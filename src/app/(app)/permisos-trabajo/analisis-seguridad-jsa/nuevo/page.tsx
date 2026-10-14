import { inputClass, labelClass, primaryButtonClass } from "@/components/administracion/estilos";
import { FormAlert } from "@/components/permisos/FormAlert";
import { JsaAnalysis } from "@/components/permisos/JsaAnalysis";
import { JsaForm } from "@/components/permisos/JsaForm";
import { ParticipantFields } from "@/components/permisos/ParticipantFields";
import { PermitAreaField } from "@/components/permisos/PermitAreaField";
import { PermitField } from "@/components/permisos/PermitField";
import { SectionCard } from "@/components/permisos/SectionCard";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  get_level_class,
  get_risk_level,
  jsaChecklists,
  jsaEnvironmental,
  jsaMaxParticipants,
  jsaPermitQuestions,
  jsaProbabilityLevels,
  jsaSeverityLevels,
  jsaSlug,
} from "@/config/jsa";
import { find_permit_type } from "@/config/tipos_permiso";
import { require_permit_actor } from "@/lib/permisos/actor";
import { executorErrorMessages, load_executor_options } from "@/lib/permisos/ejecutantes";
import { check_jsa_certifications, create_jsa } from "@/lib/permisos/jsa_acciones";

interface NewJsaPageProps {
  searchParams: Promise<{ error?: string }>;
}

const optionClass =
  "flex min-h-11 items-center gap-2 rounded-lg border border-neutral-light px-3 text-sm has-[:checked]:border-brand-navy has-[:checked]:bg-brand-navy has-[:checked]:text-white sm:min-h-10";

export default async function NewJsaPage({ searchParams }: NewJsaPageProps) {
  const { error } = await searchParams;
  const executorOptions = await load_executor_options(await require_permit_actor());
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
          { label: "Nuevo" },
        ]}
      />
      <PageHeader
        title="Análisis de seguridad en el trabajo (JSA)"
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

      <JsaForm create_action={create_jsa} check_action={check_jsa_certifications} className="space-y-6">
        <SectionCard step={1} title="Datos generales" description="Dónde y qué trabajo se va a analizar.">
          <div className="grid gap-4 sm:grid-cols-2">
            <PermitAreaField />
            <PermitField label="Nombre del trabajo a ejecutar" name="jobName" />
            <PermitField label="Ubicación del área de trabajo" name="location" />
            <PermitField label="Departamento / compañía" name="company" />
            <PermitField label="Fecha" name="date" type="date" defaultValue={today} />
            <PermitField label="Hora" name="time" type="time" defaultValue={currentTime} />
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
                    <input type="radio" name={question.field} value="yes" required className="h-4 w-4" /> Sí
                  </label>
                  <label className={optionClass}>
                    <input type="radio" name={question.field} value="no" required className="h-4 w-4" /> No
                  </label>
                </span>
              </fieldset>
            ))}
          </div>
        </SectionCard>

        <JsaAnalysis legend={legend} />

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
                  <input type="checkbox" name="checklists" value={item.slug} className="h-4 w-4" />
                  {item.label}
                </label>
              ))}
            </fieldset>
            <fieldset className="rounded-xl border border-neutral-light p-4">
              <legend className="px-2 text-sm font-bold uppercase tracking-wide text-neutral-dark">Aspectos ambientales</legend>
              <p className="mb-1 text-xs text-neutral-dark">Selecciona el impacto ambiental relacionado con el trabajo.</p>
              {jsaEnvironmental.map((item) => (
                <label key={item.slug} className="flex min-h-11 items-center gap-2 text-sm sm:min-h-10">
                  <input type="checkbox" name="environmental" value={item.slug} className="h-4 w-4" />
                  {item.label}
                </label>
              ))}
              <label htmlFor="campo-environmentalOther" className={`${labelClass} mt-2`}>
                Otro
              </label>
              <input id="campo-environmentalOther" name="environmentalOther" placeholder="Otro" className={inputClass} />
            </fieldset>
          </div>
        </SectionCard>

        <SectionCard
          step={6}
          title="Participantes"
          description="Personal que participa en el análisis de los riesgos y aspectos ambientales. Cada participante firma después de crear el JSA."
        >
          <ParticipantFields options={executorOptions} maxParticipants={jsaMaxParticipants} />
        </SectionCard>

        <button type="submit" className={`${primaryButtonClass} px-8`}>
          Crear JSA
        </button>
      </JsaForm>
    </>
  );
}
