import { notFound } from "next/navigation";
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  tableClass,
  tdClass,
  thClass,
} from "@/components/administracion/estilos";
import { DetailCard } from "@/components/permisos/DetailCard";
import { FormAlert } from "@/components/permisos/FormAlert";
import { PermitDetailHeader } from "@/components/permisos/PermitDetailHeader";
import { SectionCard } from "@/components/permisos/SectionCard";
import { SignatureBox, format_date_time } from "@/components/permisos/SignatureBox";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { checklistAnswerLabels } from "@/config/trabajos_calientes";
import type { ChecklistAnswer } from "@/config/trabajos_calientes";
import {
  confinedApprovalSignatures,
  confinedClosingSignature,
  confinedEquipment,
  confinedEvaluationLabels,
  confinedGases,
  confinedQuestions,
  confinedReadingCount,
  confinedRiskCategories,
  confinedSlug,
  get_confined_check_field,
  get_confined_executors,
  get_confined_selected,
  get_confined_valid_until,
  get_reading_count,
  get_reading_field,
  is_out_of_limits,
  is_reading_out_of_limits,
} from "@/config/espacios_confinados";
import type { ConfinedEvaluation } from "@/config/espacios_confinados";
import { find_permit_type } from "@/config/tipos_permiso";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { signErrorMessages } from "@/lib/permisos/mensajes_firma";
import { can_access_permit, require_permit_actor } from "@/lib/permisos/actor";
import {
  record_confined_movement,
  record_confined_reading,
  sign_confined_permit,
} from "@/lib/permisos/espacios_confinados_acciones";

interface ConfinedDetailPageProps {
  params: Promise<{ permitId: string }>;
  searchParams: Promise<{ error?: string }>;
}

const errorMessages: Record<string, string> = {
  ...signErrorMessages,
  same_person: "Una misma persona no puede firmar dos roles del permiso.",
  signature: "La firma no es válida; dibújala de nuevo.",
  medical: "El servicio médico debe evaluar a todos los ejecutantes.",
  initial_limits:
    "La lectura inicial está fuera de límites; no se puede autorizar la entrada.",
  inside: "Todos los ejecutantes deben haber salido antes de la firma final de HSEA.",
  unfit: "Este ejecutante fue evaluado como NO APTO y no puede entrar.",
  expired: "El permiso superó sus 8 horas de vigencia; ya no admite entradas ni lecturas.",
  atmosphere: "La última lectura está fuera de límites; evacuar y no permitir la entrada.",
  readings_full: "Ya se registraron las 5 lecturas del formato.",
  reading: "Captura un valor numérico válido para cada gas.",
};

