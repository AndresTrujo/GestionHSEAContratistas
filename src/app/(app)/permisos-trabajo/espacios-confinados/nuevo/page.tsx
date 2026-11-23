import { SubmitButton } from "@/components/ui/SubmitButton";
import { get_today_mx } from "@/lib/data/identidad";
import { notFound } from "next/navigation";
import { inputClass, labelClass, primaryButtonClass } from "@/components/administracion/estilos";
import { ExecutorFields } from "@/components/permisos/ExecutorFields";
import { FormAlert } from "@/components/permisos/FormAlert";
import { PermitAreaField } from "@/components/permisos/PermitAreaField";
import { PermitField } from "@/components/permisos/PermitField";
import { RequesterUnitField } from "@/components/permisos/RequesterUnitField";
import { SectionCard } from "@/components/permisos/SectionCard";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { checklistAnswerLabels } from "@/config/trabajos_calientes";
import {
  confinedEquipment,
  confinedGases,
  confinedMaxExecutors,
  confinedQuestions,
  confinedRiskCategories,
  confinedSlug,
  confinedValidityHours,
  get_confined_check_field,
  get_confined_executors,
  get_reading_field,
} from "@/config/espacios_confinados";
import { find_permit_type } from "@/config/tipos_permiso";
import { can_access_permit, can_edit_permit, require_permit_actor } from "@/lib/permisos/actor";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { executorErrorMessages, load_executor_options } from "@/lib/permisos/ejecutantes";
import { create_confined_permit } from "@/lib/permisos/espacios_confinados_acciones";
import { update_confined_permit } from "@/lib/permisos/edicion_permisos_acciones";

interface NewConfinedPageProps {
  searchParams: Promise<{ error?: string; editar?: string }>;
}

const optionClass =
  "flex min-h-11 items-center gap-2 rounded-lg border border-neutral-light px-3 has-[:checked]:border-brand-navy has-[:checked]:bg-brand-navy has-[:checked]:text-white sm:min-h-10";

/** Campo numérico de lectura de gases (admite decimales y no negativos). */
function GasField({ label, name, defaultValue, disabled = false }: { label: string; name: string; defaultValue?: string; disabled?: boolean }) {
  const id = `campo-${name}`;
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input id={id} name={name} type="number" min={0} step="any" required defaultValue={defaultValue} disabled={disabled} className={inputClass} />
    </div>
  );
}

function AnswerRadios({ name, defaultValue }: { name: string; defaultValue?: string }) {
  return (
    <span className="flex gap-2">
      {Object.entries(checklistAnswerLabels).map(([value, label]) => (
        <label key={value} className={optionClass}>
          <input type="radio" name={name} value={value} required defaultChecked={defaultValue === value} className="h-4 w-4" />
          {label}
        </label>
      ))}
    </span>
  );
}

