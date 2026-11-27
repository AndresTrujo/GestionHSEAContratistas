"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  get_jsa_participants,
  get_participant_key,
  jsaApprovalSignatures,
  jsaChecklists,
  jsaEnvironmental,
  jsaMaxParticipants,
  jsaMaxSteps,
  jsaPermitQuestions,
  jsaRiskIds,
  jsaScale,
  jsaSlug,
} from "@/config/jsa";
import type { WorkPermit } from "@/domain/permisos";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { get_year_mx } from "@/lib/data/identidad";
import { notify_permit_created, notify_permit_signed } from "@/lib/notificaciones/avisos";
import { can_access_permit, can_edit_permit, can_sign_key, require_permit_actor } from "./actor";
import { read_permit_area } from "./area";
import { find_jsa_certification_issues, type CertificationIssue } from "./certificaciones_jsa";
import { can_sign_participant, read_jsa_participants, register_jsa_participants } from "./ejecutantes";
import { sign_step } from "./firma";
import { resolve_requester_unit } from "./unidad_solicitante";

const basePath = `/permisos-trabajo/${jsaSlug}`;
const pngDataUrlPrefix = "data:image/png;base64,";
const maxSignatureLength = 300_000;

function read_text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function read_list(formData: FormData, name: string, validValues: string[]): string[] {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === "string")
    .filter((value) => validValues.includes(value));
}

/**
 * Aviso previo a crear el JSA: qué colaboradores de contratista no tienen las certificaciones del trabajo.
 * Se llama desde el formulario antes de enviarlo, para mostrar el aviso sin perder lo capturado.
 */
export async function check_jsa_certifications(formData: FormData): Promise<CertificationIssue[]> {
  return find_jsa_certification_issues(formData, await require_permit_actor());
}

export async function create_jsa(formData: FormData): Promise<void> {
  const actor = await require_permit_actor();
  const employeeNumber = actor.actorId;
  const repositories = get_repositories();
  const failure = `${basePath}/nuevo?error=incomplete`;

  const fields: WorkPermit["fields"] = {
    date: read_text(formData, "date"),
    time: read_text(formData, "time"),
    jobName: read_text(formData, "jobName"),
    location: read_text(formData, "location"),
    // Lo elegido en el selector si es una opción permitida; si no, el de su perfil.
    company: await resolve_requester_unit(formData, "company"),
  };
  if (Object.values(fields).some((value) => !value)) redirect(failure);

  for (const question of jsaPermitQuestions) {
    const answer = read_text(formData, question.field);
    if (answer !== "yes" && answer !== "no") redirect(failure);
    fields[question.field] = answer;
  }

  // Pasos del trabajo: las filas vacías se omiten y las demás se renumeran.
  const scale: number[] = [...jsaScale];
  let stepCount = 0;
  for (let row = 1; row <= jsaMaxSteps; row += 1) {
    const description = read_text(formData, `step${row}Description`);
    const hazards = read_text(formData, `step${row}Hazards`);
    const controls = read_text(formData, `step${row}Controls`);
    const probability = Number(read_text(formData, `step${row}P`));
    const severity = Number(read_text(formData, `step${row}S`));
    const isRowEmpty = !description && !hazards && !controls;
    if (isRowEmpty) continue;

    const hazardIds = hazards.split(/[,\s]+/).filter(Boolean);
    const isValid =
      description &&
      controls &&
      hazardIds.length > 0 &&
      hazardIds.every((id) => jsaRiskIds.includes(id) || /^\d{1,2}$/.test(id)) &&
      scale.includes(probability) &&
      scale.includes(severity);
    if (!isValid) redirect(failure);

    stepCount += 1;
    fields[`step${stepCount}Description`] = description;
    fields[`step${stepCount}Hazards`] = hazardIds.join(", ");
    fields[`step${stepCount}Controls`] = controls;
    fields[`step${stepCount}P`] = probability;
    fields[`step${stepCount}S`] = severity;
    fields[`step${stepCount}R`] = probability * severity;
  }
  if (stepCount === 0) redirect(failure);
  fields.stepCount = stepCount;

  fields.risks = read_list(formData, "risks", jsaRiskIds).join(",");
  fields.checklists = read_list(
    formData,
    "checklists",
    jsaChecklists.map((item) => item.slug),
  ).join(",");
  fields.environmental = read_list(
    formData,
    "environmental",
    jsaEnvironmental.map((item) => item.slug),
  ).join(",");
  fields.environmentalOther = read_text(formData, "environmentalOther");

  // Respaldo del aviso del formulario: sin las certificaciones del trabajo no se crea el JSA.
  if ((await find_jsa_certification_issues(formData, actor)).length > 0) redirect(`${basePath}/nuevo?error=certifications`);

  const participants = await read_jsa_participants(formData, actor, jsaMaxParticipants);
  if (!participants.ok) redirect(`${basePath}/nuevo?error=${participants.errorCode}`);
  for (const row of participants.rows) {
    fields[`participant${row.position}Name`] = row.name;
    fields[`participant${row.position}Job`] = row.job;
    fields[`participant${row.position}Company`] = row.company;
  }
  if (participants.rows.length === 0) redirect(failure);
  fields.participantCount = Math.max(jsaMaxParticipants, ...participants.rows.map((row) => row.position));

  const selectedArea = await read_permit_area(formData);
  if (!selectedArea) redirect(`${basePath}/nuevo?error=incomplete`);
  const existing = await repositories.permits.list_by_type(jsaSlug);
  const year = get_year_mx();
  fields.folio = `JSA-${year}-${String(existing.length + 1).padStart(4, "0")}`;

  const now = new Date().toISOString();
  const permit = await repositories.permits.save({
    id: crypto.randomUUID(),
    permitTypeSlug: jsaSlug,
    status: "submitted",
    requestedByEmployeeNumber: actor.actorType === "EMPLEADO" ? employeeNumber : "",
    requestedByProviderUserId: actor.providerUserId,
    providerId: participants.providerId,
    area: selectedArea.area,
    signatures: [],
    fields,
    createdAt: now,
    createdBy: employeeNumber,
    updatedAt: now,
    updatedBy: employeeNumber,
  });

  await register_jsa_participants(permit.id, participants, actor);
  await repositories.audit.append_event({
    entityType: "permisos_trabajo",
    entityId: permit.id,
    action: "crear",
    actorType: actor.actorType,
    actorId: employeeNumber,
    occurredAt: now,
    details: { folio: String(fields.folio), steps: stepCount },
  });
  notify_permit_created(permit, employeeNumber);
  redirect(`${basePath}/${permit.id}`);
}


