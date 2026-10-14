import { inputClass, labelClass, primaryButtonClass } from "@/components/administracion/estilos";
import { FormAlert } from "@/components/permisos/FormAlert";
import { PermitAreaField } from "@/components/permisos/PermitAreaField";
import { PermitField } from "@/components/permisos/PermitField";
import { SectionCard } from "@/components/permisos/SectionCard";
import { StopPeopleFields } from "@/components/permisos/StopPeopleFields";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  damageClasses,
  stopCategories,
  stopSlug,
} from "@/config/observacion_stop";
import { find_permit_type } from "@/config/tipos_permiso";
import { require_permit_actor } from "@/lib/permisos/actor";
import { load_executor_options } from "@/lib/permisos/ejecutantes";
import { create_stop_observation } from "@/lib/permisos/observacion_stop_acciones";

interface NewStopPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewStopObservationPage({
  searchParams,
}: NewStopPageProps) {
  const { error } = await searchParams;
  const executorOptions = await load_executor_options(await require_permit_actor());
  const today = new Date().toLocaleDateString("en-CA");
  const permitType = find_permit_type(stopSlug);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Permisos de trabajo", href: "/permisos-trabajo" },
          { label: "Observación preventiva STOP", href: `/permisos-trabajo/${stopSlug}` },
          { label: "Nueva" },
        ]}
      />
      <PageHeader
        title="Seguridad en el trabajo por la observación preventiva"
        eyebrow={
          permitType && (
            <span className="rounded-full bg-neutral-light/40 px-2.5 py-0.5 text-xs font-bold text-brand-navy">{permitType.formCode}</span>
          )
        }
        subtitle="Las firmas del observado y del supervisor se registran después de crear la observación."
      />

      {error === "incomplete" && (
        <FormAlert>
          Completa todos los campos, marca al menos un acto, condición o aspecto
          ambiental, y selecciona la clase del potencial de daño.
        </FormAlert>
      )}
      {error === "people" && (
        <FormAlert>
          Alguna de las personas elegidas no existe o está inactiva. Revisa al observador, al observado y al supervisor.
        </FormAlert>
      )}
      {error === "observed_not_green" && (
        <FormAlert>Solo puede ser observado un colaborador de proveedor con semáforo verde.</FormAlert>
      )}
      {error === "same_people" && (
        <FormAlert>El observado no puede ser el observador, el supervisor ni quien registra la observación.</FormAlert>
      )}

      <form action={create_stop_observation} className="space-y-6">
        <SectionCard step={1} title="Datos generales" description="Quién observa, dónde y cuándo.">
          <div className="grid gap-4 sm:grid-cols-2">
            <PermitAreaField />
            <PermitField label="Fecha" name="date" type="date" defaultValue={today} />
            <PermitField label="Ubicación del acto / condición" name="location" />
            <PermitField label="Compañía" name="company" />
          </div>
        </SectionCard>

        <SectionCard step={2} title="Personas" description="Observador y supervisor son personal TFS; el observado puede ser TFS o de un proveedor.">
          <StopPeopleFields options={executorOptions} />
        </SectionCard>

        <SectionCard
          step={3}
          title="Actos, condiciones y aspectos"
          description="Marca al menos uno; puedes agregar otros en el campo correspondiente."
        >
          <div className="space-y-4">
            {stopCategories.map((category) => (
              <fieldset key={category.key} className="rounded-xl border border-neutral-light p-4">
                <legend className="px-2 text-sm font-bold uppercase tracking-wide text-neutral-dark">{category.title}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {category.items.map((item) => (
                    <label
                      key={item.slug}
                      className="flex min-h-11 items-center gap-2 rounded-lg border border-neutral-light px-3 text-sm sm:min-h-10"
                    >
                      <input type="checkbox" name={category.key} value={item.slug} className="h-4 w-4" />
                      {item.label}
                    </label>
                  ))}
                  <input
                    name={`${category.key}Other`}
                    placeholder="Otro"
                    aria-label={`Otro (${category.title})`}
                    className={inputClass}
                  />
                </div>
              </fieldset>
            ))}
          </div>
        </SectionCard>

        <SectionCard step={4} title="Descripción">
          <label htmlFor="campo-description" className={labelClass}>
            Descripción del acto / condición insegura
          </label>
          <textarea id="campo-description" name="description" required rows={5} className={inputClass} />
        </SectionCard>

        <SectionCard step={5} title="Calificación del potencial de daño" description="Selecciona una clase.">
          <fieldset>
            <legend className="sr-only">Clase del potencial de daño</legend>
            <div className="space-y-2">
              {damageClasses.map((item) => (
                <label
                  key={item.value}
                  className="flex min-h-11 items-start gap-3 rounded-lg border border-neutral-light p-3 text-sm has-[:checked]:border-brand-navy has-[:checked]:ring-2 has-[:checked]:ring-brand-cyan"
                >
                  <input type="radio" name="damageClass" value={item.value} required className="mt-1 h-4 w-4" />
                  <span className={`w-24 shrink-0 rounded px-2 py-1 text-center font-bold ${item.className}`}>
                    {item.level} · {item.value}
                  </span>
                  <span>{item.description}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </SectionCard>

        <SectionCard step={6} title="Acciones y compromisos">
          <label htmlFor="campo-actions" className={labelClass}>
            Acciones inmediatas tomadas, recomendaciones o compromisos
          </label>
          <textarea id="campo-actions" name="actions" required rows={5} className={inputClass} />
        </SectionCard>

        <button type="submit" className={`${primaryButtonClass} px-8`}>
          Crear observación
        </button>
      </form>
    </>
  );
}