export default async function NewConfinedPermitPage({
  searchParams,
}: NewConfinedPageProps) {
  const { error, editar } = await searchParams;
  const actor = await require_permit_actor();
  const editingPermit = editar ? await get_repositories().permits.get_by_id(editar) : null;
  if (editar && (!editingPermit || editingPermit.permitTypeSlug !== confinedSlug || !can_access_permit(actor, editingPermit) || !(await can_edit_permit(actor, editingPermit)))) notFound();
  const existingExecutors = editingPermit ? get_confined_executors(editingPermit) : [];
  const executorOffset = editingPermit ? Math.max(0, ...Object.entries(editingPermit.fields).flatMap(([key, value]) => { const match = /^executor(\d+)$/.exec(key); return match && typeof value === "string" && value.trim() ? [Number(match[1])] : []; })) : 0;
  const executorOptions = await load_executor_options(actor);
  const today = get_today_mx();
  const permitType = find_permit_type(confinedSlug);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Permisos de trabajo", href: "/permisos-trabajo" },
          { label: "Espacios confinados", href: `/permisos-trabajo/${confinedSlug}` },
          { label: editingPermit ? `Editar ${String(editingPermit.fields.folio)}` : "Nuevo" },
        ]}
      />
      <PageHeader
        title={editingPermit ? `Editar permiso · ${String(editingPermit.fields.folio)}` : "Permiso para entrada a espacios confinados"}
        eyebrow={
          permitType && (
            <span className="rounded-full bg-neutral-light/40 px-2.5 py-0.5 text-xs font-bold text-brand-navy">{permitType.formCode}</span>
          )
        }
        subtitle={`Este permiso debe mantenerse siempre visible en el área de trabajo mientras se ejecuta la actividad. Vigencia de ${confinedValidityHours} horas (un turno).`}
      />

      {error === "incomplete" && (
        <FormAlert>
          Completa todos los campos: al menos un ejecutante, una opción en cada categoría de riesgo, toda la lista de verificación y la
          lectura inicial de atmósfera.
        </FormAlert>
      )}
      {error && executorErrorMessages[error] && <FormAlert>{executorErrorMessages[error]}</FormAlert>}

      <form action={editingPermit ? update_confined_permit : create_confined_permit} className="space-y-6">
        {editingPermit && <input type="hidden" name="permitId" value={editingPermit.id} />}
        <SectionCard step={1} title="Datos generales" description="Quién solicita el permiso, dónde y qué se va a hacer.">
          <div className="grid gap-4 sm:grid-cols-2">
            <PermitAreaField initialArea={editingPermit?.area ?? null} />
            <RequesterUnitField name="company" initialValue={editingPermit ? String(editingPermit.fields.company ?? "") : undefined} />
            <PermitField label="Fecha" name="date" type="date" defaultValue={String(editingPermit?.fields.date ?? today)} />
            <PermitField label="Área de trabajo" name="workArea" defaultValue={String(editingPermit?.fields.workArea ?? "")} />
            <PermitField label="Tarea a realizar" name="task" defaultValue={String(editingPermit?.fields.task ?? "")} />
          </div>
        </SectionCard>

        <SectionCard step={2} title="Identificación del espacio confinado">
          <div className="grid gap-4 sm:grid-cols-2">
            <PermitField label="No." name="spaceNumber" defaultValue={String(editingPermit?.fields.spaceNumber ?? "")} />
            <fieldset>
              <legend className={labelClass}>Clasificación de riesgo</legend>
              <div className="flex gap-2">
                <label className={optionClass}>
                  <input type="radio" name="riskType" value="I" required defaultChecked={editingPermit?.fields.riskType === "I"} className="h-4 w-4" /> Tipo I
                </label>
                <label className={optionClass}>
                  <input type="radio" name="riskType" value="II" required defaultChecked={editingPermit?.fields.riskType === "II"} className="h-4 w-4" /> Tipo II
                </label>
              </div>
            </fieldset>
            <PermitField label="Ubicación del espacio confinado" name="location" defaultValue={String(editingPermit?.fields.location ?? "")} />
            <PermitField label="Puesto" name="position" defaultValue={String(editingPermit?.fields.position ?? "")} />
          </div>
        </SectionCard>

        <SectionCard
          step={3}
          title="Ejecutantes"
          description="Personal autorizado y capacitado que realizará el trabajo, y que conoce los riesgos y controles de seguridad. La evaluación médica (apto / no apto) la registra el servicio médico al firmar; las horas de entrada y salida se registran durante el trabajo."
        >
          {editingPermit && <div className="mb-4 rounded-xl border border-neutral-light p-4"><p className="mb-2 text-sm font-bold text-brand-navy">Ejecutantes actuales (se conservan)</p><ol className="list-decimal pl-5 text-sm">{existingExecutors.map((name, index) => <li key={index}>{name}</li>)}</ol></div>}
          {editingPermit && <p className="mb-3 text-sm text-neutral-dark">Los ejecutantes actuales y sus firmas no se modificarán. Agrega únicamente personas nuevas.</p>}
          <ExecutorFields options={executorOptions} maxExecutors={confinedMaxExecutors} requiredWorkType={"CONFINADOS"} startPosition={executorOffset} initialProviderId={editingPermit?.providerId ?? null} requireExecutor={!editingPermit} />
        </SectionCard>

        <SectionCard step={4} title="Horario y emergencia" description="Horario del trabajo y a quién llamar en caso de emergencia.">
          <div className="grid gap-4 sm:grid-cols-2">
            <PermitField label="Hora de inicio del trabajo" name="startTime" type="time" defaultValue={String(editingPermit?.fields.startTime ?? "")} />
            <PermitField label="Hora de terminación del trabajo" name="endTime" type="time" defaultValue={String(editingPermit?.fields.endTime ?? "")} />
            <PermitField label="En caso de emergencia llamar a" name="emergencyContact" defaultValue={String(editingPermit?.fields.emergencyContact ?? "")} />
            <PermitField label="Teléfono de emergencia" name="emergencyPhone" type="tel" defaultValue={String(editingPermit?.fields.emergencyPhone ?? "")} />
          </div>
        </SectionCard>

        <SectionCard
          step={5}
          title="Monitoreo de atmósferas"
          description="Lectura inicial. Las lecturas 2 a 5 se registran durante el trabajo. En caso de que un parámetro esté fuera de los límites, se deberá evacuar el espacio confinado."
        >
          <div className="mb-5 grid gap-4 sm:grid-cols-2">
            <fieldset>
              <legend className={labelClass}>Modo de monitoreo</legend>
              <div className="flex flex-wrap gap-2">
                <label className={optionClass}>
                  <input type="radio" name="monitoringMode" value="permanent" required defaultChecked={editingPermit?.fields.monitoringMode === "permanent"} className="h-4 w-4" />
                  Permanente
                </label>
                <label className={optionClass}>
                  <input type="radio" name="monitoringMode" value="periodic" required defaultChecked={editingPermit?.fields.monitoringMode === "periodic"} className="h-4 w-4" />
                  Periódico
                </label>
              </div>
            </fieldset>
            <div>
              <label htmlFor="campo-monitoringFrequency" className={labelClass}>
                Frecuencia (min, solo periódico)
              </label>
              <input id="campo-monitoringFrequency" name="monitoringFrequency" type="number" min={1} defaultValue={String(editingPermit?.fields.monitoringFrequency ?? "")} className={inputClass} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {confinedGases.map((gas) => (
              <GasField key={gas.key} label={`${gas.label} · ${gas.limitLabel}`} name={`initial_${gas.key}`} defaultValue={editingPermit ? String(editingPermit.fields[get_reading_field(1, gas.key)] ?? "") : undefined} disabled={Boolean(editingPermit)} />
            ))}
          </div>
        </SectionCard>

        <SectionCard
          step={6}
          title="Riesgos"
          description={'Marca al menos una opción en cada categoría ("No aplica" si corresponde).'}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {confinedRiskCategories.map((category) => (
              <fieldset key={category.key} className="rounded-xl border border-neutral-light p-4 text-sm">
                <legend className="px-2 text-sm font-bold uppercase tracking-wide text-neutral-dark">{category.title}</legend>
                {category.items.map((item) => (
                  <label key={item.slug} className="flex min-h-11 items-center gap-2 sm:min-h-10">
                    <input type="checkbox" name={category.key} value={item.slug} defaultChecked={String(editingPermit?.fields[category.key] ?? "").split(",").includes(item.slug)} className="h-4 w-4" />
                    {item.label}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          step={7}
          title="Lista de verificación"
          description="Se verifican en el área las condiciones del reverso del permiso. Todas las preguntas son obligatorias."
        >
          <ul className="divide-y divide-neutral-light/60 text-sm">
            {confinedQuestions.map((question) => (
              <li key={question.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex-1 basis-64">
                    {question.id.slice(1)}. {question.text}
                  </span>
                  <AnswerRadios name={get_confined_check_field(question.id)} defaultValue={String(editingPermit?.fields[get_confined_check_field(question.id)] ?? "")} />
                </div>

                {question.id === "q7" && (
                  <div className="mt-3 space-y-3 rounded-xl border border-neutral-light p-4">
                    {confinedEquipment.map((item) => (
                      <div key={item.id} className="flex flex-wrap items-center justify-between gap-3">
                        <span className="flex-1 basis-48">{item.label}</span>
                        <AnswerRadios name={get_confined_check_field(item.id)} defaultValue={String(editingPermit?.fields[get_confined_check_field(item.id)] ?? "")} />
                      </div>
                    ))}
                    <div className="grid gap-3 pt-2 sm:grid-cols-2">
                      <input name="otherEquipment1" defaultValue={String(editingPermit?.fields.otherEquipment1 ?? "")} placeholder="Otro" aria-label="Otro equipo 1" className={inputClass} />
                      <input name="otherEquipment2" defaultValue={String(editingPermit?.fields.otherEquipment2 ?? "")} placeholder="Otro" aria-label="Otro equipo 2" className={inputClass} />
                    </div>
                  </div>
                )}

                {question.id === "q8" && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input
                      name="ventilationTime"
                      defaultValue={String(editingPermit?.fields.ventilationTime ?? "")}
                      placeholder="Tiempo de ventilación (si aplica)"
                      aria-label="Tiempo de ventilación (si aplica)"
                      className={inputClass}
                    />
                    <input
                      name="airChanges"
                      defaultValue={String(editingPermit?.fields.airChanges ?? "")}
                      type="number"
                      min={0}
                      step="any"
                      placeholder="Cambios de aire por hora (si aplica)"
                      aria-label="Cambios de aire por hora (si aplica)"
                      className={inputClass}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>

        <p className="rounded-xl border border-neutral-light bg-neutral-light/20 px-4 py-3 text-sm">
          Se han verificado en el área las condiciones del reverso de este permiso, por lo cual se garantiza que el espacio confinado ha
          sido inspeccionado y se encuentra libre de riesgo; se concede el permiso de entrada y se verifica que el (los) ejecutor(es)
          están calificados y capacitados para el trabajo, conocen los riesgos y cuentan con el equipo de protección personal
          requerido. Las firmas se registran después de crear el permiso.
        </p>

        <SubmitButton className={`${primaryButtonClass} px-8`} pendingLabel={editingPermit ? "Guardando…" : "Creando…"}>
          {editingPermit ? "Guardar cambios" : "Crear permiso"}
        </SubmitButton>
      </form>
    </>
  );
}
