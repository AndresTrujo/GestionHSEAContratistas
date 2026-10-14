import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminForm } from "@/components/administracion/AdminForm";
import { cardClass, inputClass, labelClass, primaryButtonClass } from "@/components/administracion/estilos";
import { DocumentPanel, type DocumentHistory } from "@/components/contratistas/DocumentPanel";
import { SemaphoreBadge } from "@/components/contratistas/SemaphoreBadge";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { DisclosureCard } from "@/components/ui/DisclosureCard";
import { find_document_type, workTypes } from "@/config/documentos_contratista";
import type { RequirementStatus } from "@/domain/contratistas";
import {
  deactivate_provider_employee_action,
  delete_employee_photo_action,
  set_work_types_action,
  upload_employee_photo_action,
} from "@/lib/contratistas/acciones";
import { can_manage_provider, require_provider_access } from "@/lib/auth/guardas";
import { get_repositories } from "@/lib/data/proveedor_datos";

const requirementStatusLabel: Record<RequirementStatus, string> = {
  FALTANTE: "falta",
  EN_REVISION: "en revisión",
  APROBADO: "aprobado",
  RECHAZADO: "rechazado",
  REVOCADO: "aprobación revocada",
  VENCIDO: "vencido",
};

const requirementChipStyle: Record<RequirementStatus, string> = {
  FALTANTE: "bg-red-50 text-red-800 ring-red-300",
  EN_REVISION: "bg-yellow-50 text-yellow-900 ring-yellow-400",
  APROBADO: "bg-green-50 text-green-900 ring-brand-green",
  RECHAZADO: "bg-red-50 text-red-800 ring-red-300",
  REVOCADO: "bg-red-50 text-red-800 ring-red-300",
  VENCIDO: "bg-red-50 text-red-800 ring-red-300",
};

function get_initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

interface EmployeeDocumentsPageProps {
  params: Promise<{ providerId: string; employeeId: string }>;
}

