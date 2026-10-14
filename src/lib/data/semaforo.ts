import type { DocumentTypeDefinition } from "@/config/documentos_contratista";
import type {
  DocumentReview,
  DocumentStatus,
  DocumentVersion,
  ProviderStatus,
  RequirementStatus,
  Semaphore,
} from "@/domain/contratistas";
import { add_months_to_date, get_date_mx } from "./identidad";

/**
 * Misma lógica que v_documentos_estado / v_semaforo_* en esquema.sql: el semáforo
 * no se guarda, se calcula, para que un documento vencido regrese solo a ROJO.
 */

/** La fecha más próxima entre el vencimiento de la versión y emisión + vigencia del tipo. */
export function resolve_valid_until(
  type: DocumentTypeDefinition,
  version: Pick<DocumentVersion, "issueDate" | "expiryDate" | "uploadedAt">,
): string | null {
  const dates: string[] = [];
  if (version.expiryDate) dates.push(version.expiryDate);
  if (type.validityMonths !== null) {
    const base = version.issueDate ?? get_date_mx(version.uploadedAt);
    dates.push(add_months_to_date(base, type.validityMonths));
  }
  return dates.length === 0 ? null : dates.sort()[0] ?? null;
}

export function resolve_document_status(
  validUntil: string | null,
  review: DocumentReview | undefined,
  today: string,
): DocumentStatus {
  if (review?.revocation) return "REVOCADO";
  if (review?.result === "RECHAZADO") return "RECHAZADO";
  if (validUntil !== null && validUntil < today) return "VENCIDO";
  if (review?.result === "APROBADO") return "APROBADO";
  return "EN_REVISION";
}

export function compute_semaphore(
  statuses: RequirementStatus[],
  providerStatus: ProviderStatus,
): Semaphore {
  if (providerStatus !== "ACTIVO") return "ROJO";
  if (statuses.some((s) => s === "FALTANTE" || s === "RECHAZADO" || s === "REVOCADO" || s === "VENCIDO")) return "ROJO";
  if (statuses.length > 0 && statuses.every((s) => s === "APROBADO")) return "VERDE";
  return "AMARILLO";
}
