import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sessionMaxAgeSeconds } from "@/config/seguridad";

/**
 * Cookie de sesión firmada (HMAC-SHA256): sin la firma, cualquiera podría escribir el
 * número de otro empleado en su cookie. Solo lleva la identidad y la caducidad; los roles
 * se leen de la BD en cada petición, así una revocación surte efecto de inmediato.
 */
export type SessionIdentityKind = "EMPLEADO" | "USUARIO_PROVEEDOR";

export interface SessionIdentity {
  kind: SessionIdentityKind;
  /** Número de empleado, o id numérico del usuario de proveedor. */
  id: string;
}

interface TokenPayload extends SessionIdentity {
  exp: number; // segundos desde epoch
}

const globalSecret = globalThis as typeof globalThis & { devSessionSecret?: string };

function get_secret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET (mínimo 32 caracteres) es obligatoria en producción");
  }
  // Desarrollo: secreto aleatorio por proceso (las sesiones se invalidan al reiniciar).
  return (globalSecret.devSessionSecret ??= randomBytes(32).toString("hex"));
}

function sign(data: string): string {
  return createHmac("sha256", get_secret()).update(data).digest("base64url");
}

/**
 * Firma HMAC con el mismo secreto de la app y un propósito propio: una firma emitida para un uso (p. ej. el
 * QR de acceso) nunca sirve para otro (p. ej. una cookie de sesión).
 */
export function sign_for_purpose(purpose: string, data: string): string {
  return sign(`${purpose}:${data}`);
}

export function create_session_token(identity: SessionIdentity): string {
  const payload: TokenPayload = {
    ...identity,
    exp: Math.floor(Date.now() / 1000) + sessionMaxAgeSeconds,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** null si la firma no coincide, el formato es inválido o ya caducó. */
export function verify_session_token(token: string): SessionIdentity | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = Buffer.from(sign(body));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<TokenPayload>;
    const { kind, id, exp } = payload;
    if (kind !== "EMPLEADO" && kind !== "USUARIO_PROVEEDOR") return null;
    if (typeof id !== "string" || typeof exp !== "number") return null;
    if (exp < Math.floor(Date.now() / 1000)) return null;
    return { kind, id };
  } catch {
    return null;
  }
}
