"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  heightsAnswerLabels,
  heightsPpeOptions,
  find_heights_signature,
  get_heights_checklist_field,
  get_heights_executors,
  get_heights_verification_key,
  heightsApprovalSignatures,
  heightsChecklistItems,
  heightsMaxExecutors,
  heightsMaxExtensionHours,
  heightsSlug,
  heightsVerificationCount,
  is_valid_today,
  medicalEvaluationLabels,
} from "@/config/trabajos_alturas";
import type { AuditAction } from "@/domain/auditoria";
import type { WorkPermit } from "@/domain/permisos";
import { get_session } from "@/lib/auth/sesion";
import { get_repositories } from "@/lib/data/proveedor_datos";
import {
  can_access_permit,
  can_sign_key,
  get_actor_type,
  require_permit_actor,
  type PermitActor,
} from "./actor";
import { read_permit_area } from "./area";
import { read_executors, register_executor_participants } from "./ejecutantes";
import { sign_step } from "./firma";

const basePath = `/permisos-trabajo/${heightsSlug}`;
const pngDataUrlPrefix = "data:image/png;base64,";
const maxSignatureLength = 300_000;

function read_text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
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
  if (!permit || permit.permitTypeSlug !== heightsSlug || !can_access_permit(actor, permit)) redirect(basePath);
  if (permit.status === "closed") redirect(`${basePath}/${permit.id}`);
  return permit;
}

export async function create_heights_permit(formData: FormData): Promise<void> {
  const actor = await require_permit_actor();
  const employeeNumber = actor.actorId;
  const repositories = get_repositories();

  const fields: WorkPermit["fields"] = {
    department: read_text(formData, "department"),
    date: read_text(formData, "date"),
    workArea: read_text(formData, "workArea"),
    description: read_text(formData, "description"),
    startTime: read_text(formData, "startTime"),
    endTime: read_text(formData, "endTime"),
  };
  const requiredFields = Object.keys(fields);
  const hasMissingField = requiredFields.some((name) => !fields[name]);

  const executors = await read_executors(formData, actor, heightsSlug, heightsMaxExecutors);
  if (!executors.ok) redirect(`${basePath}/nuevo?error=${executors.errorCode}`);
  executors.names.forEach((name, index) => {
    fields[`executor${index + 1}`] = name;
  });
  const executorCount = executors.names.filter(Boolean).length;

  const validAnswers: string[] = Object.keys(heightsAnswerLabels);
  let isChecklistComplete = true;
  for (const item of heightsChecklistItems) {
    const fieldName = get_heights_checklist_field(item.id);
    const answer = read_text(formData, fieldName);
    if (!validAnswers.includes(answer)) isChecklistComplete = false;
    fields[fieldName] = answer;
  }

  // Equipo de protección personal requerido (pregunta 2).
  const validPpe: string[] = heightsPpeOptions.map((option) => option.slug);
  fields.ppe = formData
    .getAll("ppe")
    .filter((value): value is string => typeof value === "string")
    .filter((value) => validPpe.includes(value))
    .join(",");
  fields.ppeOther = read_text(formData, "ppeOther");

  if (hasMissingField || executorCount === 0 || !isChecklistComplete) {
    redirect(`${basePath}/nuevo?error=incomplete`);
  }

  const selectedArea = await read_permit_area(formData);
  if (!selectedArea) redirect(`${basePath}/nuevo?error=incomplete`);
  const existing = await repositories.permits.list_by_type(heightsSlug);
  const year = new Date().getFullYear();
  fields.folio = `TA-${year}-${String(existing.length + 1).padStart(4, "0")}`;

  const now = new Date().toISOString();
  const permit = await repositories.permits.save({
    id: crypto.randomUUID(),
    permitTypeSlug: heightsSlug,
    status: "submitted",
    requestedByEmployeeNumber: actor.actorType === "EMPLEADO" ? employeeNumber : "",
    requestedByProviderUserId: actor.providerUserId,
    providerId: executors.providerId,
    area: selectedArea.area,
    signatures: [
      { key: "requester", employeeNumber, signedAt: now, image: null },
    ],
    fields,
    createdAt: now,
    createdBy: employeeNumber,
    updatedAt: now,
    updatedBy: employeeNumber,
  });

  await register_executor_participants(permit.id, executors, actor);
  await append_audit(permit.id, "crear", employeeNumber, {
    folio: String(fields.folio),
  });
  redirect(`${basePath}/${permit.id}`);
}

