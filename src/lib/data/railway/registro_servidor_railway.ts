import type { ServerLogEntry, ServerLogLevel } from "@/domain/registro_servidor";
import type { ServerLogFilter, ServerLogRepository } from "../repositorios";
import { get_db } from "./conexion";

interface ServerLogRow {
  id: string;
  ocurrido_en: Date;
  nivel: ServerLogLevel;
  origen: string;
  mensaje: string;
  detalle: string | null;
  contexto: Record<string, string | number | boolean | null>;
}

function map_entry(row: ServerLogRow): ServerLogEntry {
  return {
    id: row.id,
    occurredAt: row.ocurrido_en.toISOString(),
    level: row.nivel,
    source: row.origen,
    message: row.mensaje,
    detail: row.detalle,
    context: row.contexto,
  };
}

export function create_server_log_repository_railway(): ServerLogRepository {
  return {
    async append_entry(entry) {
      const { rows } = await get_db().query<ServerLogRow>(
        `INSERT INTO registro_servidor (ocurrido_en, nivel, origen, mensaje, detalle, contexto)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING *`,
        [entry.occurredAt, entry.level, entry.source, entry.message, entry.detail, JSON.stringify(entry.context)],
      );
      const row = rows[0];
      if (!row) throw new Error("No se pudo registrar la entrada del servidor");
      return map_entry(row);
    },
    async search_entries(filter: ServerLogFilter) {
      const conditions: string[] = [];
      const params: unknown[] = [];
      const add = (sql: string, value: unknown): void => {
        params.push(value);
        conditions.push(sql.replace("?", `$${params.length}`));
      };
      if (filter.level) add("nivel = ?", filter.level);
      if (filter.source) add("origen = ?", filter.source);
      if (filter.from) add("ocurrido_en >= (?::date)::timestamp AT TIME ZONE 'America/Mexico_City'", filter.from);
      if (filter.to) add("ocurrido_en < ((?::date) + 1)::timestamp AT TIME ZONE 'America/Mexico_City'", filter.to);
      params.push(filter.limit);
      const { rows } = await get_db().query<ServerLogRow>(
        `SELECT * FROM registro_servidor
          ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
          ORDER BY id DESC LIMIT $${params.length}`,
        params,
      );
      return rows.map(map_entry);
    },
    async count_since(level, sinceIso) {
      const { rows } = await get_db().query<{ total: string }>(
        `SELECT count(*) AS total FROM registro_servidor WHERE nivel = $1 AND ocurrido_en >= $2`,
        [level, sinceIso],
      );
      return Number(rows[0]?.total ?? 0);
    },
  };
}
