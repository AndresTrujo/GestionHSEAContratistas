import { redirect } from "next/navigation";
import { ModuleCard } from "@/components/ui/ModuleCard";
import { ModuleIcon } from "@/components/ui/ModuleIcon";
import { appModules, is_module_visible } from "@/config/modulos";
import { get_session } from "@/lib/auth/sesion";

export default async function IndexPage() {
  const session = await get_session();
  if (!session) redirect("/login");

  const visibleModules = appModules.filter((appModule) => is_module_visible(appModule, session));
  const firstName = session.name.split(" ")[0];

  return (
    <>
      <h1 className="text-4xl uppercase">Inicio</h1>
      <p className="mb-8 mt-1 text-neutral-dark">
        Hola, <strong className="text-brand-navy">{firstName}</strong>. Elige a dónde quieres ir.
      </p>
      {visibleModules.length === 0 ? (
        <p className="rounded-xl border border-neutral-light bg-white p-5 text-neutral-dark">
          Tu usuario aún no tiene módulos asignados. Pide a HSEA que te asigne un rol.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visibleModules.map((appModule) => (
            <ModuleCard
              key={appModule.slug}
              title={appModule.title}
              description={appModule.description}
              href={appModule.href}
              icon={<ModuleIcon slug={appModule.slug} />}
            />
          ))}
        </div>
      )}
    </>
  );
}
