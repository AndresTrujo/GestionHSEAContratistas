import { describe, expect, it } from "vitest";
import type { WorkPermit } from "@/domain/permisos";
import { apply_permit_filters, parse_permit_filters } from "./busqueda";

function make_permit(folio: string, fields: WorkPermit["fields"], createdAt = "2026-10-05T15:00:00.000Z"): WorkPermit {
  return {
    id: folio,
    permitTypeSlug: "trabajos-calientes",
    status: "submitted",
    requestedByEmployeeNumber: "204692",
    providerId: null,
    signatures: [],
    fields: { folio, ...fields },
    createdAt,
    createdBy: "204692",
    updatedAt: createdAt,
    updatedBy: "204692",
  };
}

const permits = [
  make_permit("TC-2026-0001", { date: "2026-10-05", requesterName: "Juan Pérez", executor1: "Luis Gómez" }),
  make_permit("TC-2026-0002", { date: "2026-10-04", requesterName: "Ana Ruiz" }),
  make_permit("TC-2026-0003", { date: "2026-09-01", requesterName: "Ana Ruiz", executor1: "Pedro Soto" }),
];

describe("parse_permit_filters", () => {
  it("sin parámetros el filtro predeterminado es hoy", () => {
    const filters = parse_permit_filters({});
    expect(filters.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(filters.to).toBe(filters.from);
    expect(filters.query).toBe("");
  });

  it("con las fechas vacías enviadas por el formulario no hay límite de fechas", () => {
    const filters = parse_permit_filters({ desde: "", hasta: "", q: "" });
    expect(filters.from).toBe("");
    expect(filters.to).toBe("");
  });

  it("descarta fechas con formato inválido", () => {
    expect(parse_permit_filters({ desde: "ayer" }).from).toBe("");
  });
});

describe("apply_permit_filters", () => {
  it("filtra por rango de fechas del permiso", () => {
    const result = apply_permit_filters(permits, { query: "", from: "2026-10-04", to: "2026-10-05" });
    expect(result.map((permit) => permit.id)).toEqual(["TC-2026-0001", "TC-2026-0002"]);
  });

  it("busca por folio", () => {
    const result = apply_permit_filters(permits, { query: "0003", from: "", to: "" });
    expect(result.map((permit) => permit.id)).toEqual(["TC-2026-0003"]);
  });

  it("busca por nombre del solicitante o de un ejecutante, sin importar mayúsculas", () => {
    expect(apply_permit_filters(permits, { query: "ana ruiz", from: "", to: "" })).toHaveLength(2);
    expect(apply_permit_filters(permits, { query: "LUIS", from: "", to: "" }).map((permit) => permit.id)).toEqual(["TC-2026-0001"]);
  });

  it("combina búsqueda y fechas", () => {
    const result = apply_permit_filters(permits, { query: "ana", from: "2026-10-05", to: "2026-10-05" });
    expect(result).toHaveLength(0);
  });
});
