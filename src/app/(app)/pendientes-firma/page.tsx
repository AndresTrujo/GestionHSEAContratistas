import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { find_permit_type } from "@/config/tipos_permiso";
import { get_date_mx, get_time_mx } from "@/lib/data/identidad";
import { get_permit_url } from "@/lib/notificaciones/envio";
import { list_pending_signatures } from "@/lib/notificaciones/pendientes";
import { require_permit_actor } from "@/lib/permisos/actor";

export const metadata = { title: "Pendientes de mi firma" };

export default async function PendingSignaturesPage() {
  const actor = await require_permit_actor();
  const pending = await list_pending_signatures(actor);

  return (
    <>
      <Breadcrumbs items={[{ label: "Inicio", href: "/inicio" }, { label: "Pendientes de mi firma" }]} />
      <PageHeader
        title="Pendientes de mi firma"
        subtitle="Permisos que están en tu turno de firma. Se ordenan del más antiguo al más reciente."
      />

      {pending.length === 0 ? (
        <p className="rounded-xl border border-neutral-light bg-white p-5 text-neutral-dark">
          No tienes permisos esperando tu firma.
        </p>
      ) : (
        <ul className="grid gap-3">
          {pending.map(({ permit, signature }) => {
            const typeName = find_permit_type(permit.permitTypeSlug)?.name ?? "Permiso";
            const folio = typeof permit.fields.folio === "string" && permit.fields.folio ? permit.fields.folio : "Sin folio";
            return (
              <li key={`${permit.id}-${signature.key}`}>
                <Link
                  href={get_permit_url(permit)}
                  className="group flex items-start justify-between gap-4 rounded-xl border border-neutral-light bg-white p-4 shadow-sm transition hover:border-brand-cyan hover:shadow-md"
                >
                  <div className="min-w-0">
                    <span className="mb-1 inline-block rounded-full bg-neutral-light/40 px-2.5 py-0.5 text-xs font-bold text-brand-navy">
                      {typeName}
                    </span>
                    <p className="text-lg font-bold text-brand-navy">{folio}</p>
                    <p className="text-sm text-neutral-dark">
                      Tu firma: <strong>{signature.label}</strong>
                    </p>
                    <p className="mt-1 text-xs text-neutral-dark">
                      Última actualización del permiso: {get_date_mx(permit.updatedAt)} {get_time_mx(permit.updatedAt)}
                    </p>
                  </div>
                  <span className="mt-1 shrink-0 text-sm font-bold text-brand-navy underline underline-offset-2 group-hover:text-brand-navy-alt">
                    Revisar y firmar
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
