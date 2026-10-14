import { notFound } from "next/navigation";
import { inputClass, labelClass, primaryButtonClass, tableClass, tdClass, thClass } from "@/components/administracion/estilos";
import { DetailCard } from "@/components/permisos/DetailCard";
import { FormAlert } from "@/components/permisos/FormAlert";
import { PermitDetailHeader } from "@/components/permisos/PermitDetailHeader";
import { SectionCard } from "@/components/permisos/SectionCard";
import { SignatureBox, format_date_time } from "@/components/permisos/SignatureBox";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import {
  find_heights_signature,
  get_heights_checklist_field,
  get_heights_executors,
  get_heights_verification_key,
  get_ppe_labels,
  heightsAnswerLabels,
  heightsApprovalSignatures,
  heightsChecklist,
  heightsMaxExtensionHours,
  heightsRevalidationHour,
  heightsSlug,
  heightsVerificationCount,
  is_valid_today,
  medicalEvaluationLabels,
  needs_revalidation,
} from "@/config/trabajos_alturas";
import type { HeightsAnswer, MedicalEvaluation } from "@/config/trabajos_alturas";
import { find_permit_type } from "@/config/tipos_permiso";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { signErrorMessages } from "@/lib/permisos/mensajes_firma";
import { can_access_permit, require_permit_actor } from "@/lib/permisos/actor";
import {
  close_heights_permit,
  sign_heights_permit,
} from "@/lib/permisos/trabajos_alturas_acciones";

interface HeightsDetailPageProps {
  params: Promise<{ permitId: string }>;
  searchParams: Promise<{ error?: string }>;
}

const errorMessages: Record<string, string> = {
  ...signErrorMessages,
  same_person: "Una misma persona no puede firmar dos roles de autorización.",
  expired: "Este permiso es válido sólo en la fecha solicitada; ya no admite más firmas.",
  order: "Las verificaciones se firman en orden.",
  signature: "La firma no es válida; dibújala de nuevo.",
  medical: "El servicio médico debe evaluar a todas las personas ejecutantes.",
  extension: `Indica una extensión de 1 a ${heightsMaxExtensionHours} horas con su horario.`,
};

const warningClass = "mb-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-900";

