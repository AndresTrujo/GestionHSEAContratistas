import { inputClass, labelClass, primaryButtonClass } from "@/components/administracion/estilos";
import { notFound } from "next/navigation";
import { FormAlert } from "@/components/permisos/FormAlert";
import { JsaAnalysis } from "@/components/permisos/JsaAnalysis";
import { JsaForm, JsaSubmitButton } from "@/components/permisos/JsaForm";
import { ParticipantFields } from "@/components/permisos/ParticipantFields";
import { PermitAreaField } from "@/components/permisos/PermitAreaField";
import { PermitField } from "@/components/permisos/PermitField";
import { RequesterUnitField } from "@/components/permisos/RequesterUnitField";
import { SectionCard } from "@/components/permisos/SectionCard";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  get_level_class,
  get_risk_level,
  get_jsa_participants,
  jsaChecklists,
  jsaEnvironmental,
  jsaMaxParticipants,
  jsaPermitQuestions,
  jsaProbabilityLevels,
  jsaSeverityLevels,
  jsaSlug,
} from "@/config/jsa";
import { find_permit_type } from "@/config/tipos_permiso";
import { can_access_permit, can_edit_permit, require_permit_actor } from "@/lib/permisos/actor";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { executorErrorMessages, load_executor_options } from "@/lib/permisos/ejecutantes";
import { check_jsa_certifications, create_jsa, update_jsa } from "@/lib/permisos/jsa_acciones";

interface NewJsaPageProps {
  searchParams: Promise<{ error?: string; editar?: string }>;
}

const optionClass =
  "flex min-h-11 items-center gap-2 rounded-lg border border-neutral-light px-3 text-sm has-[:checked]:border-brand-navy has-[:checked]:bg-brand-navy has-[:checked]:text-white sm:min-h-10";

