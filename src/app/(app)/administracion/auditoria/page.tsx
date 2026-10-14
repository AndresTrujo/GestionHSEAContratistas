import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  cardClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
  tableClass,
  tdClass,
  thClass,
} from "@/components/administracion/estilos";
import { require_employee_permission } from "@/lib/auth/guardas";
import { get_repositories } from "@/lib/data/proveedor_datos";

interface AuditPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Acciones que registra la auditoría (las mismas que acepta la tabla `eventos_auditoria`). */
const auditActions = [
  "crear",
  "actualizar",
  "eliminar",
  "firmar",
  "subir_version",
  "aprobar_revision",
  "rechazar_revision",
  "revocar_revision",
  "asignar_rol",
  "revocar_rol",
  "establecer_pin",
  "verificar_pin_fallido",
  "revocar_pin",
  "restablecer_password",
  "purgar_archivo",
  "descargar_documento",
  "iniciar_sesion",
  "inicio_sesion_fallido",
  "cerrar_sesion",
] as const;

const maxEvents = 200;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function read_param(params: Record<string, string | string[] | undefined>, name: string): string {
  const value = params[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function format_time(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", dateStyle: "short", timeStyle: "medium" }).format(
    new Date(iso),
  );
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  await require_employee_permission("auditoria:ver");
  const params = await searchParams;
  const entityType = read_param(params, "entidad");
  const entityId = read_param(params, "entidadId");
  const actorId = read_param(params, "actor");
  const action = read_param(params, "accion");
  const from = read_param(params, "desde");
  const to = read_param(params, "hasta");

  const events = await get_repositories().audit.search_events({
    entityType: entityType || undefined,
    entityId: entityId || undefined,
    actorId: actorId || undefined,
    action: (auditActions as readonly string[]).includes(action) ? action : undefined,
    from: isoDatePattern.test(from) ? from : undefined,
    to: isoDatePattern.test(to) ? to : undefined,
    limit: maxEvents,
  });

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Administración", href: "/administracion" },
          { label: "Auditoría" },
        ]}
      />
      <PageHeader
        title="Auditoría"
        subtitle={`Registro inmutable de lo que se hace en el sistema. Se muestran los ${maxEvents} eventos más recientes que cumplan el filtro (horas de Ciudad de México).`}
      />

      <form method="get" className={cardClass} aria-label="Filtros de auditoría">
        <h2 className="mb-3 text-xl uppercase">Filtros</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="accion" className={labelClass}>Acción</label>
            <select id="accion" name="accion" defaultValue={action} className={inputClass}>
              <option value="">Todas</option>
              {auditActions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="actor" className={labelClass}>Actor (n.º de empleado o P-id)</label>
            <input id="actor" name="actor" defaultValue={actorId} className={inputClass} />
          </div>
          <div>
            <label htmlFor="entidad" className={labelClass}>Entidad (p. ej. permisos_trabajo)</label>
            <input id="entidad" name="entidad" defaultValue={entityType} className={inputClass} />
          </div>
          <div>
            <label htmlFor="entidadId" className={labelClass}>Id de la entidad</label>
            <input id="entidadId" name="entidadId" defaultValue={entityId} className={inputClass} />
          </div>
          <div>
            <label htmlFor="desde" className={labelClass}>Desde</label>
            <input id="desde" name="desde" type="date" defaultValue={from} className={inputClass} />
          </div>
          <div>
            <label htmlFor="hasta" className={labelClass}>Hasta</label>
            <input id="hasta" name="hasta" type="date" defaultValue={to} className={inputClass} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" className={secondaryButtonClass}>Filtrar</button>
          <Link
            href="/administracion/auditoria"
            className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-brand-navy underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy sm:min-h-10"
          >
            Limpiar filtros
          </Link>
        </div>
      </form>

      <section className={cardClass} aria-label="Eventos de auditoría">
        {events.length === 0 ? (
          <p className="text-sm text-neutral-dark">No hay eventos con ese filtro.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-neutral-dark" role="status">
              {events.length} {events.length === 1 ? "evento" : "eventos"}
            </p>
            {/* Tabla en pantallas medianas y grandes */}
            <div className="hidden overflow-x-auto md:block">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th scope="col" className={thClass}>Fecha</th>
                    <th scope="col" className={thClass}>Actor</th>
                    <th scope="col" className={thClass}>Acción</th>
                    <th scope="col" className={thClass}>Entidad</th>
                    <th scope="col" className={thClass}>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td className={tdClass}>{format_time(event.occurredAt)}</td>
                      <td className={tdClass}>
                        {event.actorId}
                        <span className="block text-xs text-neutral-dark">{event.actorType}</span>
                      </td>
                      <td className={tdClass}>{event.action}</td>
                      <td className={tdClass}>
                        {event.entityType}
                        <span className="block text-xs text-neutral-dark">{event.entityId}</span>
                      </td>
                      <td className={tdClass}>
                        <code className="break-all text-xs">{JSON.stringify(event.details)}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Tarjetas en móvil */}
            <ul className="space-y-3 md:hidden">
              {events.map((event) => (
                <li key={event.id} className="rounded-lg border border-neutral-light p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge tone="info">{event.action}</StatusBadge>
                    <span className="text-xs text-neutral-dark">{format_time(event.occurredAt)}</span>
                  </div>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <dt className="font-bold text-brand-navy">Actor</dt>
                    <dd className="break-words">
                      {event.actorId} <span className="text-xs text-neutral-dark">({event.actorType})</span>
                    </dd>
                    <dt className="font-bold text-brand-navy">Entidad</dt>
                    <dd className="break-words">
                      {event.entityType} <span className="text-xs text-neutral-dark">{event.entityId}</span>
                    </dd>
                    <dt className="font-bold text-brand-navy">Detalle</dt>
                    <dd>
                      <code className="break-all text-xs">{JSON.stringify(event.details)}</code>
                    </dd>
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
