import { LocalFileStorage } from "./archivos_locales";

/**
 * Almacenamiento de los archivos subidos (documentos de contratistas). Hoy vive en una carpeta
 * (en Railway, un Volume); para pasar a otro lugar (p. ej. SharePoint) solo hay que escribir otra
 * implementación de esta interfaz. Las llaves son rutas relativas generadas por el sistema.
 */
export interface FileStorage {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  /** Idempotente: borrar un archivo que ya no existe no es error. */
  delete(key: string): Promise<void>;
}

const globalStorage = globalThis as typeof globalThis & { fileStorage?: FileStorage };

/** Carpeta de archivos: STORAGE_DIR (obligatoria en producción) o ./almacenamiento_local en desarrollo. */
export function get_file_storage(): FileStorage {
  if (!globalStorage.fileStorage) {
    const directory = process.env.STORAGE_DIR;
    if (!directory && process.env.NODE_ENV === "production") {
      throw new Error("STORAGE_DIR es obligatoria en producción (carpeta del Volume de Railway)");
    }
    globalStorage.fileStorage = new LocalFileStorage(directory || "./almacenamiento_local");
  }
  return globalStorage.fileStorage;
}
