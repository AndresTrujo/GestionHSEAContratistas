"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  checklistAnswerLabels,
  find_signature,
  get_checklist_field,
  hotWorkChecklistItems,
  get_valid_until,
  get_verification_key,
  hotWorkActivities,
  hotWorkApprovalSignatures,
  hotWorkMaxExecutors,
  hotWorkSlug,
  hotWorkVerificationCount,
} from "@/config/trabajos_calientes";
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

const basePath = `/permisos-trabajo/${hotWorkSlug}`;
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

/** Carga un permiso de trabajos calientes que siga abierto; si no (o no es accesible), vuelve al listado. */
async function load_open_permit(formData: FormData, actor: PermitActor): Promise<WorkPermit> {
  const permit = await get_repositories().permits.get_by_id(
    read_text(formData, "permitId"),
  );
  if (!permit || permit.permitTypeSlug !== hotWorkSlug || !can_access_permit(actor, permit)) redirect(basePath);
  if (permit.status === "closed") redirect(`${basePath}/${permit.id}`);
  return permit;
}

export async function create_hot_work_permit(formData: FormData): Promise<void> {
  const actor = await require_permit_actor();
  const employeeNumber = actor.actorId;
  const repositories = get_repositories();

  const fields: WorkPermit["fields"] = {
    department: read_text(formData, "department"),
    date: read_text(formData, "date"),
    workArea: read_text(formData, "workArea"),
    description: read_text(formData, "description"),
    requesterName: read_text(formData, "requesterName"),
    requesterPosition: read_text(formData, "requesterPosition"),
    startTime: read_text(formData, "startTime"),
    endTime: read_text(formData, "endTime"),
    postInspectionDone: null,
  };

  const validSlugs: string[] = hotWorkActivities.map((activity) => activity.slug);
  const activities = formData
    .getAll("activities")
    .filter((value): value is string => typeof value === "string")
    .filter((value) => validSlugs.includes(value));
  fields.activities = activities.join(",");

  const executors = await read_executors(formData, actor, hotWorkSlug, hotWorkMaxExecutors);
  if (!executors.ok) redirect(`${basePath}/nuevo?error=${executors.errorCode}`);
  executors.names.forEach((name, index) => {
    fields[`executor${index + 1}`] = name;
  });
  const executorCount = executors.names.filter(Boolean).length;

  const requiredFields = [
    "department",
    "date",
    "workArea",
    "description",
    "requesterName",
    "requesterPosition",
    "startTime",
    "endTime",
  ];
  const hasMissingField = requiredFields.some((name) => !fields[name]);

  // El permiso solo se autoriza con la lista de verificación completa.
  const validAnswers: string[] = Object.keys(checklistAnswerLabels);
  let isChecklistComplete = true;
  for (const item of hotWorkChecklistItems) {
    const fieldName = get_checklist_field(item.number);
    const answer = read_text(formData, fieldName);
    if (!validAnswers.includes(answer)) isChecklistComplete = false;
    fields[fieldName] = answer;
  }

  if (
    hasMissingField ||
    !isChecklistComplete ||
    executorCount === 0 ||
    activities.length === 0
  ) {
    redirect(`${basePath}/nuevo?error=incomplete`);
  }

  const selectedArea = await read_permit_area(formData);
  if (!selectedArea) redirect(`${basePath}/nuevo?error=incomplete`);
  const existing = await repositories.permits.list_by_type(hotWorkSlug);
  const year = new Date().getFullYear();
  fields.folio = `TC-${year}-${String(existing.length + 1).padStart(4, "0")}`;

  const now = new Date().toISOString();
  const permit = await repositories.permits.save({
    id: crypto.randomUUID(),
    permitTypeSlug: hotWorkSlug,
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

export async function sign_hot_work_permit(formData: FormData): Promise<void> {
  const actor = await require_permit_actor();
  const employeeNumber = actor.actorId;
  const permit = await load_open_permit(formData, actor);
  const key = read_text(formData, "key");
  const detailPath = `${basePath}/${permit.id}`;
  if (!can_sign_key(actor, key)) redirect(`${detailPath}?error=role`);

  const isApprovalKey = hotWorkApprovalSignatures.some((item) => item.key === key);
  const verificationPosition = Number(key.replace("verification_", ""));
  const isVerificationKey =
    key.startsWith("verification_") &&
    Number.isInteger(verificationPosition) &&
    verificationPosition >= 1 &&
    verificationPosition <= hotWorkVerificationCount;
  if (!isApprovalKey && !isVerificationKey) redirect(detailPath);
  if (find_signature(permit, key)) redirect(detailPath);

  if (isApprovalKey) {
    if (permit.status !== "submitted") redirect(detailPath);
    // Segregación: una misma persona no puede firmar dos roles de autorización.
    const alreadySigned = hotWorkApprovalSignatures.some(
      (item) => find_signature(permit, item.key)?.employeeNumber === employeeNumber,
    );
    if (alreadySigned && !actor.isAdmin) redirect(`${detailPath}?error=same_person`);
  } else {
    if (permit.status !== "approved") redirect(detailPath);
    const validUntil = get_valid_until(permit);
    if (validUntil && validUntil.getTime() < Date.now()) {
      redirect(`${detailPath}?error=expired`);
    }
    const previous = verificationPosition - 1;
    if (previous >= 1 && !find_signature(permit, get_verification_key(previous))) {
      redirect(`${detailPath}?error=order`);
    }
  }

  const image = read_text(formData, "signatureImage");
  if (!image.startsWith(pngDataUrlPrefix) || image.length > maxSignatureLength) {
    redirect(`${detailPath}?error=signature`);
  }

  const attempt = await sign_step(actor, permit, key, image, read_text(formData, "pin"));
  if (!attempt.ok) redirect(`${detailPath}?error=${attempt.errorCode}`);
  const now = new Date().toISOString();
  const signatures = [
    ...permit.signatures,
    attempt.signature,
  ];
  const allApproved = hotWorkApprovalSignatures.every((item) =>
    signatures.some((signature) => signature.key === item.key),
  );
  const status = isApprovalKey && allApproved ? "approved" : permit.status;

  await get_repositories().permits.save({
    ...permit,
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

export async function register_post_inspection(formData: FormData): Promise<void> {
  const employeeNumber = await require_employee_number();
  const permit = await load_open_permit(formData, {
    actorType: "EMPLEADO",
    actorId: employeeNumber,
    providerId: null,
    providerUserId: null,
  });
  const detailPath = `${basePath}/${permit.id}`;
  const result = read_text(formData, "result");
  if (permit.status !== "approved" || (result !== "yes" && result !== "no")) {
    redirect(detailPath);
  }

  const done = result === "yes";
  const now = new Date().toISOString();
  await get_repositories().permits.save({
    ...permit,
    status: done ? "closed" : permit.status,
    fields: {
      ...permit.fields,
      postInspectionDone: done,
      postInspectionAt: now,
      postInspectionBy: employeeNumber,
    },
    updatedAt: now,
    updatedBy: employeeNumber,
  });
  await append_audit(permit.id, "actualizar", employeeNumber, {
    event: "post_inspection",
    done,
  });

  revalidatePath(detailPath);
  redirect(detailPath);
}
