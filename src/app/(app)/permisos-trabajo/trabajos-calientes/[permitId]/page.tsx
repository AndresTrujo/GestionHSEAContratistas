import { notFound } from "next/navigation";
import { primaryButtonClass, secondaryButtonClass } from "@/components/administracion/estilos";
import { DetailCard } from "@/components/permisos/DetailCard";
import { FormAlert } from "@/components/permisos/FormAlert";
import { PermitDetailHeader } from "@/components/permisos/PermitDetailHeader";
import { SectionCard } from "@/components/permisos/SectionCard";
import { SignatureBox, format_date_time } from "@/components/permisos/SignatureBox";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import {
  checklistAnswerLabels,
  get_activity_labels,
  get_checklist_field,
  get_executors,
  hotWorkChecklist,
  get_valid_until,
  get_verification_key,
  hotWorkApprovalSignatures,
  hotWorkSlug,
  hotWorkVerificationCount,
} from "@/config/trabajos_calientes";
import type { ChecklistAnswer } from "@/config/trabajos_calientes";
import { find_permit_type } from "@/config/tipos_permiso";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { signErrorMessages } from "@/lib/permisos/mensajes_firma";
import { can_access_permit, require_permit_actor } from "@/lib/permisos/actor";
import {
  register_post_inspection,
  sign_hot_work_permit,
} from "@/lib/permisos/trabajos_calientes_acciones";

interface HotWorkDetailPageProps {
  params: Promise<{ permitId: string }>;
  searchParams: Promise<{ error?: string }>;
}

const errorMessages: Record<string, string> = {
  ...signErrorMessages,
  same_person: "Una misma persona no puede firmar dos roles de autorización.",
  expired: "El permiso superó sus 12 horas de vigencia; ya no admite verificaciones.",
  order: "Las verificaciones se firman en orden.",
  signature: "La firma no es válida; dibújala de nuevo.",
};

export default async function HotWorkPermitDetailPage({
  params,
  searchParams,
}: HotWorkDetailPageProps) {
  const { permitId } = await params;
  const { error } = await searchParams;
  const repositories = get_repositories();
  const permit = await repositories.permits.get_by_id(permitId);
  if (!permit || permit.permitTypeSlug !== hotWorkSlug || !can_access_permit(await require_permit_actor(), permit)) notFound();

  const events = await repositories.audit.list_events_by_entity("permisos_trabajo", permit.id);
  const validUntil = get_valid_until(permit);
  const isExpired = validUntil !== null && validUntil.getTime() < Date.now();
  const isClosed = permit.status === "closed";
  const canSignApproval = permit.status === "submitted";
  const canSignVerification = permit.status === "approved" && !isExpired;
  const canInspect = permit.status === "approved";
  const permitType = find_permit_type(hotWorkSlug);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Permisos de trabajo", href: "/permisos-trabajo" },
          { label: "Trabajos calientes", href: `/permisos-trabajo/${hotWorkSlug}` },
          { label: String(permit.fields.folio) },
        ]}
      />
      <PermitDetailHeader
        folio={String(permit.fields.folio)}
        typeName={permitType?.name ?? "Permiso de trabajos calientes"}
        formCode={permitType?.formCode}
        status={permit.status}
      >
        {error && errorMessages[error] && <FormAlert>{errorMessages[error]}</FormAlert>}
        {validUntil && !isClosed && (
          <p
            className={`mb-5 rounded-xl border px-4 py-3 text-sm font-bold ${
              isExpired ? "border-red-300 bg-red-50 text-red-900" : "border-brand-green bg-green-50 text-green-900"
            }`}
          >
            {isExpired ? "✕ Vigencia vencida el" : "✓ Vigente hasta el"} {format_date_time(validUntil.toISOString())}
          </p>
        )}
      </PermitDetailHeader>

      <DetailCard
        items={[
          { label: "Depto. / Compañía", value: String(permit.fields.department) },
          { label: "Fecha", value: String(permit.fields.date) },
          { label: "Área de trabajo o espacio", value: String(permit.fields.workArea) },
          {
            label: "Solicitante",
            value: (
              <>
                {String(permit.fields.requesterName)} · {String(permit.fields.requesterPosition)}{" "}
                <span className="text-sm text-neutral-dark">(registrado por {permit.requestedByEmployeeNumber})</span>
              </>
            ),
          },
          { label: "Descripción del trabajo", value: String(permit.fields.description), wide: true },
          { label: "Personas que ejecutan", value: get_executors(permit).join(", ") },
          { label: "Tipo de trabajo", value: get_activity_labels(permit).join(", ") },
          { label: "Hora de inicio", value: String(permit.fields.startTime) },
          { label: "Hora de terminación", value: String(permit.fields.endTime) },
        ]}
      />

      <details className="group mb-6 rounded-xl border border-neutral-light bg-white shadow-sm">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-3 hover:bg-neutral-light/15 [&::-webkit-details-marker]:hidden">
          <h2 className="text-2xl uppercase">Lista de verificación</h2>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-neutral-dark transition group-open:rotate-180 motion-reduce:transition-none">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <div className="space-y-4 border-t border-neutral-light px-5 py-4">
          {hotWorkChecklist.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-dark">{group.title}</h3>
              <ul className="divide-y divide-neutral-light/60 text-sm">
                {group.items.map((item) => {
                  const answer = String(permit.fields[get_checklist_field(item.number)]);
                  return (
                    <li key={item.number} className="flex justify-between gap-4 py-2">
                      <span>
                        {item.number}. {item.text}
                      </span>
                      <span className="shrink-0 font-bold">{checklistAnswerLabels[answer as ChecklistAnswer] ?? "—"}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </details>

      <div className="mb-6">
        <SectionCard title="Autorización" description="Las cuatro firmas de autorización pasan el permiso a Autorizado.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {hotWorkApprovalSignatures.map((item) => (
              <SignatureBox
                action={sign_hot_work_permit}
                key={item.key}
                permit={permit}
                signatureKey={item.key}
                label={item.label}
                canSign={canSignApproval}
              />
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="mb-6">
        <SectionCard title="Verificaciones" description="Se firman en orden mientras el permiso esté vigente.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: hotWorkVerificationCount }, (_, index) => (
              <SignatureBox
                action={sign_hot_work_permit}
                key={index}
                permit={permit}
                signatureKey={get_verification_key(index + 1)}
                label={`${index + 1}. Verificación`}
                canSign={canSignVerification}
              />
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="mb-6">
        <SectionCard title="Inspección posterior">
          <p className="mb-3 text-sm">
            ¿Se realizó la inspección del área después de 30 minutos de haber finalizado el trabajo?
          </p>
          {permit.fields.postInspectionDone === null ? (
            canInspect ? (
              <form action={register_post_inspection} className="flex flex-wrap gap-3">
                <input type="hidden" name="permitId" value={permit.id} />
                <button name="result" value="yes" className={primaryButtonClass}>
                  Sí (cierra el permiso)
                </button>
                <button name="result" value="no" className={secondaryButtonClass}>
                  No
                </button>
              </form>
            ) : (
              <p className="text-sm text-neutral-dark">Disponible cuando el permiso esté autorizado.</p>
            )
          ) : (
            <p className="text-sm font-bold">
              {permit.fields.postInspectionDone ? "Sí" : "No"} · registrado por {String(permit.fields.postInspectionBy)} el{" "}
              {format_date_time(String(permit.fields.postInspectionAt))}
              {!permit.fields.postInspectionDone && !isClosed && " (puede volver a registrarse)"}
            </p>
          )}
        </SectionCard>
      </div>

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
