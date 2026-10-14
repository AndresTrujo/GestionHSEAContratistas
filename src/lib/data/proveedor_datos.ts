import type { DataRepositories } from "./repositorios";
import { create_memory_repositories } from "./memoria/repositorios_memoria";
import { create_railway_repositories } from "./railway/repositorios_railway";

export type DataProviderName = "memory" | "firebase" | "railway";

/** Sin DATA_PROVIDER se usa "memory" (datos dummy) hasta tener BD hosteada. */
export function get_data_provider_name(): DataProviderName {
  const providerName = process.env.DATA_PROVIDER || "memory";
  if (
    providerName === "memory" ||
    providerName === "firebase" ||
    providerName === "railway"
  ) {
    return providerName;
  }
  throw new Error('DATA_PROVIDER debe ser "memory", "firebase" o "railway"');
}

// Una sola instancia por proceso (sobrevive al hot reload de `next dev`).
const globalRepositories = globalThis as typeof globalThis & {
  railwayRepositories?: DataRepositories;
};

/**
 * Punto único de entrada a la capa de datos. La implementación de firebase
 * (lib/data/firebase) no existe: se eligió Railway como proveedor de BD.
 */
export function get_repositories(): DataRepositories {
  const providerName = get_data_provider_name();
  if (providerName === "memory") return create_memory_repositories();
  if (providerName === "railway") {
    // En desarrollo no se guarda en caché: el pool de conexiones ya es global (conexion.ts) y, si no, la
    // instancia vieja sobrevive al hot reload y no tiene los métodos nuevos hasta reiniciar el servidor.
    if (process.env.NODE_ENV !== "production") return create_railway_repositories();
    return (globalRepositories.railwayRepositories ??= create_railway_repositories());
  }
  throw new Error(`Implementación de datos para "${providerName}" aún no disponible`);
}
