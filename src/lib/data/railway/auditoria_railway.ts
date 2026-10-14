import type { ActorType, AuditAction, AuditEvent } from "@/domain/auditoria";
import type { AuditSearchFilter } from "../repositorios";
import { get_db, type Queryable } from "./conexion";

interface AuditRow {
  id: string;
  ocurrido_en: Date;
  actor_tipo: ActorType;
  actor_id: string;
  accion: AuditAction;
  entidad: string;
  entidad_id: string;
  detalles: Record<string, string | number | boolean | null>;
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
    details: row.detalles,
  };
}

/**
 * Inserta el evento con la conexión dada. Dentro de una transacción usa la misma `db`
 * que la mutación, para que ambos se confirmen o se reviertan juntos.
 */
export async function insert_audit_event(
  db: Queryable,
  event: Omit<AuditEvent, "id">,
): Promise<AuditEvent> {
  const { rows } = await db.query<AuditRow>(
    `INSERT INTO eventos_auditoria (ocurrido_en, actor_tipo, actor_id, accion, entidad, entidad_id, detalles)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING *`,
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

export function create_audit_repository_railway() {
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
      if (filter.from) add("ocurrido_en >= (?::date)::timestamp AT TIME ZONE 'America/Mexico_City'", filter.from);
      if (filter.to) add("ocurrido_en < ((?::date) + 1)::timestamp AT TIME ZONE 'America/Mexico_City'", filter.to);
      params.push(filter.limit);
      const { rows } = await get_db().query<AuditRow>(
        `SELECT * FROM eventos_auditoria
          ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
          ORDER BY id DESC LIMIT $${params.length}`,
        params,
      );
      return rows.map(map_event);
    },
  };
}
