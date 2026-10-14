import { randomInt } from "node:crypto";

/** Minúsculas, sin acentos y solo letras a-z. */
function normalize_letters(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** Primeras dos letras; se rellena con "x" si el texto es corto o vacío (p. ej. sin apellido materno). */
function first_two_letters(text: string): string {
  return normalize_letters(text).padEnd(2, "x").slice(0, 2);
}

/**
 * Usuario de acceso de proveedor (8 caracteres): 2 letras del nombre, 2 del
 * apellido paterno, 2 del materno y 2 dígitos aleatorios. Coincide con el CHECK
 * de `usuarios_proveedor.usuario`. Si ya existe, quien lo llame debe reintentar.
 */
export function build_provider_username(
  firstName: string,
  paternalSurname: string,
  maternalSurname: string | null,
): string {
  const letters =
    first_two_letters(firstName) +
    first_two_letters(paternalSurname) +
    first_two_letters(maternalSurname ?? "");
  return letters + String(randomInt(0, 100)).padStart(2, "0");
}
