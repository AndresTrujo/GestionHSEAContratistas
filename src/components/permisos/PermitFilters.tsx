import { inputClass, labelClass, primaryButtonClass } from "@/components/administracion/estilos";
import type { PermitFilters as Filters } from "@/lib/permisos/busqueda";

/** Búsqueda por folio o nombre y rango de fechas (GET: el estado vive en la URL). */
export function PermitFilters({ filters }: { filters: Filters }) {
  return (
    <form method="get" className="mb-6 rounded-xl border border-neutral-light bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_11rem_11rem_auto] lg:items-end">
        <div>
          <label htmlFor="q" className={labelClass}>Buscar por folio o nombre</label>
          <input id="q" name="q" type="search" defaultValue={filters.query} placeholder="Ej. TC-2026-0001 o Juan Pérez" className={inputClass} />
        </div>
        <div>
          <label htmlFor="desde" className={labelClass}>Desde</label>
          <input id="desde" name="desde" type="date" defaultValue={filters.from} className={inputClass} />
        </div>
        <div>
          <label htmlFor="hasta" className={labelClass}>Hasta</label>
          <input id="hasta" name="hasta" type="date" defaultValue={filters.to} className={inputClass} />
        </div>
        <button type="submit" className={primaryButtonClass}>
          Filtrar
        </button>
      </div>
      <p className="mt-3 text-xs text-neutral-dark">
        Por omisión se muestran los permisos de hoy. Deja las fechas vacías para ver todos.
      </p>
    </form>
  );
}
