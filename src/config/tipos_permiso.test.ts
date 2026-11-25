import { describe, expect, it } from "vitest";
import type { WorkPermit } from "@/domain/permisos";
import { is_next_approval_signature } from "./tipos_permiso";

function make_permit(
  permitTypeSlug: string,
  signatures: WorkPermit["signatures"] = [],
): WorkPermit {
  return {
    id: "test-permit",
    permitTypeSlug,
    status: "submitted",
    requestedByEmployeeNumber: "100",
    providerId: null,
    signatures,
    fields: {},
    createdAt: new Date(0).toISOString(),
    createdBy: "100",
    updatedAt: new Date(0).toISOString(),
    updatedBy: "100",
  };
}

function add_signature(permit: WorkPermit, key: string): void {
  permit.signatures.push({
    key,
    employeeNumber: String(permit.signatures.length + 101),
    employeeName: key,
    signedAt: new Date().toISOString(),
    image: null,
  });
}

describe("secuencia de firmas de autorización", () => {
  it.each([
    {
      type: "trabajos-calientes",
      order: ["executor", "operational_manager", "tfs_executor", "hsea"],
    },
    {
      type: "trabajos-en-alturas",
      order: ["executor", "operational_manager", "medical_service", "hsea"],
    },
    {
      type: "espacios-confinados",
      order: ["requester", "operational_manager", "medical_service", "lookout"],
    },
    {
      type: "analisis-seguridad-jsa",
      order: ["executor", "operational_manager", "hsea"],
    },
  ])("desbloquea una por una las firmas de $type", ({ type, order }) => {
    const permit = make_permit(type);

    expect(is_next_approval_signature(permit, order[0]!)).toBe(true);
    for (let index = 1; index < order.length; index += 1) {
      expect(is_next_approval_signature(permit, order[index]!)).toBe(false);
      add_signature(permit, order[index - 1]!);
      expect(is_next_approval_signature(permit, order[index]!)).toBe(true);
    }
  });

  it("omite Responsable del trabajo cuando la firma TFS no es necesaria", () => {
    const permit = make_permit("trabajos-calientes");
    permit.fields.requiresTfsWorkSignature = false;

    expect(is_next_approval_signature(permit, "executor")).toBe(true);
    add_signature(permit, "executor");
    expect(is_next_approval_signature(permit, "operational_manager")).toBe(true);
    add_signature(permit, "operational_manager");
    expect(is_next_approval_signature(permit, "tfs_executor")).toBe(false);
    expect(is_next_approval_signature(permit, "hsea")).toBe(true);
  });

  it("no incluye el cierre HSEA ni las verificaciones en la secuencia de autorización de confinados", () => {
    const permit = make_permit("espacios-confinados");
    expect(is_next_approval_signature(permit, "hsea")).toBe(true);
    expect(is_next_approval_signature(permit, "verification_1")).toBe(true);
  });

  it("no bloquea firmas adicionales fuera de la secuencia principal", () => {
    const permit = make_permit("trabajos-en-alturas");
    expect(is_next_approval_signature(permit, "verification_1")).toBe(true);
    expect(is_next_approval_signature(permit, "executor_participant_1")).toBe(true);
  });
});