export default async function NewJsaPage({ searchParams }: NewJsaPageProps) {
  const { error, editar } = await searchParams;
  const actor = await require_permit_actor();
  const editingPermit = editar ? await get_repositories().permits.get_by_id(editar) : null;
  if (editar && (!editingPermit || editingPermit.permitTypeSlug !== jsaSlug || !can_access_permit(actor, editingPermit) || !(await can_edit_permit(actor, editingPermit)))) notFound();
  const executorOptions = await load_executor_options(actor);
  const existingParticipants = editingPermit ? get_jsa_participants(editingPermit) : [];
  const participantOffset = editingPermit ? Math.max(0, ...existingParticipants.map((item) => item.position)) : 0;
  const participantOptions = editingPermit?.providerId
    ? { ...executorOptions, fixedProviderId: Number(editingPermit.providerId) }
    : executorOptions;
  const now = new Date();
  const today = now.toLocaleDateString("en-CA");
  const currentTime = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const permitType = find_permit_type(jsaSlug);

  const legend = (
    <div className="mt-5 grid gap-3 text-xs lg:grid-cols-3">
      <div>
        <h3 className="mb-1 text-sm font-bold uppercase text-brand-navy">Probabilidad (P)</h3>
        {jsaProbabilityLevels.map((level) => (
          <p key={level.value} className={`mb-1 rounded px-2 py-1 ${get_level_class(level.value)}`}>
            <strong>
              {level.value} · {level.label}:
            </strong>{" "}
            {level.description}
          </p>
        ))}
      </div>
      <div>
        <h3 className="mb-1 text-sm font-bold uppercase text-brand-navy">Severidad (S)</h3>
        {jsaSeverityLevels.map((level) => (
          <p key={level.value} className={`mb-1 rounded px-2 py-1 ${get_level_class(level.value)}`}>
            <strong>
              {level.value} · {level.label}:
            </strong>{" "}
            {level.description}
          </p>
        ))}
      </div>
      <div>
        <h3 className="mb-1 text-sm font-bold uppercase text-brand-navy">Riesgo (R)</h3>
        {[4, 8, 12, 16].map((risk) => {
          const level = get_risk_level(risk);
          return (
            <p key={risk} className={`mb-1 rounded px-2 py-1 ${level.className}`}>
              <strong>
                {risk === 4 ? "R ≤ 4" : risk === 8 ? "5 – 8" : risk === 12 ? "9 – 12" : "R > 12"} · {level.label}:
              </strong>{" "}
              {level.description}
            </p>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Permisos de trabajo", href: "/permisos-trabajo" },
          { label: "Análisis de seguridad (JSA)", href: `/permisos-trabajo/${jsaSlug}` },
          { label: editingPermit ? `Editar ${String(editingPermit.fields.folio)}` : "Nuevo" },
        ]}
      />
      <PageHeader
        title={editingPermit ? `Editar JSA · ${String(editingPermit.fields.folio)}` : "Análisis de seguridad en el trabajo (JSA)"}
        eyebrow={
          permitType && (
            <span className="rounded-full bg-neutral-light/40 px-2.5 py-0.5 text-xs font-bold text-brand-navy">{permitType.formCode}</span>
          )
        }
        subtitle="El JSA debe llenarse en el lugar de trabajo y antes de realizar la actividad. Si durante la ejecución cambian las condiciones de trabajo o se identifican nuevos riesgos, se deben detener los trabajos y actualizar el JSA."
      />

      {error === "incomplete" && (
        <FormAlert>
          Completa los datos generales, responde las 4 preguntas de permiso, captura al menos un paso completo (peligros válidos, medidas
          de control, P y S) y al menos un participante.
        </FormAlert>
      )}
      {error && executorErrorMessages[error] && <FormAlert>{executorErrorMessages[error]}</FormAlert>}

      <JsaForm create_action={editingPermit ? update_jsa : create_jsa} check_action={check_jsa_certifications} className="space-y-6">
        {editingPermit && <input type="hidden" name="permitId" value={editingPermit.id} />}
        <SectionCard step={1} title="Datos generales" description="Dónde y qué trabajo se va a analizar.">
          <div className="grid gap-4 sm:grid-cols-2">
            <PermitAreaField initialArea={editingPermit?.area ?? null} />
            <PermitField label="Nombre del trabajo a ejecutar" name="jobName" defaultValue={String(editingPermit?.fields.jobName ?? "")} />
            <PermitField label="Ubicación del área de trabajo" name="location" defaultValue={String(editingPermit?.fields.location ?? "")} />
            <RequesterUnitField name="company" initialValue={editingPermit ? String(editingPermit.fields.company ?? "") : undefined} />
            <PermitField label="Fecha" name="date" type="date" defaultValue={String(editingPermit?.fields.date ?? today)} />
            <PermitField label="Hora" name="time" type="time" defaultValue={String(editingPermit?.fields.time ?? currentTime)} />
          </div>
        </SectionCard>

        <SectionCard
          step={2}
          title="¿Requiere permiso de trabajo?"
          description="Si todas las respuestas son NO, el trabajo no requiere permiso de trabajo. Si requiere alturas, espacios confinados o trabajos en caliente, se revisa que los colaboradores de contratista participantes tengan su DC-3 aprobado."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {jsaPermitQuestions.map((question) => (
              <fieldset key={question.field} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-light p-3">
                <legend className="sr-only">{question.label}</legend>
                <span aria-hidden="true" className="flex-1 basis-40 text-sm font-bold text-brand-navy">
                  {question.label}
                </span>
                <span className="flex gap-2">
                  <label className={optionClass}>
                    <input type="radio" name={question.field} value="yes" required defaultChecked={editingPermit?.fields[question.field] === "yes"} className="h-4 w-4" /> Sí
                  </label>
                  <label className={optionClass}>
                    <input type="radio" name={question.field} value="no" required defaultChecked={editingPermit?.fields[question.field] === "no"} className="h-4 w-4" /> No
                  </label>
                </span>
              </fieldset>
            ))}
          </div>
        </SectionCard>

        <JsaAnalysis legend={legend} initialPermit={editingPermit} />

        <SectionCard
          step={5}
          title="Check list y aspectos ambientales"
          description="Marca los check list de verificación aplicables y el impacto ambiental relacionado con el trabajo."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <fieldset className="rounded-xl border border-neutral-light p-4">
              <legend className="px-2 text-sm font-bold uppercase tracking-wide text-neutral-dark">
                Check list de verificación aplicables
              </legend>
              {jsaChecklists.map((item) => (
                <label key={item.slug} className="flex min-h-11 items-center gap-2 text-sm sm:min-h-10">
                  <input type="checkbox" name="checklists" value={item.slug} defaultChecked={String(editingPermit?.fields.checklists ?? "").split(",").includes(item.slug)} className="h-4 w-4" />
                  {item.label}
                </label>
              ))}
            </fieldset>
            <fieldset className="rounded-xl border border-neutral-light p-4">
              <legend className="px-2 text-sm font-bold uppercase tracking-wide text-neutral-dark">Aspectos ambientales</legend>
              <p className="mb-1 text-xs text-neutral-dark">Selecciona el impacto ambiental relacionado con el trabajo.</p>
              {jsaEnvironmental.map((item) => (
                <label key={item.slug} className="flex min-h-11 items-center gap-2 text-sm sm:min-h-10">
                  <input type="checkbox" name="environmental" value={item.slug} defaultChecked={String(editingPermit?.fields.environmental ?? "").split(",").includes(item.slug)} className="h-4 w-4" />
                  {item.label}
                </label>
              ))}
              <label htmlFor="campo-environmentalOther" className={`${labelClass} mt-2`}>
                Otro
              </label>
              <input id="campo-environmentalOther" name="environmentalOther" defaultValue={String(editingPermit?.fields.environmentalOther ?? "")} placeholder="Otro" className={inputClass} />
            </fieldset>
          </div>
        </SectionCard>

        <SectionCard
          step={6}
          title="Participantes"
          description="Personal que participa en el análisis de los riesgos y aspectos ambientales. Cada participante firma después de crear el JSA."
        >
          {editingPermit && existingParticipants.length > 0 && (
            <div className="mb-4 rounded-xl border border-neutral-light p-4">
              <p className="mb-2 text-sm font-bold text-brand-navy">Participantes actuales (se conservan sus datos y firmas)</p>
              <ul className="space-y-1 text-sm">
                {existingParticipants.map((participant) => <li key={participant.position}>#{participant.position} · {participant.name} · {participant.job} · {participant.company}</li>)}
              </ul>
            </div>
          )}
          <p className="mb-3 text-sm text-neutral-dark">{editingPermit ? "Agrega participantes nuevos; no se modificarán las firmas de quienes ya participaron." : "Personal que participa en el análisis de los riesgos y aspectos ambientales. Cada participante firma después de crear el JSA."}</p>
          <ParticipantFields options={participantOptions} maxParticipants={jsaMaxParticipants} startPosition={participantOffset} initialProviderId={editingPermit?.providerId ?? null} requireParticipant={!editingPermit} />
        </SectionCard>

        <JsaSubmitButton className={`${primaryButtonClass} px-8`} pendingLabel={editingPermit ? "Guardando…" : "Creando…"}>
          {editingPermit ? "Guardar cambios" : "Crear JSA"}
        </JsaSubmitButton>
      </JsaForm>
    </>
  );
}
