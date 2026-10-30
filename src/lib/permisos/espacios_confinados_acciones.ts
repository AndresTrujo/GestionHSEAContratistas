"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checklistAnswerLabels } from "@/config/trabajos_calientes";
import {
  confinedApprovalSignatures,
  confinedChecklistIds,
  confinedClosingSignature,
  confinedEvaluationLabels,
  confinedGases,
  confinedMaxExecutors,
  confinedReadingCount,
  confinedRiskCategories,
  confinedSlug,
  find_confined_signature,
  get_confined_check_field,
  get_confined_executors,
  get_confined_valid_until,
  get_reading_count,
  get_reading_field,
  is_out_of_limits,
  is_reading_out_of_limits,
} from "@/config/espacios_confinados";
import type { AuditAction } from "@/domain/auditoria";
import type { WorkPermit } from "@/domain/permisos";
import { get_session } from "@/lib/auth/sesion";
import { get_repositories } from "@/lib/data/proveedor_datos";
import {
  can_access_permit,
  can_sign_key,
  employee_actor,
  get_actor_type,
  require_permit_actor,
  type PermitActor,
} from "./actor";
import { read_permit_area } from "./area";
import { read_executors, register_executor_participants } from "./ejecutantes";
import { sign_step } from "./firma";

const basePath = `/permisos-trabajo/${confinedSlug}`;
const pngDataUrlPrefix = "data:image/png;base64,";
const maxSignatureLength = 300_000;

