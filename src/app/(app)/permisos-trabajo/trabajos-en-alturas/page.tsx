import { PermitListView } from "@/components/permisos/PermitListView";
import { heightsSlug } from "@/config/trabajos_alturas";
import { find_permit_type } from "@/config/tipos_permiso";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { filter_permits_for_actor, require_permit_actor } from "@/lib/permisos/actor";
import { apply_permit_filters, parse_permit_filters, type PermitListPageProps } from "@/lib/permisos/busqueda";

export default async function HeightsPermitsPage({ searchParams }: PermitListPageProps) {
  const filters = parse_permit_filters(await searchParams);
  const permitType = find_permit_type(heightsSlug);
  const actor = await require_permit_actor();
  const allPermits = filter_permits_for_actor(actor, await get_repositories().permits.list_by_type(heightsSlug)).sort(
    (first, second) => second.createdAt.localeCompare(first.createdAt),
  );
  const permits = apply_permit_filters(allPermits, filters);

  return (
    <PermitListView
      slug={heightsSlug}
      breadcrumbLabel="Trabajos en alturas"
      title="Permisos para trabajos en alturas"
      formCode={permitType?.formCode}
      newLabel="Nuevo permiso"
      filters={filters}
      permits={permits}
      columns={[
        { header: "Fecha", render: (permit) => String(permit.fields.date) },
        { header: "Área de trabajo", render: (permit) => String(permit.fields.workArea) },
        { header: "Depto. / Compañía", render: (permit) => String(permit.fields.department) },
      ]}
    />
  );
}
