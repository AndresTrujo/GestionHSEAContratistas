/**
 * El registro de errores vive en un módulo aparte que solo se importa dentro de la condición del runtime
 * Node: así el empaquetado del runtime edge nunca ve `pg` ni `fs`.
 */

/**
 * Next la invoca una vez al arrancar el servidor: aquí se inicia la revisión periódica de recordatorios de
 * firma (cada 5 minutos; la app corre con Always On, así que el proceso no se duerme).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { start_reminder_loop } = await import("./lib/notificaciones/recordatorios");
  start_reminder_loop();
}

interface RequestErrorInfo {
  path: string;
  method: string;
}

interface RequestErrorContext {
  routerKind: string;
  routePath: string;
  routeType: string;
}

/**
 * Next la invoca por cada error no controlado al atender una petición (render, ruta o acción de servidor).
 * El nombre `onRequestError` lo exige el framework.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export async function onRequestError(
  error: Error & { digest?: string },
  request: RequestErrorInfo,
  context: RequestErrorContext,
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { log_server_event } = await import("./lib/registro/registro_servidor");
  await log_server_event("ERROR", "peticion", "Error al atender una petición", {
    error,
    context: {
      metodo: request.method,
      ruta: request.path,
      patron: context.routePath,
      tipo: context.routeType,
      digest: error.digest ?? null,
    },
  });
}
