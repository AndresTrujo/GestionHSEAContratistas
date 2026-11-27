"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { privacyNoticeVersion } from "@/config/aviso_privacidad";
import { get_client_address } from "@/lib/auth/ip_cliente";
import { get_session } from "@/lib/auth/sesion";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { get_privacy_notice_hash } from "./aviso";
import { get_session_actor_id } from "./actor_aviso";

const maxUserAgentLength = 500;

/**
 * Registra la aceptación del aviso de privacidad vigente de la persona en sesión (evidencia de solo anexar).
 * Exige la casilla marcada y que la versión enviada sea la vigente; el servidor no confía en el cliente para el hash.
 */
export async function accept_privacy_notice_action(formData: FormData): Promise<void> {
  const session = await get_session();
  if (!session) redirect("/login");

  if (formData.get("accept") !== "on" || formData.get("noticeVersion") !== privacyNoticeVersion) return;

  const actorId = get_session_actor_id(session);
  const repositories = get_repositories();
  const requestHeaders = await headers();
  const created = await repositories.privacyConsents.record_acceptance({
    actorType: session.kind,
    actorId,
    noticeVersion: privacyNoticeVersion,
    noticeHash: get_privacy_notice_hash(),
    ipAddress: await get_client_address(),
    userAgent: (requestHeaders.get("user-agent") ?? "desconocido").slice(0, maxUserAgentLength),
  });

  if (created) {
    await repositories.audit.append_event({
      entityType: "aceptaciones_aviso_privacidad",
      entityId: actorId,
      action: "crear",
      actorType: session.kind,
      actorId,
      occurredAt: new Date().toISOString(),
      details: { event: "aceptar_aviso_privacidad", noticeVersion: privacyNoticeVersion },
    });
  }
  revalidatePath("/", "layout");
}
