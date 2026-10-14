import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { FileStorage } from "./almacenamiento";

/** Guarda los archivos en una carpeta del disco (el Volume de Railway en producción). */
export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(directory: string) {
    this.root = resolve(directory);
  }

  /** Impide salir de la carpeta raíz (../, rutas absolutas) aunque la llave venga mal formada. */
  private resolve_path(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) {
      throw new Error("Ruta de archivo inválida");
    }
    return path;
  }

  async save(key: string, data: Buffer): Promise<void> {
    const path = this.resolve_path(key);
    await mkdir(dirname(path), { recursive: true });
    // flag "wx": nunca sobrescribe; cada versión es un archivo nuevo.
    await writeFile(path, data, { flag: "wx" });
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.resolve_path(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve_path(key), { force: true });
  }
}
