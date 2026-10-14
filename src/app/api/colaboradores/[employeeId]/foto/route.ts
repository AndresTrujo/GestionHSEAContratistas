import { can_view_provider_employee } from "@/lib/auth/guardas";
import { get_session } from "@/lib/auth/sesion";
import { get_file_storage } from "@/lib/almacenamiento/almacenamiento";
import { get_repositories } from "@/lib/data/proveedor_datos";

interface RouteContext {
  params: Promise<{ employeeId: string }>;
}

/**
 * Fotografía vigente de un colaborador. Exige sesión y acceso a su ficha (su proveedor, él mismo o personal TFS de
 * contratistas, p. ej. caseta); es un dato personal, así que nunca se cachea.
 */
// El nombre GET lo exige Next.js para los route handlers (excepción a la convención snake_case).
// eslint-disable-next-line @typescript-eslint/naming-convention
export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const session = await get_session();
  if (!session) return new Response("No autenticado", { status: 401 });

  const employeeId = Number((await params).employeeId);
  if (!Number.isSafeInteger(employeeId)) return new Response("Fotografía no encontrada", { status: 404 });

  const { providerEmployees } = get_repositories();
  const employee = await providerEmployees.get_employee(employeeId);
  // Misma respuesta si no existe o no tiene acceso: no se revela qué colaboradores hay.
  if (!employee || !can_view_provider_employee(session, employee)) {
    return new Response("Fotografía no encontrada", { status: 404 });
  }
  const photo = await providerEmployees.get_current_photo(employeeId);
  if (!photo?.storagePath) return new Response("Fotografía no encontrada", { status: 404 });

  let data: Buffer;
  try {
    data = await get_file_storage().read(photo.storagePath);
  } catch {
    return new Response("Fotografía no disponible", { status: 404 });
  }
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Length": String(data.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