function read_text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Lee un número finito y no negativo; devuelve null si no es válido. */
function read_number(formData: FormData, name: string): number | null {
  const text = read_text(formData, name);
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function require_employee_number(): Promise<string> {
  const session = await get_session();
  if (!session || session.kind !== "EMPLEADO") redirect("/login");
  return session.employeeNumber;
}

async function append_audit(
  permitId: string,
  action: AuditAction,
  actor: string,
  details: Record<string, string | number | boolean | null>,
): Promise<void> {
  await get_repositories().audit.append_event({
    entityType: "permisos_trabajo",
    entityId: permitId,
    action,
    actorType: get_actor_type(actor),
    actorId: actor,
    occurredAt: new Date().toISOString(),
    details,
  });
}

async function load_open_permit(formData: FormData, actor: PermitActor): Promise<WorkPermit> {
  const permit = await get_repositories().permits.get_by_id(
    read_text(formData, "permitId"),
  );
  if (!permit || permit.permitTypeSlug !== confinedSlug || !can_access_permit(actor, permit)) redirect(basePath);
  if (permit.status === "closed") redirect(`${basePath}/${permit.id}`);
  return permit;
}

function is_expired(permit: WorkPermit): boolean {
  const validUntil = get_confined_valid_until(permit);
  return validUntil !== null && validUntil.getTime() < Date.now();
}

export async function create_confined_permit(formData: FormData): Promise<void> {
  const actor = await require_permit_actor();
  const employeeNumber = actor.actorId;
  const repositories = get_repositories();
  const failure = `${basePath}/nuevo?error=incomplete`;

  const fields: WorkPermit["fields"] = {
    company: read_text(formData, "company"),
    date: read_text(formData, "date"),
    workArea: read_text(formData, "workArea"),
    task: read_text(formData, "task"),
    spaceNumber: read_text(formData, "spaceNumber"),
    riskType: read_text(formData, "riskType"),
    location: read_text(formData, "location"),
    position: read_text(formData, "position"),
    emergencyContact: read_text(formData, "emergencyContact"),
    emergencyPhone: read_text(formData, "emergencyPhone"),
    startTime: read_text(formData, "startTime"),
    endTime: read_text(formData, "endTime"),
    monitoringMode: read_text(formData, "monitoringMode"),
  };
  if (Object.values(fields).some((value) => !value)) redirect(failure);
  if (fields.riskType !== "I" && fields.riskType !== "II") redirect(failure);
  if (fields.monitoringMode !== "permanent" && fields.monitoringMode !== "periodic") {
    redirect(failure);
  }

  if (fields.monitoringMode === "periodic") {
    const frequency = read_number(formData, "monitoringFrequency");
    if (frequency === null || frequency === 0) redirect(failure);
    fields.monitoringFrequency = frequency;
  }

  const executors = await read_executors(formData, actor, confinedSlug, confinedMaxExecutors);
  if (!executors.ok) redirect(`${basePath}/nuevo?error=${executors.errorCode}`);
  executors.names.forEach((name, index) => {
    fields[`executor${index + 1}`] = name;
  });
  const executorCount = executors.names.filter(Boolean).length;
  if (executorCount === 0) redirect(failure);

  // Cada categoría de riesgo requiere al menos una opción ("No aplica" incluida).
  for (const category of confinedRiskCategories) {
    const validSlugs: string[] = category.items.map((item) => item.slug);
    const selected = formData
      .getAll(category.key)
      .filter((value): value is string => typeof value === "string")
      .filter((value) => validSlugs.includes(value));
    if (selected.length === 0) redirect(failure);
    fields[category.key] = selected.join(",");
  }

  const validAnswers: string[] = Object.keys(checklistAnswerLabels);
  for (const id of confinedChecklistIds) {
    const answer = read_text(formData, get_confined_check_field(id));
    if (!validAnswers.includes(answer)) redirect(failure);
    fields[get_confined_check_field(id)] = answer;
  }
  fields.otherEquipment1 = read_text(formData, "otherEquipment1");
  fields.otherEquipment2 = read_text(formData, "otherEquipment2");

  if (fields[get_confined_check_field("q8")] === "yes") {
    const airChanges = read_number(formData, "airChanges");
    const ventilationTime = read_text(formData, "ventilationTime");
    if (airChanges === null || !ventilationTime) redirect(failure);
    fields.ventilationTime = ventilationTime;
    fields.airChanges = airChanges;
  }

  // Lectura inicial de la atmósfera (obligatoria antes de autorizar la entrada).
  const now = new Date().toISOString();
  for (const gas of confinedGases) {
    const value = read_number(formData, `initial_${gas.key}`);
    if (value === null) redirect(failure);
    fields[get_reading_field(1, gas.key)] = value;
  }
  fields.reading1At = now;
  fields.reading1By = employeeNumber;

  const selectedArea = await read_permit_area(formData);
  if (!selectedArea) redirect(`${basePath}/nuevo?error=incomplete`);
  const existing = await repositories.permits.list_by_type(confinedSlug);
  const year = new Date().getFullYear();
  fields.folio = `EC-${year}-${String(existing.length + 1).padStart(4, "0")}`;

  const permit = await repositories.permits.save({
    id: crypto.randomUUID(),
    permitTypeSlug: confinedSlug,
    status: "submitted",
    requestedByEmployeeNumber: actor.actorType === "EMPLEADO" ? employeeNumber : "",
    requestedByProviderUserId: actor.providerUserId,
    providerId: executors.providerId,
    area: selectedArea.area,
    signatures: [],
    fields,
    createdAt: now,
    createdBy: employeeNumber,
    updatedAt: now,
    updatedBy: employeeNumber,
  });

  await register_executor_participants(permit.id, executors, actor);
  await append_audit(permit.id, "crear", employeeNumber, {
    folio: String(fields.folio),
    initialReadingOutOfLimits: is_reading_out_of_limits(permit, 1),
  });
  redirect(`${basePath}/${permit.id}`);
}

/** Firma de autorización o firma final de HSEA al concluir el trabajo. */
export async function sign_confined_permit(formData: FormData): Promise<void> {
  const actor = await require_permit_actor();
  const employeeNumber = actor.actorId;
  const permit = await load_open_permit(formData, actor);
  const key = read_text(formData, "key");
  const detailPath = `${basePath}/${permit.id}`;
  if (!can_sign_key(actor, key)) redirect(`${detailPath}?error=role`);

  const isApprovalKey = confinedApprovalSignatures.some((item) => item.key === key);
  const isClosingKey = key === confinedClosingSignature.key;
  if (!isApprovalKey && !isClosingKey) redirect(detailPath);
  if (find_confined_signature(permit, key)) redirect(detailPath);

  // Segregación: una misma persona no puede firmar dos roles del permiso.
  if (!actor.isAdmin && permit.signatures.some((item) => item.employeeNumber === employeeNumber)) {
    redirect(`${detailPath}?error=same_person`);
  }

  const image = read_text(formData, "signatureImage");
  if (!image.startsWith(pngDataUrlPrefix) || image.length > maxSignatureLength) {
    redirect(`${detailPath}?error=signature`);
  }

  const fields = { ...permit.fields };

  if (isApprovalKey) {
    if (permit.status !== "submitted") redirect(detailPath);
    if (is_reading_out_of_limits(permit, 1)) redirect(`${detailPath}?error=initial_limits`);

    if (key === "medical_service") {
      // La evaluación médica de cada ejecutante se registra al firmar.
      const executors = get_confined_executors(permit);
      for (let position = 1; position <= executors.length; position += 1) {
        const evaluation = read_text(formData, `medical${position}`);
        if (!(evaluation in confinedEvaluationLabels)) {
          redirect(`${detailPath}?error=medical`);
        }
        fields[`medical${position}`] = evaluation;
      }
    }
  } else {
    // HSEA verifica las condiciones finales: nadie debe seguir dentro.
    if (permit.status !== "approved") redirect(detailPath);
    const executors = get_confined_executors(permit);
    const someoneInside = executors.some(
      (_, index) =>
        permit.fields[`entry${index + 1}At`] && !permit.fields[`exit${index + 1}At`],
    );
    if (someoneInside) redirect(`${detailPath}?error=inside`);
  }

  const attempt = await sign_step(actor, permit, key, image, read_text(formData, "pin"));
  if (!attempt.ok) redirect(`${detailPath}?error=${attempt.errorCode}`);
  const now = new Date().toISOString();
  const signatures = [
    ...permit.signatures,
    attempt.signature,
  ];
  const allApproved = confinedApprovalSignatures.every((item) =>
    signatures.some((signature) => signature.key === item.key),
  );
  const status = isClosingKey ? "closed" : allApproved ? "approved" : permit.status;

  await get_repositories().permits.save({
    ...permit,
    fields,
    signatures,
    status,
    updatedAt: now,
    updatedBy: employeeNumber,
  });
  await append_audit(permit.id, "firmar", employeeNumber, {
    event: "sign",
    key,
    status,
  });

  revalidatePath(detailPath);
  redirect(detailPath);
}

/** Registra la hora de entrada o salida de un ejecutante. */
export async function record_confined_movement(formData: FormData): Promise<void> {
  const employeeNumber = await require_employee_number();
  const permit = await load_open_permit(formData, employee_actor(employeeNumber));
  const detailPath = `${basePath}/${permit.id}`;
  const position = Number(read_text(formData, "position"));
  const kind = read_text(formData, "kind");
  const executors = get_confined_executors(permit);

  if (
    permit.status !== "approved" ||
    !Number.isInteger(position) ||
    position < 1 ||
    position > executors.length ||
    (kind !== "entry" && kind !== "exit")
  ) {
    redirect(detailPath);
  }

  const entryField = `entry${position}At`;
  const exitField = `exit${position}At`;
  const fields = { ...permit.fields };

  if (kind === "entry") {
    if (permit.fields[entryField]) redirect(detailPath);
    if (permit.fields[`medical${position}`] !== "fit") redirect(`${detailPath}?error=unfit`);
    if (is_expired(permit)) redirect(`${detailPath}?error=expired`);
    // No se permite entrar si la última lectura está fuera de límites.
    if (is_reading_out_of_limits(permit, get_reading_count(permit))) {
      redirect(`${detailPath}?error=atmosphere`);
    }
  } else if (!permit.fields[entryField] || permit.fields[exitField]) {
    redirect(detailPath);
  }

  const now = new Date().toISOString();
  fields[kind === "entry" ? entryField : exitField] = now;
  fields[`${kind}${position}By`] = employeeNumber;

  await get_repositories().permits.save({
    ...permit,
    fields,
    updatedAt: now,
    updatedBy: employeeNumber,
  });
  await append_audit(permit.id, "actualizar", employeeNumber, {
    event: kind === "entry" ? "entry" : "exit",
    executor: position,
  });

  revalidatePath(detailPath);
  redirect(detailPath);
}

/** Registra una lectura de atmósfera posterior a la inicial (hasta 5 en total). */
export async function record_confined_reading(formData: FormData): Promise<void> {
  const employeeNumber = await require_employee_number();
  const permit = await load_open_permit(formData, employee_actor(employeeNumber));
  const detailPath = `${basePath}/${permit.id}`;
  if (permit.status !== "approved") redirect(detailPath);
  if (is_expired(permit)) redirect(`${detailPath}?error=expired`);

  const position = get_reading_count(permit) + 1;
  if (position > confinedReadingCount) redirect(`${detailPath}?error=readings_full`);

  const now = new Date().toISOString();
  const fields = { ...permit.fields };
  for (const gas of confinedGases) {
    const value = read_number(formData, gas.key);
    if (value === null) redirect(`${detailPath}?error=reading`);
    fields[get_reading_field(position, gas.key)] = value;
  }
  fields[`reading${position}At`] = now;
  fields[`reading${position}By`] = employeeNumber;

  const saved = await get_repositories().permits.save({
    ...permit,
    fields,
    updatedAt: now,
    updatedBy: employeeNumber,
  });
  const outOfLimits = confinedGases.some((gas) =>
    is_out_of_limits(gas.key, Number(fields[get_reading_field(position, gas.key)])),
  );
  await append_audit(saved.id, "actualizar", employeeNumber, {
    event: "reading",
    reading: position,
    outOfLimits,
  });

  revalidatePath(detailPath);
  redirect(detailPath);
}
