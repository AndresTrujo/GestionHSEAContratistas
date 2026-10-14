import { beforeAll, describe, expect, it } from "vitest";
import { firstAdminEmployeeNumber } from "@/config/permisos";
import type { PermitArea } from "@/domain/organizacion";
import { lastAdminMessage } from "../errores";
import type { DataRepositories } from "../repositorios";
import { create_memory_repositories } from "./repositorios_memoria";

/** Departamento HSEA del seed; el administrador de arranque tiene ADMIN_HSEA con alcance GLOBAL. */
const area: PermitArea = { departmentId: 17, subdepartmentId: null };
const admin = { kind: "EMPLEADO", employeeNumber: firstAdminEmployeeNumber } as const;

let repositories: DataRepositories;
let otherEmployeeNumber = "";

beforeAll(async () => {
  repositories = create_memory_repositories();
  // Un empleado activo del seed que no tenga ningún rol.
  const candidates = await repositories.employees.list_by_department(area.departmentId);
  for (const candidate of candidates) {
    if (candidate.employeeNumber === firstAdminEmployeeNumber) continue;
    const assignments = await repositories.access.list_assignments_by_employee(candidate.employeeNumber, { onlyCurrent: true });
    if (assignments.length === 0) {
      otherEmployeeNumber = candidate.employeeNumber;
      break;
    }
  }
  if (!otherEmployeeNumber) throw new Error("el seed no tiene un empleado sin roles para la prueba");
});

describe("quién puede firmar", () => {
  it("el administrador de arranque puede firmar como HSEA en cualquier área", async () => {
    const decision = await repositories.access.can_sign({
      permitId: "p-hsea", permitTypeSlug: "trabajos-en-alturas", role: "hsea", signer: admin, area,
    });
    expect(decision).toEqual({ allowed: true });
  });

  it("un rol que el formato no exige se rechaza", async () => {
    const decision = await repositories.access.can_sign({
      permitId: "p-rol", permitTypeSlug: "trabajos-en-alturas", role: "observer", signer: admin, area,
    });
    expect(decision).toEqual({ allowed: false, reason: "ROL_NO_EXIGIDO_POR_PERMISO" });
  });

  it("alguien sin el rol no puede firmar", async () => {
    const decision = await repositories.access.can_sign({
      permitId: "p-sin-rol", permitTypeSlug: "trabajos-en-alturas", role: "hsea",
      signer: { kind: "EMPLEADO", employeeNumber: otherEmployeeNumber }, area,
    });
    expect(decision).toEqual({ allowed: false, reason: "SIN_PERMISO_O_ALCANCE" });
  });

  it("un rol solo se firma una vez por permiso", async () => {
    const request = { permitId: "p-doble", permitTypeSlug: "trabajos-en-alturas", role: "hsea", signer: admin, area, pin: "", image: null, documentHash: null } as const;
    const first = await repositories.signatures.sign_permit(request);
    expect(first.ok).toBe(true);
    const second = await repositories.signatures.sign_permit(request);
    expect(second).toEqual({ ok: false, reason: "ROL_YA_FIRMADO" });
  });

  it("una persona no puede firmar dos roles del mismo permiso", async () => {
    // Se le da a la persona de prueba un rol de encargado y uno de HSEA, ambos GLOBAL.
    await repositories.access.assign_role(
      { employeeNumber: otherEmployeeNumber, roleCode: "ENCARGADO_AREA", scope: "GLOBAL", area: { commandLineId: null, departmentId: null, subdepartmentId: null }, reason: "prueba" },
      firstAdminEmployeeNumber,
    );
    await repositories.access.assign_role(
      { employeeNumber: otherEmployeeNumber, roleCode: "SUPERVISOR_HSEA", scope: "GLOBAL", area: { commandLineId: null, departmentId: null, subdepartmentId: null }, reason: "prueba" },
      firstAdminEmployeeNumber,
    );
    const signer = { kind: "EMPLEADO", employeeNumber: otherEmployeeNumber } as const;
    const base = { permitId: "p-segregacion", permitTypeSlug: "trabajos-en-alturas", signer, area, pin: "", image: null, documentHash: null } as const;

    expect((await repositories.signatures.sign_permit({ ...base, role: "operational_manager" })).ok).toBe(true);
    const second = await repositories.signatures.sign_permit({ ...base, role: "hsea" });
    expect(second).toEqual({ ok: false, reason: "PERSONA_YA_FIRMO_OTRO_ROL" });
  });

  it("el ADMIN_HSEA sí puede firmar más de un rol del mismo permiso", async () => {
    // El administrador recibe además el rol de encargado de área (GLOBAL) para poder firmar dos roles.
    await repositories.access.assign_role(
      { employeeNumber: firstAdminEmployeeNumber, roleCode: "ENCARGADO_AREA", scope: "GLOBAL", area: { commandLineId: null, departmentId: null, subdepartmentId: null }, reason: "prueba" },
      firstAdminEmployeeNumber,
    );
    const signer = { kind: "EMPLEADO", employeeNumber: firstAdminEmployeeNumber } as const;
    const base = { permitId: "p-admin-varios", permitTypeSlug: "trabajos-en-alturas", signer, area, pin: "", image: null, documentHash: null } as const;

    expect((await repositories.signatures.sign_permit({ ...base, role: "operational_manager" })).ok).toBe(true);
    expect((await repositories.signatures.sign_permit({ ...base, role: "hsea" })).ok).toBe(true);
  });
});

describe("administrador de roles", () => {
  it("no se puede revocar al último Administrador HSEA", async () => {
    const assignments = await repositories.access.list_assignments_by_employee(firstAdminEmployeeNumber, { onlyCurrent: true });
    const adminAssignment = assignments.find((assignment) => assignment.roleCode === "ADMIN_HSEA");
    if (!adminAssignment) throw new Error("falta la asignación ADMIN_HSEA del administrador de arranque");

    await expect(repositories.access.revoke_role(adminAssignment.id, "prueba", firstAdminEmployeeNumber)).rejects.toThrow(lastAdminMessage);
  });

  it("sí se puede revocar cuando hay otro administrador", async () => {
    await repositories.access.assign_role(
      { employeeNumber: otherEmployeeNumber, roleCode: "ADMIN_HSEA", scope: "GLOBAL", area: { commandLineId: null, departmentId: null, subdepartmentId: null }, reason: "prueba" },
      firstAdminEmployeeNumber,
    );
    const assignments = await repositories.access.list_assignments_by_employee(firstAdminEmployeeNumber, { onlyCurrent: true });
    const adminAssignment = assignments.find((assignment) => assignment.roleCode === "ADMIN_HSEA");
    if (!adminAssignment) throw new Error("falta la asignación ADMIN_HSEA del administrador de arranque");

    const revoked = await repositories.access.revoke_role(adminAssignment.id, "prueba", otherEmployeeNumber);
    expect(revoked.revokedAt).not.toBeNull();
  });
});
