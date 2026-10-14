import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminForm } from "@/components/administracion/AdminForm";
import {
  cardClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
  tableClass,
  tdClass,
  thClass,
} from "@/components/administracion/estilos";
import { DocumentPanel, type DocumentHistory } from "@/components/contratistas/DocumentPanel";
import { SemaphoreBadge } from "@/components/contratistas/SemaphoreBadge";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { DisclosureCard } from "@/components/ui/DisclosureCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { workTypes } from "@/config/documentos_contratista";
import type { ProviderStatus, Semaphore } from "@/domain/contratistas";
import { add_provider_employee_action, import_provider_employees_action } from "@/lib/contratistas/acciones";
import { can_manage_provider, can_register_employees, require_provider_access } from "@/lib/auth/guardas";
import { get_repositories } from "@/lib/data/proveedor_datos";

interface ProviderStaffPageProps {
  params: Promise<{ providerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const semaphoreFilters: Semaphore[] = ["VERDE", "AMARILLO", "ROJO"];

const providerStatusStyle: Record<ProviderStatus, { label: string; className: string }> = {
  ACTIVO: { label: "Empresa activa", className: "bg-green-50 text-green-900 ring-brand-green" },
  PENDIENTE_VALIDACION: { label: "Pendiente de validación", className: "bg-yellow-50 text-yellow-900 ring-yellow-400" },
  SUSPENDIDO: { label: "Suspendida", className: "bg-red-50 text-red-800 ring-red-300" },
};

const summaryStyle: Record<"TODOS" | Semaphore, { label: string; accent: string }> = {
  TODOS: { label: "Todos", accent: "border-t-brand-navy" },
  VERDE: { label: "Verde", accent: "border-t-brand-green" },
  AMARILLO: { label: "Amarillo", accent: "border-t-yellow-400" },
  ROJO: { label: "Rojo", accent: "border-t-red-600" },
};

function read_param(params: Record<string, string | string[] | undefined>, name: string): string {
  const value = params[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default async function ProviderStaffPage({ params, searchParams }: ProviderStaffPageProps) {
  const { providerId: rawProviderId } = await params;
  const providerId = Number(rawProviderId);
  if (!Number.isSafeInteger(providerId)) notFound();
  const session = await require_provider_access(providerId);

  const query = await searchParams;
  const search = read_param(query, "q");
  const rawFilter = read_param(query, "semaforo");
  const semaphoreFilter = semaphoreFilters.find((item) => item === rawFilter) ?? null;

  const repositories = get_repositories();
  const provider = await repositories.providers.get_provider(providerId);
  if (!provider) notFound();

  const [allStaff, semaphores, hiddenEmployeeIds] = await Promise.all([
    repositories.providerEmployees.list_employees(providerId),
    repositories.providerEmployees.list_semaphores(providerId),
    repositories.providerUsers.list_employee_ids_with_inactive_account(providerId),
  ]);
  // Quien tiene su cuenta eliminada (inactiva) deja de aparecer en el listado de personal.
  const hiddenIds = new Set(hiddenEmployeeIds);
  const staff = allStaff.filter((member) => !hiddenIds.has(member.id));
  const semaphoreByEmployee = new Map(
    semaphores.flatMap((item) => (item.subject.kind === "EMPLEADO_PROVEEDOR" ? [[item.subject.providerEmployeeId, item] as const] : [])),
  );
  const canManage = can_manage_provider(session, providerId);
  // Alta de colaboradores (y de sus cuentas): solo Administrador HSEA y administrador del proveedor.
  const canRegister = can_register_employees(session, providerId);

  // Documentos de la empresa (p. ej. comprobante de pago del IMSS): los sube el proveedor y cuentan para todo su personal.
  const providerSubject = { kind: "PROVEEDOR", providerId } as const;
  const providerRequirements = await repositories.documents.list_requirements(providerSubject);
  const providerHistory: Record<string, DocumentHistory> = {};
  await Promise.all(
    providerRequirements.flatMap((requirement) =>
      requirement.documentId
        ? [
            (async () => {
              const documentId = requirement.documentId as string;
              const [versions, reviews] = await Promise.all([
                repositories.documents.list_versions(documentId),
                repositories.documents.list_reviews(documentId),
              ]);
              providerHistory[documentId] = { versions, reviews };
            })(),
          ]
        : [],
    ),
  );
  const providerApproved = providerRequirements.filter((item) => item.status === "APROBADO").length;
  const providerAllApproved = providerRequirements.length > 0 && providerApproved === providerRequirements.length;

  // Filas con su nombre, semáforo y pendientes; los conteos salen de todo el personal, el listado respeta el filtro.
  const rows = staff.map((member) => {
    const state = semaphoreByEmployee.get(member.id);
    return {
      member,
      name: [member.firstName, member.middleName, member.paternalSurname, member.maternalSurname].filter(Boolean).join(" "),
      semaphore: state?.semaphore ?? null,
      pending: member.active ? (state?.requirements.filter((item) => item.status !== "APROBADO").length ?? 0) : null,
    };
  });
  const counts: Record<"TODOS" | Semaphore, number> = {
    TODOS: rows.length,
    VERDE: rows.filter((row) => row.semaphore === "VERDE").length,
    AMARILLO: rows.filter((row) => row.semaphore === "AMARILLO").length,
    ROJO: rows.filter((row) => row.semaphore === "ROJO").length,
  };
  const term = normalize(search);
  const visibleRows = rows.filter(
    (row) =>
      (semaphoreFilter === null || row.semaphore === semaphoreFilter) &&
      (term === "" || normalize(`${row.name} ${row.member.jobTitle}`).includes(term)),
  );

  const basePath = `/contratistas/${providerId}/personal`;
  function build_href(filter: Semaphore | null): string {
    const urlParams = new URLSearchParams();
    if (filter) urlParams.set("semaforo", filter);
    if (search) urlParams.set("q", search);
    const text = urlParams.toString();
    return text ? `${basePath}?${text}` : basePath;
  }

  const statusStyle = providerStatusStyle[provider.status];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          ...(session.kind === "EMPLEADO" ? [{ label: "Control de contratistas", href: "/contratistas" }] : []),
          { label: provider.name },
          { label: "Personal" },
        ]}
      />
      <PageHeader
        title="Personal"
        subtitle={provider.name}
        eyebrow={
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${statusStyle.className}`}>
            {statusStyle.label}
          </span>
        }
        actions={
          <Link href={`/contratistas/${providerId}/equipos`} className={secondaryButtonClass}>
            Equipos motorizados
          </Link>
        }
      />

      {provider.status !== "ACTIVO" && (
        <p role="alert" className="mb-6 rounded-xl border border-yellow-500 bg-yellow-50 px-4 py-3 text-sm">
          {provider.status === "PENDIENTE_VALIDACION"
            ? "La empresa aún no ha sido validada por HSEA: todo su personal permanece en semáforo rojo hasta entonces."
            : "La empresa está suspendida."}
        </p>
      )}

      <DisclosureCard
        title="Documentación del proveedor"
        description="La sube la empresa (persona moral); si falta, está rechazada o vencida, todo el personal queda en rojo."
        defaultOpen={!providerAllApproved}
        badge={
          providerRequirements.length > 0 ? (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${
                providerAllApproved ? "bg-green-50 text-green-900 ring-brand-green" : "bg-yellow-50 text-yellow-900 ring-yellow-400"
              }`}
            >
              {providerApproved} de {providerRequirements.length} aprobado{providerRequirements.length === 1 ? "" : "s"}
            </span>
          ) : undefined
        }
      >
        <DocumentPanel
          subject={providerSubject}
          requirements={providerRequirements}
          history={providerHistory}
          canUpload={canManage}
          canDeleteFile={canManage}
          canRevoke={session.kind === "EMPLEADO" && canManage}
          reviewerPermissions={session.kind === "EMPLEADO" ? session.permissions : []}
          returnPath={basePath}
        />
      </DisclosureCard>

