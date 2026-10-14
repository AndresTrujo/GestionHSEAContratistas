import { get_session } from "@/lib/auth/sesion";
import { get_file_storage } from "@/lib/almacenamiento/almacenamiento";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { can_access_document } from "@/lib/documentos/servicio";

interface RouteContext {
  params: Promise<{ versionId: string }>;
}

/**
 * Descarga de un documento de contratista. Exige sesión y autorización sobre ese documento, deja
 * rastro en auditoría (contiene datos personales) y nunca se cachea.
 */
// El nombre GET lo exige Next.js para los route handlers (excepción a la convención snake_case).
// eslint-disable-next-line @typescript-eslint/naming-convention
export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const session = await get_session();
  if (!session) return new Response("No autenticado", { status: 401 });

  const { versionId } = await params;
  const repositories = get_repositories();
  const context = await repositories.documents.get_version(versionId);
  // Misma respuesta si no existe o no tiene acceso: no se revela qué documentos hay.
  if (!context || !(await can_access_document(session, context))) {
    return new Response("Documento no encontrado", { status: 404 });
  }
  if (context.version.storagePath === null) {
    return new Response("El archivo ya fue eliminado (se conserva solo su registro de revisión)", { status: 410 });
  }

  let data: Buffer;
  try {
    data = await get_file_storage().read(context.version.storagePath);
  } catch {
    return new Response("Archivo no disponible", { status: 404 });
  }

  await repositories.audit.append_event({
    entityType: "versiones_documento",
    entityId: context.version.id,
    action: "descargar_documento",
    actorType: session.kind,
    actorId: session.kind === "EMPLEADO" ? session.employeeNumber : `P-${session.providerUserId}`,
    occurredAt: new Date().toISOString(),
    details: { documentId: context.document.id, documentTypeCode: context.document.documentTypeCode },
  });

  const extension = context.version.mimeType === "application/pdf" ? "pdf" : context.version.mimeType === "image/png" ? "png" : "jpg";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": context.version.mimeType,
      "Content-Length": String(data.length),
      "Content-Disposition": `inline; filename="documento-${context.version.id}.${extension}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
