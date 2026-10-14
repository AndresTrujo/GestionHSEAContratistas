import Link from "next/link";
import { AdminForm } from "@/components/administracion/AdminForm";
import { inputClass } from "@/components/administracion/estilos";
import { ProveedoresAccionDetalle } from "@/components/administracion/ProveedoresAccionDetalle";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import { find_contractor_type } from "@/config/tipos_contratista";
import type { ProviderStatus } from "@/domain/contratistas";
import { set_provider_status_action } from "@/lib/administracion/acciones";
import { format_date } from "@/lib/administracion/etiquetas";
import { require_employee_permission } from "@/lib/auth/guardas";
import { get_repositories } from "@/lib/data/proveedor_datos";

interface ProvidersPageProps {
  searchParams: Promise<{ estado?: string }>;
}

const statusLabels: Record<ProviderStatus, string> = {
  PENDIENTE_VALIDACION: "Pendiente de validación",
  ACTIVO: "Activo",
  SUSPENDIDO: "Suspendido",
};

const statusTones: Record<ProviderStatus, BadgeTone> = {
  PENDIENTE_VALIDACION: "warning",
  ACTIVO: "success",
  SUSPENDIDO: "danger",
};

const statusFilters: { value: ProviderStatus | ""; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "PENDIENTE_VALIDACION", label: "Pendientes" },
  { value: "ACTIVO", label: "Activos" },
  { value: "SUSPENDIDO", label: "Suspendidos" },
];

export default async function ProvidersAdministrationPage({ searchParams }: ProvidersPageProps) {
  await require_employee_permission("contratistas:gestionar");
  const { estado = "" } = await searchParams;
  const filter = statusFilters.find((item) => item.value === estado)?.value || undefined;
  const providers = await get_repositories().providers.list_providers(filter ? { status: filter } : undefined);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Administración", href: "/administracion" },
          { label: "Proveedores" },
        ]}
      />
      <PageHeader
        title="Proveedores"
        subtitle="Un proveedor que se registra queda pendiente hasta que lo apruebes. Mientras no esté activo, todo su personal permanece en semáforo rojo."
      />

      <nav aria-label="Filtrar por estatus" className="mb-4 flex flex-wrap gap-2 text-sm">
        {statusFilters.map((item) => {
          const selected = (filter ?? "") === item.value;
          return (
            <Link
              key={item.value || "todos"}
              href={item.value ? `/administracion/proveedores?estado=${item.value}` : "/administracion/proveedores"}
              aria-current={selected ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 py-2 font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy motion-reduce:transition-none sm:min-h-10 ${
                selected
                  ? "border-brand-navy bg-brand-navy text-white"
                  : "border-neutral-dark/50 text-brand-navy hover:bg-neutral-light/40"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {providers.length === 0 ? (
        <section className="mb-6 rounded-xl border border-neutral-light bg-white p-5 shadow-sm">
          <p className="text-sm text-neutral-dark">No hay proveedores con ese filtro.</p>
        </section>
      ) : (
        <ul className="mb-6 space-y-3">
          {providers.map((provider) => (
            <li key={provider.id} className="rounded-xl border border-neutral-light bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/administracion/proveedores/${provider.id}`}
                    className="inline-flex min-h-11 items-center break-words text-lg font-bold text-brand-navy underline underline-offset-2 hover:text-brand-cyan focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy sm:min-h-10"
                  >
                    {provider.name}
                  </Link>
                  <p className="break-words text-sm text-neutral-dark">
                    {provider.taxId} · {provider.contactEmail} · registrado {format_date(provider.createdAt)}
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="font-bold text-brand-navy">Giro: </span>
                    {provider.contractorTypes.map((code) => find_contractor_type(code)?.label ?? code).join(", ")}
                  </p>
                </div>
                <StatusBadge tone={statusTones[provider.status]}>{statusLabels[provider.status]}</StatusBadge>
              </div>

              <div className="flex flex-wrap items-start gap-3">
                  {(provider.status === "SUSPENDIDO" || provider.status === "PENDIENTE_VALIDACION") && (
                    <AdminForm
                      action={set_provider_status_action}
                      submitLabel={provider.status === "PENDIENTE_VALIDACION" ? "Aprobar" : "Reactivar"}
                    >
                      <input type="hidden" name="providerId" value={provider.id} />
                      <input type="hidden" name="status" value="ACTIVO" />
                    </AdminForm>
                  )}
                  {provider.status !== "SUSPENDIDO" && (
                    <div className="mt-3 min-w-0">
                      <ProveedoresAccionDetalle label="Suspender" tone="danger">
                        <AdminForm action={set_provider_status_action} submitLabel="Suspender" variant="danger">
                          <input type="hidden" name="providerId" value={provider.id} />
                          <input type="hidden" name="status" value="SUSPENDIDO" />
                          <label htmlFor={`reason-${provider.id}`} className="mb-1 block text-sm font-bold text-brand-navy">
                            Motivo
                          </label>
                          <input
                            id={`reason-${provider.id}`}
                            name="reason"
                            placeholder="Motivo (obligatorio)"
                            required
                            className={inputClass}
                          />
                        </AdminForm>
                      </ProveedoresAccionDetalle>
                    </div>
                  )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
