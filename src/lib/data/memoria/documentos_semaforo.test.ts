import { beforeAll, describe, expect, it } from "vitest";
import { documentTypes } from "@/config/documentos_contratista";
import { firstAdminEmployeeNumber } from "@/config/permisos";
import type { ActorIdentity } from "@/domain/acceso";
import { get_today_mx } from "../identidad";
import type { DataRepositories } from "../repositorios";
import { create_memory_repositories } from "./repositorios_memoria";

const admin: ActorIdentity = { kind: "EMPLEADO", employeeNumber: firstAdminEmployeeNumber };
const noArea = { commandLineId: null, departmentId: null, subdepartmentId: null };
const sha256 = "a".repeat(64);

let repositories: DataRepositories;
let reviewerNumber = "";
let providerId = 0;
let providerEmployeeId = 0;

/** Sube una versión del documento como administrador (quien sube no puede revisar el mismo documento). */
async function upload(documentTypeCode: (typeof documentTypes)[number]["code"]): Promise<string> {
  const appliesTo = documentTypes.find((type) => type.code === documentTypeCode)?.appliesTo;
  const { version } = await repositories.documents.upload_version(
    {
      // Los documentos del proveedor (p. ej. el comprobante de pago del IMSS) se cargan a nombre de la empresa.
      subject:
        appliesTo === "PROVEEDOR"
          ? { kind: "PROVEEDOR", providerId }
          : { kind: "EMPLEADO_PROVEEDOR", providerEmployeeId },
      documentTypeCode,
      fileName: "documento.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1000,
      storagePath: `documentos/prueba/${documentTypeCode}.pdf`,
      sha256,
      issueDate: get_today_mx(),
      expiryDate: null,
    },
    admin,
  );
  return version.id;
}

async function get_semaphore(): Promise<string | undefined> {
  return (await repositories.providerEmployees.get_semaphore(providerEmployeeId))?.semaphore;
}

beforeAll(async () => {
  repositories = create_memory_repositories();

  // Una persona que revisa documentos y valida exámenes médicos (distinta de quien sube).
  // Departamento HSEA del seed (id 17): tiene varios empleados activos.
  const candidates = await repositories.employees.list_by_department(17);
  const reviewer = candidates.find((candidate) => candidate.employeeNumber !== firstAdminEmployeeNumber);
  if (!reviewer) throw new Error("el seed no tiene otro empleado para revisar");
  reviewerNumber = reviewer.employeeNumber;
  for (const roleCode of ["SUPERVISOR_HSEA", "SERVICIO_MEDICO"]) {
    await repositories.access.assign_role(
      { employeeNumber: reviewerNumber, roleCode, scope: "GLOBAL", area: noArea, reason: "prueba" },
      firstAdminEmployeeNumber,
    );
  }

  const provider = await repositories.providers.register_provider({
    name: "Proveedor de prueba",
    taxId: "ABC010101AB1",
    imssEmployerRegistration: null,
    contactEmail: "contacto@prueba.mx",
    phone: null,
    contractorTypes: ["MANTENIMIENTO"],
  });
  providerId = provider.id;
  await repositories.providers.set_provider_status(providerId, "ACTIVO", null, firstAdminEmployeeNumber);

  const employee = await repositories.providerEmployees.add_employee(
    providerId,
    {
      firstName: "Juan",
      middleName: null,
      paternalSurname: "Pérez",
      maternalSurname: null,
      curp: "PEPJ010101HDFRRN09",
      nss: "12345678901",
      jobTitle: "Soldador",
    },
    admin,
  );
  providerEmployeeId = employee.id;
});

describe("semáforo del colaborador", () => {
  it("sin documentos está en rojo", async () => {
    expect(await get_semaphore()).toBe("ROJO");
  });

  it("con todo cargado y sin revisar está en amarillo, y en verde al aprobarse todo", async () => {
    // Los del colaborador + los del proveedor, que también cuentan para el semáforo de su personal.
    const mandatory = documentTypes.filter((type) => type.appliesTo !== "EQUIPO" && type.mandatory);
    const versionIds: string[] = [];
    for (const type of mandatory) versionIds.push(await upload(type.code));
    expect(await get_semaphore()).toBe("AMARILLO");

    for (const versionId of versionIds) {
      await repositories.documents.review_version({ versionId, result: "APROBADO", reason: null }, reviewerNumber);
    }
    expect(await get_semaphore()).toBe("VERDE");
  });

  it("quien subió un documento no puede revisarlo", async () => {
    const versionId = await upload("IMSS_PAGO_PROVEEDOR");
    await expect(
      repositories.documents.review_version({ versionId, result: "APROBADO", reason: null }, firstAdminEmployeeNumber),
    ).rejects.toThrow(/tú mismo/);
    // Se deja aprobado para no alterar las pruebas siguientes.
    await repositories.documents.review_version({ versionId, result: "APROBADO", reason: null }, reviewerNumber);
  });

  it("revocar una aprobación pone el semáforo en rojo aunque el resto siga aprobado", async () => {
    const versionId = await upload("INDUCCION");
    await repositories.documents.review_version({ versionId, result: "APROBADO", reason: null }, reviewerNumber);
    expect(await get_semaphore()).toBe("VERDE");

    await repositories.documents.revoke_review(versionId, "se aprobó el documento equivocado", firstAdminEmployeeNumber);
    expect(await get_semaphore()).toBe("ROJO");
  });

  it("solo un administrador revoca, y exige motivo", async () => {
    const versionId = await upload("IMSS_ALTA");
    await repositories.documents.review_version({ versionId, result: "APROBADO", reason: null }, reviewerNumber);

    await expect(repositories.documents.revoke_review(versionId, "x", reviewerNumber)).rejects.toThrow(/Acceso denegado/);
    await expect(repositories.documents.revoke_review(versionId, "  ", firstAdminEmployeeNumber)).rejects.toThrow();
  });

  it("al subir una versión nueva del documento revocado vuelve a revisión (amarillo)", async () => {
    await upload("INDUCCION");
    expect(await get_semaphore()).toBe("AMARILLO");
  });

  it("un rechazo exige motivo", async () => {
    const versionId = await upload("INDUCCION");
    await expect(repositories.documents.review_version({ versionId, result: "RECHAZADO", reason: null }, reviewerNumber)).rejects.toThrow(/motivo/i);
  });
});
