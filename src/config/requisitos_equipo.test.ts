import { describe, expect, it } from "vitest";
import { list_required_equipment_documents } from "@/config/documentos_contratista";
import { find_contractor_type, format_contractor_type, normalize_other_contractor_type } from "@/config/tipos_contratista";
import { equipmentTypes, find_equipment_type } from "@/config/tipos_equipo";

function codes(category: "EQUIPO" | "UNIDAD" | null): string[] {
  return list_required_equipment_documents(category)
    .map((type) => type.code)
    .sort();
}

describe("documentos obligatorios por categoría de equipo", () => {
  it("Equipos: certificado de operación segura y seguro", () => {
    expect(codes("EQUIPO")).toEqual(["CERT_OPERACION_SEGURA", "POLIZA_SEGURO"]);
  });

  it("Unidades: tarjeta de circulación, seguro y verificación", () => {
    expect(codes("UNIDAD")).toEqual(["POLIZA_SEGURO", "TARJETA_CIRCULACION", "VERIF_VEHICULAR"]);
  });

  it("un tipo fuera del catálogo solo exige el seguro", () => {
    expect(codes(null)).toEqual(["POLIZA_SEGURO"]);
  });

  it("los documentos retirados ya no se exigen a nadie", () => {
    for (const category of ["EQUIPO", "UNIDAD", null] as const) {
      expect(codes(category)).not.toContain("CERT_CALIDAD");
      expect(codes(category)).not.toContain("PROG_MANTENIMIENTO");
      expect(codes(category)).not.toContain("TENENCIA_VEHICULAR");
    }
  });
});

describe("catálogo de tipos de equipo", () => {
  it("3 equipos y 5 unidades", () => {
    expect(equipmentTypes.filter((type) => type.category === "EQUIPO")).toHaveLength(3);
    expect(equipmentTypes.filter((type) => type.category === "UNIDAD")).toHaveLength(5);
  });

  it("separa el vehículo Pickup del Sedán", () => {
    expect(find_equipment_type("VEHICULO_PICKUP")?.category).toBe("UNIDAD");
    expect(find_equipment_type("VEHICULO_SEDAN")?.category).toBe("UNIDAD");
  });
});

describe("giro 'Otro' del proveedor", () => {
  it("quita espacios al inicio y al final y capitaliza la primera letra", () => {
    expect(normalize_other_contractor_type("  mecánica industrial  ")).toBe("Mecánica industrial");
    expect(normalize_other_contractor_type("\tservicios de limpieza\n")).toBe("Servicios de limpieza");
  });

  it("no altera el resto del texto", () => {
    expect(normalize_other_contractor_type("tI y redes")).toBe("TI y redes");
  });

  it("devuelve vacío si no hay texto", () => {
    expect(normalize_other_contractor_type("   ")).toBe("");
    expect(normalize_other_contractor_type(null)).toBe("");
  });

  it("muestra el texto del proveedor junto a 'Otro'", () => {
    expect(find_contractor_type("OTRO")?.label).toBe("Otro");
    expect(format_contractor_type("OTRO", "Mecánica industrial")).toBe("Otro: Mecánica industrial");
    expect(format_contractor_type("REDES", null)).toBe("Redes");
  });
});
