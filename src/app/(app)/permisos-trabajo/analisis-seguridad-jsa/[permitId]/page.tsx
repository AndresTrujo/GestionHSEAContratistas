import { notFound } from "next/navigation";
import { tableClass, tdClass, thClass } from "@/components/administracion/estilos";
import { DetailCard } from "@/components/permisos/DetailCard";
import { FormAlert } from "@/components/permisos/FormAlert";
import { PermitDetailHeader } from "@/components/permisos/PermitDetailHeader";
import { SectionCard } from "@/components/permisos/SectionCard";
import { SignatureBox, format_date_time } from "@/components/permisos/SignatureBox";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { DisclosureCard } from "@/components/ui/DisclosureCard";
import {
  get_level_class,
  get_jsa_participants,
  get_jsa_selected_risk_ids,
  get_jsa_steps,
  get_participant_key,
  get_risk_level,
  jsaApprovalSignatures,
  jsaChecklists,
  jsaEnvironmental,
  jsaHazards,
  jsaPermitQuestions,
  jsaSlug,
} from "@/config/jsa";
import { find_permit_type } from "@/config/tipos_permiso";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { signErrorMessages } from "@/lib/permisos/mensajes_firma";
import { can_access_permit, require_permit_actor } from "@/lib/permisos/actor";
import { sign_jsa } from "@/lib/permisos/jsa_acciones";

interface JsaDetailPageProps {
  params: Promise<{ permitId: string }>;
  searchParams: Promise<{ error?: string }>;
}

const errorMessages: Record<string, string> = {
  ...signErrorMessages,
  same_person: "Cada persona puede firmar una sola vez en el JSA.",
  participant_not_you:
    "Este participante está ligado a otra persona: solo ella (o un usuario de su proveedor, si es colaborador de un contratista) puede firmar por él.",
  signature: "La firma no es válida; dibújala de nuevo.",
};

