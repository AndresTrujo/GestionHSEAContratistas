import type { ActorType, AuditMetadata } from "./auditoria";
import type { AreaRef, PermitArea } from "./organizacion";
import type { SignerRole } from "./permisos";
import type { PermissionCode } from "@/config/permisos";

/**
 * Roles, permisos y firmas (tablas roles, empleado_roles, roles_firma,
 * credenciales_firma, firmas_permiso). Los roles se asignan por puesto;
 * los cursos son opcionales.
 */
export interface Role extends AuditMetadata {
  id: number;
  /** Código estable, p. ej. "SUPERVISOR_HSEA". */
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  active: boolean;
  permissions: PermissionCode[];
}

/** GLOBAL cubre toda la organización; los demás cubren el área y todo lo que cuelga de ella. */
export type RoleScope = "GLOBAL" | "LINEA_MANDO" | "DEPARTAMENTO" | "SUBDEPARTAMENTO";

/** Asignación de un rol; se revoca, nunca se borra. Solo para empleados TFS. */
export interface RoleAssignment extends AuditMetadata, AreaRef {
  id: string;
  employeeNumber: string;
  roleId: number;
  roleCode: string;
  scope: RoleScope;
  validFrom: string; // YYYY-MM-DD
  validUntil: string | null;
  grantedByEmployeeNumber: string;
  reason: string | null;
  revokedAt: string | null;
  revokedByEmployeeNumber: string | null;
}

/** Quién firma: empleado TFS o usuario de proveedor (sin número de empleado). */
export type SignerIdentity =
  | { kind: Extract<ActorType, "EMPLEADO">; employeeNumber: string }
  | { kind: Extract<ActorType, "USUARIO_PROVEEDOR">; providerUserId: number };

/** Quien ejecuta una operación; mismas dos formas que un firmante. */
export type ActorIdentity = SignerIdentity;

/** Rol de firma de los formatos y el permiso que exige (null = basta sesión + PIN). */
export interface SignatureRoleDefinition {
  code: SignerRole;
  label: string;
  requiredPermission: PermissionCode | null;
}

export type SigningCredentialStatus = "ACTIVA" | "BLOQUEADA" | "REVOCADA";

/** PIN de firma. El hash nunca sale de la capa de datos; aquí solo su estado. */
export interface SigningCredential {
  id: string;
  signer: SignerIdentity;
  status: SigningCredentialStatus;
  failedAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
  activatedByEmployeeNumber: string;
  revokedAt: string | null;
  revokedBy: string | null;
}

/**
 * Firma registrada (inmutable). Guarda la "foto" de por qué el firmante
 * estaba autorizado, para que cambios futuros de organigrama no alteren lo firmado.
 */
export interface SignatureRecord {
  id: string;
  permitId: string;
  signerRole: SignerRole;
  signer: SignerIdentity;
  area: AreaRef;
  roleAssignmentId: string | null;
  areaAssignmentId: string | null;
  /** PIN verificado al firmar; null cuando no se exige PIN. */
  credentialId: string | null;
  signerName: string;
  signerJobTitle: string;
  signedAt: string; // ISO 8601
  /** Trazo manuscrito como data URL PNG; null si no se dibujó. */
  image: string | null;
  /** sha256 del contenido firmado. */
  documentHash: string | null;
}

/** Asignación de rol: el motivo es obligatorio (trazabilidad). */
export interface AssignRoleInput {
  employeeNumber: string;
  roleCode: string;
  scope: RoleScope;
  /** Debe informar solo el nivel que corresponde al alcance (nada si es GLOBAL). */
  area: AreaRef;
  validFrom?: string; // YYYY-MM-DD; por omisión, hoy (CDMX)
  validUntil?: string | null;
  reason: string;
}

/** Pregunta "¿puede esta persona firmar este rol en este permiso?". */
export interface CanSignRequest {
  permitId: string;
  permitTypeSlug: string;
  role: SignerRole;
  signer: SignerIdentity;
  area: PermitArea;
}

export interface SignPermitInput extends CanSignRequest {
  /** PIN en claro; se verifica contra el hash y no se guarda ni se audita. */
  pin: string;
  image: string | null;
  documentHash: string | null;
}

export type SignResult =
  | { ok: true; signature: SignatureRecord }
  | { ok: false; reason: SignDenialReason };

/** Motivo por el que una persona no puede firmar un rol en un permiso. */
export type SignDenialReason =
  | "ACTOR_NO_ENCONTRADO"
  | "ACTOR_INACTIVO"
  | "SIN_PERMISO_O_ALCANCE"
  | "CURSOS_REQUERIDOS_INCOMPLETOS"
  | "ROL_NO_EXIGIDO_POR_PERMISO"
  | "ROL_YA_FIRMADO"
  | "PERSONA_YA_FIRMO_OTRO_ROL"
  | "PIN_NO_ACTIVADO"
  | "PIN_BLOQUEADO"
  | "PIN_INCORRECTO"
  | "SEMAFORO_NO_VERDE"
  /** Cuenta administrativa de proveedor (sin colaborador ligado) que intenta firmar como responsable de la tarea. */
  | "CUENTA_SIN_COLABORADOR";

/** Resultado de verificar un PIN sin registrar una firma de rol. */
export type PinCheckResult =
  | "OK"
  | Extract<SignDenialReason, "PIN_NO_ACTIVADO" | "PIN_BLOQUEADO" | "PIN_INCORRECTO">;

export type SignDecision =
  | { allowed: true }
  | { allowed: false; reason: SignDenialReason };
