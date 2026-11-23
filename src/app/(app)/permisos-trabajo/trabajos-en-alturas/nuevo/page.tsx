import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { inputClass, primaryButtonClass } from "@/components/administracion/estilos";
import { ExecutorFields } from "@/components/permisos/ExecutorFields";
import { FormAlert } from "@/components/permisos/FormAlert";
import { PermitAreaField } from "@/components/permisos/PermitAreaField";
import { PermitField } from "@/components/permisos/PermitField";
import { RequesterUnitField } from "@/components/permisos/RequesterUnitField";
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
  get_heights_executors,
} from "@/config/trabajos_alturas";
import { find_permit_type } from "@/config/tipos_permiso";
import { can_access_permit, can_edit_permit, require_permit_actor } from "@/lib/permisos/actor";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { executorErrorMessages, load_executor_options } from "@/lib/permisos/ejecutantes";
import { create_heights_permit } from "@/lib/permisos/trabajos_alturas_acciones";
import { update_heights_permit } from "@/lib/permisos/edicion_permisos_acciones";

interface NewHeightsPageProps {
  searchParams: Promise<{ error?: string; editar?: string }>;
}

export default async function NewHeightsPermitPage({
  searchParams,
}: NewHeightsPageProps) {
  const { error, editar } = await searchParams;
  const actor = await require_permit_actor();
  const editingPermit = editar ? await get_repositories().permits.get_by_id(editar) : null;
  if (editar && (!editingPermit || editingPermit.permitTypeSlug !== heightsSlug || !can_access_permit(actor, editingPermit) || !(await can_edit_permit(actor, editingPermit)))) notFound();
  const existingExecutors = editingPermit ? get_heights_executors(editingPermit) : [];
  const executorOffset = editingPermit ? Math.max(0, ...Object.entries(editingPermit.fields).flatMap(([key, value]) => { const match = /^executor(\d+)$/.exec(key); return match && typeof value === "string" && value.trim() ? [Number(match[1])] : []; })) : 0;
  const executorOptions = await load_executor_options(actor);
  const today = new Date().toLocaleDateString("en-CA");
  const permitType = find_permit_type(heightsSlug);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Permisos de trabajo", href: "/permisos-trabajo" },
          { label: "Trabajos en alturas", href: `/permisos-trabajo/${heightsSlug}` },
          { label: editingPermit ? `Editar ${String(editingPermit.fields.folio)}` : "Nuevo" },
        ]}
      />
      <PageHeader
        title={editingPermit ? `Editar permiso · ${String(editingPermit.fields.folio)}` : "Permiso para trabajos en alturas"}
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

      <form action={editingPermit ? update_heights_permit : create_heights_permit} className="space-y-6">
        {editingPermit && <input type="hidden" name="permitId" value={editingPermit.id} />}
        <SectionCard step={1} title="Datos generales" description="Quién solicita el permiso, dónde y qué se va a hacer.">
          <div className="grid gap-4 sm:grid-cols-2">
            <PermitAreaField initialArea={editingPermit?.area ?? null} />
            <RequesterUnitField name="department" initialValue={editingPermit ? String(editingPermit.fields.department ?? "") : undefined} />
            <PermitField label="Fecha" name="date" type="date" defaultValue={String(editingPermit?.fields.date ?? today)} />
            <PermitField label="Área de trabajo o espacio" name="workArea" defaultValue={String(editingPermit?.fields.workArea ?? "")} />
            <PermitField label="Descripción del trabajo" name="description" rows={3} wide defaultValue={String(editingPermit?.fields.description ?? "")} />
          </div>
        </SectionCard>

        <SectionCard
          step={2}
          title="Personas que ejecutan"
          description="La evaluación médica (apto / no apto) la registra el servicio médico al firmar."
        >
          {editingPermit && <div className="mb-4 rounded-xl border border-neutral-light p-4"><p className="mb-2 text-sm font-bold text-brand-navy">Ejecutantes actuales (se conservan)</p><ol className="list-decimal pl-5 text-sm">{existingExecutors.map((name, index) => <li key={index}>{name}</li>)}</ol></div>}
          {editingPermit && <p className="mb-3 text-sm text-neutral-dark">Los ejecutantes actuales y sus firmas no se modificarán. Agrega únicamente personas nuevas.</p>}
          <ExecutorFields options={executorOptions} maxExecutors={heightsMaxExecutors} requiredWorkType={"ALTURAS"} startPosition={executorOffset} initialProviderId={editingPermit?.providerId ?? null} requireExecutor={!editingPermit} />
        </SectionCard>

        <SectionCard step={3} title="Horario" description="Hora de inicio y de terminación del trabajo.">
          <div className="grid gap-4 sm:grid-cols-2">
            <PermitField label="Hora de inicio del trabajo" name="startTime" type="time" defaultValue={String(editingPermit?.fields.startTime ?? "")} />
            <PermitField label="Hora de terminación del trabajo" name="endTime" type="time" defaultValue={String(editingPermit?.fields.endTime ?? "")} />
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
                                defaultChecked={editingPermit?.fields[get_heights_checklist_field(item.id)] === value}
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
                              <input type="checkbox" name="ppe" value={option.slug} defaultChecked={String(editingPermit?.fields.ppe ?? "").split(",").includes(option.slug)} className="h-4 w-4" />
                              {option.label}
                            </label>
                          ))}
                          <input
                            name="ppeOther"
                            defaultValue={String(editingPermit?.fields.ppeOther ?? "")}
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

        <SubmitButton className={`${primaryButtonClass} px-8`} pendingLabel={editingPermit ? "Guardando…" : "Creando…"}>
          {editingPermit ? "Guardar cambios" : "Crear permiso"}
        </SubmitButton>
      </form>
    </>
  );
}
