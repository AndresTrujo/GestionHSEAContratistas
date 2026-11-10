import type {
  PermitSignature,
  PermitStatus,
  WorkPermit,
} from "@/domain/permisos";
import { ValidationError } from "../errores";
import type { WorkPermitRepository } from "../repositorios";
import {
  get_db,
  get_sql_error,
  with_transaction,
  type Queryable,
} from "./conexion";

type PermitFields = Record<string, string | number | boolean | null>;

interface PermitRow {
  id: string;
  tipo_permiso_slug: string;
  anio: number;
  consecutivo: number;
  folio: string;
  estatus: PermitStatus;
  solicitante_no_empleado: number | null;
  solicitante_usuario_proveedor_id: number | null;
  proveedor_id: number | null;
  departamento_id: number | null;
  subdepartamento_id: number | null;
  // Columnas JSON (nvarchar(max)): llegan como texto.
  campos: PermitFields | string;
  firmas_formato: unknown;
  creado_en: Date;
  creado_por: string;
  actualizado_en: Date;
  actualizado_por: string;
}

/** Violación de FOREIGN KEY (547 con texto "FOREIGN KEY"); el mensaje de SQL Server trae el nombre de la restricción. */
function is_foreign_key_violation(error: unknown): boolean {
  const { number, message } = get_sql_error(error);
  return number === 547 && message.includes("FOREIGN KEY");
}

function get_constraint_name(error: unknown): string {
  return /constraint "([^"]+)"/i.exec(get_sql_error(error).message)?.[1] ?? "desconocida";
}

