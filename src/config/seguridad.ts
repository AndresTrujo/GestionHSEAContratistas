/** Longitud del PIN de firma (solo dígitos). */
export const pinLength = 6;

/**
 * Exige el PIN de firma al firmar un permiso. Desactivado: se confía en la sesión del usuario (la firma
 * queda con su identidad, fecha y área). Los PIN activados y su administración se conservan por si se
 * vuelve a exigir.
 */
export const requireSigningPin = false;

/** Duración de la sesión (cookie firmada). */
export const sessionMaxAgeSeconds = 60 * 60 * 8;

/**
 * Límite de intentos del inicio de sesión (empleados y proveedores): fallos permitidos antes del primer
 * bloqueo, minutos de cada bloqueo sucesivo (el último se repite) y minutos sin fallos tras los que el
 * escalón vuelve a empezar.
 */
export const loginFreeAttempts = 3;
export const loginLockoutMinutes = [1, 3, 5, 10] as const;
export const loginThrottleResetMinutes = 60;

/** Intentos fallidos de PIN o contraseña antes de bloquear, y minutos de bloqueo. */
export const maxFailedAttempts = 5;
export const lockoutMinutes = 15;
