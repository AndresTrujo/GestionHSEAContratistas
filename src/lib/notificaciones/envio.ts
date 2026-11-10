import webpush, { WebPushError } from "web-push";
import type { NotificationKind, NotificationLogEntry, NotificationRecipient } from "@/domain/notificaciones";
import type { WorkPermit } from "@/domain/permisos";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { log_server_event } from "@/lib/registro/registro_servidor";

/** Actor de auditoría cuando el sistema revoca una suscripción que el navegador dio de baja. */
const systemActorId = "NOTIFICACIONES";
/** Un aviso de firma deja de tener sentido si no llega en unas horas (el dispositivo estuvo apagado). */
const pushTimeToLiveSeconds = 4 * 60 * 60;
const maxErrorLength = 1900;

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** Llaves VAPID de las variables de entorno; null si faltan (las notificaciones quedan apagadas). */
export function get_vapid_config(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.VAPID_SUBJECT?.trim() ?? "";
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

const globalPush = globalThis as typeof globalThis & { vapidConfigured?: boolean; vapidWarned?: boolean };

function ensure_vapid(): boolean {
  if (globalPush.vapidConfigured) return true;
  const config = get_vapid_config();
  if (!config) {
    if (!globalPush.vapidWarned) {
      console.warn("[notificaciones] Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT: no se envían notificaciones push");
      globalPush.vapidWarned = true;
    }
    return false;
  }
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  globalPush.vapidConfigured = true;
  return true;
}

export interface PushMessage {
  kind: NotificationKind;
  /** Paso de firma al que se refiere; null en avisos al solicitante. */
  signatureKey: string | null;
  title: string;
  body: string;
}

export function get_permit_url(permit: WorkPermit): string {
  return `/permisos-trabajo/${permit.permitTypeSlug}/${permit.id}`;
}

function describe_error(error: unknown): string {
  if (error instanceof WebPushError) return `HTTP ${error.statusCode}: ${error.body || error.message}`;
  return error instanceof Error ? error.message : String(error);
}

/** 404/410: el navegador dio de baja la suscripción (se desinstaló, se revocó el permiso…). */
function is_gone(error: unknown): boolean {
  return error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410);
}

/**
 * Envía el aviso a todos los dispositivos activos de la persona y lo deja en la bitácora (un renglón por
 * destinatario). Las suscripciones caducadas se revocan. Nunca lanza: devuelve null si no se pudo registrar.
 */
export async function send_push(
  permit: WorkPermit,
  recipient: NotificationRecipient,
  message: PushMessage,
): Promise<NotificationLogEntry | null> {
  if (!ensure_vapid()) return null;
  const repositories = get_repositories();
  const url = get_permit_url(permit);
  try {
    const subscriptions = await repositories.notifications.list_active_subscriptions(recipient);
    // Un mismo tag hace que el recordatorio reemplace al aviso anterior en vez de apilarse.
    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      url,
      tag: `permiso-${permit.id}-${message.signatureKey ?? "avance"}`,
    });
    const results = await Promise.allSettled(
      subscriptions.map((subscription) =>
        webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload,
          { TTL: pushTimeToLiveSeconds, urgency: "high" },
        ),
      ),
    );

    const deliveredIds: string[] = [];
    const errors: string[] = [];
    for (const [index, result] of results.entries()) {
      const subscription = subscriptions[index];
      if (!subscription) continue;
      if (result.status === "fulfilled") {
        deliveredIds.push(subscription.id);
        continue;
      }
      errors.push(describe_error(result.reason));
      if (is_gone(result.reason)) await revoke_expired(subscription.id, subscription.endpoint);
    }
    const now = new Date().toISOString();
    if (deliveredIds.length > 0) await repositories.notifications.mark_subscriptions_used(deliveredIds, now);

    return await repositories.notifications.append_log({
      permitId: permit.id,
      permitTypeSlug: permit.permitTypeSlug,
      signatureKey: message.signatureKey,
      recipient,
      kind: message.kind,
      title: message.title,
      body: message.body,
      url,
      status: subscriptions.length === 0 ? "SIN_SUSCRIPCION" : deliveredIds.length > 0 ? "ENVIADA" : "FALLIDA",
      devicesSent: deliveredIds.length,
      devicesFailed: errors.length,
      error: errors.length > 0 ? errors.join(" | ").slice(0, maxErrorLength) : null,
      sentAt: now,
    });
  } catch (error) {
    await log_server_event("ERROR", "notificaciones", "No se pudo enviar la notificación push", {
      error,
      context: { permiso: permit.id, destinatario: recipient.id, tipo: message.kind },
    });
    return null;
  }
}

async function revoke_expired(subscriptionId: string, endpoint: string): Promise<void> {
  const repositories = get_repositories();
  const revoked = await repositories.notifications.revoke_subscription(endpoint, "EXPIRADA");
  if (!revoked) return;
  await repositories.audit.append_event({
    entityType: "suscripciones_push",
    entityId: subscriptionId,
    action: "actualizar",
    actorType: "SISTEMA",
    actorId: systemActorId,
    occurredAt: new Date().toISOString(),
    details: { event: "revocar", motivo: "EXPIRADA", propietario: revoked.owner.id },
  });
}