export default async function EmployeeDocumentsPage({ params }: EmployeeDocumentsPageProps) {
  const { providerId: rawProviderId, employeeId: rawEmployeeId } = await params;
  const providerId = Number(rawProviderId);
  const employeeId = Number(rawEmployeeId);
  if (!Number.isSafeInteger(providerId) || !Number.isSafeInteger(employeeId)) notFound();
  const session = await require_provider_access(providerId, employeeId);

  const repositories = get_repositories();
  const employee = await repositories.providerEmployees.get_employee(employeeId);
  // El colaborador debe pertenecer al proveedor de la URL (evita ver personal de otro proveedor).
  if (!employee || employee.providerId !== providerId) notFound();

  const fullName = [employee.firstName, employee.middleName, employee.paternalSurname, employee.maternalSurname]
    .filter(Boolean)
    .join(" ");
  const subject = { kind: "EMPLEADO_PROVEEDOR", providerEmployeeId: employeeId } as const;
  const semaphore = await repositories.providerEmployees.get_semaphore(employeeId);
  const allRequirements = semaphore?.requirements ?? [];
  // Los documentos del proveedor (p. ej. comprobante de pago del IMSS) los sube la empresa: aquí solo se informa su estado.
  const requirements = allRequirements.filter((item) => find_document_type(item.documentTypeCode)?.appliesTo === "EMPLEADO_PROVEEDOR");
  const providerRequirements = allRequirements.filter((item) => find_document_type(item.documentTypeCode)?.appliesTo === "PROVEEDOR");
  const approvedCount = allRequirements.filter((item) => item.status === "APROBADO").length;

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

  const photo = await repositories.providerEmployees.get_current_photo(employeeId);
  const canGenerateAccess = semaphore?.semaphore === "VERDE" && photo !== null;
  const canManage = can_manage_provider(session, providerId);
  // El propio colaborador (cuenta de proveedor no administradora vinculada a su registro) puede subir su foto.
  const isOwnRecord = session.kind === "USUARIO_PROVEEDOR" && session.providerEmployeeId === employeeId;
  const pagePath = `/contratistas/${providerId}/personal/${employeeId}/documentos`;
  const accessPath = `/contratistas/${providerId}/personal/${employeeId}/acceso`;
  const missingForAccess = [semaphore?.semaphore === "VERDE" ? null : "semáforo verde", photo ? null : "fotografía"].filter(Boolean);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          ...(session.kind === "EMPLEADO" ? [{ label: "Control de contratistas", href: "/contratistas" }] : []),
          ...(canManage || session.kind === "EMPLEADO" ? [{ label: "Personal", href: `/contratistas/${providerId}/personal` }] : []),
          { label: fullName },
        ]}
      />

      <header className={`${cardClass} flex flex-wrap items-center gap-5`}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- la foto sale de una ruta protegida con sesión
          <img src={`/api/colaboradores/${employeeId}/foto`} alt={`Fotografía de ${fullName}`} className="h-32 w-24 rounded-lg border border-neutral-light object-cover" />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-32 w-24 items-center justify-center rounded-lg bg-brand-navy font-display text-4xl text-brand-cyan"
          >
            {get_initials(fullName)}
          </div>
        )}
        <div className="min-w-64 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <SemaphoreBadge semaphore={semaphore?.semaphore ?? null} />
            {!employee.active && (
              <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-800 ring-1 ring-inset ring-red-300">
                Dado de baja
              </span>
            )}
          </div>
          <h1 className="text-4xl uppercase leading-tight">{fullName}</h1>
          <p className="text-neutral-dark">{employee.jobTitle}</p>
          {employee.active && allRequirements.length > 0 && (
            <div className="mt-3 max-w-md">
              <div className="mb-1 flex justify-between text-xs font-bold text-neutral-dark">
                <span>Requisitos aprobados</span>
                <span>
                  {approvedCount} de {allRequirements.length}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Requisitos aprobados"
                aria-valuemin={0}
                aria-valuemax={allRequirements.length}
                aria-valuenow={approvedCount}
                className="h-2.5 overflow-hidden rounded-full bg-neutral-light/50"
              >
                <div className="h-full rounded-full bg-brand-green" style={{ width: `${(approvedCount / allRequirements.length) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
        {employee.active && canGenerateAccess && (
          <Link href={accessPath} className={primaryButtonClass}>
            Generar QR de Acceso
          </Link>
        )}
      </header>

      {employee.active && (
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
          <div>
            {providerRequirements.length > 0 && (
              <div className="mb-6 rounded-xl border border-neutral-light bg-white p-4 shadow-sm">
                <p className="mb-2 text-sm font-bold">Documentos a cargo del proveedor (cuentan para este semáforo)</p>
                <ul className="flex flex-wrap gap-2">
                  {providerRequirements.map((item) => (
                    <li
                      key={item.documentTypeCode}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${requirementChipStyle[item.status]}`}
                    >
                      {find_document_type(item.documentTypeCode)?.label ?? item.documentTypeCode}: {requirementStatusLabel[item.status]}
                    </li>
                  ))}
                </ul>
              </div>
            )}

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

          <aside className="space-y-6">
            <section className={`${cardClass} mb-0`}>
              <h2 className="mb-1 text-xl uppercase">Fotografía y acceso</h2>
              <p className="mb-3 text-sm text-neutral-dark">
                {canGenerateAccess
                  ? "Semáforo verde y fotografía: ya puede mostrar su QR en caseta."
                  : `El QR de acceso se habilita con semáforo verde y fotografía. Falta: ${missingForAccess.join(" y ")}.`}
              </p>
              <Link href={accessPath} className="mb-3 inline-block text-sm font-bold text-brand-navy underline">
                {canGenerateAccess ? "Generar QR de Acceso" : "Ver pantalla de acceso"}
              </Link>
              {(canManage || isOwnRecord) && (
                <>
                  <AdminForm action={upload_employee_photo_action} submitLabel={photo ? "Cambiar fotografía" : "Subir fotografía"}>
                    <input type="hidden" name="employeeId" value={employeeId} />
                    <input type="hidden" name="returnPath" value={pagePath} />
                    <label htmlFor="photo-file" className={labelClass}>Fotografía del rostro (JPG o PNG, máx. 5 MB)</label>
                    <input id="photo-file" name="file" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" required className={inputClass} />
                  </AdminForm>
                  {photo && canManage && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-bold text-red-700 underline">Eliminar fotografía</summary>
                      <AdminForm action={delete_employee_photo_action} submitLabel="Eliminar fotografía" variant="danger" className="mt-2 space-y-2">
                        <input type="hidden" name="employeeId" value={employeeId} />
                        <input type="hidden" name="returnPath" value={pagePath} />
                        <input name="reason" placeholder="Motivo (obligatorio)" required className={inputClass} />
                      </AdminForm>
                    </details>
                  )}
                </>
              )}
            </section>

            {canManage && (
              <section className={`${cardClass} mb-0`}>
                <h2 className="mb-1 text-xl uppercase">Trabajos específicos</h2>
                <AdminForm action={set_work_types_action} submitLabel="Guardar trabajos">
                  <input type="hidden" name="providerId" value={providerId} />
                  <input type="hidden" name="employeeId" value={employeeId} />
                  <div className="space-y-2 text-sm">
                    {workTypes.map((type) => (
                      <label key={type.code} className="flex min-h-11 items-center gap-2 rounded-lg border border-neutral-light px-3 sm:min-h-10">
                        <input type="checkbox" name="workTypes" value={type.code} defaultChecked={employee.workTypes.includes(type.code)} />
                        {type.label}
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-neutral-dark">Cada trabajo marcado exige su constancia DC-3.</p>
                </AdminForm>
              </section>
            )}

            {canManage && (
              <DisclosureCard title="Dar de baja" description="Acción para cuando el colaborador deja la empresa.">
                <AdminForm action={deactivate_provider_employee_action} submitLabel="Dar de baja" variant="danger">
                  <input type="hidden" name="providerId" value={providerId} />
                  <input type="hidden" name="employeeId" value={employeeId} />
                  <input name="reason" placeholder="Motivo (obligatorio)" required className={inputClass} />
                </AdminForm>
              </DisclosureCard>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
