"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { confinedSlug } from "@/config/espacios_confinados";
import { heightsSlug } from "@/config/trabajos_alturas";
import { hotWorkSlug } from "@/config/trabajos_calientes";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { can_access_permit, can_edit_permit, require_permit_actor } from "./actor";

const allowedSlugs = new Set([heightsSlug, hotWorkSlug, confinedSlug]);
const evaluationLabels = { fit: "APTO", unfit: "NO APTO", absent: "NO ASISTIÓ" } as const;

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function loadEditable(formData: FormData) {
  const actor = await require_permit_actor();
  const id = readText(formData, "permitId");
  const permit = await get_repositories().permits.get_by_id(id);
  if (!permit || !allowedSlugs.has(permit.permitTypeSlug) || !can_access_permit(actor, permit) || !(await can_edit_permit(actor, permit))) {
    redirect("/permisos-trabajo");
  }
  return { actor, permit, detailPath: `/permisos-trabajo/${permit.permitTypeSlug}/${permit.id}` };
}

export async function update_executor_medical_evaluation(formData: FormData): Promise<void> {
  const { actor, permit, detailPath } = await loadEditable(formData);
  const position = Number(readText(formData, "position"));
  const evaluation = readText(formData, "evaluation");
  if (!Number.isInteger(position) || position < 1 || position > 100 ||
      !(evaluation in evaluationLabels) ||
      !String(permit.fields[`executor${position}`] ?? "").trim() ||
      permit.fields[`executorRemovedAt_${position}`]) {
    redirect(detailPath);
  }
  const now = new Date().toISOString();
  await get_repositories().permits.save({
    ...permit,
    fields: { ...permit.fields, [`medical${position}`]: evaluation },
    signatures: permit.signatures,
    status: permit.status,
    updatedAt: now,
    updatedBy: actor.actorId,
  });
  await get_repositories().audit.append_event({
    entityType: "permisos_trabajo",
    entityId: permit.id,
    action: "actualizar",
    actorType: actor.actorType,
    actorId: actor.actorId,
    occurredAt: now,
    details: { event: "medical_evaluation", position, evaluation },
  });
  revalidatePath(detailPath);
  redirect(detailPath);
}

export async function remove_executor_from_permit(formData: FormData): Promise<void> {
  const { actor, permit, detailPath } = await loadEditable(formData);
  const position = Number(readText(formData, "position"));
  if (!Number.isInteger(position) || position < 1 || position > 100 ||
      !String(permit.fields[`executor${position}`] ?? "").trim() ||
      permit.fields[`executorRemovedAt_${position}`]) {
    redirect(detailPath);
  }
  const now = new Date().toISOString();
  // Baja lógica: se conserva el nombre, la posición, firmas y movimientos como evidencia histórica.
  await get_repositories().permits.save({
    ...permit,
    fields: { ...permit.fields, [`executorRemovedAt_${position}`]: now },
    signatures: permit.signatures,
    status: permit.status,
    updatedAt: now,
    updatedBy: actor.actorId,
  });
  await get_repositories().audit.append_event({
    entityType: "permisos_trabajo",
    entityId: permit.id,
    action: "actualizar",
    actorType: actor.actorType,
    actorId: actor.actorId,
    occurredAt: now,
    details: { event: "remove_executor", position },
  });
  revalidatePath(detailPath);
  redirect(detailPath);
}