/** Lee una columna JSON que llega como texto; tolera que ya venga parseada. */
function parse_json_column(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Valida lo leído de JSON: cualquier elemento con otra forma se descarta. */
function parse_signatures(value: unknown): PermitSignature[] {
  const parsed = parse_json_column(value);
  if (!Array.isArray(parsed)) return [];
  const result: PermitSignature[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const { key, employeeNumber, signedAt, image } = item as Record<string, unknown>;
    if (typeof key !== "string" || typeof employeeNumber !== "string" || typeof signedAt !== "string") continue;
    result.push({ key, employeeNumber, signedAt, image: typeof image === "string" ? image : null });
  }
  return result;
}

function map_permit(row: PermitRow): WorkPermit {
  return {
    id: row.id,
    permitTypeSlug: row.tipo_permiso_slug,
    status: row.estatus,
    requestedByEmployeeNumber: row.solicitante_no_empleado === null ? "" : String(row.solicitante_no_empleado),
    requestedByProviderUserId: row.solicitante_usuario_proveedor_id,
    providerId: row.proveedor_id === null ? null : String(row.proveedor_id),
    area:
      row.departamento_id === null
        ? null
        : { departmentId: row.departamento_id, subdepartmentId: row.subdepartamento_id },
    signatures: parse_signatures(row.firmas_formato),
    fields: (parse_json_column(row.campos) ?? {}) as PermitFields,
    createdAt: row.creado_en.toISOString(),
    createdBy: row.creado_por,
    updatedAt: row.actualizado_en.toISOString(),
    updatedBy: row.actualizado_por,
  };
}

interface RoleSignatureRow {
  permiso_id: string;
  rol_firma: string;
  no_empleado: number | null;
  usuario_proveedor_id: number | null;
  firmado_en: Date;
  imagen_firma: string | null;
}

/**
 * Firmas de rol de los permisos (tabla `firmas_permiso`, fuente de verdad: rol, área, segregación). Con
 * `includeImages` en false se omiten los trazos, que pesan mucho, para los listados.
 */
async function load_role_signatures(
  db: Queryable,
  permitIds: string[],
  includeImages: boolean,
): Promise<Map<string, PermitSignature[]>> {
  const result = new Map<string, PermitSignature[]>();
  if (permitIds.length === 0) return result;
  // Los ids viajan como un arreglo JSON (OPENJSON) para no toparse con el límite de 2100 parámetros.
  const { rows } = await db.query<RoleSignatureRow>(
    `SELECT permiso_id, rol_firma, no_empleado, usuario_proveedor_id, firmado_en,
            ${includeImages ? "imagen_firma" : "CAST(NULL AS nvarchar(max)) AS imagen_firma"}
       FROM firmas_permiso WHERE permiso_id IN (SELECT value FROM OPENJSON($1)) ORDER BY id`,
    [JSON.stringify(permitIds)],
  );
  for (const row of rows) {
    const list = result.get(row.permiso_id) ?? [];
    list.push({
      key: row.rol_firma,
      employeeNumber: row.no_empleado !== null ? String(row.no_empleado) : `P-${row.usuario_proveedor_id}`,
      signedAt: row.firmado_en.toISOString(),
      image: row.imagen_firma,
    });
    result.set(row.permiso_id, list);
  }
  return result;
}

/** Une las firmas del formato (verificaciones, extensión, participantes…) con las de rol; si chocan, vale la de rol. */
function merge_signatures(formatSignatures: PermitSignature[], roleSignatures: PermitSignature[]): PermitSignature[] {
  const roleKeys = new Set(roleSignatures.map((signature) => signature.key));
  return [...formatSignatures.filter((signature) => !roleKeys.has(signature.key)), ...roleSignatures].sort((first, second) =>
    first.signedAt.localeCompare(second.signedAt),
  );
}

/** Prefijo del folio ("TC" en "TC-2026-0001"); si el formato no trae uno, "PT". */
function get_folio_prefix(permit: WorkPermit): string {
  const match = /^([A-Za-z]+)-\d{4}-\d+$/.exec(String(permit.fields.folio ?? ""));
  return match?.[1]?.toUpperCase() ?? "PT";
}

/** Listado sin trazos de firma (PNG en base64, pesados): los listados no los muestran. */
async function list_permits(condition: string, params: unknown[]): Promise<WorkPermit[]> {
  const { rows } = await get_db().query<PermitRow>(
    `SELECT p.id, p.tipo_permiso_slug, p.anio, p.consecutivo, p.folio, p.estatus,
            p.solicitante_no_empleado, p.solicitante_usuario_proveedor_id, p.proveedor_id,
            p.departamento_id, p.subdepartamento_id, p.campos,
            COALESCE((SELECT '[' + STRING_AGG(CAST(JSON_MODIFY(f.value, '$.image', NULL) AS nvarchar(max)), ',')
                                   WITHIN GROUP (ORDER BY CAST(f.[key] AS int)) + ']'
                        FROM OPENJSON(p.firmas_formato) AS f),
                     '[]') AS firmas_formato,
            p.creado_en, p.creado_por, p.actualizado_en, p.actualizado_por
       FROM permisos_trabajo p WHERE ${condition} ORDER BY p.anio, p.consecutivo`,
    params,
  );
  const roleSignatures = await load_role_signatures(get_db(), rows.map((row) => row.id), false);
  return rows.map((row) => {
    const permit = map_permit(row);
    return { ...permit, signatures: merge_signatures(permit.signatures, roleSignatures.get(row.id) ?? []) };
  });
}

/**
 * Permisos de trabajo sobre `permisos_trabajo`. Al crear, la BD asigna el consecutivo por tipo y
 * año (siguiente_consecutivo) y el folio se reescribe con ese número, también en `fields.folio`,
 * para que el contador sea único aunque dos personas creen a la vez. Las firmas de rol viven en
 * `firmas_permiso` y se unen al leer; `firmas_formato` guarda solo los pasos que no son un rol
 * (verificaciones, revalidación, participantes, solicitante) y las de permisos anteriores.
 * `permisos_trabajo` tiene triggers: no se usa OUTPUT sin INTO, se relee la fila con SELECT.
 */
export function create_permit_repository_azure(): WorkPermitRepository {
  return {
    async list_by_type(permitTypeSlug) {
      return list_permits(`p.tipo_permiso_slug = $1`, [permitTypeSlug]);
    },
    async list_active(filter) {
      if (filter.permitTypeSlugs.length === 0 || filter.statuses.length === 0) return [];
      return list_permits(
        `p.tipo_permiso_slug IN (SELECT value FROM OPENJSON($1))
           AND p.estatus IN (SELECT value FROM OPENJSON($2))
           AND p.actualizado_en >= CAST($3 AS datetimeoffset(3))`,
        [JSON.stringify(filter.permitTypeSlugs), JSON.stringify(filter.statuses), filter.updatedSince],
      );
    },
    async get_by_id(id) {
      const { rows } = await get_db().query<PermitRow>(
        `SELECT * FROM permisos_trabajo WHERE id = $1`,
        [id],
      );
      const row = rows[0];
      if (!row) return null;
      const permit = map_permit(row);
      const roleSignatures = await load_role_signatures(get_db(), [row.id], true);
      return { ...permit, signatures: merge_signatures(permit.signatures, roleSignatures.get(row.id) ?? []) };
    },
    async save(permit) {
      const requesterUserId = permit.requestedByProviderUserId ?? null;
      const requester = requesterUserId === null ? Number(permit.requestedByEmployeeNumber) : null;
      if (requesterUserId === null && !Number.isSafeInteger(requester)) {
        throw new ValidationError("El solicitante del permiso debe ser un empleado o un usuario de proveedor");
      }
      const departmentId = permit.area?.departmentId ?? null;
      const subdepartmentId = permit.area?.subdepartmentId ?? null;
      const providerId = permit.providerId === null ? null : Number(permit.providerId);

      try {
        return await with_transaction(async (db) => {
          const existing = await db.query(
            `SELECT 1 AS ok FROM permisos_trabajo WITH (UPDLOCK, ROWLOCK) WHERE id = $1`,
            [permit.id],
          );

          if (existing.rowCount > 0) {
            // Las firmas de rol viven solo en `firmas_permiso`: aquí se guardan las demás (verificaciones,
            // revalidación, participantes y las de permisos anteriores a ese modelo).
            const roleSignatures = (await load_role_signatures(db, [permit.id], false)).get(permit.id) ?? [];
            const roleKeys = new Set(roleSignatures.map((signature) => signature.key));
            const formatSignatures = permit.signatures.filter((signature) => !roleKeys.has(signature.key));

            const { rows } = await db.query<PermitRow>(
              `UPDATE permisos_trabajo
                  SET estatus = $2, proveedor_id = $3, departamento_id = $4, subdepartamento_id = $5,
                      campos = $6, firmas_formato = $7,
                      actualizado_en = SYSDATETIMEOFFSET(), actualizado_por = $8
                WHERE id = $1;
               SELECT * FROM permisos_trabajo WHERE id = $1;`,
              [
                permit.id,
                permit.status,
                providerId,
                departmentId,
                subdepartmentId,
                // El folio ya asignado no se modifica.
                JSON.stringify(permit.fields),
                JSON.stringify(formatSignatures),
                permit.updatedBy,
              ],
            );
            const row = rows[0];
            if (!row) throw new Error("No se pudo actualizar el permiso");
            const saved = map_permit(row);
            return { ...saved, signatures: merge_signatures(saved.signatures, roleSignatures) };
          }

          // Procedimiento almacenado: devuelve una fila con anio_folio y consecutivo_folio.
          const counter = await db.query<{ anio_folio: number; consecutivo_folio: number }>(
            `EXEC dbo.siguiente_consecutivo $1`,
            [permit.permitTypeSlug],
          );
          const issued = counter.rows[0];
          if (!issued) throw new Error("No se pudo obtener el consecutivo del folio");
          const folio = `${get_folio_prefix(permit)}-${issued.anio_folio}-${String(issued.consecutivo_folio).padStart(4, "0")}`;

          const { rows } = await db.query<PermitRow>(
            `INSERT INTO permisos_trabajo
               (id, tipo_permiso_slug, anio, consecutivo, folio, estatus,
                solicitante_tipo, solicitante_no_empleado, solicitante_usuario_proveedor_id, proveedor_id,
                departamento_id, subdepartamento_id, campos, firmas_formato,
                creado_en, creado_por, actualizado_en, actualizado_por)
             VALUES ($1, $2, $3, $4, $5, $6, $17, $7, $18, $8, $9, $10, $11, $12,
                     CAST($13 AS datetimeoffset(3)), $14, CAST($15 AS datetimeoffset(3)), $16);
             SELECT * FROM permisos_trabajo WHERE id = $1;`,
            [
              permit.id,
              permit.permitTypeSlug,
              issued.anio_folio,
              issued.consecutivo_folio,
              folio,
              permit.status,
              requester,
              providerId,
              departmentId,
              subdepartmentId,
              JSON.stringify({ ...permit.fields, folio }),
              JSON.stringify(permit.signatures),
              permit.createdAt,
              permit.createdBy,
              permit.updatedAt,
              permit.updatedBy,
              requesterUserId === null ? "EMPLEADO" : "USUARIO_PROVEEDOR",
              requesterUserId,
            ],
          );
          const row = rows[0];
          if (!row) throw new Error("No se pudo crear el permiso");
          return map_permit(row);
        });
      } catch (error) {
        if (is_foreign_key_violation(error)) {
          throw new ValidationError(
            `El solicitante, el proveedor o el área del permiso no existen (restricción: ${get_constraint_name(error)})`,
          );
        }
        throw error;
      }
    },
  };
}
