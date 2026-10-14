import { headers } from "next/headers";

/**
 * Identifica al cliente por la IP que reenvía el proxy (x-forwarded-for / x-real-ip). Si el servidor no está
 * detrás de un proxy que la ponga, todos comparten la clave "sin-ip".
 */
export async function get_client_address(): Promise<string> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || requestHeaders.get("x-real-ip")?.trim() || "sin-ip";
}
