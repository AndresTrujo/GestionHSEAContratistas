/** Giros de contratista (espejo del catálogo `tipos_contratista` de esquema.sql). */
export const contractorTypes = [
  { code: "MANTENIMIENTO", label: "Mantenimiento" },
  { code: "REDES", label: "Redes" },
  { code: "OBRA_CIVIL", label: "Obra civil" },
  { code: "INFRAESTRUCTURA", label: "Infraestructura" },
] as const;

export type ContractorTypeCode = (typeof contractorTypes)[number]["code"];

export function find_contractor_type(code: string) {
  return contractorTypes.find((type) => type.code === code);
}
