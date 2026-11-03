/**
 * Aplica a la BD de Azure SQL las migraciones pendientes de src/lib/data/azure/migraciones/*.sql,
 * en orden de nombre. Lleva el registro en la tabla `migraciones`; cada archivo corre en su propia
 * transacción y solo una vez. Un archivo puede traer varios lotes separados por líneas GO.
 *
 *   npm run db:migrar
 *
 * Una BD nueva se crea con esquema.sql (npm run db:cargar -- --esquema), que ya incluye todo lo anterior a
 * la primera migración. Requiere AZURE_SQL_CONNECTION_STRING.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { close_pool, get_db, with_transaction } from "../src/lib/data/azure/conexion";
import { split_sql_batches } from "../src/lib/data/azure/lotes_sql";

function load_env_file(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Sin .env.local: se usa lo que ya haya en el entorno.
  }
}

async function main(): Promise<void> {
  load_env_file();
  const directory = join(process.cwd(), "src/lib/data/azure/migraciones");
  const files = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();

  try {
    await get_db().query(
      `IF OBJECT_ID(N'dbo.migraciones', N'U') IS NULL
         CREATE TABLE dbo.migraciones (
           nombre      nvarchar(450) NOT NULL PRIMARY KEY,
           aplicada_en datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
         )`,
    );
    const applied = new Set(
      (await get_db().query<{ nombre: string }>(`SELECT nombre FROM migraciones`)).rows.map((row) => row.nombre),
    );

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(directory, file), "utf8");
      await with_transaction(async (db) => {
        for (const batch of split_sql_batches(sql)) await db.query(batch);
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
