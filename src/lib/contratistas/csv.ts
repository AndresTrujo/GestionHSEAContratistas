import type { WorkTypeCode } from "@/config/documentos_contratista";
import type { NewProviderEmployeeInput } from "@/domain/contratistas";

export const maxImportRows = 500;

/** CSV con comillas ("a,b"), comillas escapadas ("") y separador coma o punto y coma (Excel en español). */
export function parse_csv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < clean.length; index += 1) {
    const char = clean.charAt(index);
    if (inQuotes) {
      if (char === '"' && clean.charAt(index + 1) === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && clean.charAt(index + 1) === "\n") index += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function normalize_header(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Encabezados aceptados (sin acentos ni mayúsculas) para cada campo. */
const headerAliases: Record<string, string[]> = {
  firstName: ["nombre", "primer_nombre", "nombres"],
  middleName: ["segundo_nombre"],
  paternalSurname: ["apellido_paterno", "paterno"],
  maternalSurname: ["apellido_materno", "materno"],
  curp: ["curp"],
  nss: ["nss", "numero_de_seguro_social", "imss"],
  jobTitle: ["puesto", "cargo"],
  workTypes: ["trabajos", "trabajos_especificos", "trabajos_especiales"],
};

export interface ParsedEmployees {
  rows: NewProviderEmployeeInput[];
  /** Problemas de formato del archivo completo (no de un renglón). */
  error: string | null;
}

/** Convierte el CSV en altas de colaboradores. Columnas: nombre, segundo_nombre, apellido_paterno, apellido_materno, curp, nss, puesto, trabajos (opcional: CALIENTES, ALTURAS, CONFINADOS separados por espacio, | o ;). */
export function parse_employees_csv(text: string): ParsedEmployees {
  const table = parse_csv(text);
  const header = table[0];
  if (!header) return { rows: [], error: "El archivo está vacío" };

  const columns = header.map(normalize_header);
  const find_column = (field: string): number =>
    columns.findIndex((name) => (headerAliases[field] ?? []).includes(name));
  const indexes = Object.fromEntries(Object.keys(headerAliases).map((field) => [field, find_column(field)]));

  const missing = ["firstName", "paternalSurname", "curp", "nss", "jobTitle"].filter((field) => (indexes[field] ?? -1) < 0);
  if (missing.length > 0) {
    return {
      rows: [],
      error: "Faltan columnas: el encabezado debe incluir nombre, apellido_paterno, curp, nss y puesto.",
    };
  }
  if (table.length - 1 > maxImportRows) {
    return { rows: [], error: `El archivo tiene más de ${maxImportRows} renglones; divídelo en partes.` };
  }

  const cell = (row: string[], field: string): string => {
    const index = indexes[field] ?? -1;
    return index >= 0 ? (row[index] ?? "").trim() : "";
  };

  const rows = table.slice(1).map((row): NewProviderEmployeeInput => {
    const workTypes = cell(row, "workTypes")
      .toUpperCase()
      .split(/[\s|;]+/)
      .filter(Boolean);
    return {
      firstName: cell(row, "firstName"),
      middleName: cell(row, "middleName") || null,
      paternalSurname: cell(row, "paternalSurname"),
      maternalSurname: cell(row, "maternalSurname") || null,
      curp: cell(row, "curp"),
      nss: cell(row, "nss"),
      jobTitle: cell(row, "jobTitle"),
      // Un trabajo desconocido se deja pasar tal cual para que el alta lo rechace con su mensaje.
      workTypes: workTypes as WorkTypeCode[],
    };
  });
  return { rows, error: null };
}
