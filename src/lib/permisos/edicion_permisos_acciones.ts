"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  confinedChecklistIds,
  confinedGases,
  confinedRiskCategories,
  confinedSlug,
  get_confined_check_field,
  get_reading_field,
} from "@/config/espacios_confinados";
import {
  heightsChecklistItems,
  heightsMaxExecutors,
  heightsPpeOptions,
  heightsSlug,
  get_heights_checklist_field,
} from "@/config/trabajos_alturas";
import {
  checklistAnswerLabels,
  get_checklist_field,
  hotWorkActivities,
  hotWorkChecklistItems,
  hotWorkMaxExecutors,
  hotWorkSlug,
} from "@/config/trabajos_calientes";
import type { WorkPermit } from "@/domain/permisos";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { can_access_permit, can_edit_permit, require_permit_actor, type PermitActor } from "./actor";
import { read_permit_area } from "./area";
import { read_executors, register_executor_participants } from "./ejecutantes";
import { resolve_requester_unit } from "./unidad_solicitante";

const validChecklistAnswers = Object.keys(checklistAnswerLabels);

function read_text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function read_number(formData: FormData, name: string): number | null {
  const value = read_text(formData, name);
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function executor_positions(fields: WorkPermit["fields"]): number[] {
  return Object.entries(fields)
    .flatMap(([key, value]) => {
      const match = /^executor(\d+)$/.exec(key);
      return match && typeof value === "string" && value.trim() ? [Number(match[1])] : [];
    });
}

async function update_executor_permit(
  formData: FormData,
  actor: PermitActor,
  permit: WorkPermit,
  options: {
    maxExecutors: number;
    workType: string;
    unitField: "department" | "company";
    listFields: Record<string, string[]>;
    requiredFields: string[];
  },
): Promise<void> {
  const repositories = get_repositories();
  const failure = `/permisos-trabajo/${permit.permitTypeSlug}/nuevo?editar=${permit.id}&error=incomplete`;
  const fields: WorkPermit["fields"] = { ...permit.fields };

  for (const [name, value] of formData.entries()) {
    if (typeof value !== "string" || ["permitId", "providerId", "executorCount", "departmentId", "subdepartmentId"].includes(name)) continue;
    if (Object.prototype.hasOwnProperty.call(fields, name)) fields[name] = value.trim();
  }
  fields[options.unitField] = await resolve_requester_unit(formData, options.unitField);
  for (const [name, allowed] of Object.entries(options.listFields)) {
    fields[name] = formData.getAll(name)
      .filter((value): value is string => typeof value === "string")
      .filter((value) => allowed.includes(value))
      .join(",");
  }
  if (options.requiredFields.some((name) => !fields[name])) redirect(failure);

  const executors = await read_executors(formData, actor, permit.permitTypeSlug, options.maxExecutors);
  if (!executors.ok) redirect(`/permisos-trabajo/${permit.permitTypeSlug}/nuevo?editar=${permit.id}&error=${executors.errorCode}`);
  const oldPositions = executor_positions(permit.fields);
  const oldMax = Math.max(0, ...oldPositions);
  const addedPositions: number[] = [];
  executors.names.forEach((name, index) => {
    if (!name) return;
    const position = index + 1;
    if (position > oldMax) {
      fields[`executor${position}`] = name;
      addedPositions.push(position);
    }
  });
  fields.executorCount = Math.max(6, ...oldPositions, ...addedPositions);

  if (permit.permitTypeSlug === heightsSlug) {
    const valid = Object.keys({ yes: true, no: true });
    for (const item of heightsChecklistItems) {
      if (!valid.includes(read_text(formData, get_heights_checklist_field(item.id)))) redirect(failure);
    }
  } else if (permit.permitTypeSlug === hotWorkSlug) {
    for (const item of hotWorkChecklistItems) {
      if (!validChecklistAnswers.includes(read_text(formData, get_checklist_field(item.number)))) redirect(failure);
    }
    if (!String(fields.activities ?? "")) redirect(failure);
  } else if (permit.permitTypeSlug === confinedSlug) {
    if (fields.riskType !== "I" && fields.riskType !== "II") redirect(failure);
    for (const category of confinedRiskCategories) {
      const selected = String(fields[category.key] ?? "").split(",").filter(Boolean);
      if (!category.items.some((item) => selected.includes(item.slug))) redirect(failure);
    }
    for (const id of confinedChecklistIds) {
      if (!validChecklistAnswers.includes(read_text(formData, get_confined_check_field(id)))) redirect(failure);
    }
    for (const gas of confinedGases) {
      const value = read_number(formData, `initial_${gas.key}`);
      if (value === null) redirect(failure);
      fields[get_reading_field(1, gas.key)] = value;
    }
    if (fields.monitoringMode === "periodic") {
      const frequency = read_number(formData, "monitoringFrequency");
      if (frequency === null || frequency === 0) redirect(failure);
      fields.monitoringFrequency = frequency;
    } else if (fields.monitoringMode === "permanent") {
      fields.monitoringFrequency = null;
    } else {
      redirect(failure);
    }
    if (fields[get_confined_check_field("q8")] === "yes") {
      const airChanges = read_number(formData, "airChanges");
      const ventilationTime = read_text(formData, "ventilationTime");
      if (airChanges === null || !ventilationTime) redirect(failure);
      fields.airChanges = airChanges;
      fields.ventilationTime = ventilationTime;
    } else {
      fields.airChanges = null;
      fields.ventilationTime = "";
    }
    fields.reading1At = new Date().toISOString();
    fields.reading1By = actor.actorId;
  }

  const selectedArea = await read_permit_area(formData);
  if (!selectedArea) redirect(failure);
  const addedProviderIds = executors.providerParticipants.map((item) => item.providerEmployeeId);
  if (addedProviderIds.length > 0) {
    const existingParticipants = await repositories.participants.list_by_permit(permit.id);
    if (executors.providerParticipants.some((item) => existingParticipants.some(
      (existing) => existing.role === "executor" &&
        existing.participant.kind === "EMPLEADO_PROVEEDOR" &&
        existing.participant.providerEmployeeId === item.providerEmployeeId,
    ))) redirect(`/permisos-trabajo/${permit.permitTypeSlug}/nuevo?editar=${permit.id}&error=executor_invalid`);
  }

  const now = new Date().toISOString();
  await repositories.permits.save({
    ...permit,
    providerId: addedPositions.length > 0 ? (executors.providerId ?? permit.providerId) : permit.providerId,
    area: selectedArea.area,
    fields,
    signatures: permit.signatures,
    status: permit.status,
    updatedAt: now,
    updatedBy: actor.actorId,
  });
  await register_executor_participants(permit.id, executors, actor);
  await repositories.audit.append_event({
    entityType: "permisos_trabajo",
    entityId: permit.id,
    action: "actualizar",
    actorType: actor.actorType,
    actorId: actor.actorId,
    occurredAt: now,
    details: { event: "edit_permit", addedExecutors: addedPositions.join(",") },
  });
  const detailPath = `/permisos-trabajo/${permit.permitTypeSlug}/${permit.id}`;
  revalidatePath(detailPath);
  redirect(detailPath);
}

async function load_editable(formData: FormData, slug: string) {
  const actor = await require_permit_actor();
  const permit = await get_repositories().permits.get_by_id(read_text(formData, "permitId"));
  if (!permit || permit.permitTypeSlug !== slug || !can_access_permit(actor, permit) || !(await can_edit_permit(actor, permit))) {
    redirect(`/permisos-trabajo/${slug}`);
  }
  return { actor, permit };
}

export async function update_heights_permit(formData: FormData): Promise<void> {
  const { actor, permit } = await load_editable(formData, heightsSlug);
  await update_executor_permit(formData, actor, permit, {
    maxExecutors: heightsMaxExecutors,
    workType: "ALTURAS",
    unitField: "department",
    listFields: { ppe: heightsPpeOptions.map((item) => item.slug) },
    requiredFields: ["department", "date", "workArea", "description", "startTime", "endTime"],
  });
}

export async function update_hot_work_permit(formData: FormData): Promise<void> {
  const { actor, permit } = await load_editable(formData, hotWorkSlug);
  await update_executor_permit(formData, actor, permit, {
    maxExecutors: hotWorkMaxExecutors,
    workType: "CALIENTES",
    unitField: "department",
    listFields: { activities: hotWorkActivities.map((item) => item.slug) },
    requiredFields: ["department", "date", "workArea", "description", "requesterName", "requesterPosition", "startTime", "endTime"],
  });
}

export async function update_confined_permit(formData: FormData): Promise<void> {
  const { actor, permit } = await load_editable(formData, confinedSlug);
  await update_executor_permit(formData, actor, permit, {
    maxExecutors: 6,
    workType: "CONFINADOS",
    unitField: "company",
    listFields: Object.fromEntries(confinedRiskCategories.map((category) => [
      category.key,
      category.items.map((item) => item.slug),
    ])),
    requiredFields: ["company", "date", "workArea", "task", "spaceNumber", "location", "position", "emergencyContact", "emergencyPhone", "startTime", "endTime"],
  });
}
