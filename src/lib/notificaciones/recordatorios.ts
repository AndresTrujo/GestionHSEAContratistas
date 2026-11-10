import {
  get_pending_signatures,
  maxReminders,
  notifiablePermitTypeSlugs,
  notifiableStatuses,
  reminderIntervalMinutes,
  reminderTickMinutes,
} from "@/config/notificaciones";
import { find_permit_type } from "@/config/tipos_permiso";
import type { NotificationLogEntry } from "@/domain/notificaciones";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { log_server_event } from "@/lib/registro/registro_servidor";
import { resolve_signature_recipients } from "./destinatarios";
import { get_vapid_config, send_push } from "./envio";
import { decide_reminder } from "./reglas";

const leaseName = "recordatorios_firma";
/** El candado dura menos que el intervalo: si una instancia muere, otra toma la siguiente vuelta. */
const leaseSeconds = reminderTickMinutes * 60 - 30;
/** Ventana de búsqueda: el último recordatorio cae a los 90 min del aviso; se deja margen. */
const lookbackMinutes = reminderIntervalMinutes * (maxReminders + 1) + 60;

const globalReminders = globalThis as typeof globalThis & {
  reminderTimer?: ReturnType<typeof setInterval>;
  reminderRunning?: boolean;
  reminderInstanceId?: string;
};

function get_instance_id(): string {
  // En Azure App Service cada instancia trae su id; en local basta uno por proceso.
  return (globalReminders.reminderInstanceId ??= process.env.WEBSITE_INSTANCE_ID || crypto.randomUUID());
}

/**
 * Una vuelta: para cada permiso con firmas pendientes, recuerda a quienes ya se les avisó y siguen
 * pudiendo firmar, si pasaron 30 minutos desde su último aviso y van menos de 3 recordatorios.
 */
export async function run_reminder_tick(now: Date = new Date()): Promise<number> {
  const repositories = get_repositories();
  const permits = await repositories.permits.list_active({
    permitTypeSlugs: notifiablePermitTypeSlugs,
    statuses: notifiableStatuses,
    updatedSince: new Date(now.getTime() - lookbackMinutes * 60_000).toISOString(),
  });

  let sent = 0;
  for (const permit of permits) {
    const pending = get_pending_signatures(permit);
    if (pending.length === 0) continue;
    const log = await repositories.notifications.list_log_by_permit(permit.id);
    if (log.length === 0) continue;
    const typeName = find_permit_type(permit.permitTypeSlug)?.name ?? "Permiso";
    const folio = typeof permit.fields.folio === "string" && permit.fields.folio ? ` ${permit.fields.folio}` : "";

    for (const signature of pending) {
      const entries = log.filter((entry) => entry.signatureKey === signature.key);
      if (entries.length === 0) continue;
      // Solo a quienes siguen pudiendo firmar (no perdieron el rol ni firmaron otro paso).
      const recipients = await resolve_signature_recipients(permit, signature);
      for (const recipient of recipients) {
        const own: NotificationLogEntry[] = entries.filter(
          (entry) => entry.recipient.kind === recipient.kind && entry.recipient.id === recipient.id,
        );
        const decision = decide_reminder(own, now);
        if (!decision.due) continue;
        await send_push(permit, recipient, {
          kind: "RECORDATORIO",
          signatureKey: signature.key,
          title: `Recordatorio ${decision.reminderNumber} de ${maxReminders}: firma pendiente`,
          body: `${typeName}${folio} sigue esperando tu firma como ${signature.label}.`,
        });
        sent += 1;
      }
    }
  }
  return sent;
}

async function run_guarded_tick(): Promise<void> {
  if (globalReminders.reminderRunning) return;
  globalReminders.reminderRunning = true;
  try {
    const acquired = await get_repositories().notifications.try_acquire_lease(leaseName, get_instance_id(), leaseSeconds);
    if (acquired) await run_reminder_tick();
  } catch (error) {
    await log_server_event("ERROR", "notificaciones", "Falló la revisión de recordatorios de firma", { error });
  } finally {
    globalReminders.reminderRunning = false;
  }
}

/** Arranca la revisión periódica (una sola vez por proceso). Sin llaves VAPID no hace nada. */
export function start_reminder_loop(): void {
  if (globalReminders.reminderTimer) return;
  if (!get_vapid_config()) {
    console.warn("[notificaciones] Sin llaves VAPID: los recordatorios de firma no se activan");
    return;
  }
  const timer = setInterval(() => void run_guarded_tick(), reminderTickMinutes * 60_000);
  // No impide que el proceso termine.
  timer.unref?.();
  globalReminders.reminderTimer = timer;
}
