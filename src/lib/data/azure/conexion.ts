import sql, { type ConnectionPool, type config as SqlConfig, type IRecordSet } from "mssql";

/**
 * Lo mínimo que usan los repositorios: sirve igual para el pool y para una transacción.
 * Los parámetros se escriben como `$1`, `$2`... en el SQL y se envían como `@p1`, `@p2`... a SQL Server.
 * `rowCount` es el número de filas afectadas por la última sentencia (INSERT/UPDATE/DELETE).
 */
export interface Queryable {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
}

const globalPool = globalThis as typeof globalThis & { azurePool?: Promise<ConnectionPool> };

/**
 * Autenticación de la cadena: usuario y contraseña de SQL (por omisión) o Microsoft Entra ID mediante
 * `Authentication=`:
 *  - ActiveDirectoryDefault: toma la identidad del entorno (az login, sesión de VS Code, variables
 *    AZURE_CLIENT_ID/AZURE_TENANT_ID/AZURE_CLIENT_SECRET o la identidad administrada del hosting).
 *  - ActiveDirectoryManagedIdentity (o ActiveDirectoryMsi): igual; `User Id` es el client id si la identidad
 *    administrada es de usuario.
 *  - ActiveDirectoryServicePrincipal: `User Id` = client id, `Password` = secreto, `Tenant Id` obligatorio.
 */
function parse_authentication(
  parts: Map<string, string>,
  user: string | undefined,
  password: string | undefined,
): Pick<SqlConfig, "user" | "password" | "authentication"> {
  const mode = parts.get("authentication")?.toLowerCase().replace(/[\s_-]/g, "");
  if (mode === undefined || mode === "sqlpassword") return { user, password };
  if (mode === "activedirectorydefault" || mode === "activedirectorymanagedidentity" || mode === "activedirectorymsi") {
    return { authentication: { type: "azure-active-directory-default", options: { clientId: user } } };
  }
  if (mode === "activedirectoryserviceprincipal") {
    const tenantId = parts.get("tenant id");
    if (!user || !password || !tenantId) {
      throw new Error("Authentication=ActiveDirectoryServicePrincipal requiere User Id (client id), Password (secreto) y Tenant Id");
    }
    return {
      authentication: {
        type: "azure-active-directory-service-principal-secret",
        options: { clientId: user, clientSecret: password, tenantId },
      },
    };
  }
  throw new Error(
    `Authentication=${parts.get("authentication")} no está soportado; usa ActiveDirectoryDefault, ActiveDirectoryManagedIdentity, ActiveDirectoryServicePrincipal o SqlPassword`,
  );
}

/**
 * Acepta la cadena ADO.NET de Azure ("Server=tcp:host,1433;Database=...;User ID=...;Password=...;Encrypt=True")
 * y la cadena ODBC ("Driver={...};Server=...;Uid=...;Pwd=...;"): ambas se traducen a la configuración de `mssql`.
 */
export function parse_connection_string(connectionString: string): SqlConfig {
  const parts = new Map<string, string>();
  for (const segment of connectionString.split(";")) {
    const index = segment.indexOf("=");
    if (index <= 0) continue;
    const key = segment.slice(0, index).trim().toLowerCase();
    const value = segment.slice(index + 1).trim().replace(/^\{(.*)\}$/, "$1");
    parts.set(key, value);
  }
  const server = (parts.get("server") ?? parts.get("data source") ?? "").replace(/^tcp:/i, "");
  const [host, port] = server.split(",");
  const flag = (key: string, fallback: boolean): boolean => {
    const value = parts.get(key)?.toLowerCase();
    if (value === undefined) return fallback;
    return value === "yes" || value === "true";
  };
  if (!host) throw new Error("AZURE_SQL_CONNECTION_STRING no trae el servidor (Server=...)");
  const user = parts.get("uid") ?? parts.get("user id");
  const password = parts.get("pwd") ?? parts.get("password");
  return {
    server: host,
    port: port ? Number(port) : 1433,
    database: parts.get("database") ?? parts.get("initial catalog"),
    ...parse_authentication(parts, user, password),
    connectionTimeout: Number(parts.get("connection timeout") ?? 30) * 1000,
    options: {
      encrypt: flag("encrypt", true),
      trustServerCertificate: flag("trustservercertificate", false),
    },
    pool: {
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      min: 0,
      // Las conexiones se conservan entre navegaciones: reabrir TLS a Azure cuesta cientos de ms.
      idleTimeoutMillis: 5 * 60_000,
    },
  };
}