/**
 * Actualiza un JSA reutilizando el mismo formato de creación. Conserva folio, estado y firmas existentes;
 * los nuevos participantes ocupan posiciones nuevas y solo ellos quedan sin firma.
 */
export async function update_jsa(formData: FormData): Promise<void> {
  const actor = await require_permit_actor();
  const repositories = get_repositories();
  const permitId = read_text(formData, "permitId");
  const permit = await repositories.permits.get_by_id(permitId);
  if (!permit || permit.fields.deletedAt || permit.permitTypeSlug !== jsaSlug || !can_access_permit(actor, permit) || !(await can_edit_permit(actor, permit))) {
    redirect(basePath);
  }
  const detailPath = `${basePath}/${permit.id}`;
  const failure = `${basePath}/nuevo?editar=${permit.id}&error=incomplete`;

  const fields: WorkPermit["fields"] = {
    ...permit.fields,
    date: read_text(formData, "date"),
    time: read_text(formData, "time"),
    jobName: read_text(formData, "jobName"),
    location: read_text(formData, "location"),
    company: read_text(formData, "company") === String(permit.fields.company ?? "")
      ? read_text(formData, "company")
      : await resolve_requester_unit(formData, "company"),
  };
  if (!fields.date || !fields.time || !fields.jobName || !fields.location || !fields.company) redirect(failure);

  for (const question of jsaPermitQuestions) {
    const answer = read_text(formData, question.field);
    if (answer !== "yes" && answer !== "no") redirect(failure);
    fields[question.field] = answer;
  }

  const scale: number[] = [...jsaScale];
  let stepCount = 0;
  for (let row = 1; row <= jsaMaxSteps; row += 1) {
    const description = read_text(formData, `step${row}Description`);
    const hazards = read_text(formData, `step${row}Hazards`);
    const controls = read_text(formData, `step${row}Controls`);
    const probability = Number(read_text(formData, `step${row}P`));
    const severity = Number(read_text(formData, `step${row}S`));
    if (!description && !hazards && !controls) continue;
    const hazardIds = hazards.split(/[,\s]+/).filter(Boolean);
    if (!description || !controls || hazardIds.length === 0 ||
      !hazardIds.every((id) => jsaRiskIds.includes(id) || /^\d{1,2}$/.test(id)) ||
      !scale.includes(probability) || !scale.includes(severity)) redirect(failure);
    stepCount += 1;
    fields[`step${stepCount}Description`] = description;
    fields[`step${stepCount}Hazards`] = hazardIds.join(", ");
    fields[`step${stepCount}Controls`] = controls;
    fields[`step${stepCount}P`] = probability;
    fields[`step${stepCount}S`] = severity;
    fields[`step${stepCount}R`] = probability * severity;
  }
  if (stepCount === 0) redirect(failure);
  fields.stepCount = stepCount;
  fields.risks = read_list(formData, "risks", jsaRiskIds).join(",");
  fields.checklists = read_list(formData, "checklists", jsaChecklists.map((item) => item.slug)).join(",");
  fields.environmental = read_list(formData, "environmental", jsaEnvironmental.map((item) => item.slug)).join(",");
  fields.environmentalOther = read_text(formData, "environmentalOther");

  const previousParticipants = await repositories.participants.list_by_permit(permit.id);
  const previousParticipantPositions = get_jsa_participants(permit).map((row) => row.position);
  const lastPreviousPosition = Math.max(0, ...previousParticipantPositions);
  const hasNewParticipantInput = [...formData.entries()].some(([name, value]) => {
    const match = /^(?:participantStaff|participantEmployee|participant)(\d+)(?:Name|Job|Company)?$/.exec(name);
    return Boolean(match && Number(match[1]) > lastPreviousPosition && typeof value === "string" && value.trim());
  });
  const participants = hasNewParticipantInput
    ? await read_jsa_participants(formData, actor, jsaMaxParticipants)
    : { ok: true as const, providerId: permit.providerId, rows: [] };
  if (!participants.ok) redirect(`${basePath}/nuevo?editar=${permit.id}&error=${participants.errorCode}`);
  if (participants.rows.some((row) => row.position <= lastPreviousPosition)) {
    redirect(`${basePath}/nuevo?editar=${permit.id}&error=participant_invalid`);
  }
  const duplicatesExisting = participants.rows.some((row) => row.link && previousParticipants.some((existing) => {
    if (existing.role !== "participant") return false;
    if (row.link?.kind === "EMPLEADO" && existing.participant.kind === "EMPLEADO") {
      return row.link.employeeNumber === existing.participant.employeeNumber;
    }
    if (row.link?.kind === "EMPLEADO_PROVEEDOR" && existing.participant.kind === "EMPLEADO_PROVEEDOR") {
      return row.link.providerEmployeeId === existing.participant.providerEmployeeId;
    }
    return false;
  }));
  if (duplicatesExisting) redirect(`${basePath}/nuevo?editar=${permit.id}&error=participant_invalid`);
  const certificationForm = new FormData();
  for (const [name, value] of formData.entries()) {
    if (typeof value === "string") certificationForm.append(name, value);
  }
  if (permit.providerId && !certificationForm.has("providerId")) certificationForm.set("providerId", permit.providerId);
  for (const linked of previousParticipants) {
    if (linked.role !== "participant" || linked.participant.kind !== "EMPLEADO_PROVEEDOR") continue;
    certificationForm.set(`participantStaff${linked.position}`, String(linked.participant.providerEmployeeId));
  }
  certificationForm.set("participantCount", String(Math.max(
    jsaMaxParticipants,
    ...previousParticipantPositions,
    ...participants.rows.map((row) => row.position),
  )));
  if (participants.rows.length > 0 && (await find_jsa_certification_issues(certificationForm, actor)).length > 0) {
    redirect(`${basePath}/nuevo?editar=${permit.id}&error=certifications`);
  }

  for (const row of participants.rows) {
    fields[`participant${row.position}Name`] = row.name;
    fields[`participant${row.position}Job`] = row.job;
    fields[`participant${row.position}Company`] = row.company;
  }
  const participantCount = Math.max(jsaMaxParticipants, ...previousParticipantPositions, ...participants.rows.map((row) => row.position));
  if (participantCount > 100) redirect(failure);
  fields.participantCount = participantCount;

  const selectedArea = await read_permit_area(formData);
  if (!selectedArea) redirect(failure);
  const now = new Date().toISOString();
  await repositories.permits.save({
    ...permit,
    providerId: participants.rows.length > 0 ? (participants.providerId ?? permit.providerId) : permit.providerId,
    area: selectedArea.area,
    fields,
    // No se modifica el estado ni se eliminan firmas: un JSA autorizado sigue autorizado.
    signatures: permit.signatures,
    updatedAt: now,
    updatedBy: actor.actorId,
  });
  await register_jsa_participants(permit.id, participants, actor);
  await repositories.audit.append_event({
    entityType: "permisos_trabajo",
    entityId: permit.id,
    action: "actualizar",
    actorType: actor.actorType,
    actorId: actor.actorId,
    occurredAt: now,
    details: { event: "edit_jsa", addedParticipants: participants.rows.map((row) => row.position).join(",") },
  });
  revalidatePath(detailPath);
  redirect(detailPath);
}

