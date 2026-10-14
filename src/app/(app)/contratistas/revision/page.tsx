import { AdminForm } from "@/components/administracion/AdminForm";
import { cardClass, inputClass, labelClass } from "@/components/administracion/estilos";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { find_document_type } from "@/config/documentos_contratista";
import type { DocumentSubject } from "@/domain/contratistas";
import { review_document_action } from "@/lib/contratistas/acciones";
import { format_date } from "@/lib/administracion/etiquetas";
import { require_employee_session } from "@/lib/auth/guardas";
import { get_repositories } from "@/lib/data/proveedor_datos";

function subject_key(subject: DocumentSubject): string {
  if (subject.kind === "EQUIPO") return `E${subject.equipmentId}`;
  if (subject.kind === "PROVEEDOR") return `V${subject.providerId}`;
  return `P${subject.providerEmployeeId}`;
}

export default async function DocumentReviewPage() {
  const session = await require_employee_session();
  const repositories = get_repositories();
  const pending = await repositories.documents.list_pending_reviews(session.employeeNumber);

  // Nombres del proveedor y de la persona o equipo dueño de cada documento.
  // Las consultas son independientes: se lanzan todas a la vez en lugar de una por una.
  const providerIds = [...new Set(pending.map((item) => item.providerId))];
  const uniqueSubjects = [...new Map(pending.map((item) => [subject_key(item.document.subject), item])).values()];
  const [providerEntries, subjectEntries] = await Promise.all([
    Promise.all(
      providerIds.map(async (providerId) => {
        const provider = await repositories.providers.get_provider(providerId);
        return [providerId, provider?.name ?? `Proveedor ${providerId}`] as const;
      }),
    ),
    Promise.all(
      uniqueSubjects.map(async (item) => {
        const subject = item.document.subject;
        const key = subject_key(subject);
        if (subject.kind === "PROVEEDOR") return [key, "Documento del proveedor"] as const;
        if (subject.kind === "EMPLEADO_PROVEEDOR") {
          const employee = await repositories.providerEmployees.get_employee(subject.providerEmployeeId);
          const name = employee
            ? [employee.firstName, employee.middleName, employee.paternalSurname, employee.maternalSurname].filter(Boolean).join(" ")
            : key;
          return [key, name] as const;
        }
        const equipment = (await repositories.equipment.list_equipment(item.providerId, { includeInactive: true })).find(
          (candidate) => candidate.id === subject.equipmentId,
        );
        return [key, equipment ? `Equipo motorizado: ${equipment.equipmentType}` : key] as const;
      }),
    ),
  ]);
  const providerNames = new Map<number, string>(providerEntries);
  const subjectNames = new Map<string, string>(subjectEntries);

  // Pendientes agrupados por proveedor (alfabético) para revisar de corrido los de una misma empresa.
  const groups = providerIds
    .map((providerId) => ({
      providerId,
      name: providerNames.get(providerId) ?? `Proveedor ${providerId}`,
      items: pending.filter((item) => item.providerId === providerId),
    }))
    .sort((first, second) => first.name.localeCompare(second.name, "es"));

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Control de contratistas", href: "/contratistas" },
          { label: "Documentos por revisar" },
        ]}
      />
      <PageHeader
        title="Documentos por revisar"
        subtitle={
          pending.length === 0
            ? "No hay documentos pendientes."
            : `${pending.length} documento${pending.length === 1 ? "" : "s"} de ${groups.length} proveedor${groups.length === 1 ? "" : "es"}.`
        }
      />
      <p className="mb-6 max-w-3xl text-sm text-neutral-dark">
        Solo ves los tipos que tu rol puede revisar (el servicio médico valida los exámenes médicos). No puedes revisar un documento
        que tú mismo subiste. Los archivos no se eliminan solos: se borran a mano desde la ficha del colaborador, equipo o proveedor, y
        el registro de la revisión se conserva.
      </p>

      {pending.length === 0 ? (
        <div className={`${cardClass} flex flex-col items-center gap-2 py-10 text-center`}>
          <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-2xl text-brand-green">✓</span>
          <p className="text-lg font-bold">Todo al día</p>
          <p className="text-sm text-neutral-dark">No hay documentos pendientes de revisión.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.providerId} aria-labelledby={`proveedor-${group.providerId}`}>
              <h2 id={`proveedor-${group.providerId}`} className="mb-3 flex items-center gap-2 text-2xl uppercase">
                {group.name}
                <span className="rounded-full bg-brand-navy px-2.5 py-0.5 font-sans text-xs font-bold normal-case text-white">
                  {group.items.length}
                </span>
              </h2>
              <div className="space-y-4">
                {group.items.map((item) => {
                  const key = subject_key(item.document.subject);
                  const type = find_document_type(item.document.documentTypeCode);
                  return (
                    <article key={item.version.id} className="rounded-xl border border-neutral-light bg-white p-5 shadow-sm">
                      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-xl leading-tight">{type?.label ?? item.document.documentTypeCode}</h3>
                          <p className="font-bold text-brand-navy">{subjectNames.get(key)}</p>
                        </div>
                        {item.version.storagePath !== null ? (
                          <a
                            href={`/api/documentos/${item.version.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-11 items-center rounded-lg border border-brand-navy px-4 text-sm font-bold text-brand-navy hover:bg-neutral-light/40 sm:min-h-10"
                          >
                            Abrir archivo
                            <span className="sr-only"> ({item.version.fileName}, se abre en otra pestaña)</span>
                          </a>
                        ) : (
                          <span className="text-sm text-neutral-dark">Archivo no disponible</span>
                        )}
                      </header>

                      <ul className="mb-4 flex flex-wrap gap-2 text-xs">
                        <li className="rounded-full bg-neutral-light/40 px-2.5 py-0.5">Versión {item.version.versionNumber}</li>
                        <li className="rounded-full bg-neutral-light/40 px-2.5 py-0.5">Subida el {format_date(item.version.uploadedAt)}</li>
                        {item.version.issueDate && (
                          <li className="rounded-full bg-neutral-light/40 px-2.5 py-0.5">Emisión {format_date(item.version.issueDate)}</li>
                        )}
                        {item.version.expiryDate && (
                          <li className="rounded-full bg-neutral-light/40 px-2.5 py-0.5">Vence {format_date(item.version.expiryDate)}</li>
                        )}
                      </ul>

                      <div className="grid gap-4 border-t border-neutral-light pt-4 sm:grid-cols-2">
                        <AdminForm action={review_document_action} submitLabel="Aprobar">
                          <input type="hidden" name="versionId" value={item.version.id} />
                          <input type="hidden" name="result" value="APROBADO" />
                          <label htmlFor={`note-${item.version.id}`} className={labelClass}>Comentario (opcional)</label>
                          <input id={`note-${item.version.id}`} name="reason" className={inputClass} />
                        </AdminForm>
                        <AdminForm action={review_document_action} submitLabel="Rechazar" variant="danger">
                          <input type="hidden" name="versionId" value={item.version.id} />
                          <input type="hidden" name="result" value="RECHAZADO" />
                          <label htmlFor={`reject-${item.version.id}`} className={labelClass}>Motivo del rechazo (obligatorio)</label>
                          <input id={`reject-${item.version.id}`} name="reason" required className={inputClass} />
                        </AdminForm>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
