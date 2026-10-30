import { jsaSlug } from "@/config/jsa";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { can_access_permit, require_permit_actor } from "@/lib/permisos/actor";
import { build_jsa_pdf } from "@/lib/permisos/jsa_pdf";

interface JsaPdfRouteProps {
  params: Promise<{ permitId: string }>;
}

/** Descarga el JSA llenado sobre la plantilla controlada FO-0066. Cada descarga queda en la auditoría. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export async function GET(_request: Request, { params }: JsaPdfRouteProps): Promise<Response> {
  const { permitId } = await params;
  const actor = await require_permit_actor();
  const repositories = get_repositories();
  const permit = await repositories.permits.get_by_id(permitId);
  if (!permit || permit.permitTypeSlug !== jsaSlug || !can_access_permit(actor, permit)) {
    return new Response("No encontrado", { status: 404 });
  }

  const bytes = await build_jsa_pdf(permit, {
    resolve_signer_name: async (actorId) => {
      const employee = await repositories.employees.find_by_number(actorId);
      if (!employee) return actorId;
      return [employee.firstName, employee.middleName, employee.paternalSurname, employee.maternalSurname]
        .filter(Boolean)
        .join(" ");
    },
  });

  const folio = String(permit.fields.folio);
  await repositories.audit.append_event({
    entityType: "permisos_trabajo",
    entityId: permit.id,
    action: "descargar_documento",
    actorType: actor.actorType,
    actorId: actor.actorId,
    occurredAt: new Date().toISOString(),
    details: { event: "pdf_jsa", folio, formCode: "FO-0066" },
  });

  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="FO-0066_${folio}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