export default async function HeightsPermitDetailPage({
  params,
  searchParams,
}: HeightsDetailPageProps) {
  const { permitId } = await params;
  const { error } = await searchParams;
  const repositories = get_repositories();
  const permit = await repositories.permits.get_by_id(permitId);
  if (!permit || permit.permitTypeSlug !== heightsSlug || !can_access_permit(await require_permit_actor(), permit)) notFound();

  const events = await repositories.audit.list_events_by_entity("permisos_trabajo", permit.id);
  const executors = get_heights_executors(permit);
  const validToday = is_valid_today(permit);
  const isClosed = permit.status === "closed";
  const isApproved = permit.status === "approved";
  const canSignApproval = permit.status === "submitted";
  const canSignDuringWork = isApproved && validToday;
  const extension = find_heights_signature(permit, "extension");
  const permitType = find_permit_type(heightsSlug);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Permisos de trabajo", href: "/permisos-trabajo" },
          { label: "Trabajos en alturas", href: `/permisos-trabajo/${heightsSlug}` },
          { label: String(permit.fields.folio) },
        ]}
      />
      <PermitDetailHeader
        folio={String(permit.fields.folio)}
        typeName={permitType?.name ?? "Permiso de trabajos en alturas"}
        formCode={permitType?.formCode}
        status={permit.status}
      >
        {error && errorMessages[error] && <FormAlert>{errorMessages[error]}</FormAlert>}
        {!isClosed && !validToday && (
          <p className={warningClass}>
            ✕ Permiso válido sólo el {String(permit.fields.date)}; fuera de esa fecha no es vigente.
          </p>
        )}
        {isApproved && needs_revalidation(permit, new Date()) && (
          <p className={warningClass}>
            ⚠ Después de las {heightsRevalidationHour}:00 el responsable operativo debe revalidar el permiso (extensión máxima de{" "}
            {heightsMaxExtensionHours} horas).
          </p>
        )}
      </PermitDetailHeader>

      <DetailCard
        items={[
          { label: "Depto. / Compañía", value: String(permit.fields.department) },
          { label: "Fecha", value: String(permit.fields.date) },
          { label: "Área de trabajo o espacio", value: String(permit.fields.workArea) },
          { label: "Registrado por", value: permit.requestedByEmployeeNumber },
          { label: "Descripción del trabajo", value: String(permit.fields.description), wide: true },
          { label: "Hora de inicio", value: String(permit.fields.startTime) },
          { label: "Hora de terminación", value: String(permit.fields.endTime) },
        ]}
      />

      <div className="mb-6">
        <SectionCard title="Personas que ejecutan el trabajo">
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th scope="col" className={thClass}>#</th>
                  <th scope="col" className={thClass}>Nombre</th>
                  <th scope="col" className={thClass}>Evaluación médica</th>
                </tr>
              </thead>
              <tbody>
                {executors.map((name, index) => {
                  const evaluation = permit.fields[`medical${index + 1}`] as
                    | MedicalEvaluation
                    | undefined;
                  return (
                    <tr key={index}>
                      <td className={tdClass}>{index + 1}</td>
                      <td className={tdClass}>{name}</td>
                      <td className={`${tdClass} font-bold ${evaluation === "unfit" ? "text-red-700" : ""}`}>
                        {evaluation === "unfit" && <span aria-hidden="true">✕ </span>}
                        {evaluation ? medicalEvaluationLabels[evaluation] : "Pendiente"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <details className="group mb-6 rounded-xl border border-neutral-light bg-white shadow-sm">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-3 hover:bg-neutral-light/15 [&::-webkit-details-marker]:hidden">
          <h2 className="text-2xl uppercase">Consideraciones de prevención</h2>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-neutral-dark transition group-open:rotate-180 motion-reduce:transition-none">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <div className="space-y-4 border-t border-neutral-light px-5 py-4">
          {heightsChecklist.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-dark">{group.title}</h3>
              <ul className="divide-y divide-neutral-light/60 text-sm">
                {group.items.map((item) => {
                  const answer = String(permit.fields[get_heights_checklist_field(item.id)]);
                  return (
                    <li key={item.id} className="flex justify-between gap-4 py-2">
                      <span>
                        {item.id}. {item.text}
                        {item.id === "2" && get_ppe_labels(permit).length > 0 && (
                          <span className="block text-neutral-dark">
                            {get_ppe_labels(permit).join(", ")}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-bold">
                        {heightsAnswerLabels[answer as HeightsAnswer] ?? "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </details>

      <div className="mb-6">
        <SectionCard title="Autorización">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {heightsApprovalSignatures.map((item) => (
              <SignatureBox
                key={item.key}
                action={sign_heights_permit}
                permit={permit}
                signatureKey={item.key}
                label={item.label}
                canSign={canSignApproval}
                modalFields={
                  item.key === "medical_service" ? (
                    <fieldset className="mb-3 space-y-2 text-sm">
                      <legend className="mb-1 font-bold">Evaluación médica</legend>
                      {executors.map((name, index) => (
                        <div key={index} className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            {index + 1}. {name}
                          </span>
                          <span className="flex gap-2">
                            {Object.entries(medicalEvaluationLabels).map(([value, label]) => (
                              <label
                                key={value}
                                className="flex min-h-11 items-center gap-2 rounded-lg border border-neutral-light px-3 has-[:checked]:border-brand-navy has-[:checked]:bg-brand-navy has-[:checked]:text-white sm:min-h-10"
                              >
                                <input
                                  type="radio"
                                  name={`medical${index + 1}`}
                                  value={value}
                                  required
                                  className="h-4 w-4"
                                />
                                {label}
                              </label>
                            ))}
                          </span>
                        </div>
                      ))}
                    </fieldset>
                  ) : undefined
                }
              />
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="mb-6">
        <SectionCard title={`Revalidación después de las ${heightsRevalidationHour}:00`}>
          {extension ? (
            <p className="mb-3 text-sm font-bold">
              Extensión de {String(permit.fields.extensionHours)} h, de {String(permit.fields.extensionFrom)} a{" "}
              {String(permit.fields.extensionTo)}.
            </p>
          ) : (
            <p className="mb-3 text-sm text-neutral-dark">
              Si el trabajo se extiende después de las {heightsRevalidationHour}:00, el responsable operativo revalida el permiso
              considerando los riesgos (máximo {heightsMaxExtensionHours} horas).
            </p>
          )}
          <div className="max-w-xs">
            <SignatureBox
              action={sign_heights_permit}
              permit={permit}
              signatureKey="extension"
              label="Responsable operativo"
              buttonLabel="Revalidar"
              canSign={canSignDuringWork}
              modalFields={
                <div className="mb-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <label htmlFor="extensionHours" className={labelClass}>Horas</label>
                    <input
                      id="extensionHours"
                      name="extensionHours"
                      type="number"
                      min={1}
                      max={heightsMaxExtensionHours}
                      required
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="extensionFrom" className={labelClass}>De</label>
                    <input id="extensionFrom" name="extensionFrom" type="time" required className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="extensionTo" className={labelClass}>A</label>
                    <input id="extensionTo" name="extensionTo" type="time" required className={inputClass} />
                  </div>
                </div>
              }
            />
          </div>
        </SectionCard>
      </div>

      <div className="mb-6">
        <SectionCard title="Verificaciones de HSEA durante el trabajo">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: heightsVerificationCount }, (_, index) => (
              <SignatureBox
                key={index}
                action={sign_heights_permit}
                permit={permit}
                signatureKey={get_heights_verification_key(index + 1)}
                label={`${index + 1}. Verificación`}
                canSign={canSignDuringWork}
              />
            ))}
          </div>
        </SectionCard>
      </div>

      {(isClosed || isApproved) && (
        <div className="mb-6">
          <SectionCard title="Cierre del permiso">
            {isClosed ? (
              <p className="text-sm font-bold">
                Cerrado por {String(permit.fields.closedBy)} el {format_date_time(String(permit.fields.closedAt))}
              </p>
            ) : (
              <form action={close_heights_permit}>
                <input type="hidden" name="permitId" value={permit.id} />
                <button className={primaryButtonClass}>Cerrar permiso (trabajo terminado)</button>
              </form>
            )}
          </SectionCard>
        </div>
      )}

      <SectionCard title="Historial">
        <ol className="space-y-2 border-l-2 border-neutral-light pl-4 text-sm">
          {events.map((event) => (
            <li key={event.id}>
              <span className="font-bold">{String(event.details.event ?? event.action)}</span>
              {event.details.key ? ` (${String(event.details.key)})` : ""}
              <span className="block text-xs text-neutral-dark">
                {format_date_time(event.occurredAt)} · {event.actorId}
              </span>
            </li>
          ))}
        </ol>
      </SectionCard>
    </>
  );
}
