/** Categorías de equipo motorizado: de ellas depende qué documentos se exigen (espejo de `tipos_equipo.categoria`). */
export const equipmentCategories = [
  { code: "EQUIPO", label: "Equipos" },
  { code: "UNIDAD", label: "Unidades" },
] as const;

export type EquipmentCategory = (typeof equipmentCategories)[number]["code"];

/** Tipos de equipo motorizado (espejo del catálogo `tipos_equipo` de esquema.sql). */
export const equipmentTypes = [
  { code: "GRUA", label: "Grúa", category: "EQUIPO" },
  { code: "MONTACARGAS", label: "Montacargas", category: "EQUIPO" },
  { code: "PLATAFORMA_AUTOELEVABLE", label: "Plataforma autoelevable", category: "EQUIPO" },
  { code: "VEHICULO_PICKUP", label: "Vehículo (Pickup)", category: "UNIDAD" },
  { code: "VEHICULO_SEDAN", label: "Vehículo (Sedán)", category: "UNIDAD" },
  { code: "CAMION", label: "Camión", category: "UNIDAD" },
  { code: "CAMION_DE_CARGA", label: "Camión de carga", category: "UNIDAD" },
  { code: "CAMIONETA_3_TONS", label: "Camioneta de 3 Tons", category: "UNIDAD" },
] as const;

export type EquipmentTypeCode = (typeof equipmentTypes)[number]["code"];

export function find_equipment_type(code: string) {
  return equipmentTypes.find((type) => type.code === code);
}

/** Nombre para mostrar; un tipo que ya no está en el catálogo (registros anteriores) se muestra tal cual. */
export function format_equipment_type(code: string): string {
  return find_equipment_type(code)?.label ?? code;
}
