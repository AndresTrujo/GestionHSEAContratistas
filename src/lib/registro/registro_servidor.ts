import type { ServerLogLevel } from "@/domain/registro_servidor";
import { get_repositories } from "@/lib/data/proveedor_datos";

const maxMessageLength = 500;
const maxDetailLength = 4000;

interface ServerLogOptions {
  error?: unknown;
  context?: Record<string, string | number | boolean | null>;
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/**
 * Deja constancia de un error o aviso del servidor: en la consola y en el registro (pantalla Administración →
 * Registro del servidor). Nunca lanza: si el registro mismo falla, solo queda la consola, para que registrar
 * un problema jamás cause otro.
 */
export async function log_server_event(
  level: ServerLogLevel,
  source: string,
  message: string,
  options: ServerLogOptions = {},
): Promise<void> {
  const { error, context = {} } = options;
  const errorText = error instanceof Error ? error.message : error === undefined ? "" : String(error);
  const fullMessage = errorText ? `${message}: ${errorText}` : message;
  const line = `[${source}] ${fullMessage}`;
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);

  try {
    await get_repositories().serverLog.append_entry({
      occurredAt: new Date().toISOString(),
      level,
      source,
      message: truncate(fullMessage, maxMessageLength),
      detail: error instanceof Error && error.stack ? truncate(error.stack, maxDetailLength) : null,
      context,
    });
  } catch (loggingError) {
    console.error("[registro_servidor] no se pudo guardar la entrada:", loggingError instanceof Error ? loggingError.message : loggingError);
  }
}
