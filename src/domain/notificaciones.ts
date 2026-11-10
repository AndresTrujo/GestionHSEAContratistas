import type { ActorId, ActorType } from "./auditoria";

/**
 * Notificaciones push (tablas suscripciones_push y notificaciones_push). Una persona puede tener varios
 * dispositivos suscritos; cada aviso enviado queda en una bitácora inmutable (trazabilidad).
 */

/** Dueño de una suscripción o destinatario de un aviso: empleado TFS ("204692") o usuario de proveedor ("P-17"). */
export interface NotificationRecipient {
  kind: Exclude<ActorType, "SISTEMA">;
  id: ActorId;
}

/** Suscripción Web Push de un dispositivo. Se revoca, nunca se borra. */
export interface PushSubscriptionRecord {
  id: string;
  owner: NotificationRecipient;
  endpoint: string;
  /** Llave pública del navegador (base64url). */
  p256dh: string;
  /** Secreto de autenticación del navegador (base64url). */
  auth: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  /** Motivo de la revocación: la persona la desactivó, el navegador la dio de baja (404/410)… */
  revokedReason: string | null;
}

export interface SavePushSubscriptionInput {
  owner: NotificationRecipient;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
}

/**
 * PENDIENTE: primer aviso de que falta su firma. RECORDATORIO: insistencia mientras siga pendiente.
 * AVANCE: al solicitante proveedor, cada firma parcial. RESULTADO: al solicitante proveedor, aprobado/cerrado/rechazado.
 */
export type NotificationKind = "PENDIENTE" | "RECORDATORIO" | "AVANCE" | "RESULTADO";

/** ENVIADA: llegó a al menos un dispositivo. SIN_SUSCRIPCION: la persona no tiene dispositivos activos. */
export type NotificationStatus = "ENVIADA" | "FALLIDA" | "SIN_SUSCRIPCION";

/** Aviso registrado (inmutable): uno por destinatario, firma pendiente y envío. */
export interface NotificationLogEntry {
  id: string;
  permitId: string;
  permitTypeSlug: string;
  /** Paso de firma al que se refiere (p. ej. "hsea", "participant_2"); null en avisos al solicitante. */
  signatureKey: string | null;
  recipient: NotificationRecipient;
  kind: NotificationKind;
  title: string;
  body: string;
  url: string;
  status: NotificationStatus;
  devicesSent: number;
  devicesFailed: number;
  error: string | null;
  sentAt: string;
}
