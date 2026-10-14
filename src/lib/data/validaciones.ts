import { ValidationError } from "./errores";

/** Validaciones de formato compartidas por las implementaciones de datos (memoria y Railway). */
export const taxIdPattern = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
export const curpPattern = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;
export const nssPattern = /^\d{11}$/;
export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export const sha256Pattern = /^[0-9a-f]{64}$/;

export function require_text(value: string | null | undefined, label: string): string {
  const text = value?.trim() ?? "";
  if (!text) throw new ValidationError(`${label} es obligatorio`);
  return text;
}

export function optional_text(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text || null;
}

export function assert_valid_date(value: string | null, label: string): void {
  if (value !== null && (!datePattern.test(value) || Number.isNaN(Date.parse(value)))) {
    throw new ValidationError(`${label} debe tener formato AAAA-MM-DD`);
  }
}
