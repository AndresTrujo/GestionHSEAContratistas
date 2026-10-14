/** El actor no cumple lo requerido (un permiso, pertenecer al proveedor, etc.). */
export class AccessDeniedError extends Error {
  constructor(requirement: string) {
    super(`Acceso denegado: se requiere ${requirement}`);
    this.name = "AccessDeniedError";
  }
}

/** Datos inválidos o regla de negocio incumplida. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * ¿Es un error esperado (validación, permiso o inexistente) que debe mostrarse como mensaje y no como error 500?
 * Compara por nombre y no con `instanceof`: según cómo Next empaquete los módulos, la clase que lanza el repositorio
 * puede ser otra instancia que la que importa la acción y `instanceof` falla.
 */
export function is_expected_error(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error.name === "ValidationError" || error.name === "AccessDeniedError" || error.name === "NotFoundError")
  );
}

/** Mensaje al intentar revocar al último Administrador HSEA. */
export const lastAdminMessage =
  "No se puede revocar al último Administrador HSEA: asigna ese rol a otra persona antes de revocarlo.";

/** La entidad pedida no existe. */
export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} no encontrado: ${id}`);
    this.name = "NotFoundError";
  }
}
