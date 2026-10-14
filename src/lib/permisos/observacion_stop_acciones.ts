"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  damageClasses,
  stopCategories,
  stopSignatures,
  stopSlug,
} from "@/config/observacion_stop";
import type { WorkPermit } from "@/domain/permisos";
import { get_session } from "@/lib/auth/sesion";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { employee_actor } from "./actor";
import { read_permit_area } from "./area";
import { resolve_provider_staff, resolve_tfs_employee } from "./ejecutantes";
import { sign_step } from "./firma";

const basePath = `/permisos-trabajo/${stopSlug}`;
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

export async function create_stop_observation(formData: FormData): Promise<void> {
  const employeeNumber = await require_employee_number();
  const repositories = get_repositories();

  const fields: WorkPermit["fields"] = {
    location: read_text(formData, "location"),
    company: read_text(formData, "company"),
    date: read_text(formData, "date"),
    description: read_text(formData, "description"),
    actions: read_text(formData, "actions"),
    damageClass: read_text(formData, "damageClass"),
  };
  const hasMissingField = Object.values(fields).some((value) => !value);
  const isValidClass = damageClasses.some((item) => item.value === fields.damageClass);

  // Debe reportarse al menos un acto, condición o aspecto ambiental.
  let findingsCount = 0;
  for (const category of stopCategories) {
    const validSlugs: string[] = category.items.map((item) => item.slug);
    const selected = formData
      .getAll(category.key)
      .filter((value): value is string => typeof value === "string")
      .filter((value) => validSlugs.includes(value));
    const other = read_text(formData, `${category.key}Other`);
    fields[category.key] = selected.join(",");
    fields[`${category.key}Other`] = other;
    findingsCount += selected.length + (other ? 1 : 0);
  }

  if (hasMissingField || !isValidClass || findingsCount === 0) {
    redirect(`${basePath}/nuevo?error=incomplete`);
  }

  const selectedArea = await read_permit_area(formData);
  if (!selectedArea) redirect(`${basePath}/nuevo?error=incomplete`);

  // Personas: observador y supervisor son empleados TFS; el observado es TFS o colaborador de un proveedor.
  const observer = await resolve_tfs_employee(read_text(formData, "observerEmployee"));
  const supervisor = await resolve_tfs_employee(read_text(formData, "supervisorEmployee"));
  const observedKind = read_text(formData, "observedKind");
  const observedTfs = observedKind === "TFS" ? await resolve_tfs_employee(read_text(formData, "observedEmployee")) : null;
  const observedStaff =
    observedKind === "PROVEEDOR"
      ? await resolve_provider_staff(read_text(formData, "observedProviderId"), read_text(formData, "observedStaff"))
      : null;
  if (!observer || !supervisor || (!observedTfs && !observedStaff)) {
    redirect(`${basePath}/nuevo?error=people`);
  }
  // Solo puede ser observado un colaborador de proveedor en semáforo verde (el único que puede estar en planta).
  if (observedStaff) {
    const semaphores = await repositories.providerEmployees.list_semaphores(observedStaff.providerId);
    const isGreen = semaphores.some(
      (item) =>
        item.subject.kind === "EMPLEADO_PROVEEDOR" &&
        item.subject.providerEmployeeId === observedStaff.staffId &&
        item.semaphore === "VERDE",
    );
    if (!isGreen) redirect(`${basePath}/nuevo?error=observed_not_green`);
  }
  // El observador puede ser también el supervisor; el observado (si es TFS) debe ser otra persona, y quien registra
  // la observación no puede ser el observado porque no podría firmar.
  if (
    observedTfs &&
    [observer.employeeNumber, supervisor.employeeNumber, employeeNumber].includes(observedTfs.employeeNumber)
  ) {
    redirect(`${basePath}/nuevo?error=same_people`);
  }

  fields.observerName = observer.name;
  fields.observerEmployee = observer.employeeNumber;
  fields.supervisorName = supervisor.name;
  fields.supervisorEmployee = supervisor.employeeNumber;
  if (observedTfs) {
    fields.observedName = observedTfs.name;
    fields.observedEmployee = observedTfs.employeeNumber;
  } else if (observedStaff) {
    fields.observedName = `${observedStaff.name} (${observedStaff.providerName})`;
    fields.observedProviderEmployeeId = observedStaff.staffId;
  }

  const existing = await repositories.permits.list_by_type(stopSlug);
  const year = new Date().getFullYear();
  fields.folio = `STOP-${year}-${String(existing.length + 1).padStart(4, "0")}`;

  const now = new Date().toISOString();
  const permit = await repositories.permits.save({
    id: crypto.randomUUID(),
    permitTypeSlug: stopSlug,
    status: "submitted",
    requestedByEmployeeNumber: employeeNumber,
    providerId: null,
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
    actorType: "EMPLEADO",
    actorId: employeeNumber,
    occurredAt: now,
    details: { folio: String(fields.folio), damageClass: String(fields.damageClass) },
  });
  redirect(`${basePath}/${permit.id}`);
}

export async function sign_stop_observation(formData: FormData): Promise<void> {
  const employeeNumber = await require_employee_number();
  const repositories = get_repositories();
  const permit = await repositories.permits.get_by_id(read_text(formData, "permitId"));
  if (!permit || permit.permitTypeSlug !== stopSlug) redirect(basePath);

  const detailPath = `${basePath}/${permit.id}`;
  const key = read_text(formData, "key");
  if (!stopSignatures.some((item) => item.key === key)) redirect(detailPath);
  if (
    permit.status !== "submitted" ||
    permit.signatures.some((item) => item.key === key)
  ) {
    redirect(detailPath);
  }

  // Si la persona que firma fue elegida en el formulario (empleado TFS), solo ella puede firmar su paso.
  const assigned = key === "observed" ? permit.fields.observedEmployee : permit.fields.supervisorEmployee;
  if (typeof assigned === "string" && assigned && assigned !== employeeNumber) {
    redirect(`${detailPath}?error=not_assigned`);
  }

  // Segregación: el observado no puede ser el observador ni el supervisor. El supervisor sí puede ser quien observó.
  const alreadyInvolved =
    permit.signatures.some((item) => item.employeeNumber === employeeNumber) ||
    (key === "observed" &&
      (permit.requestedByEmployeeNumber === employeeNumber || permit.fields.observerEmployee === employeeNumber));
  if (alreadyInvolved) redirect(`${detailPath}?error=same_person`);

  const image = read_text(formData, "signatureImage");
  if (!image.startsWith(pngDataUrlPrefix) || image.length > maxSignatureLength) {
    redirect(`${detailPath}?error=signature`);
  }

  const attempt = await sign_step(employee_actor(employeeNumber), permit, key, image, read_text(formData, "pin"));
  if (!attempt.ok) redirect(`${detailPath}?error=${attempt.errorCode}`);
  const now = new Date().toISOString();
  const signatures = [
    ...permit.signatures,
    attempt.signature,
  ];
  const allSigned = stopSignatures.every((item) =>
    signatures.some((signature) => signature.key === item.key),
  );
  const status = allSigned ? "closed" : permit.status;

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
    actorType: "EMPLEADO",
    actorId: employeeNumber,
    occurredAt: now,
    details: { event: "sign", key, status },
  });

  revalidatePath(detailPath);
  redirect(detailPath);
}
