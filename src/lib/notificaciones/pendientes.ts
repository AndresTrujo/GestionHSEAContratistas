import { get_next_signatures, notifiablePermitTypeSlugs, notifiableStatuses, type ExpectedSignature } from "@/config/notificaciones";
import type { WorkPermit } from "@/domain/permisos";
import { get_repositories } from "@/lib/data/proveedor_datos";
import type { Session } from "@/lib/auth/sesion";
import { log_server_event } from "@/lib/registro/registro_servidor";
import { can_access_permit, get_actor_from_session, type PermitActor } from "@/lib/permisos/actor";
import { resolve_signature_recipients } from "./destinatarios";

/** Una firma que la persona puede registrar ahora en un permiso. */
export interface PendingSignature {
  permit: WorkPermit;
  signature: ExpectedSignature;
}

/**
 * Firmas que esta persona puede registrar ahora: el paso que sigue de cada permiso en curso, siempre que ella
 * sea de quienes pueden firmarlo (rol y alcance de área, o persona nombrada en el formato). Incluye a todos los
 * que pueden firmar, no solo a quienes llega el aviso. Más antiguos primero.
 */
export async function list_pending_signatures(actor: PermitActor): Promise<PendingSignature[]> {
  const permits = await get_repositories().permits.list_active({
    permitTypeSlugs: notifiablePermitTypeSlugs,
    statuses: notifiableStatuses,
    updatedSince: "2000-01-01T00:00:00.000Z",
  });

  const pending: PendingSignature[] = [];
  for (const permit of permits) {
    if (permit.fields.deletedAt || !can_access_permit(actor, permit)) continue;
    for (const signature of get_next_signatures(permit)) {
      const recipients = await resolve_signature_recipients(permit, signature, [], false);
      if (recipients.some((recipient) => recipient.id === actor.actorId)) pending.push({ permit, signature });
    }
  }
  return pending.sort((first, second) => first.permit.updatedAt.localeCompare(second.permit.updatedAt));
}

/** Cuántas firmas tiene pendientes la persona de la sesión; null si no se pudo calcular (no rompe el inicio). */
export async function get_pending_signature_count(session: Session): Promise<number | null> {
  try {
    return (await list_pending_signatures(get_actor_from_session(session))).length;
  } catch (error) {
    await log_server_event("ERROR", "notificaciones", "No se pudo contar las firmas pendientes", { error });
    return null;
  }
}
