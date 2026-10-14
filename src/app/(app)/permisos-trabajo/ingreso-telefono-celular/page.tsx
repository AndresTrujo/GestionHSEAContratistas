import { PermitListView } from "@/components/permisos/PermitListView";
import { phoneSlug } from "@/config/ingreso_celular";
import { find_permit_type } from "@/config/tipos_permiso";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { filter_permits_for_actor, require_permit_actor } from "@/lib/permisos/actor";
import { apply_permit_filters, parse_permit_filters, type PermitListPageProps } from "@/lib/permisos/busqueda";

export default async function PhonePermitsPage({ searchParams }: PermitListPageProps) {
  const filters = parse_permit_filters(await searchParams);
  const permitType = find_permit_type(phoneSlug);
  const actor = await require_permit_actor();
  const allPermits = filter_permits_for_actor(actor, await get_repositories().permits.list_by_type(phoneSlug)).sort(
    (first, second) => second.createdAt.localeCompare(first.createdAt),
  );
  const permits = apply_permit_filters(allPermits, filters);

  return (
    <PermitListView
      slug={phoneSlug}
      breadcrumbLabel="Ingreso con teléfono celular"
      title="Ingreso con teléfono celular"
      formCode={permitType?.formCode}
      newLabel="Nuevo oficio"
      filters={filters}
      permits={permits}
      emptyText="Aún no hay oficios registrados."
      columns={[
        { header: "Fecha", render: (permit) => String(permit.fields.date) },
        { header: "Contratista", render: (permit) => String(permit.fields.contractorName) },
        { header: "Compañía", render: (permit) => String(permit.fields.company) },
      ]}
    />
  );
}
