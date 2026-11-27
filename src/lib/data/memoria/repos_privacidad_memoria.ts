import type { PrivacyAcceptance } from "@/domain/privacidad";
import type { PrivacyConsentRepository } from "../repositorios";

/** Aceptaciones en memoria (se pierden al reiniciar). La lista se comparte vía globalThis desde el repositorio. */
export function create_privacy_consent_repository(store: PrivacyAcceptance[]): PrivacyConsentRepository {
  return {
    async has_accepted(actorId, noticeVersion) {
      return store.some((item) => item.actorId === actorId && item.noticeVersion === noticeVersion);
    },
    async record_acceptance(input) {
      const exists = store.some(
        (item) => item.actorId === input.actorId && item.noticeVersion === input.noticeVersion,
      );
      if (exists) return false;
      store.push({ ...input, id: crypto.randomUUID(), acceptedAt: new Date().toISOString() });
      return true;
    },
    async list_by_actor(actorId) {
      return store.filter((item) => item.actorId === actorId);
    },
  };
}
