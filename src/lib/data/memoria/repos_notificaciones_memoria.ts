import type { NotificationLogEntry, PushSubscriptionRecord } from "@/domain/notificaciones";
import type { NotificationRepository } from "../repositorios";

/** Suscripciones y bitácora de avisos en memoria (se pierden al reiniciar). */
export interface NotificationStore {
  subscriptions: PushSubscriptionRecord[];
  log: NotificationLogEntry[];
  leases: Map<string, { lockedUntil: number; instanceId: string }>;
}

export function create_notification_store(): NotificationStore {
  return { subscriptions: [], log: [], leases: new Map() };
}

export function create_notification_repository(store: NotificationStore): NotificationRepository {
  function find_active(endpoint: string): PushSubscriptionRecord | undefined {
    return store.subscriptions.find((item) => item.endpoint === endpoint && item.revokedAt === null);
  }

  function revoke(subscription: PushSubscriptionRecord, reason: string): PushSubscriptionRecord {
    subscription.revokedAt = new Date().toISOString();
    subscription.revokedReason = reason;
    return { ...subscription };
  }

  return {
    async save_subscription(input) {
      const previous = find_active(input.endpoint);
      if (previous) revoke(previous, "REEMPLAZADA");
      const saved: PushSubscriptionRecord = {
        ...input,
        owner: { ...input.owner },
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        revokedAt: null,
        revokedReason: null,
      };
      store.subscriptions.push(saved);
      return { ...saved };
    },
    async revoke_subscription(endpoint, reason) {
      const active = find_active(endpoint);
      return active ? revoke(active, reason) : null;
    },
    async list_active_subscriptions(owner) {
      return store.subscriptions
        .filter((item) => item.revokedAt === null && item.owner.kind === owner.kind && item.owner.id === owner.id)
        .map((item) => ({ ...item }));
    },
    async mark_subscriptions_used(subscriptionIds, usedAt) {
      for (const item of store.subscriptions) {
        if (subscriptionIds.includes(item.id)) item.lastUsedAt = usedAt;
      }
    },
    async append_log(entry) {
      const saved: NotificationLogEntry = { ...entry, recipient: { ...entry.recipient }, id: crypto.randomUUID() };
      store.log.push(saved);
      return { ...saved };
    },
    async list_log_by_permit(permitId) {
      return store.log.filter((item) => item.permitId === permitId).map((item) => ({ ...item }));
    },
    async try_acquire_lease(taskName, instanceId, seconds) {
      const now = Date.now();
      const current = store.leases.get(taskName);
      if (current && current.lockedUntil > now && current.instanceId !== instanceId) return false;
      store.leases.set(taskName, { lockedUntil: now + seconds * 1000, instanceId });
      return true;
    },
  };
}
