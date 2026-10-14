import { PermitListView } from "@/components/permisos/PermitListView";
import { damageClasses, stopSlug } from "@/config/observacion_stop";
import { find_permit_type } from "@/config/tipos_permiso";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { filter_permits_for_actor, require_permit_actor } from "@/lib/permisos/actor";
import { apply_permit_filters, parse_permit_filters, type PermitListPageProps } from "@/lib/permisos/busqueda";

export default async function StopObservationsPage({ searchParams }: PermitListPageProps) {
  const filters = parse_permit_filters(await searchParams);
  const permitType = find_permit_type(stopSlug);
  const actor = await require_permit_actor();
  const allPermits = filter_permits_for_actor(actor, await get_repositories().permits.list_by_type(stopSlug)).sort(
    (first, second) => second.createdAt.localeCompare(first.createdAt),
  );
  const permits = apply_permit_filters(allPermits, filters);

  return (
    <PermitListView
      slug={stopSlug}
      breadcrumbLabel="Observación preventiva STOP"
      title="Observación preventiva STOP"
      formCode={permitType?.formCode}
      newLabel="Nueva observación"
      filters={filters}
      permits={permits}
      emptyText="Aún no hay observaciones registradas."
      columns={[
        { header: "Fecha", render: (permit) => String(permit.fields.date) },
        { header: "Ubicación", render: (permit) => String(permit.fields.location) },
        { header: "Observador", render: (permit) => String(permit.fields.observerName) },
        {
          header: "Clase",
          render: (permit) => {
            const damage = damageClasses.find((item) => item.value === permit.fields.damageClass);
            return (
              damage && (
                <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${damage.className}`}>
                  {damage.value} · {damage.level}
                </span>
              )
            );
          },
        },
      ]}
    />
  );
}