/** Firma de aprobación (responsable del trabajo, del área, HSE) o de un participante. */
export async function sign_jsa(formData: FormData): Promise<void> {
  const actor = await require_permit_actor();
  const employeeNumber = actor.actorId;
  const repositories = get_repositories();
  const permit = await repositories.permits.get_by_id(read_text(formData, "permitId"));
  if (!permit || permit.fields.deletedAt || permit.permitTypeSlug !== jsaSlug || !can_access_permit(actor, permit)) redirect(basePath);

  const detailPath = `${basePath}/${permit.id}`;
  const key = read_text(formData, "key");
  if (!can_sign_key(actor, key)) redirect(`${detailPath}?error=role`);
  const isApprovalKey = jsaApprovalSignatures.some((item) => item.key === key);
  const isParticipantKey = get_jsa_participants(permit).some(
    (participant) => get_participant_key(participant.position) === key,
  );
  if (!isApprovalKey && !isParticipantKey) redirect(detailPath);
  // Cada apartado del JSA admite una sola firma, tanto participantes como aprobaciones.
  if (permit.signatures.some((item) => item.key === key)) redirect(detailPath);
  if (isApprovalKey && permit.status !== "submitted") redirect(detailPath);

  // Un participante ligado a una persona solo lo firma ella (o un usuario de su proveedor, si es colaborador de un contratista).
  if (isParticipantKey && !(await can_sign_participant(actor, permit.id, Number(key.replace("participant_", ""))))) {
    redirect(`${detailPath}?error=participant_not_you`);
  }

  // En el JSA una misma persona puede participar y además firmar como responsable del trabajo o del área.
  // La autorización específica de cada rol se valida más adelante en sign_step.

  const image = read_text(formData, "signatureImage");
  if (!image.startsWith(pngDataUrlPrefix) || image.length > maxSignatureLength) {
    redirect(`${detailPath}?error=signature`);
  }

  const attempt = await sign_step(actor, permit, key, image);
  if (!attempt.ok) redirect(`${detailPath}?error=${attempt.errorCode}`);
  const now = new Date().toISOString();
  const signatures = [
    ...permit.signatures,
    attempt.signature,
  ];
  const allApproved = jsaApprovalSignatures.every((item) =>
    signatures.some((signature) => signature.key === item.key),
  );
  const status = permit.status === "submitted" && allApproved ? "approved" : permit.status;

  const updated = await repositories.permits.save({
    ...permit,
    signatures,
    status,
    updatedAt: now,
    updatedBy: employeeNumber,
  });
  await repositories.audit.append_event({
    entityType: "permisos_trabajo",
    entityId: permit.id,
    action: "firmar",
    actorType: actor.actorType,
    actorId: employeeNumber,
    occurredAt: now,
    details: { event: "sign", key, status },
  });

  notify_permit_signed(permit, updated, key, employeeNumber);
  revalidatePath(detailPath);
  redirect(detailPath);
}
