import { signerRolePermission } from "@/config/permisos";
import { stopSlug } from "@/config/observacion_stop";
import type { ExpectedSignature } from "@/config/notificaciones";
import type { NotificationRecipient } from "@/domain/notificaciones";
import type { SignerRole, WorkPermit } from "@/domain/permisos";
import { get_repositories } from "@/lib/data/proveedor_datos";

function is_signer_role(key: string): key is SignerRole {
  return key in signerRolePermission;
}

function employee(employeeNumber: string): NotificationRecipient {
  return { kind: "EMPLEADO", id: employeeNumber };
}

function text_field(permit: WorkPermit, name: string): string {
  const value = permit.fields[name];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Empleados TFS a quienes avisar que falta una firma. Solo se avisa a empleados: los usuarios de proveedor
 * reciben avisos de avance de los permisos que solicitaron, no de firmas pendientes.
 *  - Roles con permiso (HSEA, responsable operativo, servicio médico, responsable de la ejecución): todos los
 *    empleados autorizados a firmarlo en el área del permiso.
 *  - Participantes del JSA: la persona ligada, si es empleado TFS.
 *  - STOP: el supervisor y el observado nombrados en el formato.
 *  - Solicitante: quien lo solicitó, si es empleado.
 * Los roles sin permiso ni persona nombrada (vigía, etc.) no tienen a quién avisar.
 */
async function resolve_employees(permit: WorkPermit, key: string): Promise<string[]> {
  if (key.startsWith("participant_")) {
    const position = Number(key.replace("participant_", ""));
    const linked = (await get_repositories().participants.list_by_permit(permit.id)).find(
      (item) => item.role === "participant" && item.position === position,
    );
    return linked?.participant.kind === "EMPLEADO" ? [linked.participant.employeeNumber] : [];
  }
  if (permit.permitTypeSlug === stopSlug) {
    const field = key === "observed" ? "observedEmployee" : key === "supervisor" ? "supervisorEmployee" : "";
    const employeeNumber = field ? text_field(permit, field) : "";
    return employeeNumber ? [employeeNumber] : [];
  }
  if (key === "requester") {
    return permit.requestedByEmployeeNumber ? [permit.requestedByEmployeeNumber] : [];
  }
  if (!is_signer_role(key) || !permit.area) return [];
  const eligible = await get_repositories().access.list_eligible_signers(key, permit.area);
  return (eligible ?? []).filter((item) => item.active).map((item) => item.employeeNumber);
}

/**
 * Destinatarios de una firma pendiente. Se excluye a quien ya firmó otro paso del permiso (la segregación no
 * le dejaría firmar este) y a las personas indicadas en `excludeIds` (p. ej. quien acaba de actuar).
 */
export async function resolve_signature_recipients(
  permit: WorkPermit,
  signature: ExpectedSignature,
  excludeIds: string[] = [],
): Promise<NotificationRecipient[]> {
  const alreadySigned = new Set(permit.signatures.map((item) => item.employeeNumber));
  const unique = new Set(await resolve_employees(permit, signature.key));
  return [...unique]
    .filter((employeeNumber) => !alreadySigned.has(employeeNumber) && !excludeIds.includes(employeeNumber))
    .map(employee);
}

/** Usuario de proveedor que solicitó el permiso, si lo hay. */
export function get_provider_requester(permit: WorkPermit): NotificationRecipient | null {
  const userId = permit.requestedByProviderUserId;
  return userId === null || userId === undefined ? null : { kind: "USUARIO_PROVEEDOR", id: `P-${userId}` };
}
