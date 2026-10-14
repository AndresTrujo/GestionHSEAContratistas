import type { SignerRole } from "@/domain/permisos";

/**
 * Lista cerrada de permisos del sistema. Se sincroniza a la tabla `permisos`
 * (esquema.sql); los roles y sus asignaciones viven en BD, los códigos no.
 */
export const permissionDescriptions = {
  "firmar:encargado_area": "Firmar permisos como responsable operativo / encargado del área",
  "firmar:responsable_tarea": "Firmar permisos como responsable de la ejecución de la tarea",
  "firmar:supervisor_hsea": "Firmar permisos como HSEA",
  "firmar:servicio_medico": "Firmar permisos como servicio médico y/o brigadista",
  "permisos:crear": "Crear y enviar permisos de trabajo",
  "permisos:ver_area": "Ver permisos de su área",
  "permisos:ver_todos": "Ver permisos de toda la organización",
  "permisos:cerrar": "Cerrar permisos de trabajo",
  "contratistas:gestionar": "Gestionar proveedores y su personal",
  "contratistas:revisar_documentos": "Aprobar o rechazar documentos de contratistas",
  "contratistas:validar_medico": "Validar exámenes y certificados médicos de contratistas",
  "contratistas:registrar_ingresos":
    "Registrar ingresos y salidas de contratistas a planta (verificación de EPP)",
  "organizacion:ver": "Consultar empleados y estructura",
  "organizacion:administrar": "Administrar departamentos, empleados y cargos de área",
  "roles:administrar": "Asignar y revocar roles y permisos",
  "auditoria:ver": "Consultar eventos de auditoría",
} as const;

export type PermissionCode = keyof typeof permissionDescriptions;

export const permissionCodes = Object.keys(permissionDescriptions) as PermissionCode[];

export function is_permission_code(value: string): value is PermissionCode {
  return value in permissionDescriptions;
}

/**
 * Permiso que debe tener quien firma cada rol de los formatos
 * (espejo de la tabla `roles_firma`). null = basta sesión + PIN.
 */
export const signerRolePermission: Record<SignerRole, PermissionCode | null> = {
  executor: "firmar:responsable_tarea",
  tfs_executor: "firmar:responsable_tarea",
  operational_manager: "firmar:encargado_area",
  hsea: "firmar:supervisor_hsea",
  medical_service: "firmar:servicio_medico",
  requester: null,
  lookout: null,
  contractor: null,
  observer: null,
  observed: null,
  supervisor: null,
};

export const signerRoleLabels: Record<SignerRole, string> = {
  executor: "Responsable de la ejecución",
  tfs_executor: "Responsable de la ejecución por parte de TFS",
  operational_manager: "Responsable operativo del área",
  hsea: "HSEA",
  medical_service: "Servicio médico y/o brigadista",
  requester: "Solicitante",
  lookout: "Prevencionista / vigía",
  contractor: "Contratista",
  observer: "Observador",
  observed: "Observado",
  supervisor: "Supervisor",
};

/**
 * Roles de firma que puede ejercer un usuario de proveedor. Los demás son de TFS
 * (HSEA, responsable operativo, servicio médico, etc.). Un proveedor no tiene roles:
 * se valida que pertenezca al proveedor del permiso y que su colaborador esté en VERDE.
 */
export const providerSignerRoles: SignerRole[] = ["executor", "contractor"];

export function get_required_permission(role: SignerRole): PermissionCode | null {
  return signerRolePermission[role];
}

/** Rol que administra roles y organización; siempre debe quedar al menos una persona activa con él. */
export const adminRoleCode = "ADMIN_HSEA";

/** Departamento cuyo personal firma las verificaciones de los permisos (no es un rol: basta pertenecer a él). */
export const hseaDepartmentName = "HSEA";

/** Roles de sistema (precargados en BD). */
export const systemRoleCodes = [
  "ADMIN_HSEA",
  "SUPERVISOR_HSEA",
  "ENCARGADO_AREA",
  "RESPONSABLE_TAREA",
  "SERVICIO_MEDICO",
  "GERENTE_AREA",
  "CONSULTA",
] as const;

export type SystemRoleCode = (typeof systemRoleCodes)[number];

export const systemRoleNames: Record<SystemRoleCode, string> = {
  ADMIN_HSEA: "Administrador HSEA",
  SUPERVISOR_HSEA: "Supervisor HSEA",
  ENCARGADO_AREA: "Encargado del área",
  RESPONSABLE_TAREA: "Responsable de la tarea",
  SERVICIO_MEDICO: "Servicio médico",
  GERENTE_AREA: "Gerente de área",
  CONSULTA: "Consulta",
};

/** Permisos iniciales de cada rol de sistema (espejo del seed de esquema.sql). */
export const defaultRolePermissions: Record<SystemRoleCode, PermissionCode[]> = {
  ADMIN_HSEA: [
    "organizacion:ver",
    "organizacion:administrar",
    "roles:administrar",
    "auditoria:ver",
    "permisos:ver_todos",
    "contratistas:gestionar",
    "contratistas:revisar_documentos",
    "contratistas:registrar_ingresos",
    "firmar:supervisor_hsea",
    "contratistas:validar_medico",
  ],
  SUPERVISOR_HSEA: [
    "contratistas:registrar_ingresos",
    "firmar:supervisor_hsea",
    "permisos:ver_todos",
    "permisos:cerrar",
    "contratistas:revisar_documentos",
    "organizacion:ver",
  ],
  ENCARGADO_AREA: [
    "firmar:encargado_area",
    "permisos:ver_area",
    "permisos:crear",
    "organizacion:ver",
  ],
  RESPONSABLE_TAREA: ["firmar:responsable_tarea", "permisos:crear", "permisos:ver_area"],
  SERVICIO_MEDICO: [
    "firmar:servicio_medico",
    "contratistas:validar_medico",
    "permisos:ver_area",
    "organizacion:ver",
  ],
  GERENTE_AREA: ["permisos:ver_area", "organizacion:ver"],
  CONSULTA: ["permisos:ver_area", "organizacion:ver"],
};

/** Primer administrador, asignado al cargar el seed (la guía lo sugiere: Gerente HSE). */
export const firstAdminEmployeeNumber = "204692";
