import { createHash } from "node:crypto";
import type { SignerIdentity } from "@/domain/acceso";
import type { PermitSignature, SignerRole, WorkPermit } from "@/domain/permisos";
import { hseaDepartmentName } from "@/config/permisos";
import { requireSigningPin } from "@/config/seguridad";
import { find_permit_type } from "@/config/tipos_permiso";
import { get_repositories } from "@/lib/data/proveedor_datos";
import type { PermitActor } from "./actor";

export type SignStepResult =
  | { ok: true; signature: PermitSignature }
  | { ok: false; errorCode: string };

function to_signer(actor: PermitActor): SignerIdentity {
  return actor.actorType === "USUARIO_PROVEEDOR" && actor.providerUserId !== null
    ? { kind: "USUARIO_PROVEEDOR", providerUserId: actor.providerUserId }
    : { kind: "EMPLEADO", employeeNumber: actor.actorId };
}

/** sha256 del contenido del permiso al firmar: deja constancia de qué se firmó. */
function hash_permit_content(permit: WorkPermit): string {
  const content = JSON.stringify(Object.entries(permit.fields).sort(([first], [second]) => first.localeCompare(second)));
  return createHash("sha256").update(content).digest("hex");
}

/** ¿Es un empleado TFS activo del departamento HSEA? */
async function is_hsea_employee(actor: PermitActor): Promise<boolean> {
  if (actor.actorType !== "EMPLEADO") return false;
  const { employees, organization } = get_repositories();
  const [employee, departments] = await Promise.all([employees.find_by_number(actor.actorId), organization.list_departments()]);
  if (!employee || !employee.active) return false;
  const hsea = departments.find((department) => department.name.trim().toUpperCase() === hseaDepartmentName);
  return hsea !== undefined && employee.departmentId === hsea.id;
}

function is_signer_role(permit: WorkPermit, key: string): key is SignerRole {
  const permitType = find_permit_type(permit.permitTypeSlug);
  return permitType !== undefined && (permitType.signerRoles as string[]).includes(key);
}

/**
 * Firma un paso del formato con PIN. Si el paso es un rol del permiso (executor, hsea…), se registra en
 * `firmas_permiso` con autorización por rol, alcance de área y segregación; si no (verificaciones,
 * revalidaciones, participantes), solo se verifica el PIN. Debe llamarse cuando el resto de las
 * validaciones ya pasó: la firma de rol es irreversible.
 * Devuelve la firma para el arreglo del formato, o el código de error (`firma_<motivo>`).
 */
export async function sign_step(
  actor: PermitActor,
  permit: WorkPermit,
  key: string,
  image: string,
  pin: string,
): Promise<SignStepResult> {
  const repositories = get_repositories();
  const signer = to_signer(actor);

  if (!is_signer_role(permit, key)) {
    // Las verificaciones durante el trabajo las firma cualquier empleado TFS del departamento HSEA.
    if (key.startsWith("verification_") && !(await is_hsea_employee(actor))) {
      return { ok: false, errorCode: "firma_NO_ES_HSEA" };
    }
    if (requireSigningPin) {
      const check = await repositories.credentials.verify_pin(signer, pin);
      if (check !== "OK") return { ok: false, errorCode: `firma_${check}` };
    }
    return { ok: true, signature: { key, employeeNumber: actor.actorId, signedAt: new Date().toISOString(), image } };
  }

  if (!permit.area) return { ok: false, errorCode: "firma_SIN_AREA" };
  const result = await repositories.signatures.sign_permit({
    permitId: permit.id,
    permitTypeSlug: permit.permitTypeSlug,
    role: key,
    signer,
    area: permit.area,
    pin,
    image,
    documentHash: hash_permit_content(permit),
  });
  if (!result.ok) return { ok: false, errorCode: `firma_${result.reason}` };
  return {
    ok: true,
    signature: { key, employeeNumber: actor.actorId, signedAt: result.signature.signedAt, image },
  };
}