function get_pool(): Promise<ConnectionPool> {
  if (!globalPool.azurePool) {
    const connectionString = process.env.AZURE_SQL_CONNECTION_STRING;
    if (!connectionString) throw new Error("AZURE_SQL_CONNECTION_STRING es obligatoria con DATA_PROVIDER=azure");
    const pool = new sql.ConnectionPool(parse_connection_string(connectionString));
    globalPool.azurePool = pool.connect().catch((error: unknown) => {
      // Un fallo de conexión no debe quedar en caché: el siguiente intento vuelve a conectar.
      globalPool.azurePool = undefined;
      throw error;
    });
  }
  return globalPool.azurePool;
}

/** Los `date` de SQL Server llegan como Date (UTC); la app los maneja como "AAAA-MM-DD". */
function normalize_recordset<T>(recordset: IRecordSet<T> | undefined): T[] {
  if (!recordset) return [];
  const dateColumns = Object.entries(recordset.columns)
    .filter(([, column]) => column.type === sql.Date)
    .map(([name]) => name);
  if (dateColumns.length === 0) return Array.from(recordset);
  return recordset.map((row) => {
    const copy = { ...row } as Record<string, unknown>;
    for (const name of dateColumns) {
      const value = copy[name];
      if (value instanceof Date) copy[name] = value.toISOString().slice(0, 10);
    }
    return copy as T;
  });
}

function bind_params(request: sql.Request, params: unknown[] | undefined): void {
  (params ?? []).forEach((value, index) => {
    request.input(`p${index + 1}`, value === undefined ? null : value);
  });
}

async function run_query<T>(
  make_request: () => Promise<sql.Request>,
  text: string,
  params?: unknown[],
): Promise<{ rows: T[]; rowCount: number }> {
  const request = await make_request();
  bind_params(request, params);
  const result = await request.query<T>(text.replace(/\$(\d+)/g, "@p$1"));
  const recordsets = result.recordsets as IRecordSet<T>[];
  // Si la consulta devuelve varios conjuntos (p. ej. INSERT seguido de SELECT), el resultado es el último.
  const last = Array.isArray(recordsets) && recordsets.length > 0 ? recordsets[recordsets.length - 1] : undefined;
  const affected = result.rowsAffected.reduce((total, count) => total + count, 0);
  return { rows: normalize_recordset(last), rowCount: result.rowsAffected.length > 0 ? affected : 0 };
}

export function get_db(): Queryable {
  return {
    query<T>(text: string, params?: unknown[]) {
      return run_query<T>(async () => (await get_pool()).request(), text, params);
    },
  };
}

/**
 * Ejecuta `work` en una transacción: la mutación y su evento de auditoría se
 * confirman o se revierten juntos. Si `work` lanza, se hace ROLLBACK.
 */
export async function with_transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T> {
  const transaction = new sql.Transaction(await get_pool());
  await transaction.begin();
  try {
    const result = await work({
      query<R>(text: string, params?: unknown[]) {
        return run_query<R>(async () => new sql.Request(transaction), text, params);
      },
    });
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
}

export async function close_pool(): Promise<void> {
  if (globalPool.azurePool) {
    const pool = await globalPool.azurePool.catch(() => undefined);
    globalPool.azurePool = undefined;
    await pool?.close();
  }
}

/** Número de error de SQL Server y, si aplica, el texto del mensaje (incluye el nombre de la restricción). */
export function get_sql_error(error: unknown): { number?: number; message: string } {
  if (typeof error === "object" && error !== null) {
    const { number, message } = error as { number?: unknown; message?: unknown };
    return {
      number: typeof number === "number" ? number : undefined,
      message: typeof message === "string" ? message : "",
    };
  }
  return { message: "" };
}

/** Violación de UNIQUE / PRIMARY KEY (2627 = restricción, 2601 = índice único). */
export function is_unique_violation(error: unknown): boolean {
  const { number } = get_sql_error(error);
  return number === 2627 || number === 2601;
}

/** Violación de FOREIGN KEY o CHECK (547). */
export function is_constraint_violation(error: unknown): boolean {
  return get_sql_error(error).number === 547;
}
