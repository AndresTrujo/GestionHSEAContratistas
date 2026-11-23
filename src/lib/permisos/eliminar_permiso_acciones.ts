"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { require_permit_actor } from "./actor";

/** Elimina lógicamente un permiso. Solo ADMIN_HSEA puede ejecutar esta acción. */
export async function delete_work_permit(formData: FormData): Promise<void> {
  const actor = await require_permit_actor();
  if (actor.actorType !== "EMPLEADO" || actor.isAdmin !== true) {
    throw new Error("No tienes autorización para eliminar permisos.");
  }

  const permitId = String(formData.get("permitId") ?? "").trim();
  if (!permitId) throw new Error("Permiso no válido.");

  const repositories = get_repositories();
  const permit = await repositories.permits.get_by_id(permitId);
  if (!permit) throw new Error("El permiso no existe o ya fue eliminado.");

  const now = new Date().toISOString();
  await repositories.permits.save({
    ...permit,
    fields: {
      ...permit.fields,
      deletedAt: now,
      deletedBy: actor.actorId,
    },
    updatedAt: now,
    updatedBy: actor.actorId,
  });

  await repositories.audit.append_event({
    entityType: "permisos_trabajo",
    entityId: permit.id,
    action: "eliminar",
    actorType: actor.actorType,
    actorId: actor.actorId,
    occurredAt: now,
    details: {
      event: "delete_permit",
      permitTypeSlug: permit.permitTypeSlug,
      folio: String(permit.fields.folio ?? permit.id),
    },
  });

  const listPath = `/permisos-trabajo/${permit.permitTypeSlug}`;
  revalidatePath("/permisos-trabajo");
  revalidatePath(listPath);
  revalidatePath(`${listPath}/${permit.id}`);
  redirect(listPath);
}
