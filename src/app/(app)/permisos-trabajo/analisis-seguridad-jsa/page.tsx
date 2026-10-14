import { PermitListView } from "@/components/permisos/PermitListView";
import { get_jsa_steps, get_risk_level, jsaSlug } from "@/config/jsa";
import { find_permit_type } from "@/config/tipos_permiso";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { filter_permits_for_actor, require_permit_actor } from "@/lib/permisos/actor";
import { apply_permit_filters, parse_permit_filters, type PermitListPageProps } from "@/lib/permisos/busqueda";

export default async function JsaListPage({ searchParams }: PermitListPageProps) {
  const filters = parse_permit_filters(await searchParams);
  const permitType = find_permit_type(jsaSlug);
  const actor = await require_permit_actor();
  const allPermits = filter_permits_for_actor(actor, await get_repositories().permits.list_by_type(jsaSlug)).sort(
    (first, second) => second.createdAt.localeCompare(first.createdAt),
  );
  const permits = apply_permit_filters(allPermits, filters);

  return (
    <PermitListView
      slug={jsaSlug}
      breadcrumbLabel="Análisis de seguridad (JSA)"
      title="Análisis de seguridad en el trabajo (JSA)"
      formCode={permitType?.formCode}
      newLabel="Nuevo JSA"
      filters={filters}
      permits={permits}
      emptyText="Aún no hay análisis registrados."
      columns={[
        { header: "Fecha", render: (permit) => String(permit.fields.date) },
        { header: "Trabajo", render: (permit) => String(permit.fields.jobName) },
        { header: "Ubicación", render: (permit) => String(permit.fields.location) },
        {
          header: "Riesgo máximo",
          render: (permit) => {
            const maxRisk = Math.max(...get_jsa_steps(permit).map((step) => step.risk));
            const level = get_risk_level(maxRisk);
            return (
              <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${level.className}`}>
                {maxRisk} · {level.label}
              </span>
            );
          },
        },
      ]}
    />
  );
}
