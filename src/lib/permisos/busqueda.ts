import type { WorkPermit } from "@/domain/permisos";
import { get_date_mx, get_today_mx } from "@/lib/data/identidad";

export type PermitSearchParams = Record<string, string | string[] | undefined>;

export interface PermitListPageProps {
  searchParams: Promise<PermitSearchParams>;
}

export interface PermitFilters {
  /** Texto buscado en el folio y en los campos de nombre (solicitante, ejecutantes, contratista…). */
  query: string;
  /** Fecha inicial YYYY-MM-DD; vacío = sin límite. */
  from: string;
  /** Fecha final YYYY-MM-DD; vacío = sin límite. */
  to: string;
}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
/** Campos de texto libre que contienen nombres de personas o empresas. */
const nameFieldPattern = /name|executor\d|company/i;

function read_param(params: PermitSearchParams, name: string): string | undefined {
  const value = params[name];
  const text = Array.isArray(value) ? value[0] : value;
  return text === undefined ? undefined : text.trim();
}

function read_date(params: PermitSearchParams, name: string, fallback: string): string {
  const value = read_param(params, name);
  if (value === undefined) return fallback;
  return isoDatePattern.test(value) ? value : "";
}

/**
 * Filtros del listado. Sin parámetros en la URL el filtro predeterminado es el día de hoy (hora de
 * Ciudad de México); si la persona envía el formulario con las fechas vacías, se ve todo.
 */
export function parse_permit_filters(params: PermitSearchParams): PermitFilters {
  const today = get_today_mx();
  return {
    query: read_param(params, "q") ?? "",
    from: read_date(params, "desde", today),
    to: read_date(params, "hasta", today),
  };
}

/** Fecha del permiso: la capturada en el formato o, si no hay, la de creación. */
function get_permit_date(permit: WorkPermit): string {
  const captured = permit.fields.date;
  return typeof captured === "string" && isoDatePattern.test(captured) ? captured : get_date_mx(permit.createdAt);
}

export function apply_permit_filters(permits: WorkPermit[], filters: PermitFilters): WorkPermit[] {
  const query = filters.query.toLowerCase();
  return permits.filter((permit) => {
    const date = get_permit_date(permit);
    if (filters.from && date < filters.from) return false;
    if (filters.to && date > filters.to) return false;
    if (!query) return true;

    const searchable = [
      String(permit.fields.folio ?? ""),
      ...Object.entries(permit.fields)
        .filter(([key, value]) => nameFieldPattern.test(key) && typeof value === "string")
        .map(([, value]) => String(value)),
    ];
    return searchable.some((text) => text.toLowerCase().includes(query));
  });
}
