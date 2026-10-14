import Link from "next/link";
import type { ReactNode } from "react";
import { primaryButtonClass, tableClass, tdClass, thClass } from "@/components/administracion/estilos";
import { PermitFilters } from "@/components/permisos/PermitFilters";
import { PermitStatusBadge } from "@/components/permisos/PermitStatusBadge";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import type { WorkPermit } from "@/domain/permisos";
import type { PermitFilters as Filters } from "@/lib/permisos/busqueda";

export interface PermitColumn {
  header: string;
  render: (permit: WorkPermit) => ReactNode;
}

interface PermitListViewProps {
  slug: string;
  /** Texto del último tramo de la ruta de navegación (p. ej. "Trabajos calientes"). */
  breadcrumbLabel: string;
  title: string;
  /** Código del formato controlado (p. ej. FO-0123). */
  formCode?: string;
  newLabel: string;
  filters: Filters;
  permits: WorkPermit[];
  /** Columnas propias del tipo de permiso; el folio y el estado se agregan solos. */
  columns: PermitColumn[];
  emptyText?: string;
}

/**
 * Listado de permisos de un tipo: encabezado con el botón de nuevo, filtros, resumen por estado y la lista
 * (tabla en pantallas medianas y grandes, tarjetas en celular). Cada tipo solo aporta sus columnas.
 */
export function PermitListView({
  slug,
  breadcrumbLabel,
  title,
  formCode,
  newLabel,
  filters,
  permits,
  columns,
  emptyText = "No hay permisos que coincidan con el filtro.",
}: PermitListViewProps) {
  const pending = permits.filter((permit) => permit.status === "submitted").length;
  const approved = permits.filter((permit) => permit.status === "approved").length;
  const closed = permits.filter((permit) => permit.status === "closed").length;
  const summary = [
    { label: "Permisos", value: permits.length, accent: "border-t-brand-navy" },
    { label: "Pendientes de firmas", value: pending, accent: "border-t-brand-cyan" },
    { label: "Autorizados", value: approved, accent: "border-t-brand-green" },
    { label: "Cerrados", value: closed, accent: "border-t-neutral-dark" },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Permisos de trabajo", href: "/permisos-trabajo" },
          { label: breadcrumbLabel },
        ]}
      />
      <PageHeader
        title={title}
        eyebrow={
          formCode ? (
            <span className="rounded-full bg-neutral-light/40 px-2.5 py-0.5 text-xs font-bold text-brand-navy">{formCode}</span>
          ) : undefined
        }
        actions={
          <Link href={`/permisos-trabajo/${slug}/nuevo`} className={primaryButtonClass}>
            {newLabel}
          </Link>
        }
      />

      <PermitFilters filters={filters} />

      <ul className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((item) => (
          <li key={item.label} className={`rounded-xl border border-t-4 border-neutral-light bg-white p-4 shadow-sm ${item.accent}`}>
            <span className="block text-3xl font-bold text-brand-navy">{item.value}</span>
            <span className="text-sm text-neutral-dark">{item.label}</span>
          </li>
        ))}
      </ul>

      {permits.length === 0 ? (
        <p className="rounded-xl border border-neutral-light bg-white p-6 text-center text-neutral-dark shadow-sm">{emptyText}</p>
      ) : (
        <>
          {/* Celulares: una tarjeta por permiso. */}
          <ul className="space-y-3 md:hidden">
            {permits.map((permit) => (
              <li key={permit.id} className="rounded-xl border border-neutral-light bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <Link href={`/permisos-trabajo/${slug}/${permit.id}`} className="text-lg font-bold text-brand-navy underline">
                    {String(permit.fields.folio)}
                  </Link>
                  <PermitStatusBadge status={permit.status} />
                </div>
                <dl className="space-y-1 text-sm">
                  {columns.map((column) => (
                    <div key={column.header} className="flex gap-2">
                      <dt className="shrink-0 text-neutral-dark">{column.header}:</dt>
                      <dd className="min-w-0">{column.render(permit)}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>

          {/* Pantallas medianas y grandes: tabla. */}
          <div className="hidden overflow-x-auto rounded-xl border border-neutral-light bg-white shadow-sm md:block">
            <table className={tableClass}>
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr>
                  <th scope="col" className={thClass}>Folio</th>
                  {columns.map((column) => (
                    <th key={column.header} scope="col" className={thClass}>
                      {column.header}
                    </th>
                  ))}
                  <th scope="col" className={thClass}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {permits.map((permit) => (
                  <tr key={permit.id} className="hover:bg-neutral-light/10">
                    <td className={tdClass}>
                      <Link href={`/permisos-trabajo/${slug}/${permit.id}`} className="font-bold text-brand-navy underline">
                        {String(permit.fields.folio)}
                      </Link>
                    </td>
                    {columns.map((column) => (
                      <td key={column.header} className={tdClass}>
                        {column.render(permit)}
                      </td>
                    ))}
                    <td className={tdClass}>
                      <PermitStatusBadge status={permit.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
