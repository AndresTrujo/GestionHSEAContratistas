/**
 * Sondeo de salud para el Health check de Azure App Service. Pública a propósito (el sondeo no lleva sesión)
 * y sin tocar la base de datos ni el almacenamiento: solo confirma que el proceso atiende peticiones. Si
 * dependiera de Azure SQL, una caída breve de la BD haría que Azure sacara la instancia de rotación.
 */
export const dynamic = "force-dynamic";

// El nombre GET lo exige Next.js para los route handlers (excepción a la convención snake_case).
// eslint-disable-next-line @typescript-eslint/naming-convention
export function GET(): Response {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
