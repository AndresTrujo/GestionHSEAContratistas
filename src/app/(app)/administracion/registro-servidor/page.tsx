import Link from "next/link";
import { ServerErrorAlert } from "@/components/administracion/ServerErrorAlert";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import {
  cardClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
  tableClass,
  tdClass,
  thClass,
} from "@/components/administracion/estilos";
import { serverLogLevels, type ServerLogLevel } from "@/domain/registro_servidor";
import { require_employee_permission } from "@/lib/auth/guardas";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { alertWindowHours, count_recent_server_errors } from "@/lib/registro/alerta";

interface ServerLogPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const maxEntries = 200;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

// Tono de la etiqueta de cada nivel (la etiqueta lleva símbolo además de color).
const levelTone: Record<ServerLogLevel, BadgeTone> = {
  ERROR: "danger",
  WARN: "warning",
  INFO: "neutral",
};

function read_param(params: Record<string, string | string[] | undefined>, name: string): string {
  const value = params[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function format_time(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", dateStyle: "short", timeStyle: "medium" }).format(
    new Date(iso),
  );
}

export default async function ServerLogPage({ searchParams }: ServerLogPageProps) {
  await require_employee_permission("auditoria:ver");
  const params = await searchParams;
  const level = read_param(params, "nivel");
  const source = read_param(params, "origen");
  const from = read_param(params, "desde");
  const to = read_param(params, "hasta");

  const [entries, recentErrors] = await Promise.all([
    get_repositories().serverLog.search_entries({
      level: (serverLogLevels as readonly string[]).includes(level) ? (level as ServerLogLevel) : undefined,
      source: source || undefined,
      from: isoDatePattern.test(from) ? from : undefined,
      to: isoDatePattern.test(to) ? to : undefined,
      limit: maxEntries,
    }),
    count_recent_server_errors(),
  ]);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Administración", href: "/administracion" },
          { label: "Registro del servidor" },
        ]}
      />
      <PageHeader
        title="Registro del servidor"
        subtitle={`Errores y avisos técnicos: fallos al atender peticiones, fallos de la purga de archivos y bloqueos de inicio de sesión. Se muestran las ${maxEntries} entradas más recientes que cumplan el filtro (horas de Ciudad de México).`}
        actions={
          <Link href="/administracion" className={secondaryButtonClass}>
            Volver a Administración
          </Link>
        }
      />

      {recentErrors !== null && recentErrors > 0 && (
        <ServerErrorAlert count={recentErrors} windowHours={alertWindowHours} />
      )}

      <section className={cardClass}>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="nivel" className={labelClass}>Nivel</label>
            <select id="nivel" name="nivel" defaultValue={level} className={inputClass}>
              <option value="">Todos</option>
              {serverLogLevels.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="origen" className={labelClass}>Origen (peticion, purga_archivos, login)</label>
            <input id="origen" name="origen" defaultValue={source} className={inputClass} />
          </div>
          <div>
            <label htmlFor="desde" className={labelClass}>Desde</label>
            <input id="desde" name="desde" type="date" defaultValue={from} className={inputClass} />
          </div>
          <div>
            <label htmlFor="hasta" className={labelClass}>Hasta</label>
            <input id="hasta" name="hasta" type="date" defaultValue={to} className={inputClass} />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <button type="submit" className={secondaryButtonClass}>Filtrar</button>
          </div>
        </form>
      </section>

      <section className={cardClass}>
        {entries.length === 0 ? (
          <p className="text-sm text-neutral-dark">No hay entradas con ese filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={`${tableClass} min-w-[40rem]`}>
              <thead>
                <tr>
                  <th className={thClass}>Fecha</th>
                  <th className={thClass}>Nivel</th>
                  <th className={thClass}>Origen</th>
                  <th className={thClass}>Mensaje</th>
                  <th className={thClass}>Contexto</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className={tdClass}>{format_time(entry.occurredAt)}</td>
                    <td className={tdClass}>
                      <StatusBadge tone={levelTone[entry.level]}>{entry.level}</StatusBadge>
                    </td>
                    <td className={tdClass}>{entry.source}</td>
                    <td className={tdClass}>
                      {entry.message}
                      {entry.detail && (
                        <details className="mt-1">
                          <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg text-xs font-bold text-brand-navy underline focus-visible:outline-brand-navy sm:min-h-10">
                            Ver pila
                          </summary>
                          <pre className="mt-1 max-w-xl overflow-x-auto whitespace-pre-wrap text-xs">{entry.detail}</pre>
                        </details>
                      )}
                    </td>
                    <td className={tdClass}>
                      <code className="break-all text-xs">{JSON.stringify(entry.context)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
