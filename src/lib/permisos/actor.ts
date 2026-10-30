import { redirect } from "next/navigation";
import type { ActorType } from "@/domain/auditoria";
import type { WorkPermit } from "@/domain/permisos";
import { adminRoleCode, providerSignerRoles } from "@/config/permisos";
import { get_session } from "@/lib/auth/sesion";

/** Quien crea o firma un permiso: empleado TFS o usuario de un proveedor. */
export interface PermitActor {
  actorType: ActorType;
  /** Número de empleado, o `P-<id de usuario>` para usuarios de proveedor (misma regla que la firma por PIN). */
  actorId: string;
  /** Proveedor del usuario; null para empleados. */
  providerId: string | null;
  providerUserId: number | null;
  /** ADMIN_HSEA: exento de las reglas de segregación de firmas (puede firmar varios roles). */
  isAdmin?: boolean;
}

/** Pasos de firma que un usuario de proveedor puede firmar (siempre en permisos de su propia empresa). */
const providerSignableKeys: string[] = [...providerSignerRoles, "requester"];

export async function require_permit_actor(): Promise<PermitActor> {
  const session = await get_session();
  if (!session) redirect("/login");
  if (session.kind === "EMPLEADO") {
    return {
      actorType: "EMPLEADO",
      actorId: session.employeeNumber,
      providerId: null,
      providerUserId: null,
      isAdmin: session.roleCodes.includes(adminRoleCode),
    };
  }
  return {
    actorType: "USUARIO_PROVEEDOR",
    actorId: `P-${session.providerUserId}`,
    providerId: String(session.providerId),
    providerUserId: session.providerUserId,
    isAdmin: false,
  };
}

export function employee_actor(employeeNumber: string): PermitActor {
  return { actorType: "EMPLEADO", actorId: employeeNumber, providerId: null, providerUserId: null };
}

/** Tipo de actor a partir de su id (los ids de proveedor empiezan con `P-`). */
export function get_actor_type(actorId: string): ActorType {
  return actorId.startsWith("P-") ? "USUARIO_PROVEEDOR" : "EMPLEADO";
}

/** Los empleados ven todos los permisos; un proveedor, solo los de su empresa. */
export function can_access_permit(actor: PermitActor, permit: WorkPermit): boolean {
  return actor.actorType === "EMPLEADO" || (actor.providerId !== null && permit.providerId === actor.providerId);
}

export function filter_permits_for_actor(actor: PermitActor, permits: WorkPermit[]): WorkPermit[] {
  return permits.filter((permit) => can_access_permit(actor, permit));
}

export function can_sign_key(actor: PermitActor, key: string): boolean {
  return actor.actorType === "EMPLEADO" || providerSignableKeys.includes(key) || key.startsWith("participant_");
}
