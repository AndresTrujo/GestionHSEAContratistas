import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { ModuleIcon } from "@/components/ui/ModuleIcon";
import { PageHeader } from "@/components/ui/PageHeader";
import { permitTypes } from "@/config/tipos_permiso";
import { stopSlug } from "@/config/observacion_stop";
import { get_session } from "@/lib/auth/sesion";

export default async function WorkPermitsPage() {
  const session = await get_session();
  // La observación preventiva STOP es interna de TFS; los proveedores no la ven.
  const visibleTypes = permitTypes.filter((permitType) => session?.kind === "EMPLEADO" || permitType.slug !== stopSlug);

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Inicio", href: "/inicio" }, { label: "Permisos de trabajo" }]}
      />
      <PageHeader title="Permisos de trabajo" subtitle="Elige el formato que necesitas: ahí ves los permisos existentes y puedes crear uno nuevo." />
      <ul className="grid gap-4 sm:grid-cols-2">
        {visibleTypes.map((permitType) => (
          <li key={permitType.slug}>
            <Link
              href={`/permisos-trabajo/${permitType.slug}`}
              className="group flex h-full items-start gap-4 rounded-xl border border-neutral-light bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-cyan hover:shadow-md motion-reduce:transform-none"
            >
              <div aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-navy text-brand-cyan">
                <ModuleIcon slug="permisos-trabajo" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="mb-1 inline-block rounded-full bg-neutral-light/40 px-2.5 py-0.5 text-xs font-bold text-brand-navy">
                  {permitType.formCode}
                </span>
                <h2 className="mb-1 text-xl uppercase leading-tight text-brand-navy">{permitType.name}</h2>
                <p className="text-sm text-neutral-dark">{permitType.description}</p>
                <p className="mt-2 text-xs text-neutral-dark">{permitType.validityNote}</p>
              </div>
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="mt-1 shrink-0 text-brand-cyan transition group-hover:translate-x-1 motion-reduce:transform-none"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
