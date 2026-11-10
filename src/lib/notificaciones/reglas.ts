import { maxReminders, reminderIntervalMinutes } from "@/config/notificaciones";
import type { NotificationLogEntry } from "@/domain/notificaciones";

export type ReminderDecision = { due: true; reminderNumber: number } | { due: false };

/**
 * ¿Toca recordarle a esta persona esta firma? `entries` son los avisos ya registrados del mismo permiso,
 * paso de firma y destinatario. Solo se recuerda lo que ya se avisó (PENDIENTE), cada 30 minutos desde el
 * último aviso y hasta 3 veces; los avisos sin dispositivo también cuentan, para no insistir sin fin.
 */
export function decide_reminder(entries: NotificationLogEntry[], now: Date): ReminderDecision {
  const relevant = entries.filter((entry) => entry.kind === "PENDIENTE" || entry.kind === "RECORDATORIO");
  if (!relevant.some((entry) => entry.kind === "PENDIENTE")) return { due: false };
  const sent = relevant.filter((entry) => entry.kind === "RECORDATORIO").length;
  if (sent >= maxReminders) return { due: false };
  const lastSentAt = Math.max(...relevant.map((entry) => Date.parse(entry.sentAt)));
  if (now.getTime() - lastSentAt < reminderIntervalMinutes * 60_000) return { due: false };
  return { due: true, reminderNumber: sent + 1 };
}