/** Firma de autorización, verificación de HSEA o revalidación (extensión). */
export async function sign_heights_permit(formData: FormData): Promise<void> {
  const actor = await require_permit_actor();
  const employeeNumber = actor.actorId;
  const permit = await load_open_permit(formData, actor);
  const key = read_text(formData, "key");
  const detailPath = `${basePath}/${permit.id}`;
  if (!can_sign_key(actor, key)) redirect(`${detailPath}?error=role`);

  const isApprovalKey = heightsApprovalSignatures.some((item) => item.key === key);
  const verificationPosition = Number(key.replace("verification_", ""));
  const isVerificationKey =
    key.startsWith("verification_") &&
    Number.isInteger(verificationPosition) &&
    verificationPosition >= 1 &&
    verificationPosition <= heightsVerificationCount;
  const isExtensionKey = key === "extension";
  if (!isApprovalKey && !isVerificationKey && !isExtensionKey) redirect(detailPath);
  if (find_heights_signature(permit, key)) redirect(detailPath);

  const image = read_text(formData, "signatureImage");
  if (!image.startsWith(pngDataUrlPrefix) || image.length > maxSignatureLength) {
    redirect(`${detailPath}?error=signature`);
  }

  const fields = { ...permit.fields };

  if (isApprovalKey) {
    if (permit.status !== "submitted") redirect(detailPath);
    // Segregación: una misma persona no puede firmar dos roles de autorización.
    const alreadySigned = heightsApprovalSignatures.some(
      (item) =>
        find_heights_signature(permit, item.key)?.employeeNumber === employeeNumber,
    );
    if (alreadySigned && !actor.isAdmin) redirect(`${detailPath}?error=same_person`);

    if (key === "medical_service") {
      // La evaluación médica de cada ejecutante se registra al firmar.
      const executors = get_heights_executors(permit);
      for (let position = 1; position <= executors.length; position += 1) {
        const evaluation = read_text(formData, `medical${position}`);
        if (!(evaluation in medicalEvaluationLabels)) {
          redirect(`${detailPath}?error=medical`);
        }
        fields[`medical${position}`] = evaluation;
      }
    }
  } else {
    if (permit.status !== "approved") redirect(detailPath);
    if (!is_valid_today(permit)) redirect(`${detailPath}?error=expired`);

    if (isVerificationKey) {
      const previous = verificationPosition - 1;
      if (
        previous >= 1 &&
        !find_heights_signature(permit, get_heights_verification_key(previous))
      ) {
        redirect(`${detailPath}?error=order`);
      }
    } else {
      const hours = Number(read_text(formData, "extensionHours"));
      const from = read_text(formData, "extensionFrom");
      const to = read_text(formData, "extensionTo");
      if (
        !Number.isInteger(hours) ||
        hours < 1 ||
        hours > heightsMaxExtensionHours ||
        !from ||
        !to
      ) {
        redirect(`${detailPath}?error=extension`);
      }
      fields.extensionHours = hours;
      fields.extensionFrom = from;
      fields.extensionTo = to;
    }
  }

  const attempt = await sign_step(actor, permit, key, image, read_text(formData, "pin"));
  if (!attempt.ok) redirect(`${detailPath}?error=${attempt.errorCode}`);
  const now = new Date().toISOString();
  const signatures = [
    ...permit.signatures,
    attempt.signature,
  ];
  const allApproved = heightsApprovalSignatures.every((item) =>
    signatures.some((signature) => signature.key === item.key),
  );
  const status = isApprovalKey && allApproved ? "approved" : permit.status;

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

export async function close_heights_permit(formData: FormData): Promise<void> {
  const employeeNumber = await require_employee_number();
  const permit = await load_open_permit(formData, {
    actorType: "EMPLEADO",
    actorId: employeeNumber,
    providerId: null,
    providerUserId: null,
  });
  const detailPath = `${basePath}/${permit.id}`;
  if (permit.status !== "approved") redirect(detailPath);

  const now = new Date().toISOString();
  await get_repositories().permits.save({
    ...permit,
    status: "closed",
    fields: { ...permit.fields, closedAt: now, closedBy: employeeNumber },
    updatedAt: now,
    updatedBy: employeeNumber,
  });
  await append_audit(permit.id, "actualizar", employeeNumber, { event: "close" });

  revalidatePath(detailPath);
  redirect(detailPath);
}
