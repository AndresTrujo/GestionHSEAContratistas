import { primaryButtonClass } from "@/components/administracion/estilos";
import { ExecutorFields } from "@/components/permisos/ExecutorFields";
import { FormAlert } from "@/components/permisos/FormAlert";
import { PermitAreaField } from "@/components/permisos/PermitAreaField";
import { PermitField } from "@/components/permisos/PermitField";
import { SectionCard } from "@/components/permisos/SectionCard";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  checklistAnswerLabels,
  get_checklist_field,
  hotWorkActivities,
  hotWorkChecklist,
  hotWorkMaxExecutors,
  hotWorkSlug,
  hotWorkValidityHours,
} from "@/config/trabajos_calientes";
import { find_permit_type } from "@/config/tipos_permiso";
import { require_permit_actor } from "@/lib/permisos/actor";
import { executorErrorMessages, load_executor_options } from "@/lib/permisos/ejecutantes";
import { create_hot_work_permit } from "@/lib/permisos/trabajos_calientes_acciones";

interface NewHotWorkPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewHotWorkPermitPage({
  searchParams,
}: NewHotWorkPageProps) {
  const { error } = await searchParams;
  const executorOptions = await load_executor_options(await require_permit_actor());
  const today = new Date().toLocaleDateString("en-CA");
  const permitType = find_permit_type(hotWorkSlug);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Permisos de trabajo", href: "/permisos-trabajo" },
          { label: "Trabajos calientes", href: `/permisos-trabajo/${hotWorkSlug}` },
          { label: "Nuevo" },
        ]}
      />
      <PageHeader
        title="Permiso para trabajos calientes"
        eyebrow={
          permitType && (
            <span className="rounded-full bg-neutral-light/40 px-2.5 py-0.5 text-xs font-bold text-brand-navy">{permitType.formCode}</span>
          )
        }
        subtitle={`Cubre únicamente el área específica y debe mantenerse en un lugar visible en el lugar de trabajo. Válido por ${hotWorkValidityHours} horas.`}
      />

      {error === "incomplete" && (
        <FormAlert>
          Completa todos los campos, indica al menos una persona ejecutora y una actividad, y responde toda la lista de verificación.
        </FormAlert>
      )}
      {error && executorErrorMessages[error] && <FormAlert>{executorErrorMessages[error]}</FormAlert>}

      <form action={create_hot_work_permit} className="space-y-6">
        <SectionCard step={1} title="Datos generales" description="Quién solicita el permiso, dónde y qué se va a hacer.">
          <div className="grid gap-4 sm:grid-cols-2">
            <PermitAreaField />
            <PermitField label="Depto. / Compañía" name="department" />
            <PermitField label="Fecha" name="date" type="date" defaultValue={today} />
            <PermitField label="Área de trabajo o espacio" name="workArea" />
            <PermitField label="Solicitante" name="requesterName" />
            <PermitField label="Puesto del solicitante" name="requesterPosition" />
            <PermitField label="Descripción del trabajo" name="description" rows={3} wide />
          </div>
        </SectionCard>

        <SectionCard step={2} title="Personas que ejecutan" description="Quienes realizarán el trabajo en caliente.">
          <ExecutorFields options={executorOptions} maxExecutors={hotWorkMaxExecutors} requiredWorkType={"CALIENTES"} />
        </SectionCard>

        <SectionCard step={3} title="Tipo de trabajo y horario" description="Marca todas las actividades que apliquen.">
          <fieldset className="mb-5">
            <legend className="sr-only">Tipo de trabajo</legend>
            <div className="flex flex-wrap gap-3">
              {hotWorkActivities.map((activity) => (
                <label
                  key={activity.slug}
                  className="flex min-h-11 items-center gap-2 rounded-lg border border-neutral-light px-3 text-sm sm:min-h-10"
                >
                  <input type="checkbox" name="activities" value={activity.slug} className="h-4 w-4" />
                  {activity.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <PermitField label="Hora de inicio del trabajo" name="startTime" type="time" />
            <PermitField label="Hora de terminación del trabajo" name="endTime" type="time" />
          </div>
        </SectionCard>

        <SectionCard
          step={4}
          title="Lista de verificación"
          description="El permiso se autoriza únicamente cuando se haya validado la lista de verificación. Todas las preguntas son obligatorias."
        >
          <div className="space-y-4">
            {hotWorkChecklist.map((group) => (
              <fieldset key={group.title} className="rounded-xl border border-neutral-light p-4">
                <legend className="px-2 text-sm font-bold uppercase tracking-wide text-neutral-dark">{group.title}</legend>
                <ul className="divide-y divide-neutral-light/60">
                  {group.items.map((item) => (
                    <li key={item.number} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                      <span className="flex-1 basis-64">
                        {item.number}. {item.text}
                      </span>
                      <span className="flex gap-2">
                        {Object.entries(checklistAnswerLabels).map(([value, label]) => (
                          <label
                            key={value}
                            className="flex min-h-11 items-center gap-2 rounded-lg border border-neutral-light px-3 has-[:checked]:border-brand-navy has-[:checked]:bg-brand-navy has-[:checked]:text-white sm:min-h-10"
                          >
                            <input type="radio" name={get_checklist_field(item.number)} value={value} required className="h-4 w-4" />
                            {label}
                          </label>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </fieldset>
            ))}
          </div>
        </SectionCard>

        <p className="rounded-xl border border-neutral-light bg-neutral-light/20 px-4 py-3 text-sm">
          Se han verificado las condiciones de este permiso por lo cual se garantiza que el área ha sido inspeccionada y se encuentra
          libre de riesgo. Se concede el permiso para realizar un solo trabajo en caliente y se verifica que el ejecutor está calificado,
          conoce los riesgos y cuenta con el equipo de protección personal. Las firmas se registran después de crear el permiso.
        </p>

        <button type="submit" className={`${primaryButtonClass} px-8`}>
          Crear permiso
        </button>
      </form>
    </>
  );
}
