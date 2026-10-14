import { describe, expect, it } from "vitest";
import { find_document_type } from "@/config/documentos_contratista";
import type { DocumentReview } from "@/domain/contratistas";
import { compute_semaphore, resolve_document_status, resolve_valid_until } from "./semaforo";

function make_review(overrides: Partial<DocumentReview> = {}): DocumentReview {
  return {
    id: "1",
    versionId: "1",
    result: "APROBADO",
    reviewerEmployeeNumber: "204692",
    reason: null,
    reviewedAt: "2026-10-01T12:00:00.000Z",
    revocation: null,
    ...overrides,
  };
}

describe("resolve_valid_until", () => {
  const medicalExam = find_document_type("EXAMEN_MEDICO");

  it("suma la vigencia del tipo a la fecha de emisión", () => {
    if (!medicalExam) throw new Error("falta el tipo EXAMEN_MEDICO");
    const validUntil = resolve_valid_until(medicalExam, { issueDate: "2026-01-31", expiryDate: null, uploadedAt: "2026-02-10T12:00:00Z" });
    expect(validUntil).toBe("2027-01-31");
  });

  it("gana la fecha más próxima si la versión trae vencimiento propio", () => {
    if (!medicalExam) throw new Error("falta el tipo EXAMEN_MEDICO");
    const validUntil = resolve_valid_until(medicalExam, { issueDate: "2026-01-31", expiryDate: "2026-06-01", uploadedAt: "2026-02-10T12:00:00Z" });
    expect(validUntil).toBe("2026-06-01");
  });

  it("un documento sin vigencia ni vencimiento no caduca", () => {
    const payment = find_document_type("IMSS_PAGO_PROVEEDOR");
    if (!payment) throw new Error("falta el tipo IMSS_PAGO_PROVEEDOR");
    expect(resolve_valid_until(payment, { issueDate: null, expiryDate: null, uploadedAt: "2026-02-10T12:00:00Z" })).toBeNull();
  });
});

describe("resolve_document_status", () => {
  const today = "2026-10-05";

  it("sin revisión está en revisión", () => {
    expect(resolve_document_status("2027-01-01", undefined, today)).toBe("EN_REVISION");
  });

  it("aprobado y vigente", () => {
    expect(resolve_document_status("2027-01-01", make_review(), today)).toBe("APROBADO");
  });

  it("aprobado pero vencido pasa a vencido", () => {
    expect(resolve_document_status("2026-10-04", make_review(), today)).toBe("VENCIDO");
  });

  it("rechazado", () => {
    expect(resolve_document_status("2027-01-01", make_review({ result: "RECHAZADO", reason: "ilegible" }), today)).toBe("RECHAZADO");
  });

  it("una aprobación revocada queda revocada aunque siga vigente", () => {
    const review = make_review({ revocation: { revokedAt: "2026-10-02T12:00:00.000Z", revokedByEmployeeNumber: "204692", reason: "error" } });
    expect(resolve_document_status("2027-01-01", review, today)).toBe("REVOCADO");
  });
});

describe("compute_semaphore", () => {
  it("verde solo con todo aprobado", () => {
    expect(compute_semaphore(["APROBADO", "APROBADO"], "ACTIVO")).toBe("VERDE");
  });

  it("amarillo si todo está cargado pero algo sigue en revisión", () => {
    expect(compute_semaphore(["APROBADO", "EN_REVISION"], "ACTIVO")).toBe("AMARILLO");
  });

  it("rojo si falta, está rechazado, revocado o vencido algún requisito", () => {
    for (const status of ["FALTANTE", "RECHAZADO", "REVOCADO", "VENCIDO"] as const) {
      expect(compute_semaphore(["APROBADO", status], "ACTIVO")).toBe("ROJO");
    }
  });

  it("rojo si el proveedor no está activo, aunque todo esté aprobado", () => {
    expect(compute_semaphore(["APROBADO"], "SUSPENDIDO")).toBe("ROJO");
    expect(compute_semaphore(["APROBADO"], "PENDIENTE_VALIDACION")).toBe("ROJO");
  });

  it("revocar un documento con el resto aprobado deja el semáforo en rojo", () => {
    expect(compute_semaphore(["APROBADO", "APROBADO", "REVOCADO"], "ACTIVO")).toBe("ROJO");
  });
});
