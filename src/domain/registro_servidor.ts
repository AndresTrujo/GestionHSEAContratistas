/**
 * Registro del servidor: errores y avisos técnicos (fallos de peticiones, de la purga de archivos, bloqueos
 * de inicio de sesión). Es aparte de la auditoría, que registra lo que hacen las personas. Solo se agrega.
 */
export type ServerLogLevel = "ERROR" | "WARN" | "INFO";

export const serverLogLevels: readonly ServerLogLevel[] = ["ERROR", "WARN", "INFO"];

export interface ServerLogEntry {
  id: string;
  /** ISO 8601. */
  occurredAt: string;
  level: ServerLogLevel;
  /** Quién lo generó: "peticion", "purga_archivos", "login"… */
  source: string;
  message: string;
  /** Pila del error u otro detalle largo. */
  detail: string | null;
  context: Record<string, string | number | boolean | null>;
}
