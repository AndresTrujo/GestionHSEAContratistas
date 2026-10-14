import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { find_module, is_module_visible } from "@/config/modulos";
import { get_session } from "@/lib/auth/sesion";

/** Protege todo el módulo; cada pantalla exige además su permiso concreto. */
export default async function AdministrationLayout({ children }: { children: ReactNode }) {
  const session = await get_session();
  const appModule = find_module("administracion");
  if (!session || !appModule || !is_module_visible(appModule, session)) redirect("/inicio");
  return children;
}
