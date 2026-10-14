import { inputClass, primaryButtonClass } from "@/components/administracion/estilos";
import { ExecutorFields } from "@/components/permisos/ExecutorFields";
import { FormAlert } from "@/components/permisos/FormAlert";
import { PermitAreaField } from "@/components/permisos/PermitAreaField";
import { PermitField } from "@/components/permisos/PermitField";
import { SectionCard } from "@/components/permisos/SectionCard";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  get_heights_checklist_field,
  heightsAnswerLabels,
  heightsChecklist,
  heightsPpeOptions,
  heightsMaxExecutors,
  heightsSlug,
} from "@/config/trabajos_alturas";
import { find_permit_type } from "@/config/tipos_permiso";
import { require_permit_actor } from "@/lib/permisos/actor";
import { executorErrorMessages, load_executor_options } from "@/lib/permisos/ejecutantes";
import { create_heights_permit } from "@/lib/permisos/trabajos_alturas_acciones";

interface NewHeightsPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewHeightsPermitPage({
  searchParams,
}: NewHeightsPageProps) {
  const { error } = await searchParams;
  const executorOptions = await load_executor_options(await require_permit_actor());
  const today = new Date().toLocaleDateString("en-CA");
  const permitType = find_permit_type(heightsSlug);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Permisos de trabajo", href: "/permisos-trabajo" },
          { label: "Trabajos en alturas", href: `/permisos-trabajo/${heightsSlug}` },
          { label: "Nuevo" },
        ]}
      />
      <PageHeader
        title="Permiso para trabajos en alturas"
        eyebrow={
          permitType && (
            <span className="rounded-full bg-neutral-light/40 px-2.5 py-0.5 text-xs font-bold text-brand-navy">{permitType.formCode}</span>
          )
        }
        subtitle="Este permiso cubre únicamente el trabajo y área especificados, y debe mantenerse en un lugar visible en el lugar del trabajo. Es válido sólo en la fecha en que se solicita."
      />

      {error === "incomplete" && (
        <FormAlert>
          Completa todos los campos, indica al menos una persona ejecutora y responde toda la lista de verificación.
        </FormAlert>
      )}
      {error && executorErrorMessages[error] && <FormAlert>{executorErrorMessages[error]}</FormAlert>}

      <form action={create_heights_permit} className="space-y-6">
        <SectionCard step={1} title="Datos generales" description="Quién solicita el permiso, dónde y qué se va a hacer.">
          <div className="grid gap-4 sm:grid-cols-2">
            <PermitAreaField />
            <PermitField label="Depto. / Compañía" name="department" />
            <PermitField label="Fecha" name="date" type="date" defaultValue={today} />
            <PermitField label="Área de trabajo o espacio" name="workArea" />
            <PermitField label="Descripción del trabajo" name="description" rows={3} wide />
          </div>
        </SectionCard>

        <SectionCard
          step={2}
          title="Personas que ejecutan"
          description="La evaluación médica (apto / no apto) la registra el servicio médico al firmar."
        >
          <ExecutorFields options={executorOptions} maxExecutors={heightsMaxExecutors} requiredWorkType={"ALTURAS"} />
        </SectionCard>

        <SectionCard step={3} title="Horario" description="Hora de inicio y de terminación del trabajo.">
          <div className="grid gap-4 sm:grid-cols-2">
            <PermitField label="Hora de inicio del trabajo" name="startTime" type="time" />
            <PermitField label="Hora de terminación del trabajo" name="endTime" type="time" />
          </div>
        </SectionCard>

        <SectionCard
          step={4}
          title="Consideraciones de prevención"
          description="Antes de firmar este permiso, tanto el responsable de la ejecución como el operativo deberán inspeccionar el área aplicando el siguiente listado de verificación. Todas las preguntas son obligatorias."
        >
          <div className="space-y-4">
            {heightsChecklist.map((group) => (
              <fieldset key={group.title} className="rounded-xl border border-neutral-light p-4">
                <legend className="px-2 text-sm font-bold uppercase tracking-wide text-neutral-dark">{group.title}</legend>
                <ul className="divide-y divide-neutral-light/60">
                  {group.items.map((item) => (
                    <li key={item.id} className="py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="flex-1 basis-64">
                          {item.id}. {item.text}
                        </span>
                        <span className="flex gap-2">
                          {Object.entries(heightsAnswerLabels).map(([value, label]) => (
                            <label
                              key={value}
                              className="flex min-h-11 items-center gap-2 rounded-lg border border-neutral-light px-3 has-[:checked]:border-brand-navy has-[:checked]:bg-brand-navy has-[:checked]:text-white sm:min-h-10"
                            >
                              <input
                                type="radio"
                                name={get_heights_checklist_field(item.id)}
                                value={value}
                                required
                                className="h-4 w-4"
                              />
                              {label}
                            </label>
                          ))}
                        </span>
                      </div>
                      {item.id === "2" && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {heightsPpeOptions.map((option) => (
                            <label
                              key={option.slug}
                              className="flex min-h-11 items-center gap-2 rounded-lg border border-neutral-light px-3 sm:min-h-10"
                            >
                              <input type="checkbox" name="ppe" value={option.slug} className="h-4 w-4" />
                              {option.label}
                            </label>
                          ))}
                          <input
                            name="ppeOther"
                            placeholder="Otro"
                            aria-label="Otro equipo de protección personal"
                            className={`${inputClass} sm:max-w-48`}
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </fieldset>
            ))}
          </div>
        </SectionCard>

        <p className="rounded-xl border border-neutral-light bg-neutral-light/20 px-4 py-3 text-sm">
          Se han verificado las condiciones de este permiso por lo cual se garantiza que el área ha sido inspeccionada y se encuentra
          libre de riesgos. Se otorga el permiso para realizar el trabajo específico descrito y se verifica que los ejecutantes están
          calificados, conocen los riesgos y cuentan con el equipo de protección personal y las medidas de seguridad. Las firmas se
          registran después de crear el permiso.
        </p>

        <button type="submit" className={`${primaryButtonClass} px-8`}>
          Crear permiso
        </button>
      </form>
    </>
  );
}
