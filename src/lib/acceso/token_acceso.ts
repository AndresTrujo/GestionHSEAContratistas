import { timingSafeEqual } from "node:crypto";
import { sign_for_purpose } from "@/lib/auth/token_sesion";

/**
 * Contenido del QR de acceso a planta: el id del colaborador firmado (HMAC). El QR no concede acceso por sí
 * solo: la firma solo prueba que lo emitió este sistema; al escanearlo se valida en vivo el semáforo, que el
 * colaborador y el proveedor sigan activos y que no haya un ingreso abierto. No lleva datos personales.
 */
const purpose = "acceso-planta";
const prefix = "HSEA1";

export function create_access_token(providerEmployeeId: number): string {
  const id = String(providerEmployeeId);
  return `${prefix}.${id}.${sign_for_purpose(purpose, id)}`;
}

/** El id del colaborador, o null si el formato o la firma no son válidos. */
export function verify_access_token(token: string): number | null {
  const [tokenPrefix, id, signature] = token.trim().split(".");
  if (tokenPrefix !== prefix || !id || !signature || !/^\d{1,9}$/.test(id)) return null;

  const expected = Buffer.from(sign_for_purpose(purpose, id));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  return Number(id);
}
