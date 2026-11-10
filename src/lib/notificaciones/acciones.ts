"use server";

import { headers } from "next/headers";
import type { NotificationRecipient } from "@/domain/notificaciones";
import { get_session, type Session } from "@/lib/auth/sesion";
import { get_repositories } from "@/lib/data/proveedor_datos";

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushActionResult = { ok: true } | { ok: false; errorCode: "sin_sesion" | "suscripcion_invalida" };

const maxEndpointLength = 2000;
const base64UrlPattern = /^[A-Za-z0-9_-]+=*$/;

function to_recipient(session: Session): NotificationRecipient {
  return session.kind === "EMPLEADO"
    ? { kind: "EMPLEADO", id: session.employeeNumber }
    : { kind: "USUARIO_PROVEEDOR", id: `P-${session.providerUserId}` };
}

function is_valid_subscription(input: PushSubscriptionInput): boolean {
  if (typeof input.endpoint !== "string" || input.endpoint.length > maxEndpointLength) return false;
  try {
    if (new URL(input.endpoint).protocol !== "https:") return false;
  } catch {
    return false;
  }
  return [input.p256dh, input.auth].every(
    (value) => typeof value === "string" && value.length > 0 && value.length <= 200 && base64UrlPattern.test(value),
  );
}

/**
 * Registra (o reasigna) la suscripción de este dispositivo a quien tiene la sesión. Si ya estaba activa
 * para esta persona no hace nada; si era de otra (dispositivo compartido), pasa a la sesión actual.
 */
export async function save_push_subscription(input: PushSubscriptionInput): Promise<PushActionResult> {
  const session = await get_session();
  if (!session) return { ok: false, errorCode: "sin_sesion" };
  if (!is_valid_subscription(input)) return { ok: false, errorCode: "suscripcion_invalida" };

  const owner = to_recipient(session);
  const repositories = get_repositories();
  const current = await repositories.notifications.list_active_subscriptions(owner);
  const same = current.find((item) => item.endpoint === input.endpoint);
  if (same && same.p256dh === input.p256dh && same.auth === input.auth) return { ok: true };

  const userAgent = ((await headers()).get("user-agent") ?? "").slice(0, 500) || null;
  const saved = await repositories.notifications.save_subscription({
    owner,
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth: input.auth,
    userAgent,
  });
  await repositories.audit.append_event({
    entityType: "suscripciones_push",
    entityId: saved.id,
    action: "crear",
    actorType: owner.kind,
    actorId: owner.id,
    occurredAt: saved.createdAt,
    details: { event: "suscribir", dispositivo: userAgent ? userAgent.slice(0, 200) : null },
  });
  return { ok: true };
}

/** Desactiva las notificaciones de este dispositivo (solo si la suscripción es de quien tiene la sesión). */
export async function remove_push_subscription(endpoint: string): Promise<PushActionResult> {
  const session = await get_session();
  if (!session) return { ok: false, errorCode: "sin_sesion" };
  const owner = to_recipient(session);
  const repositories = get_repositories();
  const current = await repositories.notifications.list_active_subscriptions(owner);
  if (!current.some((item) => item.endpoint === endpoint)) return { ok: true };

  const revoked = await repositories.notifications.revoke_subscription(endpoint, "DESACTIVADA_POR_USUARIO");
  if (revoked) {
    await repositories.audit.append_event({
      entityType: "suscripciones_push",
      entityId: revoked.id,
      action: "actualizar",
      actorType: owner.kind,
      actorId: owner.id,
      occurredAt: new Date().toISOString(),
      details: { event: "revocar", motivo: "DESACTIVADA_POR_USUARIO" },
    });
  }
  return { ok: true };
}
