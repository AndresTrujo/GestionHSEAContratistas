import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

/** date -> "AAAA-MM-DD" tal cual (por omisión pg lo convierte a Date en la zona del servidor). */
types.setTypeParser(1082, (value) => value);

/** Lo mínimo que usan los repositorios: sirve igual para el pool y para una transacción. */
export interface Queryable {
  query<T extends QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
}

const globalPool = globalThis as typeof globalThis & { railwayPool?: Pool };

function get_pool(): Pool {
  if (!globalPool.railwayPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL es obligatoria con DATA_PROVIDER=railway");
    globalPool.railwayPool = new Pool({
      connectionString,
      // La URL pública de Railway exige SSL; en la red privada no hace falta.
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      // Reabrir una conexión SSL a Railway cuesta cientos de ms: se conservan abiertas entre navegaciones
      // (por omisión pg las cierra a los 10 s de inactividad).
      idleTimeoutMillis: 5 * 60_000,
      keepAlive: true,
    });
  }
  return globalPool.railwayPool;
}

function wrap_client(client: PoolClient): Queryable {
  return {
    async query<T extends QueryResultRow>(text: string, params?: unknown[]) {
      const result = await client.query<T>(text, params);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
  };
}

export function get_db(): Queryable {
  const pool = get_pool();
  return {
    async query<T extends QueryResultRow>(text: string, params?: unknown[]) {
      const result = await pool.query<T>(text, params);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
  };
}

/**
 * Ejecuta `work` en una transacción: la mutación y su evento de auditoría se
 * confirman o se revierten juntos. Si `work` lanza, se hace ROLLBACK.
 */
export async function with_transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T> {
  const client = await get_pool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(wrap_client(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function close_pool(): Promise<void> {
  if (globalPool.railwayPool) {
    await globalPool.railwayPool.end();
    globalPool.railwayPool = undefined;
  }
}

/** Código SQLSTATE y nombre de la restricción de un error de PostgreSQL. */
export function get_pg_error(error: unknown): { code?: string; constraint?: string } {
  if (typeof error === "object" && error !== null) {
    const { code, constraint } = error as { code?: unknown; constraint?: unknown };
    return {
      code: typeof code === "string" ? code : undefined,
      constraint: typeof constraint === "string" ? constraint : undefined,
    };
  }
  return {};
}

export const pgUniqueViolation = "23505";
export const pgForeignKeyViolation = "23503";
