import { loginFreeAttempts, loginLockoutMinutes, loginThrottleResetMinutes } from "@/config/seguridad";

/**
 * Límite de intentos fallidos de inicio de sesión. Tras `loginFreeAttempts` fallos seguidos la clave queda
 * bloqueada 1, 3, 5 y 10 minutos (cada bloqueo sube un escalón; el último se repite). Terminado el bloqueo
 * basta un fallo más para volver a bloquear en el escalón siguiente. Un inicio correcto limpia el conteo y
 * el escalón vuelve a cero también tras `loginThrottleResetMinutes` sin fallos.
 *
 * El conteo vive en memoria del proceso: un reinicio del servidor lo borra, lo cual es aceptable para un
 * freno de fuerza bruta (el registro de auditoría y de servidor conservan los bloqueos).
 */
interface ThrottleState {
  failures: number;
  level: number;
  lockedUntilMs: number;
  lastFailureMs: number;
}

const globalThrottle = globalThis as typeof globalThis & { loginThrottle?: Map<string, ThrottleState> };

function get_store(): Map<string, ThrottleState> {
  return (globalThrottle.loginThrottle ??= new Map());
}

/** Segundos que faltan para que alguna de las claves pueda volver a intentar; 0 si ninguna está bloqueada. */
export function get_lockout_seconds(keys: string[], nowMs: number = Date.now()): number {
  let remainingMs = 0;
  for (const key of keys) {
    const state = get_store().get(key);
    if (state) remainingMs = Math.max(remainingMs, state.lockedUntilMs - nowMs);
  }
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

/** Cuenta un fallo en cada clave. Devuelve los segundos de bloqueo que resultaron (0 si aún no se bloquea). */
export function record_login_failure(keys: string[], nowMs: number = Date.now()): number {
  let lockSeconds = 0;
  for (const key of keys) {
    let state = get_store().get(key);
    if (!state || nowMs - state.lastFailureMs > loginThrottleResetMinutes * 60_000) {
      state = { failures: 0, level: 0, lockedUntilMs: 0, lastFailureMs: nowMs };
    }
    state.failures += 1;
    state.lastFailureMs = nowMs;
    if (state.failures >= loginFreeAttempts) {
      const minutes = loginLockoutMinutes[Math.min(state.level, loginLockoutMinutes.length - 1)] ?? 1;
      state.lockedUntilMs = nowMs + minutes * 60_000;
      state.level += 1;
      // Tras el bloqueo, un solo fallo más vuelve a bloquear en el escalón siguiente.
      state.failures = loginFreeAttempts - 1;
      lockSeconds = Math.max(lockSeconds, minutes * 60);
    }
    get_store().set(key, state);
  }
  return lockSeconds;
}

export function clear_login_failures(keys: string[]): void {
  for (const key of keys) get_store().delete(key);
}

/** Texto para el aviso de bloqueo ("1 minuto", "3 minutos"; en segundos si falta menos de uno). */
export function format_wait(seconds: number): string {
  if (seconds < 60) return `${seconds} segundo${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minuto${minutes === 1 ? "" : "s"}`;
}
