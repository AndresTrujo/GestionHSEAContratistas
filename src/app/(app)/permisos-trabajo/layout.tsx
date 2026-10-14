import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { find_module, is_module_visible } from "@/config/modulos";
import { get_session } from "@/lib/auth/sesion";

/** Protege todo el módulo: solo empleados TFS (los proveedores firman desde su propio flujo). */
export default async function WorkPermitsLayout({ children }: { children: ReactNode }) {
  const session = await get_session();
  const appModule = find_module("permisos-trabajo");
  if (!session || !appModule || !is_module_visible(appModule, session)) redirect("/inicio");
  return children;
}
