import type { ServerLogEntry, ServerLogLevel } from "@/domain/registro_servidor";
import type { ServerLogFilter, ServerLogRepository } from "../repositorios";
import { get_db } from "./conexion";

type LogContext = Record<string, string | number | boolean | null>;

interface ServerLogRow {
  id: string;
  ocurrido_en: Date;
  nivel: ServerLogLevel;
  origen: string;
  mensaje: string;
  detalle: string | null;
  // Columna JSON (nvarchar(max)): llega como texto.
  contexto: LogContext | string;
}

function parse_context(value: LogContext | string | null): LogContext {
  if (value === null) return {};
  if (typeof value !== "string") return value;
  return JSON.parse(value) as LogContext;
}

function map_entry(row: ServerLogRow): ServerLogEntry {
  return {
    id: row.id,
    occurredAt: row.ocurrido_en.toISOString(),
    level: row.nivel,
    source: row.origen,
    message: row.mensaje,
    detail: row.detalle,
    context: parse_context(row.contexto),
  };
}

export function create_server_log_repository_azure(): ServerLogRepository {
  return {
    async append_entry(entry) {
      // registro_servidor tiene triggers de inmutabilidad: no admite OUTPUT sin INTO, se lee con SCOPE_IDENTITY().
      const { rows } = await get_db().query<ServerLogRow>(
        `INSERT INTO registro_servidor (ocurrido_en, nivel, origen, mensaje, detalle, contexto)
         VALUES (CAST($1 AS datetimeoffset(3)), $2, $3, $4, $5, $6);
         SELECT * FROM registro_servidor WHERE id = SCOPE_IDENTITY();`,
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
      const { rows } = await get_db().query<ServerLogRow>(
        `SELECT TOP ($${params.length}) * FROM registro_servidor
          ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
          ORDER BY id DESC`,
        params,
      );
      return rows.map(map_entry);
    },
    async count_since(level, sinceIso) {
      const { rows } = await get_db().query<{ total: number | string }>(
        `SELECT COUNT(*) AS total FROM registro_servidor WHERE nivel = $1 AND ocurrido_en >= CAST($2 AS datetimeoffset(3))`,
        [level, sinceIso],
      );
      return Number(rows[0]?.total ?? 0);
    },
  };
}
