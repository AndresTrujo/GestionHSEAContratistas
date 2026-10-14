import { cache } from "react";
import { cookies } from "next/headers";
import type { PermissionCode } from "@/config/permisos";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { get_employee_full_name } from "@/lib/data/identidad";
import { verify_session_token } from "./token_sesion";

export const sessionCookieName = "hsea_session";

export interface EmployeeSession {
  kind: "EMPLEADO";
  employeeNumber: string;
  name: string;
  jobTitle: string;
  roleCodes: string[];
  /** Permisos de sus roles vigentes en cualquier alcance (para mostrar u ocultar opciones; no sustituye la validación por área). */
  permissions: PermissionCode[];
}

export interface ProviderSession {
  kind: "USUARIO_PROVEEDOR";
  providerUserId: number;
  providerId: number;
  providerName: string;
  name: string;
  username: string;
  isAdministrator: boolean;
  /** Colaborador al que pertenece la cuenta (para que consulte su propia documentación). */
  providerEmployeeId: number | null;
  /** Debe cambiar su contraseña temporal antes de usar el sistema. */
  mustChangePassword: boolean;
}

export type Session = EmployeeSession | ProviderSession;

/**
 * Sesión vigente o null. Valida la firma de la cookie y vuelve a leer a la persona en la BD:
 * si la dieron de baja, desactivaron su cuenta o suspendieron a su proveedor, la sesión deja
 * de valer aunque la cookie no haya caducado. Se calcula una vez por petición.
 */
export const get_session = cache(async (): Promise<Session | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  const identity = token ? verify_session_token(token) : null;
  if (!identity) return null;

  const repositories = get_repositories();

  if (identity.kind === "EMPLEADO") {
    // Las tres consultas van en paralelo: con la BD remota cada ida y vuelta pesa más que la consulta.
    const [employee, assignments, roles] = await Promise.all([
      repositories.employees.find_by_number(identity.id),
      repositories.access.list_assignments_by_employee(identity.id, { onlyCurrent: true }),
      repositories.access.list_roles(),
    ]);
    if (!employee || !employee.active) return null;
    const roleIds = new Set(assignments.map((assignment) => assignment.roleId));
    const heldRoles = roles.filter((role) => roleIds.has(role.id));
    return {
      kind: "EMPLEADO",
      employeeNumber: employee.employeeNumber,
      name: get_employee_full_name(employee),
      jobTitle: employee.jobTitle,
      roleCodes: heldRoles.map((role) => role.code),
      permissions: [...new Set(heldRoles.flatMap((role) => role.permissions))],
    };
  }

  const userId = Number(identity.id);
  if (!Number.isSafeInteger(userId)) return null;
  const user = await repositories.providerUsers.get_user(userId);
  if (!user || !user.active) return null;
  const provider = await repositories.providers.get_provider(user.providerId);
  if (!provider || provider.status === "SUSPENDIDO") return null;
  return {
    kind: "USUARIO_PROVEEDOR",
    providerUserId: user.id,
    providerId: user.providerId,
    providerName: provider.name,
    name: user.name,
    username: user.username,
    isAdministrator: user.isAdministrator,
    providerEmployeeId: user.providerEmployeeId,
    mustChangePassword: user.mustChangePassword,
  };
});

export function has_session_permission(session: Session, permission: PermissionCode): boolean {
  return session.kind === "EMPLEADO" && session.permissions.includes(permission);
}
