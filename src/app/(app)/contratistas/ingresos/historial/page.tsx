import Link from "next/link";
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
import { PageHeader } from "@/components/ui/PageHeader";
import { require_employee_permission } from "@/lib/auth/guardas";
import { format_decimal_hours, format_duration, get_worked_ms, summarize_hours, type HoursPeriod } from "@/lib/contratistas/horas";
import { get_repositories } from "@/lib/data/proveedor_datos";

interface HistoryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Tope de registros leídos; el acumulado se calcula sobre todos ellos. */
const maxEntries = 5000;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function read_param(params: Record<string, string | string[] | undefined>, name: string): string {
  const value = params[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function format_time(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default async function EntryHistoryPage({ searchParams }: HistoryPageProps) {
  await require_employee_permission("contratistas:registrar_ingresos");
  const params = await searchParams;
  const providerParam = Number(read_param(params, "proveedor"));
  const from = isoDatePattern.test(read_param(params, "desde")) ? read_param(params, "desde") : "";
  const to = isoDatePattern.test(read_param(params, "hasta")) ? read_param(params, "hasta") : "";
  const period: HoursPeriod = read_param(params, "periodo") === "mes" ? "mes" : "semana";

  const repositories = get_repositories();
  const providers = await repositories.providers.list_providers();
  const providerId = Number.isSafeInteger(providerParam) && providerParam > 0 ? providerParam : undefined;

  const entries = await repositories.entries.list_history({
    providerId,
    from: from || undefined,
    to: to || undefined,
    limit: maxEntries,
  });

  // Colaborador (nombre y empresa) de cada registro, consultados en paralelo.
  const providerNames = new Map(providers.map((provider) => [provider.id, provider.name]));
  const employeeIds = [...new Set(entries.map((entry) => entry.providerEmployeeId))];
  const employeeEntries = await Promise.all(
    employeeIds.map(async (employeeId) => {
      const employee = await repositories.providerEmployees.get_employee(employeeId);
      return [
        employeeId,
        {
          name: employee
            ? [employee.firstName, employee.middleName, employee.paternalSurname, employee.maternalSurname].filter(Boolean).join(" ")
            : `Colaborador ${employeeId}`,
          company: employee ? (providerNames.get(employee.providerId) ?? `Proveedor ${employee.providerId}`) : "—",
        },
      ] as const;
    }),
  );
  const employeeInfo = new Map<number, { name: string; company: string }>(employeeEntries);
  const get_name = (employeeId: number) => employeeInfo.get(employeeId)?.name ?? "";

  // Horas acumuladas por periodo (del más reciente al más antiguo) y, dentro de cada uno, por colaborador.
  const summaries = summarize_hours(entries, period);
  const periods = [...new Map(summaries.map((item) => [item.periodKey, item.periodLabel])).entries()].sort((first, second) =>
    second[0].localeCompare(first[0]),
  );
  const totalMs = summaries.reduce((sum, item) => sum + item.totalMs, 0);

  // Registros agrupados por colaborador (alfabético) y, dentro de cada uno, del más reciente al más antiguo.
  const byEmployee = new Map<number, typeof entries>();
  for (const entry of entries) byEmployee.set(entry.providerEmployeeId, [...(byEmployee.get(entry.providerEmployeeId) ?? []), entry]);
  const groups = [...byEmployee.entries()]
    .map(([employeeId, items]) => ({
      employeeId,
      info: employeeInfo.get(employeeId),
      items,
      workedMs: items.reduce((sum, entry) => sum + (get_worked_ms(entry) ?? 0), 0),
    }))
    .sort((first, second) => (first.info?.name ?? "").localeCompare(second.info?.name ?? "", "es"));

  function build_href(nextPeriod: HoursPeriod): string {
    const urlParams = new URLSearchParams();
    if (providerId) urlParams.set("proveedor", String(providerId));
    if (from) urlParams.set("desde", from);
    if (to) urlParams.set("hasta", to);
    urlParams.set("periodo", nextPeriod);
    return `/contratistas/ingresos/historial?${urlParams.toString()}`;
  }

  const summary = [
    { label: "Registros", value: String(entries.length), accent: "border-t-brand-navy" },
    { label: "Colaboradores", value: String(employeeIds.length), accent: "border-t-brand-cyan" },
    { label: "Horas en planta", value: format_duration(totalMs), accent: "border-t-brand-green" },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Control de contratistas", href: "/contratistas" },
          { label: "Ingresos a planta", href: "/contratistas/ingresos" },
          { label: "Historial y horas" },
        ]}
      />
      <PageHeader
        title="Historial y horas"
        subtitle="Entradas y salidas de la bitácora, con las horas que cada colaborador pasó en planta (hora de Ciudad de México)."
        actions={
          <Link href="/contratistas/ingresos/escanear" className={primaryButtonClass}>
            Escanear QR
          </Link>
        }
      />

      <section className={cardClass} aria-label="Filtros">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="periodo" value={period} />
          <div>
            <label htmlFor="proveedor" className={labelClass}>Proveedor</label>
            <select id="proveedor" name="proveedor" defaultValue={providerId ?? ""} className={inputClass}>
              <option value="">Todos</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="desde" className={labelClass}>Desde</label>
            <input id="desde" name="desde" type="date" defaultValue={from} className={inputClass} />
          </div>
          <div>
            <label htmlFor="hasta" className={labelClass}>Hasta</label>
            <input id="hasta" name="hasta" type="date" defaultValue={to} className={inputClass} />
          </div>
          <div className="flex items-end gap-3">
            <button type="submit" className={secondaryButtonClass}>Filtrar</button>
            {(providerId || from || to) && (
              <Link href={`/contratistas/ingresos/historial?periodo=${period}`} className="inline-flex min-h-11 items-center text-sm font-bold text-brand-navy underline sm:min-h-10">
                Quitar filtros
              </Link>
            )}
          </div>
        </form>
      </section>

      <ul className="mb-6 grid gap-3 sm:grid-cols-3">
        {summary.map((item) => (
          <li key={item.label} className={`rounded-xl border border-t-4 border-neutral-light bg-white p-4 shadow-sm ${item.accent}`}>
            <span className="block text-3xl font-bold text-brand-navy">{item.value}</span>
            <span className="text-sm text-neutral-dark">{item.label}</span>
          </li>
        ))}
      </ul>

      <section className={cardClass} aria-labelledby="titulo-horas">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="titulo-horas" className="text-2xl uppercase">Horas acumuladas</h2>
            <p className="text-sm text-neutral-dark">
              Suma de las horas entre cada entrada y su salida, por colaborador. Los ingresos que siguen dentro de planta o que fueron
              denegados no suman. Cuenta por la fecha de entrada.
            </p>
          </div>
          <nav aria-label="Periodo del acumulado" className="flex gap-1 rounded-lg bg-neutral-light/40 p-1">
            {(["semana", "mes"] as const).map((option) => (
              <Link
                key={option}
                href={build_href(option)}
                aria-current={period === option ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-md px-4 text-sm font-bold transition sm:min-h-9 ${
                  period === option ? "bg-white text-brand-navy shadow-sm" : "text-neutral-dark hover:text-brand-navy"
                }`}
              >
                {option === "semana" ? "Semanal" : "Mensual"}
              </Link>
            ))}
          </nav>
        </div>

        {periods.length === 0 ? (
          <p className="rounded-lg bg-neutral-light/20 px-4 py-6 text-center text-sm text-neutral-dark">
            Aún no hay salidas registradas con ese filtro.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <caption className="sr-only">Horas en planta por colaborador, agrupadas por {period === "semana" ? "semana" : "mes"}</caption>
              <thead>
                <tr>
                  <th scope="col" className={thClass}>Colaborador</th>
                  <th scope="col" className={thClass}>Empresa</th>
                  <th scope="col" className={`${thClass} text-right`}>Ingresos</th>
                  <th scope="col" className={`${thClass} text-right`}>Horas</th>
                </tr>
              </thead>
              {periods.map(([periodKey, periodLabel]) => {
                const rows = summaries
                  .filter((item) => item.periodKey === periodKey)
                  .sort((first, second) => get_name(first.employeeId).localeCompare(get_name(second.employeeId), "es"));
                const periodMs = rows.reduce((sum, item) => sum + item.totalMs, 0);
                return (
                  <tbody key={periodKey}>
                    <tr>
                      <th scope="colgroup" colSpan={3} className="bg-neutral-light/30 px-3 py-2 text-left font-bold capitalize">
                        {periodLabel}
                      </th>
                      <td className="bg-neutral-light/30 px-3 py-2 text-right font-bold">{format_duration(periodMs)}</td>
                    </tr>
                    {rows.map((item) => (
                      <tr key={`${periodKey}-${item.employeeId}`} className="hover:bg-neutral-light/10">
                        <td className={tdClass}>{get_name(item.employeeId)}</td>
                        <td className={tdClass}>{employeeInfo.get(item.employeeId)?.company}</td>
                        <td className={`${tdClass} text-right`}>{item.sessions}</td>
                        <td className={`${tdClass} text-right`}>
                          <span className="font-bold">{format_duration(item.totalMs)}</span>
                          <span className="block text-xs text-neutral-dark">{format_decimal_hours(item.totalMs)} h</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                );
              })}
            </table>
          </div>
        )}
      </section>

      <section className={cardClass} aria-labelledby="titulo-registros">
        <h2 id="titulo-registros" className="mb-1 text-2xl uppercase">Registros por colaborador</h2>
        <p className="mb-4 text-sm text-neutral-dark">
          Todos los registros, incluidos los intentos denegados, del más reciente al más antiguo. Se leen hasta {maxEntries} registros.
        </p>
        {groups.length === 0 ? (
          <p className="rounded-lg bg-neutral-light/20 px-4 py-6 text-center text-sm text-neutral-dark">No hay registros con ese filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <caption className="sr-only">Entradas y salidas agrupadas por colaborador</caption>
              <thead>
                <tr>
                  <th scope="col" className={thClass}>Entrada</th>
                  <th scope="col" className={thClass}>Salida</th>
                  <th scope="col" className={thClass}>Tiempo en planta</th>
                  <th scope="col" className={thClass}>Resultado</th>
                  <th scope="col" className={thClass}>Semáforo</th>
                  <th scope="col" className={thClass}>EPP</th>
                  <th scope="col" className={thClass}>Observaciones</th>
                  <th scope="col" className={thClass}>Registró</th>
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.employeeId}>
                  <tr>
                    <th scope="colgroup" colSpan={8} className="bg-neutral-light/30 px-3 py-2 text-left font-bold">
                      {group.info?.name}
                      <span className="font-normal text-neutral-dark">
                        {" "}· {group.info?.company} · {group.items.length} registro{group.items.length === 1 ? "" : "s"} · {format_duration(group.workedMs)} acumuladas
                      </span>
                    </th>
                  </tr>
                  {group.items.map((entry) => {
                    const worked = get_worked_ms(entry);
                    return (
                      <tr key={entry.id} className="hover:bg-neutral-light/10">
                        <td className={tdClass}>{format_time(entry.enteredAt)}</td>
                        <td className={tdClass}>
                          {entry.result === "DENEGADO" ? "—" : entry.exitedAt ? format_time(entry.exitedAt) : <span className="font-bold text-brand-green">Dentro de planta</span>}
                        </td>
                        <td className={tdClass}>{worked === null ? "—" : format_duration(worked)}</td>
                        <td className={`${tdClass} font-bold ${entry.result === "PERMITIDO" ? "text-brand-green" : "text-red-700"}`}>
                          {entry.result === "PERMITIDO" ? "Permitido" : "Denegado"}
                        </td>
                        <td className={tdClass}><SemaphoreBadge semaphore={entry.semaphoreAtEntry} /></td>
                        <td className={tdClass}>{entry.eppComplete ? "Completo" : "Incompleto"}</td>
                        <td className={tdClass}>{[entry.denialReason, entry.notes].filter(Boolean).join(" · ") || "—"}</td>
                        <td className={tdClass}>
                          {entry.registeredByEmployeeNumber}
                          {entry.exitRegisteredByEmployeeNumber && entry.exitRegisteredByEmployeeNumber !== entry.registeredByEmployeeNumber && (
                            <span className="block text-xs text-neutral-dark">Salida: {entry.exitRegisteredByEmployeeNumber}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </section>

      <p className="text-sm">
        <Link href="/contratistas/ingresos" className="font-bold text-brand-navy underline">Volver a ingresos a planta</Link>
      </p>
    </>
  );
}
