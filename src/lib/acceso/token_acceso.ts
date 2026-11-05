import { timingSafeEqual } from "node:crypto";
import { sign_for_purpose } from "@/lib/auth/token_sesion";

/**
 * Contenido del QR de acceso a planta: el id del colaborador firmado (HMAC). El QR no concede acceso por sí
 * solo: la firma solo prueba que lo emitió este sistema; al escanearlo se valida en vivo el semáforo, que el
 * colaborador y el proveedor sigan activos y que no haya un ingreso abierto. No lleva datos personales.
 */
const purpose = "acceso-planta";
const prefix = "HSEA1";

/** Parámetro de la URL del QR que lleva el token. */
export const accessQueryParam = "t";

/**
 * Contenido real del QR: una URL a /acceso/qr con el token en la query. Así la cámara nativa del teléfono lo
 * abre en el navegador; el escáner de la app también la entiende (ver `extract_access_token`).
 */
export function build_access_url(baseUrl: string, token: string): string {
  const url = new URL("/acceso/qr", baseUrl);
  url.searchParams.set(accessQueryParam, token);
  return url.toString();
}

/** El token, tanto si se escaneó el texto antiguo (`HSEA1.…`) como la URL del QR; cadena vacía si no hay. */
export function extract_access_token(scanned: string): string {
  const text = scanned.trim();
  if (!/^https?:\/\//i.test(text)) return text;
  try {
    return new URL(text).searchParams.get(accessQueryParam)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function create_access_token(providerEmployeeId: number): string {
  const id = String(providerEmployeeId);
  return `${prefix}.${id}.${sign_for_purpose(purpose, id)}`;
}

/** El id del colaborador, o null si el formato o la firma no son válidos. */
export function verify_access_token(token: string): number | null {
  const [tokenPrefix, id, signature] = extract_access_token(token).split(".");
  if (tokenPrefix !== prefix || !id || !signature || !/^\d{1,9}$/.test(id)) return null;

  const expected = Buffer.from(sign_for_purpose(purpose, id));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  return Number(id);
}
