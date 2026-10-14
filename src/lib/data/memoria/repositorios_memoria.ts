import type { AuditEvent } from "@/domain/auditoria";
import type { WorkPermit } from "@/domain/permisos";
import type { ServerLogEntry } from "@/domain/registro_servidor";
import type { DataRepositories } from "../repositorios";
import { get_date_mx } from "../identidad";
import {
  create_contractor_store,
  type ContractorStore,
} from "./almacen_contratistas";
import {
  create_organization_store,
  type OrganizationStore,
} from "./almacen_organizacion";
import {
  create_contractor_repositories,
  create_provider_signer_lookup,
} from "./repos_contratistas_memoria";
import { create_organization_repositories } from "./repos_organizacion_memoria";

/**
 * Implementación en memoria con datos dummy, para desarrollar sin BD hosteada.
 * Los datos se pierden al reiniciar el servidor.
 */
interface MemoryStore {
  permits: WorkPermit[];
  auditEvents: AuditEvent[];
  serverLogs: ServerLogEntry[];
}

function create_store(): MemoryStore {
  return { permits: [], auditEvents: [], serverLogs: [] };
}

// Se guarda en globalThis para sobrevivir al hot reload de `next dev`.
const globalStore = globalThis as typeof globalThis & {
  memoryStore?: MemoryStore;
  organizationStore?: OrganizationStore;
  contractorStore?: ContractorStore;
};

export function create_memory_repositories(): DataRepositories {
  const store = (globalStore.memoryStore ??= create_store());
  const organizationStore = (globalStore.organizationStore ??= create_organization_store());
  const contractorStore = (globalStore.contractorStore ??= create_contractor_store());

  function upsert<T extends { id: string }>(list: T[], item: T): T {
    const index = list.findIndex((existing) => existing.id === item.id);
    if (index >= 0) list[index] = item;
    else list.push(item);
    return item;
  }

  const audit: DataRepositories["audit"] = {
    async append_event(event) {
      const saved: AuditEvent = { ...event, id: crypto.randomUUID() };
      store.auditEvents.push(saved);
      return saved;
    },
    async list_events_by_entity(entityType, entityId) {
      return store.auditEvents.filter(
        (event) => event.entityType === entityType && event.entityId === entityId,
      );
    },
    async search_events(filter) {
      return store.auditEvents
        .filter((event) => {
          if (filter.entityType && event.entityType !== filter.entityType) return false;
          if (filter.entityId && event.entityId !== filter.entityId) return false;
          if (filter.actorId && event.actorId !== filter.actorId) return false;
          if (filter.action && event.action !== filter.action) return false;
          const date = get_date_mx(event.occurredAt);
          if (filter.from && date < filter.from) return false;
          if (filter.to && date > filter.to) return false;
          return true;
        })
        .reverse()
        .slice(0, filter.limit);
    },
  };

  const serverLog: DataRepositories["serverLog"] = {
    async append_entry(entry) {
      const saved: ServerLogEntry = { ...entry, id: crypto.randomUUID() };
      store.serverLogs.push(saved);
      return saved;
    },
    async search_entries(filter) {
      return store.serverLogs
        .filter((entry) => {
          if (filter.level && entry.level !== filter.level) return false;
          if (filter.source && entry.source !== filter.source) return false;
          const date = get_date_mx(entry.occurredAt);
          if (filter.from && date < filter.from) return false;
          if (filter.to && date > filter.to) return false;
          return true;
        })
        .reverse()
        .slice(0, filter.limit);
    },
    async count_since(level, sinceIso) {
      return store.serverLogs.filter((entry) => entry.level === level && entry.occurredAt >= sinceIso).length;
    },
  };

  const permits: DataRepositories["permits"] = {
    async list_by_type(permitTypeSlug) {
      return store.permits.filter((permit) => permit.permitTypeSlug === permitTypeSlug);
    },
    async get_by_id(id) {
      return store.permits.find((permit) => permit.id === id) ?? null;
    },
    async save(permit) {
      return upsert(store.permits, permit);
    },
  };

  // La firma de proveedores consulta a contratistas; contratistas consulta permisos de acceso.
  const organization = create_organization_repositories(
    organizationStore,
    audit,
    create_provider_signer_lookup(contractorStore, permits),
  );
  const contractors = create_contractor_repositories(
    contractorStore,
    audit,
    organization.access,
    organization.employees,
    permits,
  );

  return { audit, serverLog, permits, ...organization, ...contractors };
}
