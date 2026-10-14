import { createHmac } from "node:crypto";

/**
 * CURP y NSS no se guardan en claro: se guarda su huella (HMAC-SHA256 con la llave `PII_HASH_KEY`, en hex).
 * La huella es determinista, así que sigue sirviendo para impedir duplicados (restricción UNIQUE) y para
 * comprobar un valor conocido, pero no permite leer el dato. Con una llave aparte (no solo un hash simple) no
 * se pueden recorrer los ~10^11 NSS posibles para recuperarlos aunque se filtre la base de datos.
 *
 * Perder o cambiar la llave invalida las huellas guardadas (los duplicados dejarían de detectarse): debe
 * respaldarse junto con la configuración del servidor.
 */
export type PiiKind = "curp" | "nss";

export const piiHashLength = 64;

/** Llave fija solo para desarrollo y pruebas; en producción es obligatoria. */
const developmentKey = "llave-solo-para-desarrollo-no-usar-en-produccion";

function get_key(): string {
  const key = process.env.PII_HASH_KEY;
  if (key && key.length >= 32) return key;
  if (process.env.NODE_ENV === "production") {
    throw new Error("PII_HASH_KEY (mínimo 32 caracteres) es obligatoria en producción");
  }
  return developmentKey;
}

/** Huella de un valor ya normalizado (CURP en mayúsculas, NSS sin espacios). El tipo entra en el cálculo. */
export function hash_pii(kind: PiiKind, normalizedValue: string): string {
  return createHmac("sha256", get_key()).update(`${kind}:${normalizedValue}`).digest("hex");
}

/** true si el texto ya es una huella (64 hex) y no un valor en claro. */
export function is_pii_hash(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
