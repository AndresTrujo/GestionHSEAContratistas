"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  find_phone_signature,
  phoneSignatures,
  phoneSlug,
} from "@/config/ingreso_celular";
import type { WorkPermit } from "@/domain/permisos";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { can_access_permit, can_sign_key, get_actor_type, require_permit_actor } from "./actor";
import { read_permit_area } from "./area";
import { resolve_provider_staff } from "./ejecutantes";
import { sign_step } from "./firma";

const basePath = `/permisos-trabajo/${phoneSlug}`;
const pngDataUrlPrefix = "data:image/png;base64,";
const maxSignatureLength = 300_000;

function read_text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function create_phone_permit(formData: FormData): Promise<void> {
  const actor = await require_permit_actor();
  const employeeNumber = actor.actorId;
  const repositories = get_repositories();

  const fields: WorkPermit["fields"] = {
    date: read_text(formData, "date"),
    phoneBrand: read_text(formData, "phoneBrand"),
    phoneModel: read_text(formData, "phoneModel"),
  };
  if (Object.values(fields).some((value) => !value)) {
    redirect(`${basePath}/nuevo?error=incomplete`);
  }

  const selectedArea = await read_permit_area(formData);
  if (!selectedArea) redirect(`${basePath}/nuevo?error=incomplete`);

  // Proveedor y contratista: un usuario de proveedor solo puede elegir su propia empresa; el colaborador debe estar en verde.
  const rawProvider = actor.providerId ?? read_text(formData, "providerId");
  const contractor = await resolve_provider_staff(rawProvider, read_text(formData, "contractorStaff"));
  if (!contractor) redirect(`${basePath}/nuevo?error=contractor`);
  const semaphores = await repositories.providerEmployees.list_semaphores(contractor.providerId);
  const isGreen = semaphores.some(
    (item) =>
      item.subject.kind === "EMPLEADO_PROVEEDOR" &&
      item.subject.providerEmployeeId === contractor.staffId &&
      item.semaphore === "VERDE",
  );
  if (!isGreen) redirect(`${basePath}/nuevo?error=contractor`);
  fields.contractorName = contractor.name;
  fields.company = contractor.providerName;
  fields.contractorProviderEmployeeId = contractor.staffId;
  const existing = await repositories.permits.list_by_type(phoneSlug);
  const year = new Date().getFullYear();
  fields.folio = `CEL-${year}-${String(existing.length + 1).padStart(4, "0")}`;

  const now = new Date().toISOString();
  const permit = await repositories.permits.save({
    id: crypto.randomUUID(),
    permitTypeSlug: phoneSlug,
    status: "submitted",
    requestedByEmployeeNumber: actor.actorType === "EMPLEADO" ? employeeNumber : "",
    requestedByProviderUserId: actor.providerUserId,
    providerId: String(contractor.providerId),
    area: selectedArea.area,
    signatures: [],
    fields,
    createdAt: now,
    createdBy: employeeNumber,
    updatedAt: now,
    updatedBy: employeeNumber,
  });

  await repositories.audit.append_event({
    entityType: "permisos_trabajo",
    entityId: permit.id,
    action: "crear",
    actorType: actor.actorType,
    actorId: employeeNumber,
    occurredAt: now,
    details: { folio: String(fields.folio) },
  });
  redirect(`${basePath}/${permit.id}`);
}

export async function sign_phone_permit(formData: FormData): Promise<void> {
  const actor = await require_permit_actor();
  const employeeNumber = actor.actorId;
  const repositories = get_repositories();
  const permit = await repositories.permits.get_by_id(read_text(formData, "permitId"));
  if (!permit || permit.permitTypeSlug !== phoneSlug || !can_access_permit(actor, permit)) redirect(basePath);

  const detailPath = `${basePath}/${permit.id}`;
  const key = read_text(formData, "key");
  if (!phoneSignatures.some((item) => item.key === key)) redirect(detailPath);
  if (!can_sign_key(actor, key)) redirect(`${detailPath}?error=role`);
  if (permit.status !== "submitted" || find_phone_signature(permit, key)) {
    redirect(detailPath);
  }

  // Segregación: una misma persona no puede firmar dos roles.
  if (!actor.isAdmin && permit.signatures.some((item) => item.employeeNumber === employeeNumber)) {
    redirect(`${detailPath}?error=same_person`);
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
  const allSigned = phoneSignatures.every((item) =>
    signatures.some((signature) => signature.key === item.key),
  );
  const status = allSigned ? "approved" : permit.status;

  await repositories.permits.save({
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
    actorType: get_actor_type(employeeNumber),
    actorId: employeeNumber,
    occurredAt: now,
    details: { event: "sign", key, status },
  });

  revalidatePath(detailPath);
  redirect(detailPath);
}
