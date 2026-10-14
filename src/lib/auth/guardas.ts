import { redirect } from "next/navigation";
import { adminRoleCode, type PermissionCode } from "@/config/permisos";
import { get_session, type EmployeeSession, type Session } from "./sesion";

const contractorPermissions: PermissionCode[] = [
  "contratistas:gestionar",
  "contratistas:revisar_documentos",
  "contratistas:validar_medico",
  "contratistas:registrar_ingresos",
];

/**
 * Acceso a la información de un proveedor: sus propios usuarios, o empleados TFS con algún permiso
 * de contratistas. Cualquier otro caso se redirige.
 */
export async function require_provider_access(providerId: number, ownEmployeeId?: number): Promise<Session> {
  const session = await get_session();
  if (!session) redirect("/login");
  if (session.kind === "USUARIO_PROVEEDOR") {
    // Un colaborador (no administrador) solo consulta su propia ficha de documentos.
    if (!session.isAdministrator) {
      const isOwnRecord =
        ownEmployeeId !== undefined &&
        session.providerId === providerId &&
        session.providerEmployeeId === ownEmployeeId;
      if (!isOwnRecord) redirect("/inicio");
      return session;
    }
    if (session.providerId !== providerId) redirect("/contratistas");
    return session;
  }
  if (!contractorPermissions.some((permission) => session.permissions.includes(permission))) redirect("/inicio");
  return session;
}

/** ¿Puede esta sesión ver la ficha de un colaborador? Su proveedor (administrador, o él mismo) o empleados TFS con algún permiso de contratistas. */
export function can_view_provider_employee(session: Session, employee: { id: number; providerId: number }): boolean {
  if (session.kind === "USUARIO_PROVEEDOR") {
    if (session.providerId !== employee.providerId) return false;
    return session.isAdministrator || session.providerEmployeeId === employee.id;
  }
  return contractorPermissions.some((permission) => session.permissions.includes(permission));
}

/** ¿Puede dar de alta personal/equipos y subir documentos del proveedor? Sus usuarios, o `contratistas:gestionar`. */
export function can_manage_provider(session: Session, providerId: number): boolean {
  return session.kind === "USUARIO_PROVEEDOR"
    ? session.isAdministrator && session.providerId === providerId
    : session.permissions.includes("contratistas:gestionar");
}

/**
 * ¿Puede dar de alta colaboradores (y con ello generar sus cuentas)? Solo el administrador del proveedor y el
 * Administrador HSEA; otros perfiles, aun con `contratistas:gestionar`, no.
 */
export function can_register_employees(session: Session, providerId: number): boolean {
  return session.kind === "USUARIO_PROVEEDOR"
    ? session.isAdministrator && session.providerId === providerId
    : session.roleCodes.includes(adminRoleCode);
}

/** Sesión de empleado TFS o redirección al login. */
export async function require_employee_session(): Promise<EmployeeSession> {
  const session = await get_session();
  if (!session || session.kind !== "EMPLEADO") redirect("/login");
  return session;
}

/**
 * Sesión de empleado con el permiso (en cualquier alcance) o redirección a Inicio. Sirve para
 * proteger pantallas; la operación en sí la valida de nuevo el repositorio.
 */
export async function require_employee_permission(permission: PermissionCode): Promise<EmployeeSession> {
  const session = await require_employee_session();
  if (!session.permissions.includes(permission)) redirect("/inicio");
  return session;
}
