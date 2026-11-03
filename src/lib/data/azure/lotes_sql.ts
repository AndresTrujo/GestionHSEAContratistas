/**
 * Divide un script T-SQL en lotes por las líneas `GO` (que no es SQL, sino un separador de herramientas):
 * CREATE FUNCTION/VIEW/TRIGGER/PROCEDURE deben ser la primera sentencia de su lote.
 */
export function split_sql_batches(script: string): string[] {
  const batches: string[] = [];
  let current: string[] = [];
  for (const line of script.split(/\r?\n/)) {
    if (/^\s*GO\s*(--.*)?$/i.test(line)) {
      if (current.join("").trim()) batches.push(current.join("\n"));
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.join("").trim()) batches.push(current.join("\n"));
  return batches;
}
