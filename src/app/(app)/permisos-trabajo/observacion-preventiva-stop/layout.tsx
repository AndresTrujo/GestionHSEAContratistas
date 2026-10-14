import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { get_session } from "@/lib/auth/sesion";

/** Marco del formato FO-0059: banda azul marino y hoja blanca al centro. Es una observación interna de TFS. */
export default async function StopLayout({ children }: { children: ReactNode }) {
  const session = await get_session();
  if (session?.kind !== "EMPLEADO") redirect("/permisos-trabajo");
  return (
    <div className="bg-brand-navy p-4 sm:p-6">
      <div className="bg-white p-6 sm:p-8">{children}</div>
    </div>
  );
}
