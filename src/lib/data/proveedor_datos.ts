import type { DataRepositories } from "./repositorios";
import { create_azure_repositories } from "./azure/repositorios_azure";
import { create_memory_repositories } from "./memoria/repositorios_memoria";

export type DataProviderName = "memory" | "azure";

/** Sin DATA_PROVIDER se usa "memory" (datos dummy) hasta tener BD hosteada. */
export function get_data_provider_name(): DataProviderName {
  const providerName = process.env.DATA_PROVIDER || "memory";
  if (providerName === "memory" || providerName === "azure") return providerName;
  throw new Error('DATA_PROVIDER debe ser "memory" o "azure"');
}

// Una sola instancia por proceso (sobrevive al hot reload de `next dev`).
const globalRepositories = globalThis as typeof globalThis & {
  azureRepositories?: DataRepositories;
};

/** Punto único de entrada a la capa de datos. La BD de producción es Azure SQL Server. */
export function get_repositories(): DataRepositories {
  const providerName = get_data_provider_name();
  if (providerName === "memory") return create_memory_repositories();
  // En desarrollo no se guarda en caché: el pool de conexiones ya es global (conexion.ts) y, si no, la
  // instancia vieja sobrevive al hot reload y no tiene los métodos nuevos hasta reiniciar el servidor.
  if (process.env.NODE_ENV !== "production") return create_azure_repositories();
  return (globalRepositories.azureRepositories ??= create_azure_repositories());
}
