import { headers } from "next/headers";

/** URL pública de la app: `APP_BASE_URL` o, si falta, el host de la petición en curso. */
export async function get_app_base_url(): Promise<string> {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return configured;
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
