import Link from "next/link";
import { redirect } from "next/navigation";
import {
  cardClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  tableClass,
  tdClass,
  thClass,
} from "@/components/administracion/estilos";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { find_contractor_type } from "@/config/tipos_contratista";
import type { Provider, ProviderStatus } from "@/domain/contratistas";
import { get_session } from "@/lib/auth/sesion";
import { get_repositories } from "@/lib/data/proveedor_datos";

interface ContractorsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const statusStyle: Record<ProviderStatus, { label: string; className: string }> = {
  ACTIVO: { label: "Activo", className: "bg-green-50 text-green-900 ring-brand-green" },
  PENDIENTE_VALIDACION: { label: "Pendiente de validación", className: "bg-yellow-50 text-yellow-900 ring-yellow-400" },
  SUSPENDIDO: { label: "Suspendido", className: "bg-red-50 text-red-800 ring-red-300" },
};

const statusFilters: ProviderStatus[] = ["ACTIVO", "PENDIENTE_VALIDACION", "SUSPENDIDO"];

function read_param(params: Record<string, string | string[] | undefined>, name: string): string {
  const value = params[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

interface ProviderSummary {
  provider: Provider;
  total: number;
  green: number;
  yellow: number;
  red: number;
}

/** Barra apilada verde/amarillo/rojo del personal; el texto equivalente va en el aria-label y en los números. */
function SemaphoreBar({ summary }: { summary: ProviderSummary }) {
  if (summary.total === 0) return <span className="text-xs text-neutral-dark">Sin personal</span>;
  const part = (count: number) => `${(count / summary.total) * 100}%`;
  return (
    <div className="min-w-44">
      <div
        role="img"
        aria-label={`${summary.total} colaboradores: ${summary.green} en verde, ${summary.yellow} en amarillo, ${summary.red} en rojo`}
        className="flex h-2.5 overflow-hidden rounded-full bg-neutral-light/50"
      >
        <span className="bg-brand-green" style={{ width: part(summary.green) }} />
        <span className="bg-yellow-400" style={{ width: part(summary.yellow) }} />
        <span className="bg-red-600" style={{ width: part(summary.red) }} />
      </div>
      <p className="mt-1 text-xs text-neutral-dark">
        {summary.total} · <span className="font-bold text-brand-green">{summary.green}</span> /{" "}
        <span className="font-bold text-yellow-700">{summary.yellow}</span> / <span className="font-bold text-red-700">{summary.red}</span>
      </p>
    </div>
  );
}

export default async function ContractorsPage({ searchParams }: ContractorsPageProps) {
  const session = await get_session();
  if (!session) redirect("/login");
  // Un proveedor solo ve lo suyo.
  if (session.kind === "USUARIO_PROVEEDOR") redirect(`/contratistas/${session.providerId}/personal`);

  const query = await searchParams;
  const search = read_param(query, "q");
  const statusFilter = statusFilters.find((item) => item === read_param(query, "estatus")) ?? null;

  const repositories = get_repositories();
  const canReview =
    session.permissions.includes("contratistas:revisar_documentos") || session.permissions.includes("contratistas:validar_medico");
  const canLogEntries = session.permissions.includes("contratistas:registrar_ingresos");

  const [providers, pendingReviews] = await Promise.all([
    repositories.providers.list_providers(),
    canReview ? repositories.documents.list_pending_reviews(session.employeeNumber) : Promise.resolve([]),
  ]);
  const summaries: ProviderSummary[] = await Promise.all(
    providers.map(async (provider) => {
      const [allSemaphores, hiddenEmployeeIds] = await Promise.all([
        repositories.providerEmployees.list_semaphores(provider.id),
        repositories.providerUsers.list_employee_ids_with_inactive_account(provider.id),
      ]);
      // Quien tiene su cuenta eliminada (inactiva) no cuenta, igual que en el listado de personal.
      const hiddenIds = new Set(hiddenEmployeeIds);
      const semaphores = allSemaphores.filter(
        (item) => !(item.subject.kind === "EMPLEADO_PROVEEDOR" && hiddenIds.has(item.subject.providerEmployeeId)),
      );
      return {
        provider,
        total: semaphores.length,
        green: semaphores.filter((item) => item.semaphore === "VERDE").length,
        yellow: semaphores.filter((item) => item.semaphore === "AMARILLO").length,
        red: semaphores.filter((item) => item.semaphore === "ROJO").length,
      };
    }),
  );

  const term = normalize(search);
  const visible = summaries.filter(
    ({ provider }) =>
      (statusFilter === null || provider.status === statusFilter) &&
      (term === "" || normalize(`${provider.name} ${provider.taxId}`).includes(term)),
  );
  const totals = {
    providers: summaries.length,
    people: summaries.reduce((sum, item) => sum + item.total, 0),
    green: summaries.reduce((sum, item) => sum + item.green, 0),
    yellow: summaries.reduce((sum, item) => sum + item.yellow, 0),
    red: summaries.reduce((sum, item) => sum + item.red, 0),
  };
  const cards = [
    { label: "Proveedores", value: totals.providers, accent: "border-t-brand-navy" },
    { label: "Personal en verde", value: totals.green, accent: "border-t-brand-green" },
    { label: "Personal en amarillo", value: totals.yellow, accent: "border-t-yellow-400" },
    { label: "Personal en rojo", value: totals.red, accent: "border-t-red-600" },
  ];

  return (
    <>
      <Breadcrumbs items={[{ label: "Inicio", href: "/inicio" }, { label: "Control de contratistas" }]} />
      <PageHeader
        title="Control de contratistas"
        subtitle={`${totals.providers} proveedor${totals.providers === 1 ? "" : "es"} y ${totals.people} colaborador${totals.people === 1 ? "" : "es"} activos.`}
        actions={
          <>
            {canReview && (
              <Link href="/contratistas/revision" className={primaryButtonClass}>
                Documentos por revisar
                {pendingReviews.length > 0 && (
                  <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs text-brand-green">{pendingReviews.length}</span>
                )}
              </Link>
            )}
            {canLogEntries && (
              <Link href="/contratistas/ingresos" className={secondaryButtonClass}>
                Ingresos a planta
              </Link>
            )}
          </>
        }
      />

      <ul className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((item) => (
          <li key={item.label} className={`rounded-xl border border-t-4 border-neutral-light bg-white p-4 shadow-sm ${item.accent}`}>
            <span className="block text-3xl font-bold text-brand-navy">{item.value}</span>
            <span className="text-sm text-neutral-dark">{item.label}</span>
          </li>
        ))}
      </ul>

      <section aria-labelledby="titulo-proveedores" className="mb-6">
        <h2 id="titulo-proveedores" className="sr-only">
          Proveedores
        </h2>
        <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label htmlFor="buscar" className={labelClass}>Buscar proveedor</label>
            <input id="buscar" name="q" type="search" defaultValue={search} placeholder="Razón social o RFC" className={inputClass} />
          </div>
          <div>
            <label htmlFor="estatus" className={labelClass}>Estatus</label>
            <select id="estatus" name="estatus" defaultValue={statusFilter ?? ""} className={inputClass}>
              <option value="">Todos</option>
              {statusFilters.map((status) => (
                <option key={status} value={status}>{statusStyle[status].label}</option>
              ))}
            </select>
          </div>
          <button type="submit" className={secondaryButtonClass}>Filtrar</button>
          {(search || statusFilter) && (
            <Link href="/contratistas" className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-brand-navy underline sm:min-h-10">
              Quitar filtros
            </Link>
          )}
        </form>

        {visible.length === 0 ? (
          <p className={`${cardClass} text-sm text-neutral-dark`}>
            {summaries.length === 0 ? "Aún no hay proveedores registrados." : "Ningún proveedor coincide con el filtro."}
          </p>
        ) : (
          <>
            {/* Celulares: una tarjeta por proveedor. */}
            <ul className="space-y-3 md:hidden">
              {visible.map((summary) => (
                <li key={summary.provider.id} className="rounded-xl border border-neutral-light bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold">{summary.provider.name}</p>
                      <p className="text-xs text-neutral-dark">{summary.provider.taxId}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${statusStyle[summary.provider.status].className}`}>
                      {statusStyle[summary.provider.status].label}
                    </span>
                  </div>
                  <p className="mb-3 text-xs text-neutral-dark">
                    {summary.provider.contractorTypes.map((code) => find_contractor_type(code)?.label ?? code).join(", ") || "Sin giro"}
                  </p>
                  <div className="mb-3">
                    <SemaphoreBar summary={summary} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Link href={`/contratistas/${summary.provider.id}/personal`} className={secondaryButtonClass}>Personal</Link>
                    <Link href={`/contratistas/${summary.provider.id}/equipos`} className={secondaryButtonClass}>Equipos</Link>
                  </div>
                </li>
              ))}
            </ul>

            {/* Pantallas medianas y grandes: tabla. */}
            <div className="hidden overflow-x-auto rounded-xl border border-neutral-light bg-white shadow-sm md:block">
              <table className={tableClass}>
                <caption className="sr-only">Proveedores con su estatus y el semáforo de su personal</caption>
                <thead>
                  <tr>
                    <th scope="col" className={thClass}>Proveedor</th>
                    <th scope="col" className={thClass}>Giro</th>
                    <th scope="col" className={thClass}>Estatus</th>
                    <th scope="col" className={thClass}>Personal (total · verde / amarillo / rojo)</th>
                    <th scope="col" className={thClass}><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((summary) => (
                    <tr key={summary.provider.id} className="hover:bg-neutral-light/10">
                      <td className={tdClass}>
                        <span className="font-bold">{summary.provider.name}</span>
                        <span className="block text-xs text-neutral-dark">{summary.provider.taxId}</span>
                      </td>
                      <td className={tdClass}>
                        {summary.provider.contractorTypes.length === 0 ? (
                          <span className="text-neutral-dark">—</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {summary.provider.contractorTypes.map((code) => (
                              <span key={code} className="rounded-full bg-neutral-light/40 px-2 py-0.5 text-xs">
                                {find_contractor_type(code)?.label ?? code}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className={tdClass}>
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${statusStyle[summary.provider.status].className}`}>
                          {statusStyle[summary.provider.status].label}
                        </span>
                      </td>
                      <td className={tdClass}><SemaphoreBar summary={summary} /></td>
                      <td className={`${tdClass} whitespace-nowrap text-right`}>
                        <span className="inline-flex gap-2">
                          <Link href={`/contratistas/${summary.provider.id}/personal`} className={secondaryButtonClass}>Personal</Link>
                          <Link href={`/contratistas/${summary.provider.id}/equipos`} className={secondaryButtonClass}>Equipos</Link>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}
