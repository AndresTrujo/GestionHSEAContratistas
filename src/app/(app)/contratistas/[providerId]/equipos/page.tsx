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
import { SemaphoreBadge } from "@/components/contratistas/SemaphoreBadge";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { DisclosureCard } from "@/components/ui/DisclosureCard";
import { PageHeader } from "@/components/ui/PageHeader";
import type { Semaphore } from "@/domain/contratistas";
import { add_equipment_action } from "@/lib/contratistas/acciones";
import { can_manage_provider, require_provider_access } from "@/lib/auth/guardas";
import { get_repositories } from "@/lib/data/proveedor_datos";

interface ProviderEquipmentPageProps {
  params: Promise<{ providerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const semaphoreFilters: Semaphore[] = ["VERDE", "AMARILLO", "ROJO"];

const summaryStyle: Record<"TODOS" | Semaphore, { label: string; accent: string }> = {
  TODOS: { label: "Todos", accent: "border-t-brand-navy" },
  VERDE: { label: "Verde", accent: "border-t-brand-green" },
  AMARILLO: { label: "Amarillo", accent: "border-t-yellow-400" },
  ROJO: { label: "Rojo", accent: "border-t-red-600" },
};

export default async function ProviderEquipmentPage({ params, searchParams }: ProviderEquipmentPageProps) {
  const { providerId: rawProviderId } = await params;
  const providerId = Number(rawProviderId);
  if (!Number.isSafeInteger(providerId)) notFound();
  const session = await require_provider_access(providerId);

  const query = await searchParams;
  const rawFilter = Array.isArray(query.semaforo) ? query.semaforo[0] : query.semaforo;
  const semaphoreFilter = semaphoreFilters.find((item) => item === rawFilter) ?? null;

  const repositories = get_repositories();
  const provider = await repositories.providers.get_provider(providerId);
  if (!provider) notFound();

  const equipment = await repositories.equipment.list_equipment(providerId);
  const semaphores = await Promise.all(equipment.map((item) => repositories.equipment.get_semaphore(item.id)));
  const canManage = can_manage_provider(session, providerId);

  const rows = equipment.map((item, index) => ({
    item,
    semaphore: semaphores[index]?.semaphore ?? null,
    pending: semaphores[index]?.requirements.filter((requirement) => requirement.status !== "APROBADO").length ?? 0,
    details: [item.brand, item.model, item.description].filter(Boolean).join(" · "),
    identification: [item.serialNumber && `Serie ${item.serialNumber}`, item.plates && `Placas ${item.plates}`].filter(Boolean).join(" · "),
  }));
  const counts: Record<"TODOS" | Semaphore, number> = {
    TODOS: rows.length,
    VERDE: rows.filter((row) => row.semaphore === "VERDE").length,
    AMARILLO: rows.filter((row) => row.semaphore === "AMARILLO").length,
    ROJO: rows.filter((row) => row.semaphore === "ROJO").length,
  };
  const visibleRows = rows.filter((row) => semaphoreFilter === null || row.semaphore === semaphoreFilter);
  const basePath = `/contratistas/${providerId}/equipos`;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          ...(session.kind === "EMPLEADO" ? [{ label: "Control de contratistas", href: "/contratistas" }] : []),
          { label: provider.name },
          { label: "Equipos motorizados" },
        ]}
      />
      <PageHeader
        title="Equipos motorizados"
        subtitle={provider.name}
        actions={
          <Link href={`/contratistas/${providerId}/personal`} className={secondaryButtonClass}>
            Ver personal
          </Link>
        }
      />
      <p className="mb-6 max-w-3xl text-sm text-neutral-dark">
        Grúas, montacargas y demás equipo motorizado que usará el proveedor: cada uno debe tener aprobados su certificado de
        calidad, programa de mantenimiento, póliza de seguro, verificación vehicular y tenencia vehicular.
      </p>

      <section aria-labelledby="titulo-equipos" className="mb-6">
        <h2 id="titulo-equipos" className="sr-only">
          Listado de equipos
        </h2>

