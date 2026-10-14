import { AdminForm } from "@/components/administracion/AdminForm";
import { inputClass, labelClass } from "@/components/administracion/estilos";
import { find_document_type } from "@/config/documentos_contratista";
import type { PermissionCode } from "@/config/permisos";
import type {
  DocumentReview,
  DocumentSubject,
  DocumentVersion,
  RequirementState,
  RequirementStatus,
} from "@/domain/contratistas";
import {
  delete_document_file_action,
  review_document_action,
  revoke_review_action,
  upload_document_action,
} from "@/lib/contratistas/acciones";
import { format_date } from "@/lib/administracion/etiquetas";

export interface DocumentHistory {
  versions: DocumentVersion[];
  reviews: DocumentReview[];
}

interface DocumentPanelProps {
  subject: DocumentSubject;
  requirements: RequirementState[];
  /** Historial por id de documento. */
  history: Record<string, DocumentHistory>;
  canUpload: boolean;
  /** Puede eliminar manualmente el archivo de una versión (el registro se conserva). */
  canDeleteFile?: boolean;
  /** Administración HSE: puede revocar una aprobación (error humano). */
  canRevoke?: boolean;
  /** Permisos del empleado que mira la página: según ellos puede aprobar o rechazar cada tipo de documento. */
  reviewerPermissions?: PermissionCode[];
  /** Ruta a revalidar tras subir. */
  returnPath: string;
}

/** Estado de cada requisito: el texto y un símbolo acompañan al color para no depender solo de él. */
const statusLabels: Record<RequirementStatus, { label: string; symbol: string; className: string }> = {
  FALTANTE: { label: "Falta", symbol: "!", className: "bg-red-50 text-red-800 ring-red-300" },
  EN_REVISION: { label: "En revisión", symbol: "…", className: "bg-yellow-50 text-yellow-900 ring-yellow-400" },
  APROBADO: { label: "Aprobado", symbol: "✓", className: "bg-green-50 text-green-900 ring-brand-green" },
  RECHAZADO: { label: "Rechazado", symbol: "✕", className: "bg-red-50 text-red-800 ring-red-300" },
  REVOCADO: { label: "Aprobación revocada", symbol: "✕", className: "bg-red-50 text-red-800 ring-red-300" },
  VENCIDO: { label: "Vencido", symbol: "!", className: "bg-red-50 text-red-800 ring-red-300" },
};

