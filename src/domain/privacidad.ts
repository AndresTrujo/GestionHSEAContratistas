import type { ActorId, ActorType } from "./auditoria";

/**
 * Aceptación del aviso de privacidad (LFPDPPP). Es evidencia: solo se agrega, nunca se edita ni se borra.
 * Se liga a la identidad del actor (número de empleado o "P-" + id de usuario de proveedor) y a la versión
 * exacta del texto aceptado (versión + sha256).
 */
export interface PrivacyAcceptance {
  id: string;
  actorType: Extract<ActorType, "EMPLEADO" | "USUARIO_PROVEEDOR">;
  actorId: ActorId;
  noticeVersion: string;
  /** sha256 del texto del aviso vigente al aceptar. */
  noticeHash: string;
  acceptedAt: string; // ISO 8601
  ipAddress: string;
  userAgent: string;
}

export type NewPrivacyAcceptance = Omit<PrivacyAcceptance, "id" | "acceptedAt">;
