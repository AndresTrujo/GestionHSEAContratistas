/**
 * Carga inicial de la BD de Railway (PostgreSQL) con la organización de seed_organizacion.json.
 *
 *   npm run db:cargar                      carga el seed (la BD debe tener ya el esquema)
 *   npm run db:cargar -- --esquema         aplica antes src/lib/data/railway/esquema.sql
 *   npm run db:cargar -- --incluir-bajas   carga también empleados dados de baja (por omisión solo activos)
 *
 * Requiere DATABASE_URL (y DATABASE_SSL=true con la URL pública de Railway), en el entorno o en .env.local.
 * Orden: líneas -> departamentos -> subdepartamentos -> empleados (jefes en un segundo paso) ->
 * cargos_area -> reglas_departamentos_rh -> cursos -> capacitaciones -> administrador inicial.
 * Las sugerencias de roles del seed NO se cargan: los roles se asignan desde la app.
 * Todo corre en una sola transacción: si algo falla, no queda nada a medias.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { firstAdminEmployeeNumber } from "../src/config/permisos";
import type { SeedFile } from "../src/lib/data/memoria/almacen_organizacion";
import { insert_audit_event } from "../src/lib/data/railway/auditoria_railway";
import { close_pool, get_db, with_transaction, type Queryable } from "../src/lib/data/railway/conexion";

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

const maxQueryParams = 60_000;

/** Inserta por lotes con VALUES (los nombres de tabla y columnas son constantes del script). */
async function insert_rows(
  db: Queryable,
  table: string,
  columns: string[],
  rows: unknown[][],
): Promise<void> {
  const batchSize = Math.max(1, Math.floor(maxQueryParams / columns.length));
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const placeholders = batch
      .map(
        (_, rowIndex) =>
          `(${columns.map((__, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`).join(", ")})`,
      )
      .join(", ");
    await db.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders}`, batch.flat());
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
  const sql = readFileSync(join(process.cwd(), "src/lib/data/railway/esquema.sql"), "utf8");
  // El esquema trae su propio BEGIN/COMMIT: va fuera de la transacción de la carga.
  await get_db().query(sql);
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
    await insert_rows(
      db,
      "subdepartamentos",
      ["id", "departamento_id", "nombre"],
      seed.subdepartamentos.map((r) => [r.id, r.departamento_id, r.nombre]),
    );
    await db.query(
      `SELECT setval(pg_get_serial_sequence('subdepartamentos', 'id'), (SELECT max(id) FROM subdepartamentos))`,
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
        `UPDATE empleados e SET jefe_no_empleado = v.jefe
           FROM unnest($1::int[], $2::int[]) AS v(numero, jefe)
          WHERE e.no_empleado = v.numero`,
        [withManager.map((r) => r.no_empleado), withManager.map((r) => r.jefe_no_empleado)],
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
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO empleado_roles (no_empleado, rol_id, alcance, otorgado_por, motivo, creado_por, actualizado_por)
         SELECT $1, r.id, 'GLOBAL', $1, 'Administrador inicial', $1, $1 FROM roles r WHERE r.codigo = 'ADMIN_HSEA'
         RETURNING id`,
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
