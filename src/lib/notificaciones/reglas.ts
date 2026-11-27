import {
  fastReminderIntervalMinutes,
  fastReminders,
  reminderWindowEndMinutes,
  reminderWindowStartMinutes,
  slowReminderIntervalMinutes,
} from "@/config/notificaciones";
import type { NotificationLogEntry } from "@/domain/notificaciones";
import { get_time_mx } from "@/lib/data/identidad";

export type ReminderDecision = { due: true; reminderNumber: number } | { due: false };

/** ¿Es hora laboral de recordatorios (08:00 a 18:00, hora de CDMX)? */
export function is_within_reminder_window(now: Date): boolean {
  const [hours = 0, minutes = 0] = get_time_mx(now).split(":").map(Number);
  const minuteOfDay = hours * 60 + minutes;
  return minuteOfDay >= reminderWindowStartMinutes && minuteOfDay < reminderWindowEndMinutes;
}

/**
 * ¿Toca recordarle a esta persona esta firma? `entries` son los avisos ya registrados del mismo permiso,
 * paso de firma y destinatario. Solo se recuerda lo que ya se avisó (PENDIENTE): los primeros 3 recordatorios
 * cada 15 minutos desde el último aviso y, después, uno por hora hasta que firme. Fuera del horario laboral
 * no se envía; el recordatorio atrasado sale en cuanto abre la ventana. Los avisos sin dispositivo también
 * cuentan, para no insistir sin fin.
 */
export function decide_reminder(entries: NotificationLogEntry[], now: Date): ReminderDecision {
  const relevant = entries.filter((entry) => entry.kind === "PENDIENTE" || entry.kind === "RECORDATORIO");
  if (!relevant.some((entry) => entry.kind === "PENDIENTE")) return { due: false };
  if (!is_within_reminder_window(now)) return { due: false };
  const sent = relevant.filter((entry) => entry.kind === "RECORDATORIO").length;
  const intervalMinutes = sent < fastReminders ? fastReminderIntervalMinutes : slowReminderIntervalMinutes;
  const lastSentAt = Math.max(...relevant.map((entry) => Date.parse(entry.sentAt)));
  if (now.getTime() - lastSentAt < intervalMinutes * 60_000) return { due: false };
  return { due: true, reminderNumber: sent + 1 };
}
