import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

const hashPrefix = "scrypt";

/** Hash con sal (scrypt) para PIN y contraseñas. Formato: scrypt$<sal hex>$<hash hex>. */
export function hash_secret(secret: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, 32);
  return `${hashPrefix}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verify_secret(secret: string, stored: string): boolean {
  const [prefix, saltHex, hashHex] = stored.split("$");
  if (prefix !== hashPrefix || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(secret, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

const passwordAlphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Contraseña temporal de 10 caracteres sin los ambiguos (0/O, 1/l/I). */
export function generate_temporary_password(): string {
  let password = "";
  for (let index = 0; index < 10; index += 1) {
    password += passwordAlphabet.charAt(randomInt(0, passwordAlphabet.length));
  }
  return password;
}

export const minPasswordLength = 8;
