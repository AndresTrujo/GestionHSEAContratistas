import { redirect } from "next/navigation";
import { get_session } from "@/lib/auth/sesion";

/** Un colaborador de proveedor entra directo a su propia ficha de documentos (solo lectura). */
export default async function MyDocumentsPage() {
  const session = await get_session();
  if (!session || session.kind !== "USUARIO_PROVEEDOR" || session.isAdministrator) redirect("/inicio");
  if (session.providerEmployeeId === null) {
    return <p className="text-neutral-dark">Tu cuenta no está vinculada a un colaborador. Pide a tu administrador que la vincule.</p>;
  }
  redirect(`/contratistas/${session.providerId}/personal/${session.providerEmployeeId}/documentos`);
}
