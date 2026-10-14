import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { find_module, is_module_visible } from "@/config/modulos";
import { get_session } from "@/lib/auth/sesion";

/**
 * Protege todo el módulo: administradores de proveedor, o empleados con algún permiso de contratistas.
 * Un colaborador de proveedor solo pasa para ver su propia ficha; cada página lo valida con `require_provider_access`.
 */
export default async function ContractorsLayout({ children }: { children: ReactNode }) {
  const session = await get_session();
  const appModule = find_module("contratistas");
  if (!session || !appModule) redirect("/inicio");
  const isOwnRecordViewer = session.kind === "USUARIO_PROVEEDOR" && !session.isAdministrator;
  if (!isOwnRecordViewer && !is_module_visible(appModule, session)) redirect("/inicio");
  return children;
}
