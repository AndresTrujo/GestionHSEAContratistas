import { describe, expect, it } from "vitest";
import type { WorkPermit } from "@/domain/permisos";
import { is_next_approval_signature } from "./tipos_permiso";

function make_permit(signatures: WorkPermit["signatures"] = []): WorkPermit {
  return {
    id: "test-permit",
    permitTypeSlug: "analisis-seguridad-jsa",
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

describe("secuencia de firmas de autorización", () => {
  it("permite primero la firma del responsable de ejecución", () => {
    const permit = make_permit();
    expect(is_next_approval_signature(permit, "executor")).toBe(true);
    expect(is_next_approval_signature(permit, "operational_manager")).toBe(false);
    expect(is_next_approval_signature(permit, "hsea")).toBe(false);
  });

  it("habilita al responsable del área después de ejecución y a HSE después del área", () => {
    const permit = make_permit([
      { key: "executor", employeeNumber: "101", employeeName: "Ejecutor", signedAt: new Date().toISOString(), image: null },
    ]);
    expect(is_next_approval_signature(permit, "operational_manager")).toBe(true);
    expect(is_next_approval_signature(permit, "hsea")).toBe(false);

    permit.signatures.push({
      key: "operational_manager",
      employeeNumber: "102",
      employeeName: "Responsable del área",
      signedAt: new Date().toISOString(),
      image: null,
    });
    expect(is_next_approval_signature(permit, "hsea")).toBe(true);
  });

  it("usa al solicitante como primer firmante en formatos que no tienen rol executor", () => {
    const permit = {
      ...make_permit(),
      permitTypeSlug: "espacios-confinados",
    };
    expect(is_next_approval_signature(permit, "operational_manager")).toBe(false);
    permit.signatures.push({
      key: "requester",
      employeeNumber: "103",
      employeeName: "Responsable del trabajo",
      signedAt: new Date().toISOString(),
      image: null,
    });
    expect(is_next_approval_signature(permit, "operational_manager")).toBe(true);
    expect(is_next_approval_signature(permit, "hsea")).toBe(false);
  });

  it("no bloquea firmas adicionales que no forman parte de la secuencia", () => {
    expect(is_next_approval_signature(make_permit(), "medical_service")).toBe(true);
  });
});
