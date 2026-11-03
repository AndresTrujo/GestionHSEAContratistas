/**
 * Carga inicial de la BD de Azure SQL Server con la organización de seed_organizacion.json.
 *
 *   npm run db:cargar                      carga el seed (la BD debe tener ya el esquema)
 *   npm run db:cargar -- --esquema         aplica antes src/lib/data/azure/esquema.sql
 *   npm run db:cargar -- --incluir-bajas   carga también empleados dados de baja (por omisión solo activos)
 *
 * Requiere AZURE_SQL_CONNECTION_STRING, en el entorno o en .env.local.
 * Orden: líneas -> departamentos -> subdepartamentos -> empleados (jefes en un segundo paso) ->
 * cargos_area -> reglas_departamentos_rh -> cursos -> capacitaciones -> administrador inicial.
 * Las sugerencias de roles del seed NO se cargan: los roles se asignan desde la app.
 * Todo corre en una sola transacción: si algo falla, no queda nada a medias.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { firstAdminEmployeeNumber } from "../src/config/permisos";
import type { SeedFile } from "../src/lib/data/memoria/almacen_organizacion";
import { insert_audit_event } from "../src/lib/data/azure/auditoria_azure";
import { close_pool, get_db, with_transaction, type Queryable } from "../src/lib/data/azure/conexion";
import { split_sql_batches } from "../src/lib/data/azure/lotes_sql";

interface FullSeed extends SeedFile {
  reglas_departamentos_rh: {
    departamento_rh: string;
    linea_mando_id: number;
    departamento_id: number;
    subdepartamento_id: number | null;
    origen: string | null;
  }[];
  cursos: {
    id_curso: string;
    nombre: string;
    horas: number;
    palabras_clave: string | null;
  }[];
  capacitaciones: {
    id: number;
    no_empleado: number;
    id_curso: string;
    fecha: string;
    estado_id: number;
    fuente: string | null;
  }[];
}

// SQL Server admite máximo 2,100 parámetros por consulta y 1,000 filas por VALUES.
const maxQueryParams = 2_000;
const maxRowsPerInsert = 1_000;

/**
 * Inserta por lotes con VALUES (los nombres de tabla y columnas son constantes del script).
 * Con `identity`, la tabla tiene columna IDENTITY y los ids del seed se insertan tal cual.
 */
