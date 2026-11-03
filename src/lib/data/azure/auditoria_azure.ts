import type { ActorType, AuditAction, AuditEvent } from "@/domain/auditoria";
import type { AuditSearchFilter } from "../repositorios";
import { get_db, type Queryable } from "./conexion";

type AuditDetails = Record<string, string | number | boolean | null>;

interface AuditRow {
  id: string;
  ocurrido_en: Date;
  actor_tipo: ActorType;
  actor_id: string;
  accion: AuditAction;
  entidad: string;
  entidad_id: string;
  // Las columnas JSON son nvarchar(max): llegan como texto.
  detalles: AuditDetails | string;
}

/** Lee una columna JSON (nvarchar(max) con ISJSON) que llega como texto; tolera que ya venga parseada. */
export function parse_json_record(value: AuditDetails | string | null): AuditDetails {
  if (value === null) return {};
  if (typeof value !== "string") return value;
  return JSON.parse(value) as AuditDetails;
}

function map_event(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    entityType: row.entidad,
    entityId: row.entidad_id,
    action: row.accion,
    actorType: row.actor_tipo,
    actorId: row.actor_id,
    occurredAt: row.ocurrido_en.toISOString(),
    details: parse_json_record(row.detalles),
  };
}

/**
 * Inserta el evento con la conexión dada. Dentro de una transacción usa la misma `db`
 * que la mutación, para que ambos se confirmen o se reviertan juntos.
 * `eventos_auditoria` tiene triggers de inmutabilidad: no admite OUTPUT sin INTO, así que se lee con SCOPE_IDENTITY().
 */
export async function insert_audit_event(
  db: Queryable,
  event: Omit<AuditEvent, "id">,
): Promise<AuditEvent> {
  const { rows } = await db.query<AuditRow>(
    `INSERT INTO eventos_auditoria (ocurrido_en, actor_tipo, actor_id, accion, entidad, entidad_id, detalles)
     VALUES (CAST($1 AS datetimeoffset(3)), $2, $3, $4, $5, $6, $7);
     SELECT * FROM eventos_auditoria WHERE id = SCOPE_IDENTITY();`,
    [
      event.occurredAt,
      event.actorType,
      event.actorId,
      event.action,
      event.entityType,
      event.entityId,
      JSON.stringify(event.details),
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("No se pudo registrar el evento de auditoría");
  return map_event(row);
}

export function create_audit_repository_azure() {
  return {
    async append_event(event: Omit<AuditEvent, "id">): Promise<AuditEvent> {
      return insert_audit_event(get_db(), event);
    },
    async list_events_by_entity(entityType: string, entityId: string): Promise<AuditEvent[]> {
      const { rows } = await get_db().query<AuditRow>(
        `SELECT * FROM eventos_auditoria WHERE entidad = $1 AND entidad_id = $2 ORDER BY id`,
        [entityType, entityId],
      );
      return rows.map(map_event);
    },
    async search_events(filter: AuditSearchFilter): Promise<AuditEvent[]> {
      const conditions: string[] = [];
      const params: unknown[] = [];
      const add = (sql: string, value: unknown): void => {
        params.push(value);
        conditions.push(sql.replace("?", `$${params.length}`));
      };
      if (filter.entityType) add("entidad = ?", filter.entityType);
      if (filter.entityId) add("entidad_id = ?", filter.entityId);
      if (filter.actorId) add("actor_id = ?", filter.actorId);
      if (filter.action) add("accion = ?", filter.action);
      // Día local de México: desde las 00:00 del día "from" hasta antes de las 00:00 del día siguiente a "to".
      if (filter.from) {
        add("ocurrido_en >= (CAST(CAST(? AS date) AS datetime2) AT TIME ZONE 'Central Standard Time (Mexico)')", filter.from);
      }
      if (filter.to) {
        add(
          "ocurrido_en < (DATEADD(day, 1, CAST(CAST(? AS date) AS datetime2)) AT TIME ZONE 'Central Standard Time (Mexico)')",
          filter.to,
        );
      }
      params.push(filter.limit);
      const { rows } = await get_db().query<AuditRow>(
        `SELECT TOP ($${params.length}) * FROM eventos_auditoria
          ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
          ORDER BY id DESC`,
        params,
      );
      return rows.map(map_event);
    },
  };
}
