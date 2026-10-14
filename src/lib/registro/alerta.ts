import { get_repositories } from "@/lib/data/proveedor_datos";

/** Ventana de la alerta: errores del servidor en las últimas 24 horas. */
export const alertWindowHours = 24;

/** Cuántos errores del servidor hubo en la ventana de la alerta. Si no se puede consultar, devuelve null. */
export async function count_recent_server_errors(): Promise<number | null> {
  try {
    const since = new Date(Date.now() - alertWindowHours * 60 * 60 * 1000).toISOString();
    return await get_repositories().serverLog.count_since("ERROR", since);
  } catch {
    return null;
  }
}
