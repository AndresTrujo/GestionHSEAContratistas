/**
 * Aplica a la BD de Railway las migraciones pendientes de src/lib/data/railway/migraciones/*.sql,
 * en orden de nombre. Lleva el registro en la tabla `migraciones`; cada archivo corre en su propia
 * transacción y solo una vez.
 *
 *   npm run db:migrar
 *
 * Una BD nueva se crea con esquema.sql (ya incluye todo): las migraciones son idempotentes, así que
 * aplicarlas después no daña nada. Requiere DATABASE_URL (y DATABASE_SSL=true con la URL pública).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { close_pool, get_db, with_transaction } from "../src/lib/data/railway/conexion";

function load_env_file(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Sin .env.local: se usa lo que ya haya en el entorno.
  }
}

async function main(): Promise<void> {
  load_env_file();
  const directory = join(process.cwd(), "src/lib/data/railway/migraciones");
  const files = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();

  try {
    await get_db().query(
      `CREATE TABLE IF NOT EXISTS migraciones (nombre text PRIMARY KEY, aplicada_en timestamptz NOT NULL DEFAULT now())`,
    );
    const applied = new Set(
      (await get_db().query<{ nombre: string }>(`SELECT nombre FROM migraciones`)).rows.map((row) => row.nombre),
    );

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(directory, file), "utf8");
      await with_transaction(async (db) => {
        await db.query(sql);
        await db.query(`INSERT INTO migraciones (nombre) VALUES ($1)`, [file]);
      });
      console.log(`Aplicada: ${file}`);
      count += 1;
    }
    console.log(count === 0 ? "No hay migraciones pendientes." : `Migraciones aplicadas: ${count}.`);
  } finally {
    await close_pool();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
