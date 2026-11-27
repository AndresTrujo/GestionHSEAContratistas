import type { Session } from "@/lib/auth/sesion";

/** Identidad usada en auditoría: número de empleado, o "P-" + id del usuario de proveedor. */
export function get_session_actor_id(session: Session): string {
  return session.kind === "EMPLEADO" ? session.employeeNumber : `P-${session.providerUserId}`;
}
