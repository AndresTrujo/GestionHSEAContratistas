import { createHash, randomUUID } from "node:crypto";
import { find_document_type, maxDocumentFileBytes, type DocumentTypeCode } from "@/config/documentos_contratista";
import type { ActorIdentity } from "@/domain/acceso";
import type {
  ContractorDocument,
  DocumentSubject,
  DocumentVersion,
  VersionContext,
} from "@/domain/contratistas";
import type { Session } from "@/lib/auth/sesion";
import { get_file_storage } from "@/lib/almacenamiento/almacenamiento";
import { detect_file_type } from "@/lib/almacenamiento/tipo_archivo";
import { NotFoundError, ValidationError } from "@/lib/data/errores";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { log_server_event } from "@/lib/registro/registro_servidor";

export interface UploadDocumentInput {
  subject: DocumentSubject;
  documentTypeCode: DocumentTypeCode;
  file: File;
  issueDate: string | null;
  expiryDate: string | null;
}

/** Nombre original del archivo, sin ruta ni caracteres de control y acotado (solo se muestra, no se usa como ruta). */
function clean_file_name(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120);
  return cleaned || "documento";
}

/**
 * Sube un documento: valida el contenido real del archivo (PDF/JPG/PNG por sus primeros bytes),
 * calcula su sha256 en el servidor, lo guarda con un nombre generado y registra la versión.
 * Si el registro falla, el archivo guardado se borra: no quedan archivos huérfanos.
 */
export async function upload_document(
  input: UploadDocumentInput,
  actor: ActorIdentity,
): Promise<{ document: ContractorDocument; version: DocumentVersion }> {
  const { file } = input;
  if (file.size <= 0) throw new ValidationError("Selecciona un archivo");
  if (file.size > maxDocumentFileBytes) {
    throw new ValidationError(`El archivo excede ${Math.floor(maxDocumentFileBytes / 1024 / 1024)} MB`);
  }

  const data = Buffer.from(await file.arrayBuffer());
  const detected = detect_file_type(data);
  if (!detected) throw new ValidationError("Formato no permitido: sube un PDF, JPG o PNG");

  const type = find_document_type(input.documentTypeCode);
  if (!type) throw new ValidationError(`Tipo de documento desconocido: ${input.documentTypeCode}`);

  const subjectFolder =
    input.subject.kind === "EMPLEADO_PROVEEDOR"
      ? `empleados/${input.subject.providerEmployeeId}`
      : input.subject.kind === "PROVEEDOR"
        ? `proveedores/${input.subject.providerId}`
        : `equipos/${input.subject.equipmentId}`;
  const storagePath = `documentos/${subjectFolder}/${type.code}/${randomUUID()}.${detected.extension}`;

  const storage = get_file_storage();
  await storage.save(storagePath, data);
  try {
    return await get_repositories().documents.upload_version(
      {
        subject: input.subject,
        documentTypeCode: type.code,
        fileName: clean_file_name(file.name),
        mimeType: detected.mimeType,
        sizeBytes: data.length,
        storagePath,
        sha256: createHash("sha256").update(data).digest("hex"),
        issueDate: input.issueDate,
        expiryDate: input.expiryDate,
      },
      actor,
    );
  } catch (error) {
    await storage.delete(storagePath);
    throw error;
  }
}

/**
 * Elimina manualmente el archivo de una versión; el registro, el hash y la revisión se conservan.
 * Primero el repositorio valida permisos y marca la versión (con auditoría); después se borra el archivo
 * físico. Si ese borrado falla, el archivo queda huérfano pero ya inaccesible desde la app.
 */
export async function delete_document_file(versionId: string, reason: string, actor: ActorIdentity): Promise<void> {
  const { documents } = get_repositories();
  const context = await documents.get_version(versionId);
  if (!context) throw new NotFoundError("Versión de documento", versionId);
  const storagePath = context.version.storagePath;
  await documents.delete_version_file(versionId, reason, actor);
  if (!storagePath) return;
  try {
    await get_file_storage().delete(storagePath);
  } catch (error) {
    await log_server_event("ERROR", "documentos", `No se pudo borrar el archivo físico de la versión ${versionId}`, {
      error,
      context: { versionId },
    });
  }
}

/**
 * ¿Puede esta sesión ver el archivo? Usuarios del proveedor dueño; empleados TFS con el permiso
 * de revisión del tipo de documento o con `contratistas:gestionar`.
 */
export async function can_access_document(session: Session, context: VersionContext): Promise<boolean> {
  if (session.kind === "USUARIO_PROVEEDOR") return session.providerId === context.providerId;

  const type = find_document_type(context.document.documentTypeCode);
  const { access } = get_repositories();
  if (type && (await access.has_permission(session.employeeNumber, type.reviewPermission))) return true;
  return access.has_permission(session.employeeNumber, "contratistas:gestionar");
}
