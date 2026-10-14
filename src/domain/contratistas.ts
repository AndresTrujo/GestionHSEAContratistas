import type { ActorId, AuditMetadata } from "./auditoria";
import type { ContractorTypeCode } from "@/config/tipos_contratista";
import type {
  DocumentSubjectKind,
  DocumentTypeCode,
  WorkTypeCode,
} from "@/config/documentos_contratista";

/**
 * Contratistas (tablas proveedores, usuarios_proveedor, empleados_proveedor,
 * equipos_proveedor, documentos_contratista, versiones_documento,
 * revisiones_documento, registros_ingreso, permiso_participantes).
 * Los ids serial de la BD son number; los bigserial, string.
 */
export type ProviderStatus = "PENDIENTE_VALIDACION" | "ACTIVO" | "SUSPENDIDO";

export interface Provider extends AuditMetadata {
  id: number;
  name: string;
  taxId: string; // RFC
  imssEmployerRegistration: string | null;
  contactEmail: string;
  phone: string | null;
  status: ProviderStatus;
  /** Giros del contratista; puede tener varios. */
  contractorTypes: ContractorTypeCode[];
}

/** Cuenta de acceso de proveedor. El hash de la contraseña nunca sale de la capa de datos. */
export interface ProviderUser extends AuditMetadata {
  id: number;
  providerId: number;
  /** Colaborador al que pertenece la cuenta, si aplica (p. ej. responsable de la tarea). */
  providerEmployeeId: number | null;
  name: string;
  /** 8 caracteres: ver build_provider_username. */
  username: string;
  email: string | null;
  isAdministrator: boolean;
  active: boolean;
  mustChangePassword: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
}

export interface ProviderEmployee extends AuditMetadata {
  id: number;
  providerId: number;
  firstName: string;
  middleName: string | null;
  paternalSurname: string;
  maternalSurname: string | null;
  /** Huella (HMAC) de la CURP, no el valor: ver lib/data/huella_pii.ts. */
  curp: string;
  /** Huella (HMAC) del NSS, no el valor. */
  nss: string;
  jobTitle: string;
  active: boolean;
  terminationDate: string | null;
  /** Trabajos específicos declarados (cada uno exige su DC-3). */
  workTypes: WorkTypeCode[];
}

export interface ProviderEquipment extends AuditMetadata {
  id: number;
  providerId: number;
  equipmentType: string; // 'GRUA', 'MONTACARGAS', ...
  description: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  plates: string | null;
  active: boolean;
}

/** A quién pertenece un documento: un colaborador, un equipo o el proveedor mismo (persona moral). */
export type DocumentSubject =
  | { kind: Extract<DocumentSubjectKind, "EMPLEADO_PROVEEDOR">; providerEmployeeId: number }
  | { kind: Extract<DocumentSubjectKind, "EQUIPO">; equipmentId: number }
  | { kind: Extract<DocumentSubjectKind, "PROVEEDOR">; providerId: number };

/** Expediente de un tipo de documento de un sujeto; las versiones cuelgan de él. */
export interface ContractorDocument {
  id: string;
  subject: DocumentSubject;
  documentTypeCode: DocumentTypeCode;
  createdAt: string;
  createdBy: ActorId;
}

/** Versión inmutable; solo cambia al eliminar manualmente su archivo. */
export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** null una vez purgado el archivo; el registro y el hash se conservan. */
  storagePath: string | null;
  fileDeletedAt: string | null;
  sha256: string;
  issueDate: string | null; // YYYY-MM-DD
  expiryDate: string | null;
  uploadedBy: ActorId;
  uploadedAt: string;
}

/** Fotografía de un colaborador (pantalla de acceso a planta). Una nueva no borra la anterior; el archivo puede eliminarse a mano. */
export interface EmployeePhoto {
  id: string;
  providerEmployeeId: number;
  fileName: string;
  mimeType: "image/jpeg" | "image/png";
  sizeBytes: number;
  /** null una vez eliminado el archivo; el registro y el hash se conservan. */
  storagePath: string | null;
  fileDeletedAt: string | null;
  sha256: string;
  uploadedBy: ActorId;
  uploadedAt: string;
}

export interface NewEmployeePhotoInput {
  fileName: string;
  mimeType: EmployeePhoto["mimeType"];
  sizeBytes: number;
  storagePath: string;
  sha256: string;
}

export type ReviewResult = "APROBADO" | "RECHAZADO";

/** Anulación de una aprobación por error humano; la revisión original se conserva intacta. */
export interface DocumentRevocation {
  revokedAt: string;
  revokedByEmployeeNumber: string;
  reason: string;
}

export interface DocumentReview {
  id: string;
  versionId: string;
  result: ReviewResult;
  reviewerEmployeeNumber: string;
  reason: string | null;
  reviewedAt: string;
  /** Solo una revisión APROBADO puede revocarse. */
  revocation: DocumentRevocation | null;
}

