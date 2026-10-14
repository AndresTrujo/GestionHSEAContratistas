import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { appModules, is_module_visible } from "@/config/modulos";
import { get_session } from "@/lib/auth/sesion";

export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await get_session();
  if (!session) redirect("/login");
  // Con contraseña temporal no se usa el sistema hasta cambiarla.
  if (session.kind === "USUARIO_PROVEEDOR" && session.mustChangePassword) {
    redirect("/cambiar-password");
  }

  const identity =
    session.kind === "EMPLEADO"
      ? { name: session.name, detail: `Empleado ${session.employeeNumber}` }
      : { name: session.name, detail: session.providerName };

  // Solo las secciones a las que esta persona tiene acceso.
  const navItems = [
    { href: "/inicio", label: "Inicio" },
    ...appModules
      .filter((appModule) => is_module_visible(appModule, session))
      .map((appModule) => ({ href: appModule.href, label: appModule.title })),
  ];

  return (
    <div className="min-h-screen bg-neutral-light/15">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-bold focus:text-brand-navy"
      >
        Saltar al contenido
      </a>
      <AppHeader identity={identity} navItems={navItems} />
      <main id="contenido" className="mx-auto max-w-6xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}
