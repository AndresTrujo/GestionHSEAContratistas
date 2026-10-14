import { PermitListView } from "@/components/permisos/PermitListView";
import { confinedSlug } from "@/config/espacios_confinados";
import { find_permit_type } from "@/config/tipos_permiso";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { filter_permits_for_actor, require_permit_actor } from "@/lib/permisos/actor";
import { apply_permit_filters, parse_permit_filters, type PermitListPageProps } from "@/lib/permisos/busqueda";

export default async function ConfinedPermitsPage({ searchParams }: PermitListPageProps) {
  const filters = parse_permit_filters(await searchParams);
  const permitType = find_permit_type(confinedSlug);
  const actor = await require_permit_actor();
  const allPermits = filter_permits_for_actor(actor, await get_repositories().permits.list_by_type(confinedSlug)).sort(
    (first, second) => second.createdAt.localeCompare(first.createdAt),
  );
  const permits = apply_permit_filters(allPermits, filters);

  return (
    <PermitListView
      slug={confinedSlug}
      breadcrumbLabel="Espacios confinados"
      title="Permisos para entrada a espacios confinados"
      formCode={permitType?.formCode}
      newLabel="Nuevo permiso"
      filters={filters}
      permits={permits}
      columns={[
        { header: "Fecha", render: (permit) => String(permit.fields.date) },
        { header: "Espacio confinado", render: (permit) => `${String(permit.fields.spaceNumber)} · ${String(permit.fields.location)}` },
        { header: "Tipo", render: (permit) => `Tipo ${String(permit.fields.riskType)}` },
        { header: "Compañía", render: (permit) => String(permit.fields.company) },
      ]}
    />
  );
}