        <ul className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(["TODOS", ...semaphoreFilters] as const).map((key) => {
            const filter = key === "TODOS" ? null : key;
            const active = semaphoreFilter === filter;
            return (
              <li key={key}>
                <Link
                  href={filter ? `${basePath}?semaforo=${filter}` : basePath}
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

        {visibleRows.length === 0 ? (
          <p className={`${cardClass} text-sm text-neutral-dark`}>
            {equipment.length === 0 ? "Aún no hay equipos motorizados registrados." : "Ningún equipo coincide con el filtro."}
          </p>
        ) : (
          <>
            {/* Celulares: una tarjeta por equipo. */}
            <ul className="space-y-3 md:hidden">
              {visibleRows.map(({ item, semaphore, pending, details, identification }) => (
                <li key={item.id} className="rounded-xl border border-neutral-light bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold">{item.equipmentType}</p>
                      {details && <p className="text-sm text-neutral-dark">{details}</p>}
                    </div>
                    {item.active ? <SemaphoreBadge semaphore={semaphore} /> : <span className="text-xs text-red-700">Baja</span>}
                  </div>
                  <p className="mb-3 text-xs text-neutral-dark">
                    {identification || "Sin identificación"} · {pending === 0 ? "Documentación al corriente" : `${pending} pendiente${pending === 1 ? "" : "s"}`}
                  </p>
                  <Link href={`${basePath}/${item.id}/documentos`} className={`${secondaryButtonClass} w-full`}>
                    Abrir ficha
                  </Link>
                </li>
              ))}
            </ul>

            {/* Pantallas medianas y grandes: tabla. */}
            <div className="hidden overflow-x-auto rounded-xl border border-neutral-light bg-white shadow-sm md:block">
              <table className={tableClass}>
                <caption className="sr-only">Equipos motorizados del proveedor con su semáforo y documentos pendientes</caption>
                <thead>
                  <tr>
                    <th scope="col" className={thClass}>Equipo</th>
                    <th scope="col" className={thClass}>Identificación</th>
                    <th scope="col" className={thClass}>Semáforo</th>
                    <th scope="col" className={thClass}>Documentos</th>
                    <th scope="col" className={thClass}><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(({ item, semaphore, pending, details, identification }) => (
                    <tr key={item.id} className="hover:bg-neutral-light/10">
                      <td className={tdClass}>
                        <span className="font-bold">{item.equipmentType}</span>
                        {details && <span className="block text-xs text-neutral-dark">{details}</span>}
                      </td>
                      <td className={tdClass}>{identification || <span className="text-neutral-dark">—</span>}</td>
                      <td className={tdClass}>
                        {item.active ? <SemaphoreBadge semaphore={semaphore} /> : <span className="text-xs text-red-700">Baja</span>}
                      </td>
                      <td className={tdClass}>
                        {pending === 0 ? (
                          <span className="font-bold text-brand-green">Al corriente</span>
                        ) : (
                          <span>{pending} pendiente{pending === 1 ? "" : "s"}</span>
                        )}
                      </td>
                      <td className={`${tdClass} text-right`}>
                        <Link href={`${basePath}/${item.id}/documentos`} className={secondaryButtonClass}>
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

      {canManage && (
        <DisclosureCard title="Agregar equipo motorizado" description="Después de agregarlo, sube sus cinco documentos desde su ficha.">
          <AdminForm action={add_equipment_action} submitLabel="Agregar equipo" className="space-y-5">
            <input type="hidden" name="providerId" value={providerId} />
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="mb-2 text-sm font-bold uppercase tracking-wide text-neutral-dark">Equipo</legend>
              <div>
                <label htmlFor="equipmentType" className={labelClass}>Tipo (p. ej. grúa, montacargas)</label>
                <input id="equipmentType" name="equipmentType" required className={inputClass} />
              </div>
              <div>
                <label htmlFor="description" className={labelClass}>Descripción (opcional)</label>
                <input id="description" name="description" className={inputClass} />
              </div>
              <div>
                <label htmlFor="brand" className={labelClass}>Marca (opcional)</label>
                <input id="brand" name="brand" className={inputClass} />
              </div>
              <div>
                <label htmlFor="model" className={labelClass}>Modelo (opcional)</label>
                <input id="model" name="model" className={inputClass} />
              </div>
            </fieldset>
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="mb-2 text-sm font-bold uppercase tracking-wide text-neutral-dark">Identificación</legend>
              <div>
                <label htmlFor="serialNumber" className={labelClass}>Número de serie (opcional)</label>
                <input id="serialNumber" name="serialNumber" className={inputClass} />
              </div>
              <div>
                <label htmlFor="plates" className={labelClass}>Placas (opcional)</label>
                <input id="plates" name="plates" className={inputClass} />
              </div>
            </fieldset>
          </AdminForm>
        </DisclosureCard>
      )}
    </>
  );
}
