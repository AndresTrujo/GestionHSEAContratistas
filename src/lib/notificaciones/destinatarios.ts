import { get_required_permission, providerSignerRoles, signerRolePermission } from "@/config/permisos";
import { stopSlug } from "@/config/observacion_stop";
import type { ExpectedSignature } from "@/config/notificaciones";
import type { RoleScope } from "@/domain/acceso";
import type { NotificationRecipient } from "@/domain/notificaciones";
import type { PermitArea } from "@/domain/organizacion";
import type { SignerRole, WorkPermit } from "@/domain/permisos";
import { does_scope_cover_area } from "@/lib/data/alcance";
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

/** Qué tan específico es un alcance: el subdepartamento es más específico que el departamento, y así hasta GLOBAL. */
const scopeSpecificity: Record<RoleScope, number> = { SUBDEPARTAMENTO: 3, DEPARTAMENTO: 2, LINEA_MANDO: 1, GLOBAL: 0 };

/**
 * De los empleados autorizados a firmar el rol en el área, deja solo a quienes lo tienen con el alcance más
 * específico: si hay encargados del departamento (o subdepartamento) del permiso, no se avisa a quien lo
 * tiene por alcance de línea de mando o global; si no hay nadie, se avisa a los de alcance mayor.
 */
async function keep_most_specific_scope(employeeNumbers: string[], role: SignerRole, area: PermitArea): Promise<string[]> {
  const permission = get_required_permission(role);
  if (!permission || employeeNumbers.length < 2) return employeeNumbers;
  const { access, organization } = get_repositories();
  const [roles, departments] = await Promise.all([access.list_roles(), organization.list_departments()]);
  const grantingRoleIds = new Set(roles.filter((item) => item.active && item.permissions.includes(permission)).map((item) => item.id));
  const commandLineOfArea = departments.find((department) => department.id === area.departmentId)?.commandLineId ?? null;

  const levels = await Promise.all(
    employeeNumbers.map(async (employeeNumber) => {
      const assignments = await access.list_assignments_by_employee(employeeNumber, { onlyCurrent: true });
      const level = assignments
        .filter((item) => grantingRoleIds.has(item.roleId) && does_scope_cover_area(item.scope, item, area, commandLineOfArea))
        .reduce((best, item) => Math.max(best, scopeSpecificity[item.scope]), -1);
      return { employeeNumber, level };
    }),
  );
  const bestLevel = Math.max(...levels.map((item) => item.level));
  return levels.filter((item) => item.level === bestLevel).map((item) => item.employeeNumber);
}

/** Usuario de proveedor que solicitó el permiso, si lo hay. */
export function get_provider_requester(permit: WorkPermit): NotificationRecipient | null {
  const userId = permit.requestedByProviderUserId;
  return userId === null || userId === undefined ? null : { kind: "USUARIO_PROVEEDOR", id: `P-${userId}` };
}

/**
 * A quién avisar que falta una firma:
 *  - Roles con permiso (HSEA, responsable operativo, servicio médico, responsable de la ejecución): los
 *    empleados autorizados a firmarlo en el área del permiso, solo los del alcance más específico (primero
 *    los del departamento o subdepartamento del permiso; los de línea de mando o global solo si no hay nadie).
 *  - Roles que firma el proveedor (solicitante, contratista, ejecutor): el usuario de proveedor que solicitó el
 *    permiso, si lo hay.
 *  - Participantes del JSA: la persona ligada, si es empleado TFS.
 *  - STOP: el supervisor y el observado nombrados en el formato.
 *  - Solicitante: quien lo solicitó (empleado o usuario de proveedor).
 * Los roles sin permiso ni persona nombrada (vigía, etc.) no tienen a quién avisar.
 */
async function resolve_recipients(permit: WorkPermit, key: string, narrowScope: boolean): Promise<NotificationRecipient[]> {
  if (key.startsWith("participant_")) {
    const position = Number(key.replace("participant_", ""));
    const linked = (await get_repositories().participants.list_by_permit(permit.id)).find(
      (item) => item.role === "participant" && item.position === position,
    );
    return linked?.participant.kind === "EMPLEADO" ? [employee(linked.participant.employeeNumber)] : [];
  }
  if (permit.permitTypeSlug === stopSlug) {
    const field = key === "observed" ? "observedEmployee" : key === "supervisor" ? "supervisorEmployee" : "";
    const employeeNumber = field ? text_field(permit, field) : "";
    return employeeNumber ? [employee(employeeNumber)] : [];
  }

  const recipients: NotificationRecipient[] = [];
  if (key === "requester" && permit.requestedByEmployeeNumber) recipients.push(employee(permit.requestedByEmployeeNumber));
  if ((providerSignerRoles as string[]).includes(key) && permit.providerId !== null) {
    const requester = get_provider_requester(permit);
    if (requester) recipients.push(requester);
  }
  if (is_signer_role(key) && permit.area) {
    const eligible = await get_repositories().access.list_eligible_signers(key, permit.area);
    const active = (eligible ?? []).filter((item) => item.active).map((item) => item.employeeNumber);
    const selected = narrowScope ? await keep_most_specific_scope(active, key, permit.area) : active;
    recipients.push(...selected.map(employee));
  }
  return recipients;
}

/**
 * Destinatarios de una firma pendiente. Se excluye a quien ya firmó otro paso del permiso (la segregación no
 * le dejaría firmar este) y a las personas indicadas en `excludeIds` (p. ej. quien acaba de actuar).
 * Con `narrowScope: false` se devuelven todos los que pueden firmar (para la vista de pendientes), no solo
 * los del alcance más específico a quienes se avisa.
 */
export async function resolve_signature_recipients(
  permit: WorkPermit,
  signature: ExpectedSignature,
  excludeIds: string[] = [],
  narrowScope = true,
): Promise<NotificationRecipient[]> {
  const alreadySigned = new Set(permit.signatures.map((item) => item.employeeNumber));
  const unique = new Map((await resolve_recipients(permit, signature.key, narrowScope)).map((item) => [item.id, item]));
  return [...unique.values()].filter((item) => !alreadySigned.has(item.id) && !excludeIds.includes(item.id));
}