async function insert_rows(
  db: Queryable,
  table: string,
  columns: string[],
  rows: unknown[][],
  identity = false,
): Promise<void> {
  const batchSize = Math.max(1, Math.min(maxRowsPerInsert, Math.floor(maxQueryParams / columns.length)));
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const placeholders = batch
      .map(
        (_, rowIndex) =>
          `(${columns.map((__, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`).join(", ")})`,
      )
      .join(", ");
    const insert = `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders}`;
    // IDENTITY_INSERT vale por sesión y ámbito: se activa y se apaga en la misma consulta.
    await db.query(
      identity ? `SET IDENTITY_INSERT ${table} ON; ${insert}; SET IDENTITY_INSERT ${table} OFF;` : insert,
      batch.flat(),
    );
  }
}

function load_env_file(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Sin .env.local: se usa lo que ya haya en el entorno.
  }
}

async function apply_schema(): Promise<void> {
  const sql = readFileSync(join(process.cwd(), "src/lib/data/azure/esquema.sql"), "utf8");
  // El esquema son varios lotes separados por GO: se ejecutan en orden, fuera de la transacción de la carga.
  for (const batch of split_sql_batches(sql)) await get_db().query(batch);
  console.log("Esquema aplicado.");
}

async function load_seed(includeTerminated: boolean): Promise<void> {
  const seed = JSON.parse(
    readFileSync(join(process.cwd(), "src/lib/data/memoria/seed_organizacion.json"), "utf8"),
  ) as FullSeed;

  await with_transaction(async (db) => {
    const loaded = await db.query<{ total: string }>(`SELECT count(*) AS total FROM lineas_mando`);
    if (Number(loaded.rows[0]?.total ?? 0) > 0) {
      throw new Error("La BD ya tiene organización cargada; la carga inicial solo se corre una vez.");
    }

    await insert_rows(db, "lineas_mando", ["id", "nombre"], seed.lineas_mando.map((r) => [r.id, r.nombre]));
    await insert_rows(
      db,
      "departamentos",
      ["id", "linea_mando_id", "nombre"],
      seed.departamentos.map((r) => [r.id, r.linea_mando_id, r.nombre]),
    );
    // Con IDENTITY_INSERT, SQL Server ajusta solo el siguiente id al mayor insertado.
    await insert_rows(
      db,
      "subdepartamentos",
      ["id", "departamento_id", "nombre"],
      seed.subdepartamentos.map((r) => [r.id, r.departamento_id, r.nombre]),
      true,
    );

    const employees = seed.empleados.filter((r) => includeTerminated || r.activo);
    const loadedNumbers = new Set(employees.map((r) => r.no_empleado));
    await insert_rows(
      db,
      "empleados",
      [
        "no_empleado", "primer_nombre", "segundo_nombre", "apellido_paterno", "apellido_materno",
        "genero", "fecha_ingreso", "fecha_baja", "activo", "puesto",
        "linea_mando_id", "departamento_id", "subdepartamento_id",
      ],
      employees.map((r) => [
        r.no_empleado, r.primer_nombre, r.segundo_nombre ?? null, r.apellido_paterno, r.apellido_materno ?? null,
        r.genero ?? null, r.fecha_ingreso, r.fecha_baja ?? null, r.activo, r.puesto,
        r.linea_mando_id, r.departamento_id, r.subdepartamento_id ?? null,
      ]),
    );

    // Jefes en un segundo paso (referencian a otros empleados); si el jefe no se cargó, queda sin jefe.
    const withManager = employees.filter(
      (r) => r.jefe_no_empleado !== null && r.jefe_no_empleado !== undefined && loadedNumbers.has(r.jefe_no_empleado),
    );
    if (withManager.length > 0) {
      await db.query(
        `UPDATE e SET jefe_no_empleado = v.jefe
           FROM empleados e
           JOIN OPENJSON($1) WITH (numero int '$.numero', jefe int '$.jefe') v ON e.no_empleado = v.numero`,
        [JSON.stringify(withManager.map((r) => ({ numero: r.no_empleado, jefe: r.jefe_no_empleado })))],
      );
    }

    const posts = seed.cargos_area.filter((r) => loadedNumbers.has(r.no_empleado));
    await insert_rows(
      db,
      "cargos_area",
      ["no_empleado", "cargo", "linea_mando_id", "departamento_id", "subdepartamento_id", "vigente_desde", "vigente_hasta", "motivo"],
      posts.map((r) => [
        r.no_empleado, r.cargo, r.linea_mando_id ?? null, r.departamento_id ?? null, r.subdepartamento_id ?? null,
        r.vigente_desde, r.vigente_hasta ?? null, r.motivo ?? null,
      ]),
    );

    await insert_rows(
      db,
      "reglas_departamentos_rh",
      ["departamento_rh", "linea_mando_id", "departamento_id", "subdepartamento_id", "origen"],
      seed.reglas_departamentos_rh.map((r) => [
        r.departamento_rh, r.linea_mando_id, r.departamento_id, r.subdepartamento_id ?? null, r.origen ?? null,
      ]),
    );
    await insert_rows(
      db,
      "cursos",
      ["id_curso", "nombre", "horas", "palabras_clave"],
      seed.cursos.map((r) => [r.id_curso, r.nombre, r.horas, r.palabras_clave ?? null]),
    );

    const trainings = seed.capacitaciones.filter((r) => loadedNumbers.has(r.no_empleado));
    await insert_rows(
      db,
      "capacitaciones",
      ["id", "no_empleado", "id_curso", "fecha", "estado_id", "fuente"],
      trainings.map((r) => [r.id, r.no_empleado, r.id_curso, r.fecha, r.estado_id, r.fuente ?? null]),
    );

    // Administrador inicial: sin él nadie podría asignar roles.
    const adminNumber = Number(firstAdminEmployeeNumber);
    let adminLoaded = false;
    if (loadedNumbers.has(adminNumber)) {
      // empleado_roles tiene triggers: no admite OUTPUT sin INTO, así que el id se lee con SCOPE_IDENTITY().
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO empleado_roles (no_empleado, rol_id, alcance, otorgado_por, motivo, creado_por, actualizado_por)
         SELECT $1, r.id, 'GLOBAL', $1, 'Administrador inicial', $1, $1 FROM roles r WHERE r.codigo = 'ADMIN_HSEA';
         SELECT CAST(SCOPE_IDENTITY() AS varchar(20)) AS id WHERE SCOPE_IDENTITY() IS NOT NULL;`,
        [adminNumber],
      );
      const assignmentId = rows[0]?.id;
      if (assignmentId) {
        await insert_audit_event(db, {
          entityType: "empleado_roles",
          entityId: assignmentId,
          action: "asignar_rol",
          actorType: "EMPLEADO",
          actorId: firstAdminEmployeeNumber,
          occurredAt: new Date().toISOString(),
          details: { employeeNumber: firstAdminEmployeeNumber, roleCode: "ADMIN_HSEA", scope: "GLOBAL", reason: "Administrador inicial" },
        });
        adminLoaded = true;
      }
    }

    console.log(
      [
        `Líneas de mando:      ${seed.lineas_mando.length}`,
        `Departamentos:        ${seed.departamentos.length}`,
        `Subdepartamentos:     ${seed.subdepartamentos.length}`,
        `Empleados:            ${employees.length} de ${seed.empleados.length}${includeTerminated ? "" : " (solo activos)"}`,
        `Cargos de área:       ${posts.length} de ${seed.cargos_area.length}`,
        `Cursos:               ${seed.cursos.length}`,
        `Capacitaciones:       ${trainings.length} de ${seed.capacitaciones.length}`,
        `Administrador inicial: ${adminLoaded ? firstAdminEmployeeNumber : `NO cargado (${firstAdminEmployeeNumber} no está entre los empleados cargados)`}`,
      ].join("\n"),
    );
  });
}

async function main(): Promise<void> {
  load_env_file();
  const args = new Set(process.argv.slice(2));
  try {
    if (args.has("--esquema")) await apply_schema();
    await load_seed(args.has("--incluir-bajas"));
    console.log("Carga terminada.");
  } finally {
    await close_pool();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