export default async function JsaDetailPage({ params, searchParams }: JsaDetailPageProps) {
  const { permitId } = await params;
  const { error } = await searchParams;
  const repositories = get_repositories();
  const permit = await repositories.permits.get_by_id(permitId);
  if (!permit || permit.permitTypeSlug !== jsaSlug || !can_access_permit(await require_permit_actor(), permit)) notFound();

  const events = await repositories.audit.list_events_by_entity("permisos_trabajo", permit.id);
  const steps = get_jsa_steps(permit);
  const participants = get_jsa_participants(permit);
  const selectedRisks = get_jsa_selected_risk_ids(permit);
  const selectedChecklists = String(permit.fields.checklists ?? "").split(",");
  const selectedEnvironmental = String(permit.fields.environmental ?? "").split(",");
  const maxRisk = Math.max(...steps.map((step) => step.risk));
  const maxLevel = get_risk_level(maxRisk);
  const requiresPermit = jsaPermitQuestions.some(
    (question) => permit.fields[question.field] === "yes",
  );
  const permitType = find_permit_type(jsaSlug);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Permisos de trabajo", href: "/permisos-trabajo" },
          { label: "Análisis de seguridad (JSA)", href: `/permisos-trabajo/${jsaSlug}` },
          { label: String(permit.fields.folio) },
        ]}
      />
      <PermitDetailHeader
        folio={String(permit.fields.folio)}
        typeName={permitType?.name ?? "Análisis de seguridad en el trabajo (JSA)"}
        formCode={permitType?.formCode}
        status={permit.status}
      >
        <p className="mb-5">
          <span className={`inline-block rounded px-2.5 py-1 text-sm font-bold ${maxLevel.className}`}>
            Riesgo máximo {maxRisk} · {maxLevel.label}
          </span>
        </p>
        {error && errorMessages[error] && <FormAlert>{errorMessages[error]}</FormAlert>}
        {maxRisk > 12 && (
          <p role="alert" className="mb-5 rounded-xl border border-red-800 bg-red-600 px-4 py-3 text-sm font-bold text-white">
            {maxLevel.description}
          </p>
        )}
      </PermitDetailHeader>

      <DetailCard
        items={[
          { label: "Nombre del trabajo a ejecutar", value: String(permit.fields.jobName) },
          { label: "Ubicación del área de trabajo", value: String(permit.fields.location) },
          { label: "Departamento / compañía", value: String(permit.fields.company) },
          { label: "Fecha y hora", value: `${String(permit.fields.date)} · ${String(permit.fields.time)}` },
          { label: "Registrado por", value: permit.requestedByEmployeeNumber },
        ]}
      />

      <div className="mb-6">
        <SectionCard title="¿Requiere permiso de trabajo?">
          <p className="text-sm">
            {requiresPermit
              ? jsaPermitQuestions
                  .filter((question) => permit.fields[question.field] === "yes")
                  .map((question) => question.label)
                  .join(", ")
              : "No requiere permiso de trabajo."}
          </p>
        </SectionCard>
      </div>

      <div className="mb-6">
        <SectionCard title="Análisis del trabajo">
          <div className="overflow-x-auto rounded-xl border border-neutral-light">
            <table className={tableClass}>
              <caption className="sr-only">Análisis del trabajo</caption>
              <thead>
                <tr>
                  <th scope="col" className={thClass}>No</th>
                  <th scope="col" className={thClass}>Pasos del trabajo</th>
                  <th scope="col" className={thClass}>N° peligro</th>
                  <th scope="col" className={thClass}>Medidas de control</th>
                  <th scope="col" className={thClass}>P</th>
                  <th scope="col" className={thClass}>S</th>
                  <th scope="col" className={thClass}>R</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((step) => {
                  const level = get_risk_level(step.risk);
                  return (
                    <tr key={step.number}>
                      <td className={`${tdClass} font-bold`}>{step.number}</td>
                      <td className={tdClass}>{step.description}</td>
                      <td className={tdClass}>{step.hazards}</td>
                      <td className={tdClass}>{step.controls}</td>
                      <td className={tdClass}>
                        <span className={`inline-block rounded px-2 py-0.5 font-bold ${get_level_class(step.probability)}`}>
                          {step.probability}
                        </span>
                      </td>
                      <td className={tdClass}>
                        <span className={`inline-block rounded px-2 py-0.5 font-bold ${get_level_class(step.severity)}`}>
                          {step.severity}
                        </span>
                      </td>
                      <td className={tdClass}>
                        <span
                          title={level.label}
                          className={`inline-block whitespace-nowrap rounded px-2 py-0.5 font-bold ${level.className}`}
                        >
                          {step.risk} · {level.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      {selectedRisks.length > 0 && (
        <DisclosureCard title="Peligros y riesgos seleccionados">
          <ul className="space-y-1 text-sm">
            {jsaHazards.flatMap((hazard) =>
              hazard.risks
                .filter((risk) => selectedRisks.includes(risk.id))
                .map((risk) => (
                  <li key={risk.id}>
                    <strong>{risk.id}</strong> {hazard.name}: {risk.text}
                  </li>
                )),
            )}
          </ul>
        </DisclosureCard>
      )}

      <DetailCard
        items={[
          {
            label: "Check list aplicables",
            value:
              jsaChecklists
                .filter((item) => selectedChecklists.includes(item.slug))
                .map((item) => item.label)
                .join(", ") || "Ninguno",
          },
          {
            label: "Aspectos ambientales",
            value:
              [
                ...jsaEnvironmental
                  .filter((item) => selectedEnvironmental.includes(item.slug))
                  .map((item) => item.label),
                ...(permit.fields.environmentalOther ? [`Otro: ${String(permit.fields.environmentalOther)}`] : []),
              ].join(", ") || "Ninguno",
          },
        ]}
      />

      <div className="mb-6">
        <SectionCard
          title="Personal que participa en el análisis"
          description="Cada participante firma una vez (una persona, una firma en todo el JSA)."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {participants.map((participant) => (
              <SignatureBox
                key={participant.position}
                action={sign_jsa}
                permit={permit}
                signatureKey={get_participant_key(participant.position)}
                label={`${participant.name} · ${participant.job} · ${participant.company}`}
                canSign
              />
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="mb-6">
        <SectionCard title="Aprobaciones">
          <div className="grid gap-3 sm:grid-cols-3">
            {jsaApprovalSignatures.map((item) => (
              <div key={item.key}>
                {item.help && <p className="mb-1 text-xs text-neutral-dark">{item.help}</p>}
                <SignatureBox
                  action={sign_jsa}
                  permit={permit}
                  signatureKey={item.key}
                  label={item.label}
                  canSign={permit.status === "submitted"}
                />
              </div>
            ))}
          </div>
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
