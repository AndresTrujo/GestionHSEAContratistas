import type { WorkPermit } from "@/domain/permisos";

/** Estructura del formato FO-0058 (Autorización de ingreso con teléfono celular). */
export const phoneSlug = "ingreso-telefono-celular";
export const phoneValidityMonths = 6;

/** Firmas que autorizan el oficio (las 3 obligatorias, personas distintas). */
export const phoneSignatures = [
  { key: "contractor", label: "Contratista" },
  { key: "requester", label: "Solicitante TFS" },
  { key: "hsea", label: "HSEA" },
] as const;

export function find_phone_signature(permit: WorkPermit, key: string) {
  return permit.signatures.find((signature) => signature.key === key);
}

/** La vigencia de 6 meses corre desde la última firma. */
export function get_phone_valid_until(permit: WorkPermit): Date | null {
  const times = phoneSignatures.map(
    (item) => find_phone_signature(permit, item.key)?.signedAt,
  );
  if (times.some((time) => !time)) return null;
  const lastSignedAt = (times as string[]).sort().at(-1);
  if (!lastSignedAt) return null;
  const validUntil = new Date(lastSignedAt);
  validUntil.setMonth(validUntil.getMonth() + phoneValidityMonths);
  return validUntil;
}
