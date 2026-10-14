/**
 * Convierte a huella (HMAC) las CURP y NSS que aún estén guardados en claro en `empleados_proveedor`.
 * Es idempotente: lo que ya es una huella (64 hex) se omite. Requiere DATABASE_URL y PII_HASH_KEY.
 *
 *   npm run db:hashear_pii
 *
 * Correrlo una vez, después de desplegar la versión que guarda huellas; antes de eso, hacer un respaldo.
 * Un valor en claro con formato inválido se reporta y se deja como está.
 */
import { close_pool, get_db, with_transaction } from "../src/lib/data/railway/conexion";
import { hash_pii, is_pii_hash } from "../src/lib/data/huella_pii";
import { curpPattern, nssPattern } from "../src/lib/data/validaciones";

function load_env_file(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Sin .env.local: se usa lo que ya haya en el entorno.
  }
}

interface EmployeeIdentityRow {
  id: number;
  curp: string;
  nss: string;
}

async function main(): Promise<void> {
  load_env_file();
  if (!process.env.PII_HASH_KEY || process.env.PII_HASH_KEY.length < 32) {
    throw new Error("Define PII_HASH_KEY (mínimo 32 caracteres) antes de correr este script.");
  }

  try {
    const { rows } = await get_db().query<EmployeeIdentityRow>(`SELECT id, curp, nss FROM empleados_proveedor ORDER BY id`);
    let converted = 0;
    let skipped = 0;
    await with_transaction(async (db) => {
      for (const row of rows) {
        const curp = row.curp.trim().toUpperCase();
        const nss = row.nss.replace(/\s+/g, "");
        const curpValue = is_pii_hash(row.curp) ? row.curp : curpPattern.test(curp) ? hash_pii("curp", curp) : null;
        const nssValue = is_pii_hash(row.nss) ? row.nss : nssPattern.test(nss) ? hash_pii("nss", nss) : null;
        if (curpValue === null || nssValue === null) {
          console.warn(`Colaborador ${row.id}: CURP o NSS con formato inválido; se deja sin convertir.`);
          skipped += 1;
          continue;
        }
        if (curpValue === row.curp && nssValue === row.nss) continue;
        await db.query(`UPDATE empleados_proveedor SET curp = $2, nss = $3, actualizado_en = now() WHERE id = $1`, [
          row.id,
          curpValue,
          nssValue,
        ]);
        converted += 1;
      }
    });
    console.log(`Colaboradores convertidos: ${converted}. Omitidos por formato inválido: ${skipped}.`);
  } finally {
    await close_pool();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
