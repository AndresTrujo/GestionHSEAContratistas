import { notFound } from "next/navigation";
import { AdminForm } from "@/components/administracion/AdminForm";
import { cardClass, inputClass } from "@/components/administracion/estilos";
import { DocumentPanel, type DocumentHistory } from "@/components/contratistas/DocumentPanel";
import { SemaphoreBadge } from "@/components/contratistas/SemaphoreBadge";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { DisclosureCard } from "@/components/ui/DisclosureCard";
import { deactivate_equipment_action } from "@/lib/contratistas/acciones";
import { can_manage_provider, require_provider_access } from "@/lib/auth/guardas";
import { get_repositories } from "@/lib/data/proveedor_datos";

interface EquipmentDocumentsPageProps {
  params: Promise<{ providerId: string; equipmentId: string }>;
}

export default async function EquipmentDocumentsPage({ params }: EquipmentDocumentsPageProps) {
  const { providerId: rawProviderId, equipmentId: rawEquipmentId } = await params;
  const providerId = Number(rawProviderId);
  const equipmentId = Number(rawEquipmentId);
  if (!Number.isSafeInteger(providerId) || !Number.isSafeInteger(equipmentId)) notFound();
  const session = await require_provider_access(providerId);

  const repositories = get_repositories();
  const equipmentList = await repositories.equipment.list_equipment(providerId, { includeInactive: true });
  // El equipo debe pertenecer al proveedor de la URL.
  const equipment = equipmentList.find((item) => item.id === equipmentId);
  if (!equipment) notFound();

  const subject = { kind: "EQUIPO", equipmentId } as const;
  const semaphore = await repositories.equipment.get_semaphore(equipmentId);
  const requirements = semaphore?.requirements ?? [];
  const approvedCount = requirements.filter((item) => item.status === "APROBADO").length;

  const history: Record<string, DocumentHistory> = {};
  await Promise.all(
    requirements.flatMap((requirement) =>
      requirement.documentId
        ? [
            (async () => {
              const documentId = requirement.documentId as string;
              const [versions, reviews] = await Promise.all([
                repositories.documents.list_versions(documentId),
                repositories.documents.list_reviews(documentId),
              ]);
              history[documentId] = { versions, reviews };
            })(),
          ]
        : [],
    ),
  );

  const canManage = can_manage_provider(session, providerId);
  const pagePath = `/contratistas/${providerId}/equipos/${equipmentId}/documentos`;
  const details = [equipment.brand, equipment.model, equipment.description].filter(Boolean).join(" · ");
  const identification = [equipment.serialNumber && `Serie ${equipment.serialNumber}`, equipment.plates && `Placas ${equipment.plates}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          ...(session.kind === "EMPLEADO" ? [{ label: "Control de contratistas", href: "/contratistas" }] : []),
          { label: "Equipos motorizados", href: `/contratistas/${providerId}/equipos` },
          { label: equipment.equipmentType },
        ]}
      />

      <header className={`${cardClass} flex flex-wrap items-center gap-5`}>
        <div className="min-w-64 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <SemaphoreBadge semaphore={semaphore?.semaphore ?? null} />
            {!equipment.active && (
              <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-800 ring-1 ring-inset ring-red-300">
                Dado de baja
              </span>
            )}
          </div>
          <h1 className="text-4xl uppercase leading-tight">{equipment.equipmentType}</h1>
          {details && <p className="text-neutral-dark">{details}</p>}
          {identification && <p className="text-sm text-neutral-dark">{identification}</p>}
          {equipment.active && requirements.length > 0 && (
            <div className="mt-3 max-w-md">
              <div className="mb-1 flex justify-between text-xs font-bold text-neutral-dark">
                <span>Requisitos aprobados</span>
                <span>
                  {approvedCount} de {requirements.length}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Requisitos aprobados"
                aria-valuemin={0}
                aria-valuemax={requirements.length}
                aria-valuenow={approvedCount}
                className="h-2.5 overflow-hidden rounded-full bg-neutral-light/50"
              >
                <div className="h-full rounded-full bg-brand-green" style={{ width: `${(approvedCount / requirements.length) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      </header>

      {equipment.active && (
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
          <div>
            <h2 className="mb-3 text-2xl uppercase">Documentación</h2>
            <DocumentPanel
              subject={subject}
              requirements={requirements}
              history={history}
              canUpload={canManage}
              canDeleteFile={canManage}
              canRevoke={session.kind === "EMPLEADO" && canManage}
              reviewerPermissions={session.kind === "EMPLEADO" ? session.permissions : []}
              returnPath={pagePath}
            />
          </div>

          {canManage && (
            <aside>
              <DisclosureCard title="Dar de baja" description="Acción para cuando el equipo deja de usarse.">
                <AdminForm action={deactivate_equipment_action} submitLabel="Dar de baja" variant="danger">
                  <input type="hidden" name="providerId" value={providerId} />
                  <input type="hidden" name="equipmentId" value={equipmentId} />
                  <input name="reason" placeholder="Motivo (obligatorio)" required className={inputClass} />
                </AdminForm>
              </DisclosureCard>
            </aside>
          )}
        </div>
      )}
    </>
  );
}
