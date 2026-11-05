/**
 * Ruta interna a la que volver tras iniciar sesión (p. ej. el QR de acceso abierto con la cámara del teléfono).
 * Solo se aceptan rutas del propio sitio: "/algo", nunca "//host" ni "/\host" (redirección abierta).
 */
export function safe_next_path(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\") || /[\u0000-\u001f]/.test(path)) return null;
  return path;
}

/** Agrega `next=<ruta>` a una URL de login (o la deja igual si no hay destino). */
export function with_next(url: string, nextPath: string | null): string {
  if (!nextPath) return url;
  return `${url}${url.includes("?") ? "&" : "?"}next=${encodeURIComponent(nextPath)}`;
}
