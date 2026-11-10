import { after } from "next/server";
import {
  get_pending_signatures,
  get_signature_label,
  is_notifiable_permit_type,
  type ExpectedSignature,
} from "@/config/notificaciones";
import { find_permit_type } from "@/config/tipos_permiso";
import type { WorkPermit } from "@/domain/permisos";
import { log_server_event } from "@/lib/registro/registro_servidor";
import { get_provider_requester, resolve_signature_recipients } from "./destinatarios";
import { send_push } from "./envio";

function describe_permit(permit: WorkPermit): string {
  const folio = permit.fields.folio;
  const typeName = find_permit_type(permit.permitTypeSlug)?.name ?? "Permiso";
  return typeof folio === "string" && folio ? `${typeName} ${folio}` : typeName;
}

function get_folio(permit: WorkPermit): string {
  const folio = permit.fields.folio;
  return typeof folio === "string" && folio ? folio : (find_permit_type(permit.permitTypeSlug)?.name ?? "tu permiso");
}

/** Primer aviso a cada persona que puede firmar los pasos pendientes de la etapa actual. */
async function notify_pending(permit: WorkPermit, signatures: ExpectedSignature[], excludeIds: string[]): Promise<void> {
  const description = describe_permit(permit);
  for (const signature of signatures) {
    const recipients = await resolve_signature_recipients(permit, signature, excludeIds);
    await Promise.all(
      recipients.map((recipient) =>
        send_push(permit, recipient, {
          kind: "PENDIENTE",
          signatureKey: signature.key,
          title: "Firma pendiente",
          body: `${description}: se requiere tu firma como ${signature.label}.`,
        }),
      ),
    );
  }
}

/** Avance al usuario de proveedor que solicitó el permiso: quién firmó y quién falta, o el resultado. */
async function notify_requester_progress(
  previous: WorkPermit,
  updated: WorkPermit,
  signedKey: string,
  actorId: string,
): Promise<void> {
  const requester = get_provider_requester(updated);
  if (!requester || requester.id === actorId) return;
  const folio = get_folio(updated);

  if (updated.status !== previous.status && (updated.status === "approved" || updated.status === "closed")) {
    const pending = get_pending_signatures(updated);
    const result = updated.status === "approved" ? "fue aprobado" : "quedó cerrado";
    const next = pending.length > 0 ? ` Falta: ${pending.map((item) => item.label).join(", ")}.` : "";
    await send_push(updated, requester, {
      kind: "RESULTADO",
      signatureKey: null,
      title: `Tu permiso ${folio} ${result}`,
      body: `Firmó: ${get_signature_label(updated, signedKey)}.${next}`,
    });
    return;
  }

  const pending = get_pending_signatures(updated);
  await send_push(updated, requester, {
    kind: "AVANCE",
    signatureKey: null,
    title: `Avance de tu permiso ${folio}`,
    body:
      pending.length > 0
        ? `Firmó: ${get_signature_label(updated, signedKey)}. Faltan: ${pending.map((item) => item.label).join(", ")}.`
        : `Firmó: ${get_signature_label(updated, signedKey)}.`,
  });
}

/** Corre el aviso después de responder (no retrasa ni rompe la acción del usuario). */
function run_after(work: () => Promise<void>, context: Record<string, string>): void {
  after(async () => {
    try {
      await work();
    } catch (error) {
      await log_server_event("ERROR", "notificaciones", "No se pudieron enviar los avisos de firma", {
        error,
        context,
      });
    }
  });
}

/** Al crear un permiso: avisa a quienes deben firmar. `actorId` es quien lo creó (no se le avisa). */
export function notify_permit_created(permit: WorkPermit, actorId: string): void {
  if (!is_notifiable_permit_type(permit.permitTypeSlug)) return;
  run_after(() => notify_pending(permit, get_pending_signatures(permit), [actorId]), { permiso: permit.id });
}

/**
 * Tras una firma: si el permiso cambió de etapa, avisa a quienes deben firmar la nueva; al usuario de
 * proveedor solicitante le avisa de cada firma de autorización y del resultado.
 */
export function notify_permit_signed(previous: WorkPermit, updated: WorkPermit, signedKey: string, actorId: string): void {
  if (!is_notifiable_permit_type(updated.permitTypeSlug)) return;
  run_after(
    async () => {
      if (updated.status !== previous.status) {
        await notify_pending(updated, get_pending_signatures(updated), [actorId]);
      }
      const wasExpected = get_pending_signatures(previous).some((item) => item.key === signedKey);
      if (wasExpected) await notify_requester_progress(previous, updated, signedKey, actorId);
    },
    { permiso: updated.id, firma: signedKey },
  );
}