/** Requisitos documentales de un colaborador o equipo, con su historial de versiones y la carga de archivos. */
export function DocumentPanel({
  subject,
  requirements,
  history,
  canUpload,
  canDeleteFile = false,
  canRevoke = false,
  reviewerPermissions = [],
  returnPath,
}: DocumentPanelProps) {
  const subjectId =
    subject.kind === "EQUIPO"
      ? subject.equipmentId
      : subject.kind === "PROVEEDOR"
        ? subject.providerId
        : subject.providerEmployeeId;

  return (
    <div className="space-y-4">
      {requirements.map((requirement) => {
        const type = find_document_type(requirement.documentTypeCode);
        const status = statusLabels[requirement.status];
        const documentHistory = requirement.documentId ? history[requirement.documentId] : undefined;
        const latestVersionId = documentHistory?.versions.at(-1)?.id;

        return (
          <article key={requirement.documentTypeCode} className="rounded-xl border border-neutral-light bg-white p-4 shadow-sm">
            <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg leading-tight">{type?.label ?? requirement.documentTypeCode}</h3>
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${status.className}`}>
                  <span aria-hidden="true">{status.symbol}</span>
                  {status.label}
                </span>
                {requirement.validUntil && (
                  <span className="text-xs text-neutral-dark">vigente hasta {format_date(requirement.validUntil)}</span>
                )}
              </p>
            </header>

            {documentHistory && documentHistory.versions.length > 0 && (
              <ul className="mb-3 divide-y divide-neutral-light/70 rounded-lg border border-neutral-light/70 text-sm [&>li]:px-3 [&>li]:py-2">
                {[...documentHistory.versions].reverse().map((version) => {
                  const review = documentHistory.reviews.find((item) => item.versionId === version.id);
                  return (
                    <li key={version.id}>
                      <span className="font-bold">v{version.versionNumber}</span> · {version.fileName} · subido{" "}
                      {format_date(version.uploadedAt)}
                      {version.storagePath !== null ? (
                        <>
                          {" · "}
                          <a href={`/api/documentos/${version.id}`} target="_blank" rel="noreferrer" className="font-bold text-brand-navy underline">
                            Ver archivo
                          </a>
                        </>
                      ) : (
                        <span className="text-neutral-dark"> · archivo eliminado ({format_date(version.fileDeletedAt)}); se conserva su registro</span>
                      )}
                      <span className="block text-xs text-neutral-dark">
                        {review
                          ? `${review.result === "APROBADO" ? "Aprobado" : "Rechazado"} el ${format_date(review.reviewedAt)} por ${review.reviewerEmployeeNumber}${review.reason ? ` — ${review.reason}` : ""}`
                          : "Pendiente de revisión"}
                      </span>
                      {!review && version.id === latestVersionId && type && reviewerPermissions.includes(type.reviewPermission) && (
                        <div className="mt-2 grid gap-3 sm:grid-cols-2">
                          <AdminForm action={review_document_action} submitLabel="Aprobar">
                            <input type="hidden" name="versionId" value={version.id} />
                            <input type="hidden" name="result" value="APROBADO" />
                            <input type="hidden" name="returnPath" value={returnPath} />
                            <input name="reason" placeholder="Comentario (opcional)" className={inputClass} />
                          </AdminForm>
                          <AdminForm action={review_document_action} submitLabel="Rechazar" variant="danger">
                            <input type="hidden" name="versionId" value={version.id} />
                            <input type="hidden" name="result" value="RECHAZADO" />
                            <input type="hidden" name="returnPath" value={returnPath} />
                            <input name="reason" placeholder="Motivo del rechazo (obligatorio)" required className={inputClass} />
                          </AdminForm>
                        </div>
                      )}
                      {canDeleteFile && version.storagePath !== null && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs font-bold text-red-700 underline">Eliminar archivo</summary>
                          <AdminForm action={delete_document_file_action} submitLabel="Eliminar archivo" variant="danger" className="mt-2 space-y-2">
                            <input type="hidden" name="versionId" value={version.id} />
                            <input type="hidden" name="returnPath" value={returnPath} />
                            <p className="text-xs text-neutral-dark">
                              Se borra el archivo de forma definitiva. Se conservan el registro, su huella (sha256) y la revisión
                              para trazabilidad; la eliminación queda en la bitácora de auditoría.
                            </p>
                            <input name="reason" placeholder="Motivo (obligatorio)" required className={inputClass} />
                          </AdminForm>
                        </details>
                      )}
                      {review?.revocation && (
                        <span className="block text-xs font-bold text-red-700">
                          Aprobación revocada el {format_date(review.revocation.revokedAt)} por {review.revocation.revokedByEmployeeNumber} —{" "}
                          {review.revocation.reason}
                        </span>
                      )}
                      {canRevoke && review?.result === "APROBADO" && !review.revocation && version.id === latestVersionId && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs font-bold text-red-700 underline">Revocar aprobación</summary>
                          <AdminForm action={revoke_review_action} submitLabel="Revocar aprobación" variant="danger" className="mt-2 space-y-2">
                            <input type="hidden" name="versionId" value={version.id} />
                            <input type="hidden" name="returnPath" value={returnPath} />
                            <p className="text-xs text-neutral-dark">
                              Úsalo solo si la aprobación fue un error. El documento queda sin vigencia, el semáforo pasa a rojo y el
                              proveedor debe subir uno nuevo. La revisión original se conserva en el historial.
                            </p>
                            <input name="reason" placeholder="Motivo (obligatorio)" required className={inputClass} />
                          </AdminForm>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {canUpload && (
              <details>
                <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-brand-navy px-4 text-sm font-bold text-brand-navy hover:bg-neutral-light/40 sm:min-h-10">
                  {requirement.status === "FALTANTE" ? "Subir documento" : "Subir una versión nueva"}
                </summary>
                <AdminForm action={upload_document_action} submitLabel="Subir" className="mt-3 grid gap-3 sm:grid-cols-3">
                  <input type="hidden" name="subjectKind" value={subject.kind} />
                  <input type="hidden" name="subjectId" value={subjectId} />
                  <input type="hidden" name="documentTypeCode" value={requirement.documentTypeCode} />
                  <input type="hidden" name="returnPath" value={returnPath} />
                  <div className="sm:col-span-3">
                    <label htmlFor={`file-${requirement.documentTypeCode}`} className={labelClass}>
                      Archivo (PDF, JPG o PNG, máx. 10 MB)
                    </label>
                    <input
                      id={`file-${requirement.documentTypeCode}`}
                      name="file"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      required
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor={`issue-${requirement.documentTypeCode}`} className={labelClass}>
                      Fecha de emisión{type?.validityMonths ? " (obligatoria)" : ""}
                    </label>
                    <input
                      id={`issue-${requirement.documentTypeCode}`}
                      name="issueDate"
                      type="date"
                      required={Boolean(type?.validityMonths)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor={`expiry-${requirement.documentTypeCode}`} className={labelClass}>
                      Vencimiento (si lo trae)
                    </label>
                    <input id={`expiry-${requirement.documentTypeCode}`} name="expiryDate" type="date" className={inputClass} />
                  </div>
                  {type?.validityMonths ? (
                    <p className="self-end text-xs text-neutral-dark">Vigencia de {type.validityMonths} meses desde la emisión.</p>
                  ) : null}
                </AdminForm>
              </details>
            )}
          </article>
        );
      })}
    </div>
  );
}