function format_time(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export default async function ConfinedPermitDetailPage({
  params,
  searchParams,
}: ConfinedDetailPageProps) {
  const { permitId } = await params;
  const { error } = await searchParams;
  const repositories = get_repositories();
  const permit = await repositories.permits.get_by_id(permitId);
  if (!permit || permit.permitTypeSlug !== confinedSlug || !can_access_permit(await require_permit_actor(), permit)) notFound();

  const events = await repositories.audit.list_events_by_entity("permisos_trabajo", permit.id);
  const executors = get_confined_executors(permit);
  const validUntil = get_confined_valid_until(permit);
  const isExpired = validUntil !== null && validUntil.getTime() < Date.now();
  const isApproved = permit.status === "approved";
  const isClosed = permit.status === "closed";
  const readingCount = get_reading_count(permit);
  const latestOutOfLimits = is_reading_out_of_limits(permit, readingCount);
  const canOperate = isApproved && !isExpired;
  const permitType = find_permit_type(confinedSlug);
  const monitoring =
    permit.fields.monitoringMode === "permanent"
      ? "Permanente"
      : `Periódico · cada ${String(permit.fields.monitoringFrequency)} min`;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Permisos de trabajo", href: "/permisos-trabajo" },
          { label: "Espacios confinados", href: `/permisos-trabajo/${confinedSlug}` },
          { label: String(permit.fields.folio) },
        ]}
      />
      <PermitDetailHeader
        folio={String(permit.fields.folio)}
        typeName={permitType?.name ?? "Permiso de entrada a espacios confinados"}
        formCode={permitType?.formCode}
        status={permit.status}
      >
        {error && errorMessages[error] && <FormAlert>{errorMessages[error]}</FormAlert>}
        {latestOutOfLimits && !isClosed && (
          <p role="alert" className="mb-5 rounded-xl border border-red-700 bg-red-700 px-4 py-3 text-sm font-bold text-white">
            ⚠ Un parámetro de la lectura {readingCount} está fuera de los límites: se debe evacuar el espacio confinado.
          </p>
        )}
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
          { label: "Compañía", value: String(permit.fields.company) },
          { label: "Fecha", value: String(permit.fields.date) },
          { label: "Área de trabajo", value: String(permit.fields.workArea) },
          { label: "Tarea a realizar", value: String(permit.fields.task) },
          { label: "Espacio confinado No.", value: String(permit.fields.spaceNumber) },
          { label: "Clasificación de riesgo", value: `Tipo ${String(permit.fields.riskType)}` },
          { label: "Ubicación", value: String(permit.fields.location) },
          { label: "Puesto", value: String(permit.fields.position) },
          { label: "Hora de inicio / terminación", value: `${String(permit.fields.startTime)} – ${String(permit.fields.endTime)}` },
          {
            label: "En caso de emergencia llamar a",
            value: `${String(permit.fields.emergencyContact)} · ${String(permit.fields.emergencyPhone)}`,
          },
          { label: "Registrado por", value: permit.requestedByEmployeeNumber },
        ]}
      />

      <div className="mb-6">
        <SectionCard title="Ejecutantes">
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th scope="col" className={thClass}>#</th>
                  <th scope="col" className={thClass}>Nombre</th>
                  <th scope="col" className={thClass}>Evaluación médica</th>
                  <th scope="col" className={thClass}>Entrada</th>
                  <th scope="col" className={thClass}>Salida</th>
                </tr>
              </thead>
              <tbody>
                {executors.map((name, index) => {
                  const position = index + 1;
                  const evaluation = permit.fields[`medical${position}`] as
                    | ConfinedEvaluation
                    | undefined;
                  const entryAt = permit.fields[`entry${position}At`];
                  const exitAt = permit.fields[`exit${position}At`];
                  return (
                    <tr key={position}>
                      <td className={tdClass}>{position}</td>
                      <td className={tdClass}>{name}</td>
                      <td className={`${tdClass} font-bold ${evaluation === "unfit" ? "text-red-700" : ""}`}>
                        {evaluation === "unfit" && <span aria-hidden="true">✕ </span>}
                        {evaluation ? confinedEvaluationLabels[evaluation] : "Pendiente"}
                      </td>
                      <td className={tdClass}>
                        {typeof entryAt === "string" ? (
                          format_time(entryAt)
                        ) : canOperate && evaluation === "fit" ? (
                          <form action={record_confined_movement}>
                            <input type="hidden" name="permitId" value={permit.id} />
                            <input type="hidden" name="position" value={position} />
                            <button name="kind" value="entry" className={secondaryButtonClass}>
                              Registrar entrada
                            </button>
                          </form>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={tdClass}>
                        {typeof exitAt === "string" ? (
                          format_time(exitAt)
                        ) : typeof entryAt === "string" && isApproved ? (
                          <form action={record_confined_movement}>
                            <input type="hidden" name="permitId" value={permit.id} />
                            <input type="hidden" name="position" value={position} />
                            <button name="kind" value="exit" className={secondaryButtonClass}>
                              Registrar salida
                            </button>
                          </form>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <div className="mb-6">
        <SectionCard title="Monitoreo de atmósferas" description={monitoring}>
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th scope="col" className={thClass}>Gas</th>
                  <th scope="col" className={thClass}>Límites</th>
                  {Array.from({ length: confinedReadingCount }, (_, index) => (
                    <th key={index} scope="col" className={thClass}>
                      {index === 0 ? "Inicial" : `Lectura ${index + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {confinedGases.map((gas) => (
                  <tr key={gas.key}>
                    <th scope="row" className={`${tdClass} font-normal`}>{gas.label}</th>
                    <td className={tdClass}>{gas.limitLabel}</td>
                    {Array.from({ length: confinedReadingCount }, (_, index) => {
                      const value = permit.fields[get_reading_field(index + 1, gas.key)];
                      const outOfLimits =
                        typeof value === "number" && is_out_of_limits(gas.key, value);
                      return (
                        <td key={index} className={`${tdClass} ${outOfLimits ? "font-bold text-red-700" : ""}`}>
                          {outOfLimits && <span aria-hidden="true">⚠ </span>}
                          {typeof value === "number" ? `${value} ${gas.unit}` : "—"}
                          {outOfLimits && <span className="sr-only"> (fuera de límites)</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canOperate && readingCount < confinedReadingCount && (
            <form
              action={record_confined_reading}
              className="mt-4 grid items-end gap-3 border-t border-neutral-light pt-4 sm:grid-cols-3 lg:grid-cols-5"
            >
              <input type="hidden" name="permitId" value={permit.id} />
              {confinedGases.map((gas) => (
                <div key={gas.key}>
                  <label htmlFor={`lectura-${gas.key}`} className={labelClass}>
                    {gas.label}
                  </label>
                  <input
                    id={`lectura-${gas.key}`}
                    name={gas.key}
                    type="number"
                    min={0}
                    step="any"
                    required
                    className={inputClass}
                  />
                </div>
              ))}
              <button className={primaryButtonClass}>Registrar lectura {readingCount + 1}</button>
            </form>
          )}
        </SectionCard>
      </div>

      <div className="mb-6">
        <SectionCard title="Riesgos">
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {confinedRiskCategories.map((category) => (
              <div key={category.key}>
                <dt className="text-xs font-bold uppercase tracking-wide text-neutral-dark">{category.title}</dt>
                <dd className="mt-0.5 text-base">{get_confined_selected(permit, category.key).join(", ")}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      </div>

      <details className="group mb-6 rounded-xl border border-neutral-light bg-white shadow-sm">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-3 hover:bg-neutral-light/15 [&::-webkit-details-marker]:hidden">
          <h2 className="text-2xl uppercase">Lista de verificación</h2>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-neutral-dark transition group-open:rotate-180 motion-reduce:transition-none">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <ul className="divide-y divide-neutral-light/60 border-t border-neutral-light px-5 py-2 text-sm">
          {confinedQuestions.map((question) => {
            const answer = String(permit.fields[get_confined_check_field(question.id)]);
            return (
              <li key={question.id} className="py-2">
                <div className="flex justify-between gap-4">
                  <span>
                    {question.id.slice(1)}. {question.text}
                  </span>
                  <span className="shrink-0 font-bold">
                    {checklistAnswerLabels[answer as ChecklistAnswer] ?? "—"}
                  </span>
                </div>
                {question.id === "q7" && (
                  <ul className="ml-4 mt-1 text-neutral-dark">
                    {confinedEquipment.map((item) => {
                      const equipmentAnswer = String(
                        permit.fields[get_confined_check_field(item.id)],
                      );
                      return (
                        <li key={item.id} className="flex justify-between gap-4">
                          <span>{item.label}</span>
                          <span className="shrink-0 font-bold">
                            {checklistAnswerLabels[equipmentAnswer as ChecklistAnswer] ?? "—"}
                          </span>
                        </li>
                      );
                    })}
                    {[permit.fields.otherEquipment1, permit.fields.otherEquipment2]
                      .filter((value) => typeof value === "string" && value)
                      .map((value) => (
                        <li key={String(value)}>Otro: {String(value)}</li>
                      ))}
                  </ul>
                )}
                {question.id === "q8" && permit.fields.ventilationTime && (
                  <p className="ml-4 text-neutral-dark">
                    Tiempo de ventilación: {String(permit.fields.ventilationTime)} · Cambios de
                    aire por hora: {String(permit.fields.airChanges)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </details>

      <div className="mb-6">
        <SectionCard title="Autorización de entrada">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {confinedApprovalSignatures.map((item) => (
              <SignatureBox
                key={item.key}
                action={sign_confined_permit}
                permit={permit}
                signatureKey={item.key}
                label={item.label}
                canSign={permit.status === "submitted"}
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
                            {Object.entries(confinedEvaluationLabels).map(([value, label]) => (
                              <label
                                key={value}
                                className="flex min-h-11 items-center gap-2 rounded-lg border border-neutral-light px-3 has-[:checked]:border-brand-navy has-[:checked]:bg-brand-navy has-[:checked]:text-white sm:min-h-10"
                              >
                                <input type="radio" name={`medical${index + 1}`} value={value} required className="h-4 w-4" />
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
        <SectionCard
          title="Conclusión del trabajo"
          description="Concluido el trabajo, se entrega el permiso al responsable operativo para verificar las condiciones finales del área intervenida y se regresa al departamento HSEA, que firma para cerrarlo."
        >
          <div className="max-w-xs">
            <SignatureBox
              action={sign_confined_permit}
              permit={permit}
              signatureKey={confinedClosingSignature.key}
              label={confinedClosingSignature.label}
              canSign={isApproved}
            />
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Historial">
        <ol className="space-y-2 border-l-2 border-neutral-light pl-4 text-sm">
          {events.map((event) => (
            <li key={event.id}>
              <span className="font-bold">{String(event.details.event ?? event.action)}</span>
              {event.details.key ? ` (${String(event.details.key)})` : ""}
              {event.details.outOfLimits ? " · FUERA DE LÍMITES" : ""}
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