/** Estado vigente de un documento (última versión + su revisión). REVOCADO cuenta como faltante (ROJO). */
export type DocumentStatus = "EN_REVISION" | "APROBADO" | "RECHAZADO" | "REVOCADO" | "VENCIDO";

/** Estado de un requisito; FALTANTE = aún no hay documento. */
export type RequirementStatus = DocumentStatus | "FALTANTE";

export interface RequirementState {
  documentTypeCode: DocumentTypeCode;
  status: RequirementStatus;
  documentId: string | null;
  versionId: string | null;
  validUntil: string | null;
}

/** ROJO: falta/rechazado/vencido. AMARILLO: todo cargado, en revisión. VERDE: puede entrar a planta. */
export type Semaphore = "ROJO" | "AMARILLO" | "VERDE";

export interface SubjectSemaphore {
  subject: DocumentSubject;
  semaphore: Semaphore;
  requirements: RequirementState[];
}

/** Documento pendiente de revisión, para la bandeja de quien revisa. */
export interface PendingReview {
  document: ContractorDocument;
  version: DocumentVersion;
  providerId: number;
}

/** Una versión con su expediente y el proveedor dueño (para autorizar su descarga). */
export interface VersionContext {
  document: ContractorDocument;
  version: DocumentVersion;
  providerId: number;
}

export type EntryResult = "PERMITIDO" | "DENEGADO";

/** Bitácora histórica de ingresos a planta; solo se completa la salida. */
export interface EntryRecord {
  id: string;
  providerEmployeeId: number;
  enteredAt: string;
  result: EntryResult;
  semaphoreAtEntry: Semaphore;
  eppComplete: boolean;
  notes: string | null;
  denialReason: string | null;
  permitId: string | null;
  registeredByEmployeeNumber: string;
  exitedAt: string | null;
  exitRegisteredByEmployeeNumber: string | null;
}

/** Quién participa en un permiso: empleado TFS o colaborador de un proveedor. */
export type ParticipantRef =
  | { kind: "EMPLEADO"; employeeNumber: string }
  | { kind: "EMPLEADO_PROVEEDOR"; providerEmployeeId: number };

export interface PermitParticipant {
  id: string;
  permitId: string;
  /** Función en el permiso, p. ej. "executor". */
  role: string;
  position: number;
  participant: ParticipantRef;
  /** Nombre al momento de registrarlo. */
  registeredName: string;
  createdAt: string;
  createdBy: ActorId;
  removedAt: string | null;
}

/* ---- Entradas de los repositorios ---- */

export interface RegisterProviderInput {
  name: string;
  taxId: string;
  imssEmployerRegistration: string | null;
  contactEmail: string;
  phone: string | null;
  contractorTypes: ContractorTypeCode[];
}

export interface CreateProviderUserInput {
  providerId: number;
  firstName: string;
  paternalSurname: string;
  maternalSurname: string | null;
  providerEmployeeId: number | null;
  email: string | null;
  isAdministrator: boolean;
}

/** La contraseña temporal se entrega una sola vez; se obliga a cambiarla al entrar. */
export interface CreatedProviderUser {
  user: ProviderUser;
  temporaryPassword: string;
}

export type ProviderLoginResult =
  | { ok: true; user: ProviderUser }
  | {
      ok: false;
      reason:
        | "CREDENCIALES_INVALIDAS"
        | "USUARIO_INACTIVO"
        | "USUARIO_BLOQUEADO"
        | "PROVEEDOR_SUSPENDIDO";
    };

export interface NewProviderEmployeeInput {
  firstName: string;
  middleName: string | null;
  paternalSurname: string;
  maternalSurname: string | null;
  curp: string;
  nss: string;
  jobTitle: string;
  workTypes?: WorkTypeCode[];
}

/** Carga masiva: cada renglón se valida por separado; los rechazados traen el motivo. */
export interface ImportEmployeesResult {
  created: ProviderEmployee[];
  rejected: { row: number; reason: string }[];
}

export interface NewEquipmentInput {
  equipmentType: string;
  description: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  plates: string | null;
}

/** El archivo ya está en el almacenamiento; aquí solo su metadata (ruta y hash). */
export interface UploadVersionInput {
  subject: DocumentSubject;
  documentTypeCode: DocumentTypeCode;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  sha256: string;
  issueDate: string | null;
  expiryDate: string | null;
}

export interface ReviewVersionInput {
  versionId: string;
  result: ReviewResult;
  /** Obligatorio al rechazar. */
  reason: string | null;
}

export interface RegisterEntryInput {
  providerEmployeeId: number;
  /** Verificación física del EPP completo en la puerta. */
  eppComplete: boolean;
  notes: string | null;
  permitId?: string | null;
}

export interface AddParticipantInput {
  permitId: string;
  role: string;
  position?: number;
  participant: ParticipantRef;
}
