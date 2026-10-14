import Link from "next/link";
import { AdminForm } from "@/components/administracion/AdminForm";
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
import { SemaphoreBadge } from "@/components/contratistas/SemaphoreBadge";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { DisclosureCard } from "@/components/ui/DisclosureCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { register_entry_action, register_manual_exit_action } from "@/lib/contratistas/acciones";
import { format_duration } from "@/lib/contratistas/horas";
import { require_employee_permission } from "@/lib/auth/guardas";
import { get_today_mx } from "@/lib/data/identidad";
import { get_repositories } from "@/lib/data/proveedor_datos";

interface EntriesPageProps {
  searchParams: Promise<{ proveedor?: string }>;
}

function format_time(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default async function EntriesPage({ searchParams }: EntriesPageProps) {
  await require_employee_permission("contratistas:registrar_ingresos");
  const { proveedor } = await searchParams;
  const providerId = Number(proveedor);
  const repositories = get_repositories();
  const today = get_today_mx();

  const allProviders = await repositories.providers.list_providers();
  const providers = allProviders.filter((provider) => provider.status === "ACTIVO");
  const provider = Number.isSafeInteger(providerId) ? providers.find((item) => item.id === providerId) : undefined;
  const providerNames = new Map(allProviders.map((item) => [item.id, item.name]));

  const [allStaff, semaphores, openEntries, todayEntries, hiddenEmployeeIds] = await Promise.all([
    provider ? repositories.providerEmployees.list_employees(provider.id) : Promise.resolve([]),
    provider ? repositories.providerEmployees.list_semaphores(provider.id) : Promise.resolve([]),
    repositories.entries.list_open_entries(),
    repositories.entries.list_history({ from: today, to: today }),
    provider ? repositories.providerUsers.list_employee_ids_with_inactive_account(provider.id) : Promise.resolve([]),
  ]);
  // Quien tiene su cuenta eliminada (inactiva) no aparece, igual que en el listado de personal.
  const hiddenIds = new Set(hiddenEmployeeIds);
  const staff = allStaff.filter((member) => !hiddenIds.has(member.id));
  const semaphoreByEmployee = new Map(
    semaphores.flatMap((item) => (item.subject.kind === "EMPLEADO_PROVEEDOR" ? [[item.subject.providerEmployeeId, item.semaphore] as const] : [])),
  );
  const openByEmployee = new Set(openEntries.map((entry) => entry.providerEmployeeId));

  // Nombre y empresa de quienes están dentro de planta (consultas en paralelo).
  const insideEntries = await Promise.all(
    openEntries.map(async (entry) => {
      const employee = await repositories.providerEmployees.get_employee(entry.providerEmployeeId);
      return {
        entry,
        name: employee
          ? [employee.firstName, employee.middleName, employee.paternalSurname, employee.maternalSurname].filter(Boolean).join(" ")
          : `Colaborador ${entry.providerEmployeeId}`,
        company: employee ? (providerNames.get(employee.providerId) ?? "—") : "—",
      };
    }),
  );
  insideEntries.sort((first, second) => second.entry.enteredAt.localeCompare(first.entry.enteredAt));

  const allowedToday = todayEntries.filter((entry) => entry.result === "PERMITIDO").length;
  const deniedToday = todayEntries.filter((entry) => entry.result === "DENEGADO").length;
  const nowMs = new Date().getTime();

  const summary = [
    { label: "Dentro de planta ahora", value: openEntries.length, accent: "border-t-brand-navy" },
    { label: "Ingresos permitidos hoy", value: allowedToday, accent: "border-t-brand-green" },
    { label: "Intentos denegados hoy", value: deniedToday, accent: "border-t-red-600" },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Control de contratistas", href: "/contratistas" },
          { label: "Ingresos a planta" },
        ]}
      />
      <PageHeader
        title="Ingresos a planta"
        subtitle="Entrada y salida con el QR del colaborador; solo pasa quien está en semáforo verde y con EPP completo."
        actions={
          <>
            <Link href="/contratistas/ingresos/escanear" className={primaryButtonClass}>
              Escanear QR
            </Link>
            <Link href="/contratistas/ingresos/historial" className={secondaryButtonClass}>
              Historial y horas
            </Link>
          </>
        }
      />

      <ul className="mb-6 grid gap-3 sm:grid-cols-3">
        {summary.map((item) => (
          <li key={item.label} className={`rounded-xl border border-t-4 border-neutral-light bg-white p-4 shadow-sm ${item.accent}`}>
            <span className="block text-3xl font-bold text-brand-navy">{item.value}</span>
            <span className="text-sm text-neutral-dark">{item.label}</span>
          </li>
        ))}
      </ul>

      <section className={cardClass} aria-labelledby="titulo-dentro">
        <h2 id="titulo-dentro" className="mb-1 text-2xl uppercase">Dentro de planta ahora</h2>
        <p className="mb-4 text-sm text-neutral-dark">La salida se registra escaneando el QR del propio colaborador; si no se puede, hay salida manual con motivo.</p>
        {insideEntries.length === 0 ? (
          <p className="rounded-lg bg-neutral-light/20 px-4 py-6 text-center text-sm text-neutral-dark">Nadie registrado dentro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <caption className="sr-only">Colaboradores que están dentro de la planta</caption>
              <thead>
                <tr>
                  <th scope="col" className={thClass}>Colaborador</th>
                  <th scope="col" className={thClass}>Entró</th>
                  <th scope="col" className={thClass}>Tiempo dentro</th>
                  <th scope="col" className={thClass}><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {insideEntries.map(({ entry, name, company }) => (
                  <tr key={entry.id} className="hover:bg-neutral-light/10">
                    <td className={tdClass}>
                      <span className="font-bold">{name}</span>
                      <span className="block text-xs text-neutral-dark">{company}</span>
                    </td>
                    <td className={tdClass}>{format_time(entry.enteredAt)}</td>
                    <td className={tdClass}>{format_duration(Math.max(0, nowMs - new Date(entry.enteredAt).getTime()))}</td>
                    <td className={`${tdClass} text-right`}>
                      <Link href={`/contratistas/ingresos/escanear?salida=${entry.id}`} className={secondaryButtonClass}>
                        Registrar salida (QR)
                      </Link>
                      <details className="mt-2 text-left">
                        <summary className="cursor-pointer text-right text-xs font-bold text-neutral-dark underline">
                          Salida manual (sin QR)
                        </summary>
                        <AdminForm action={register_manual_exit_action} submitLabel="Registrar salida manual" variant="secondary" className="mt-2 space-y-2">
                          <input type="hidden" name="entryId" value={entry.id} />
                          <p className="text-xs text-neutral-dark">Solo si no se puede usar el QR. El motivo queda en la auditoría.</p>
                          <input name="reason" placeholder="Motivo (obligatorio)" required className={inputClass} />
                        </AdminForm>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DisclosureCard
        title="Registro manual de ingreso"
        description="Respaldo por si no se puede usar el QR; mantiene las mismas reglas de semáforo y EPP."
        defaultOpen={Boolean(provider)}
      >
        <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label htmlFor="proveedor" className={labelClass}>Proveedor</label>
            <select id="proveedor" name="proveedor" defaultValue={provider?.id ?? ""} className={inputClass}>
              <option value="">Elige…</option>
              {providers.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className={secondaryButtonClass}>Ver personal</button>
        </form>

        {provider && (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <caption className="sr-only">Personal de {provider.name} para registrar ingreso</caption>
              <thead>
                <tr>
                  <th scope="col" className={thClass}>Colaborador</th>
                  <th scope="col" className={thClass}>Semáforo</th>
                  <th scope="col" className={thClass}>Registro</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => (
                  <tr key={member.id}>
                    <td className={tdClass}>
                      <span className="font-bold">{[member.firstName, member.paternalSurname, member.maternalSurname].filter(Boolean).join(" ")}</span>
                      <span className="block text-xs text-neutral-dark">{member.jobTitle}</span>
                    </td>
                    <td className={tdClass}><SemaphoreBadge semaphore={semaphoreByEmployee.get(member.id) ?? null} /></td>
                    <td className={tdClass}>
                      {openByEmployee.has(member.id) ? (
                        <span className="text-xs font-bold text-brand-green">Ya está dentro</span>
                      ) : (
                        <AdminForm action={register_entry_action} submitLabel="Registrar ingreso" variant="secondary">
                          <input type="hidden" name="providerEmployeeId" value={member.id} />
                          <label className="mb-2 flex min-h-11 items-center gap-2 text-sm sm:min-h-10">
                            <input type="checkbox" name="eppComplete" className="h-5 w-5" /> EPP completo verificado
                          </label>
                          <input name="notes" placeholder="Observaciones (opcional)" className={inputClass} />
                        </AdminForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DisclosureCard>
    </>
  );
}
