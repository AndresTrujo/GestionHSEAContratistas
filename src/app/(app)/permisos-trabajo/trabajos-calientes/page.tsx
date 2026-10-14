import { PermitListView } from "@/components/permisos/PermitListView";
import { find_permit_type } from "@/config/tipos_permiso";
import { hotWorkSlug } from "@/config/trabajos_calientes";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { filter_permits_for_actor, require_permit_actor } from "@/lib/permisos/actor";
import { apply_permit_filters, parse_permit_filters, type PermitListPageProps } from "@/lib/permisos/busqueda";

export default async function HotWorkPermitsPage({ searchParams }: PermitListPageProps) {
  const filters = parse_permit_filters(await searchParams);
  const permitType = find_permit_type(hotWorkSlug);
  const actor = await require_permit_actor();
  const allPermits = filter_permits_for_actor(actor, await get_repositories().permits.list_by_type(hotWorkSlug)).sort(
    (first, second) => second.createdAt.localeCompare(first.createdAt),
  );
  const permits = apply_permit_filters(allPermits, filters);

  return (
    <PermitListView
      slug={hotWorkSlug}
      breadcrumbLabel="Trabajos calientes"
      title="Permisos de trabajos calientes"
      formCode={permitType?.formCode}
      newLabel="Nuevo permiso"
      filters={filters}
      permits={permits}
      columns={[
        { header: "Fecha", render: (permit) => String(permit.fields.date) },
        { header: "Área de trabajo", render: (permit) => String(permit.fields.workArea) },
        { header: "Solicitante", render: (permit) => String(permit.fields.requesterName) },
      ]}
    />
  );
}