      <section aria-labelledby="titulo-personal" className="mb-6">
        <h2 id="titulo-personal" className="sr-only">
          Listado de personal
        </h2>

        <ul className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(["TODOS", ...semaphoreFilters] as const).map((key) => {
            const filter = key === "TODOS" ? null : key;
            const active = semaphoreFilter === filter;
            return (
              <li key={key}>
                <Link
                  href={build_href(filter)}
                  aria-current={active ? "true" : undefined}
                  className={`block rounded-xl border border-t-4 bg-white p-4 shadow-sm transition hover:shadow-md ${summaryStyle[key].accent} ${
                    active ? "border-brand-navy ring-2 ring-brand-navy" : "border-neutral-light"
                  }`}
                >
                  <span className="block text-3xl font-bold text-brand-navy">{counts[key]}</span>
                  <span className="text-sm text-neutral-dark">{summaryStyle[key].label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <form method="get" action={basePath} className="mb-4 flex flex-wrap items-end gap-3">
          {semaphoreFilter && <input type="hidden" name="semaforo" value={semaphoreFilter} />}
          <div className="min-w-64 flex-1">
            <label htmlFor="buscar" className={labelClass}>Buscar colaborador</label>
            <input id="buscar" name="q" type="search" defaultValue={search} placeholder="Nombre o puesto" className={inputClass} />
          </div>
          <button type="submit" className={secondaryButtonClass}>Buscar</button>
          {(search || semaphoreFilter) && (
            <Link href={basePath} className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-brand-navy underline sm:min-h-10">
              Quitar filtros
            </Link>
          )}
        </form>

        {visibleRows.length === 0 ? (
          <p className={`${cardClass} text-sm text-neutral-dark`}>
            {staff.length === 0 ? "Aún no hay colaboradores registrados." : "Ningún colaborador coincide con el filtro."}
          </p>
        ) : (
          <>
            {/* Celulares: una tarjeta por colaborador. */}
            <ul className="space-y-3 md:hidden">
              {visibleRows.map(({ member, name, semaphore, pending }) => (
                <li key={member.id} className="rounded-xl border border-neutral-light bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold">{name}</p>
                      <p className="text-sm text-neutral-dark">{member.jobTitle}</p>
                    </div>
                    <SemaphoreBadge semaphore={semaphore} />
                  </div>
                  <p className="mb-3 text-xs text-neutral-dark">
                    {pending === null ? "Dado de baja" : pending === 0 ? "Documentación al corriente" : `${pending} pendiente${pending === 1 ? "" : "s"}`}
                    {member.workTypes.length > 0 && ` · ${member.workTypes.map((code) => workTypes.find((type) => type.code === code)?.label ?? code).join(", ")}`}
                  </p>
                  <Link href={`${basePath}/${member.id}/documentos`} className={`${secondaryButtonClass} w-full`}>
                    Abrir ficha
                  </Link>
                </li>
              ))}
            </ul>

            {/* Pantallas medianas y grandes: tabla. */}
            <div className="hidden overflow-x-auto rounded-xl border border-neutral-light bg-white shadow-sm md:block">
              <table className={tableClass}>
                <caption className="sr-only">Personal del proveedor con su semáforo y documentos pendientes</caption>
                <thead>
                  <tr>
                    <th scope="col" className={thClass}>Colaborador</th>
                    <th scope="col" className={thClass}>Trabajos específicos</th>
                    <th scope="col" className={thClass}>Semáforo</th>
                    <th scope="col" className={thClass}>Documentos</th>
                    <th scope="col" className={thClass}><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(({ member, name, semaphore, pending }) => (
                    <tr key={member.id} className="hover:bg-neutral-light/10">
                      <td className={tdClass}>
                        <span className="font-bold">{name}</span>
                        {!member.active && <span className="ml-2 text-xs text-red-700">(baja)</span>}
                        <span className="block text-xs text-neutral-dark">{member.jobTitle}</span>
                      </td>
                      <td className={tdClass}>
                        {member.workTypes.length === 0 ? (
                          <span className="text-neutral-dark">—</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {member.workTypes.map((code) => (
                              <span key={code} className="rounded-full bg-neutral-light/40 px-2 py-0.5 text-xs">
                                {workTypes.find((type) => type.code === code)?.label ?? code}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className={tdClass}><SemaphoreBadge semaphore={semaphore} /></td>
                      <td className={tdClass}>
                        {pending === null ? (
                          "—"
                        ) : pending === 0 ? (
                          <span className="text-brand-green font-bold">Al corriente</span>
                        ) : (
                          <span>{pending} pendiente{pending === 1 ? "" : "s"}</span>
                        )}
                      </td>
                      <td className={`${tdClass} text-right`}>
                        <Link href={`${basePath}/${member.id}/documentos`} className={secondaryButtonClass}>
                          Abrir ficha
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {canRegister && (
        <>
          <DisclosureCard
            title="Agregar colaborador"
            description="Al darlo de alta se genera su usuario y contraseña temporal."
          >
            <AdminForm action={add_provider_employee_action} submitLabel="Agregar colaborador" className="space-y-5">
              <input type="hidden" name="providerId" value={providerId} />
              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="mb-2 text-sm font-bold uppercase tracking-wide text-neutral-dark">Datos personales</legend>
                <div>
                  <label htmlFor="firstName" className={labelClass}>Nombre</label>
                  <input id="firstName" name="firstName" required className={inputClass} />
                </div>
                <div>
                  <label htmlFor="middleName" className={labelClass}>Segundo nombre (opcional)</label>
                  <input id="middleName" name="middleName" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="paternalSurname" className={labelClass}>Apellido paterno</label>
                  <input id="paternalSurname" name="paternalSurname" required className={inputClass} />
                </div>
                <div>
                  <label htmlFor="maternalSurname" className={labelClass}>Apellido materno (opcional)</label>
                  <input id="maternalSurname" name="maternalSurname" className={inputClass} />
                </div>
              </fieldset>
              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="mb-2 text-sm font-bold uppercase tracking-wide text-neutral-dark">Identificación</legend>
                <div>
                  <label htmlFor="curp" className={labelClass}>CURP</label>
                  <input id="curp" name="curp" required maxLength={18} className={`${inputClass} uppercase`} />
                </div>
                <div>
                  <label htmlFor="nss" className={labelClass}>NSS (11 dígitos)</label>
                  <input id="nss" name="nss" required inputMode="numeric" maxLength={11} className={inputClass} />
                </div>
              </fieldset>
              <fieldset className="space-y-3">
                <legend className="mb-2 text-sm font-bold uppercase tracking-wide text-neutral-dark">Puesto y trabajos</legend>
                <div>
                  <label htmlFor="jobTitle" className={labelClass}>Puesto</label>
                  <input id="jobTitle" name="jobTitle" required className={inputClass} />
                </div>
                <div>
                  <p className={labelClass}>Trabajos específicos que realizará (cada uno exige su DC-3)</p>
                  <div className="flex flex-wrap gap-3 text-sm">
                    {workTypes.map((type) => (
                      <label key={type.code} className="flex min-h-11 items-center gap-2 rounded-lg border border-neutral-light px-3 sm:min-h-10">
                        <input type="checkbox" name="workTypes" value={type.code} />
                        {type.label}
                      </label>
                    ))}
                  </div>
                </div>
              </fieldset>
            </AdminForm>
          </DisclosureCard>

          <DisclosureCard
            title="Cargar lista de colaboradores (CSV)"
            description="Para dar de alta a varios a la vez; cada renglón se valida por separado."
          >
            <p className="mb-3 text-sm text-neutral-dark">
              Archivo CSV (se genera desde Excel con “Guardar como → CSV”) con el encabezado:{" "}
              <code className="rounded bg-neutral-light/40 px-1">nombre, segundo_nombre, apellido_paterno, apellido_materno, curp, nss, puesto, trabajos</code>.
              La columna <code className="rounded bg-neutral-light/40 px-1">trabajos</code> es opcional (CALIENTES, ALTURAS, CONFINADOS separados por
              espacio). Los renglones correctos se agregan y de los rechazados se indica el motivo.
            </p>
            <AdminForm action={import_provider_employees_action} submitLabel="Cargar lista">
              <input type="hidden" name="providerId" value={providerId} />
              <label htmlFor="file" className={labelClass}>Archivo CSV</label>
              <input id="file" name="file" type="file" accept=".csv,text/csv" required className={inputClass} />
            </AdminForm>
          </DisclosureCard>
        </>
      )}
    </>
  );
}
