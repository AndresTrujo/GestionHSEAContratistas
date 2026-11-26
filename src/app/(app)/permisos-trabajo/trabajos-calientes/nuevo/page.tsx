import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { get_today_mx } from "@/lib/data/identidad";
import { primaryButtonClass } from "@/components/administracion/estilos";
import { ExecutorFields } from "@/components/permisos/ExecutorFields";
import { FormAlert } from "@/components/permisos/FormAlert";
import { PermitAreaField } from "@/components/permisos/PermitAreaField";
import { PermitField } from "@/components/permisos/PermitField";
import { RequesterUnitField } from "@/components/permisos/RequesterUnitField";
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
  get_executors,
} from "@/config/trabajos_calientes";
import { find_permit_type } from "@/config/tipos_permiso";
import { can_access_permit, can_edit_permit, require_permit_actor } from "@/lib/permisos/actor";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { executorErrorMessages, load_executor_options } from "@/lib/permisos/ejecutantes";
import { create_hot_work_permit } from "@/lib/permisos/trabajos_calientes_acciones";
import { update_hot_work_permit } from "@/lib/permisos/edicion_permisos_acciones";

interface NewHotWorkPageProps {
  searchParams: Promise<{ error?: string; editar?: string }>;
}

export default async function NewHotWorkPermitPage({
  searchParams,
}: NewHotWorkPageProps) {
  const { error, editar } = await searchParams;
  const actor = await require_permit_actor();
  const editingPermit = editar ? await get_repositories().permits.get_by_id(editar) : null;
  if (editar && (!editingPermit || editingPermit.permitTypeSlug !== hotWorkSlug || !can_access_permit(actor, editingPermit) || !(await can_edit_permit(actor, editingPermit)))) notFound();
  const existingExecutors = editingPermit ? get_executors(editingPermit) : [];
  const executorOffset = editingPermit ? Math.max(0, ...Object.entries(editingPermit.fields).flatMap(([key, value]) => { const match = /^executor(\d+)$/.exec(key); return match && typeof value === "string" && value.trim() ? [Number(match[1])] : []; })) : 0;
  const executorOptions = await load_executor_options(actor);
  const today = get_today_mx();
  const permitType = find_permit_type(hotWorkSlug);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Permisos de trabajo", href: "/permisos-trabajo" },
          { label: "Trabajos calientes", href: `/permisos-trabajo/${hotWorkSlug}` },
          { label: editingPermit ? `Editar ${String(editingPermit.fields.folio)}` : "Nuevo" },
        ]}
      />
      <PageHeader
        title={editingPermit ? `Editar permiso · ${String(editingPermit.fields.folio)}` : "Permiso para trabajos calientes"}
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

      <form action={editingPermit ? update_hot_work_permit : create_hot_work_permit} className="space-y-6">
        {editingPermit && <input type="hidden" name="permitId" value={editingPermit.id} />}
        <SectionCard step={1} title="Datos generales" description="Quién solicita el permiso, dónde y qué se va a hacer.">
          <div className="grid gap-4 sm:grid-cols-2">
            <PermitAreaField initialArea={editingPermit?.area ?? null} />
            <RequesterUnitField name="department" initialValue={editingPermit ? String(editingPermit.fields.department ?? "") : undefined} />
            <PermitField label="Fecha" name="date" type="date" defaultValue={String(editingPermit?.fields.date ?? today)} />
            <PermitField label="Área de trabajo o espacio" name="workArea" defaultValue={String(editingPermit?.fields.workArea ?? "")} />
            <PermitField label="Solicitante" name="requesterName" defaultValue={String(editingPermit?.fields.requesterName ?? "")} />
            <PermitField label="Puesto del solicitante" name="requesterPosition" defaultValue={String(editingPermit?.fields.requesterPosition ?? "")} />
            <PermitField label="Descripción del trabajo" name="description" rows={3} wide defaultValue={String(editingPermit?.fields.description ?? "")} />
          </div>
        </SectionCard>

        <SectionCard step={2} title="Personas que ejecutan" description="Quienes realizarán el trabajo en caliente.">
          {editingPermit && <div className="mb-4 rounded-xl border border-neutral-light p-4"><p className="mb-2 text-sm font-bold text-brand-navy">Ejecutantes actuales (se conservan)</p><ol className="list-decimal pl-5 text-sm">{existingExecutors.map((name, index) => <li key={index}>{name}</li>)}</ol></div>}
          {editingPermit && <p className="mb-3 text-sm text-neutral-dark">Los ejecutantes actuales y sus firmas no se modificarán. Agrega únicamente personas nuevas.</p>}
          <ExecutorFields options={executorOptions} maxExecutors={hotWorkMaxExecutors} requiredWorkType={"CALIENTES"} startPosition={executorOffset} initialProviderId={editingPermit?.providerId ?? null} requireExecutor={!editingPermit} />
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
                  <input type="checkbox" name="activities" value={activity.slug} defaultChecked={String(editingPermit?.fields.activities ?? "").split(",").includes(activity.slug)} className="h-4 w-4" />
                  {activity.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <PermitField label="Hora de inicio del trabajo" name="startTime" type="time" defaultValue={String(editingPermit?.fields.startTime ?? "")} />
            <PermitField label="Hora de terminación del trabajo" name="endTime" type="time" defaultValue={String(editingPermit?.fields.endTime ?? "")} />
          </div>
          <label className="mt-5 flex items-start gap-3 rounded-xl border border-neutral-light p-4 text-sm">
            <input type="checkbox" name="requiresTfsWorkSignature" defaultChecked={editingPermit?.fields.requiresTfsWorkSignature !== false} className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="block font-bold text-brand-navy">¿Se requiere la firma del Responsable del trabajo?</span>
              <span className="mt-1 block text-neutral-dark">Si no se requiere, el campo de firma quedará deshabilitado y no será necesario para autorizar el permiso.</span>
            </span>
          </label>
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
                            <input type="radio" name={get_checklist_field(item.number)} value={value} required defaultChecked={editingPermit?.fields[get_checklist_field(item.number)] === value} className="h-4 w-4" />
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

        <SubmitButton className={`${primaryButtonClass} px-8`} pendingLabel={editingPermit ? "Guardando…" : "Creando…"}>
          {editingPermit ? "Guardar cambios" : "Crear permiso"}
        </SubmitButton>
      </form>
    </>
  );
}
