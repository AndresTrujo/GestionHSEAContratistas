import type { PermitStatus, WorkPermit } from "@/domain/permisos";
import { confinedApprovalSignatures, confinedClosingSignature, confinedSlug } from "./espacios_confinados";
import { get_jsa_participants, get_participant_key, jsaApprovalSignatures, jsaSlug } from "./jsa";
import { stopSignatures, stopSlug } from "./observacion_stop";
import { heightsApprovalSignatures, heightsSlug } from "./trabajos_alturas";
import { is_next_approval_signature } from "./tipos_permiso";
import { hotWorkApprovalSignatures, hotWorkSlug } from "./trabajos_calientes";

/**
 * Recordatorios a quien no ha firmado: los primeros `fastReminders` cada 15 minutos desde el último aviso y
 * después uno por hora, hasta que firme. Solo se envían dentro del horario laboral (hora de CDMX).
 */
export const fastReminderIntervalMinutes = 15;
export const fastReminders = 3;
export const slowReminderIntervalMinutes = 60;
export const reminderWindowStartMinutes = 8 * 60;
export const reminderWindowEndMinutes = 18 * 60;
/** Cada cuánto revisa el servidor si hay recordatorios por enviar. */
export const reminderTickMinutes = 5;
/** Un permiso sin movimiento por más de estos días deja de recibir recordatorios (se considera abandonado). */
export const reminderMaxAgeDays = 14;

/** Paso de firma que se espera en una etapa del permiso, con el texto que verá el destinatario. */
export interface ExpectedSignature {
  key: string;
  label: string;
}

/**
 * Firmas que se esperan en cada estatus, por tipo de permiso. Solo estos tipos notifican
 * (el ingreso de teléfono celular queda fuera). Las verificaciones durante el trabajo no se notifican.
 */
const expectedSignaturesByType: Record<string, (permit: WorkPermit) => Partial<Record<PermitStatus, ExpectedSignature[]>>> = {
  [hotWorkSlug]: () => ({ submitted: [...hotWorkApprovalSignatures] }),
  [heightsSlug]: () => ({ submitted: [...heightsApprovalSignatures] }),
  [confinedSlug]: () => ({
    submitted: [...confinedApprovalSignatures],
    // El cierre de HSEA se habilita una vez aprobado el permiso.
    approved: [confinedClosingSignature],
  }),
  [jsaSlug]: (permit) => ({
    submitted: [
      ...jsaApprovalSignatures.map((item) => ({ key: item.key, label: item.label })),
      ...get_jsa_participants(permit).map((participant) => ({
        key: get_participant_key(participant.position),
        label: "Participante",
      })),
    ],
  }),
  [stopSlug]: () => ({ submitted: [...stopSignatures] }),
};

export const notifiablePermitTypeSlugs = Object.keys(expectedSignaturesByType);

/** Estatus en los que algún tipo espera firmas (para buscar recordatorios pendientes). */
export const notifiableStatuses: PermitStatus[] = ["submitted", "approved"];

export function is_notifiable_permit_type(permitTypeSlug: string): boolean {
  return permitTypeSlug in expectedSignaturesByType;
}

/** Firmas de la etapa actual del permiso que aún no se han hecho. */
export function get_pending_signatures(permit: WorkPermit): ExpectedSignature[] {
  const stages = expectedSignaturesByType[permit.permitTypeSlug]?.(permit);
  const expected = stages?.[permit.status] ?? [];
  return expected.filter((item) => !permit.signatures.some((signature) => signature.key === item.key));
}

/**
 * Firmas pendientes que ya se pueden firmar: las aprobaciones son secuenciales, así que solo se avisa a
 * quien sigue (y a los participantes, que firman en paralelo), no a quien todavía no puede firmar.
 */
export function get_next_signatures(permit: WorkPermit): ExpectedSignature[] {
  return get_pending_signatures(permit).filter((item) => is_next_approval_signature(permit, item.key));
}

/** Texto de un paso de firma del permiso (cualquier etapa), para avisos de avance. */
export function get_signature_label(permit: WorkPermit, key: string): string {
  const stages = expectedSignaturesByType[permit.permitTypeSlug]?.(permit) ?? {};
  for (const items of Object.values(stages)) {
    const found = items?.find((item) => item.key === key);
    if (found) return found.label;
  }
  return key;
}
