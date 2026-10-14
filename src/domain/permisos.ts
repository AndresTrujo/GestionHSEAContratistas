import type { AuditMetadata } from "./auditoria";
import type { PermitArea } from "./organizacion";

export type PermitStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "closed";

/** Rol que debe firmar o intervenir en un formato. */
export type SignerRole =
  | "requester"
  | "executor"
  | "tfs_executor"
  | "operational_manager"
  | "medical_service"
  | "lookout"
  | "hsea"
  | "contractor"
  | "observer"
  | "observed"
  | "supervisor";

export interface PermitType {
  slug: string;
  /** Código del formato controlado (p. ej. FO-0060). */
  formCode: string;
  name: string;
  description: string;
  /** Vigencia en horas; null si no aplica o se rige por otra regla. */
  validityHours: number | null;
  /** Texto de vigencia tal como aparece en el formato. */
  validityNote: string;
  /** El formato incluye una lista de verificación previa a la autorización. */
  hasChecklist: boolean;
  signerRoles: SignerRole[];
}

/** Firma digital: número de empleado autenticado + momento exacto. */
export interface PermitSignature {
  /** Rol (SignerRole) o paso del formato (p. ej. "verification_1"). */
  key: string;
  employeeNumber: string;
  signedAt: string; // ISO 8601
  /** Trazo manuscrito como data URL PNG; null si la firma no se dibujó. */
  image: string | null;
}

export interface WorkPermit extends AuditMetadata {
  id: string;
  permitTypeSlug: string;
  status: PermitStatus;
  /** Número del empleado solicitante; vacío cuando lo solicita un usuario de proveedor. */
  requestedByEmployeeNumber: string;
  /** Usuario de proveedor solicitante (alternativo al empleado). */
  requestedByProviderUserId?: number | null;
  /** Proveedor asociado cuando el trabajo lo ejecuta un contratista. */
  providerId: string | null;
  /** Área del permiso (alcance de las firmas); opcional mientras los formatos capturen el área como texto. */
  area?: PermitArea | null;
  signatures: PermitSignature[];
  /** Campos propios de cada tipo de permiso. */
  fields: Record<string, string | number | boolean | null>;
}
