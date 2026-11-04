/** Giros de contratista (espejo del catálogo `tipos_contratista` de esquema.sql). */
export const contractorTypes = [
  { code: "MANTENIMIENTO", label: "Mantenimiento" },
  { code: "REDES", label: "Redes" },
  { code: "OBRA_CIVIL", label: "Obra civil" },
  { code: "INFRAESTRUCTURA", label: "Infraestructura" },
  { code: "OTRO", label: "Otro" },
] as const;

export type ContractorTypeCode = (typeof contractorTypes)[number]["code"];

/** Giro "Otro": el proveedor lo describe con su propio texto (`proveedores.giro_otro`). */
export const otherContractorTypeCode: ContractorTypeCode = "OTRO";
export const maxOtherContractorTypeLength = 100;

export function find_contractor_type(code: string) {
  return contractorTypes.find((type) => type.code === code);
}

/** Limpia el giro escrito a mano: sin espacios al inicio ni al final y con la primera letra en mayúscula. */
export function normalize_other_contractor_type(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed.charAt(0).toLocaleUpperCase("es") + trimmed.slice(1);
}

/** Texto de un giro para mostrarlo: "Otro" lleva a continuación lo que el proveedor escribió. */
export function format_contractor_type(code: string, otherContractorType: string | null): string {
  const label = find_contractor_type(code)?.label ?? code;
  return code === otherContractorTypeCode && otherContractorType ? `${label}: ${otherContractorType}` : label;
}
