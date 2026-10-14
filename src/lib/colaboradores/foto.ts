import { createHash, randomUUID } from "node:crypto";
import type { ActorIdentity } from "@/domain/acceso";
import type { EmployeePhoto } from "@/domain/contratistas";
import { get_file_storage } from "@/lib/almacenamiento/almacenamiento";
import { detect_file_type } from "@/lib/almacenamiento/tipo_archivo";
import { ValidationError } from "@/lib/data/errores";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { log_server_event } from "@/lib/registro/registro_servidor";

export const maxPhotoBytes = 5 * 1024 * 1024;

/**
 * Sube la fotografía de un colaborador: valida por contenido que sea JPG o PNG, calcula el sha256 en el
 * servidor y la guarda con un nombre generado. Si el registro falla, el archivo se borra (sin huérfanos).
 */
export async function upload_employee_photo(
  employeeId: number,
  file: File,
  actor: ActorIdentity,
): Promise<EmployeePhoto> {
  if (file.size <= 0) throw new ValidationError("Selecciona una fotografía");
  if (file.size > maxPhotoBytes) throw new ValidationError(`La fotografía excede ${maxPhotoBytes / 1024 / 1024} MB`);

  const data = Buffer.from(await file.arrayBuffer());
  const detected = detect_file_type(data);
  if (!detected || detected.mimeType === "application/pdf") {
    throw new ValidationError("Formato no permitido: sube una imagen JPG o PNG");
  }

  const storagePath = `fotos/empleados/${employeeId}/${randomUUID()}.${detected.extension}`;
  const storage = get_file_storage();
  await storage.save(storagePath, data);
  try {
    return await get_repositories().providerEmployees.add_photo(
      employeeId,
      {
        fileName: (file.name.split(/[\\/]/).pop() ?? "foto").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120) || "foto",
        mimeType: detected.mimeType,
        sizeBytes: data.length,
        storagePath,
        sha256: createHash("sha256").update(data).digest("hex"),
      },
      actor,
    );
  } catch (error) {
    await storage.delete(storagePath);
    throw error;
  }
}

/**
 * Elimina la fotografía vigente. Primero el repositorio valida permisos y marca el registro (con auditoría);
 * después se borra el archivo físico.
 */
export async function delete_employee_photo(employeeId: number, reason: string, actor: ActorIdentity): Promise<void> {
  const { providerEmployees } = get_repositories();
  const current = await providerEmployees.get_current_photo(employeeId);
  await providerEmployees.delete_current_photo(employeeId, reason, actor);
  if (!current?.storagePath) return;
  try {
    await get_file_storage().delete(current.storagePath);
  } catch (error) {
    await log_server_event("ERROR", "documentos", `No se pudo borrar el archivo físico de la foto ${current.id}`, {
      error,
      context: { photoId: current.id },
    });
  }
}
