"use server";

import { revalidatePath } from "next/cache";
import type { RoleScope } from "@/domain/acceso";
import type { AreaPosition, AreaRef } from "@/domain/organizacion";
import type { ProviderStatus } from "@/domain/contratistas";
import { require_employee_session } from "@/lib/auth/guardas";
import { is_expected_error, ValidationError } from "@/lib/data/errores";
import { get_repositories } from "@/lib/data/proveedor_datos";
import type { ActionState } from "./estado";
import { load_role_suggestions } from "./sugerencias";

/*
 * Cada acción: valida la sesión de empleado, delega en el repositorio (que vuelve a validar el
 * permiso y deja el evento de auditoría) y devuelve un resultado para el formulario.
 */

function read_text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function read_optional(formData: FormData, name: string): string | null {
  return read_text(formData, name) || null;
}

function read_id(formData: FormData, name: string): number | null {
  const value = read_text(formData, name);
  if (!value) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

const roleScopes: RoleScope[] = ["GLOBAL", "LINEA_MANDO", "DEPARTAMENTO", "SUBDEPARTAMENTO"];

function read_scope(formData: FormData, name: string): RoleScope {
  const value = read_text(formData, name);
  const scope = roleScopes.find((item) => item === value);
  if (!scope) throw new ValidationError("Elige un alcance válido");
  return scope;
}

/** Arma el área a partir del nivel elegido; los selects de los otros niveles se ignoran. */
function build_area(scope: RoleScope, formData: FormData): AreaRef {
  const empty: AreaRef = { commandLineId: null, departmentId: null, subdepartmentId: null };
  if (scope === "GLOBAL") return empty;
  const pick = (name: string, label: string): number => {
    const id = read_id(formData, name);
    if (id === null) throw new ValidationError(`Elige ${label}`);
    return id;
  };
  if (scope === "LINEA_MANDO") return { ...empty, commandLineId: pick("commandLineId", "la línea de mando") };
  if (scope === "DEPARTAMENTO") return { ...empty, departmentId: pick("departmentId", "el departamento") };
  return { ...empty, subdepartmentId: pick("subdepartmentId", "el subdepartamento") };
}

async function run_action(
  paths: string[],
  work: (employeeNumber: string) => Promise<{ message: string; secret?: string }>,
): Promise<ActionState> {
  const session = await require_employee_session();
  try {
    const result = await work(session.employeeNumber);
    for (const path of paths) revalidatePath(path);
    return { ok: true, message: result.message, secret: result.secret };
  } catch (error) {
    if (is_expected_error(error)) return { ok: false, message: error.message };
    throw error;
  }
}

/* ---- Roles y PIN ---- */

export async function assign_role_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const employeeNumber = read_text(formData, "employeeNumber");
  return run_action([`/administracion/roles/${employeeNumber}`], async (actor) => {
    const scope = read_scope(formData, "scope");
    await get_repositories().access.assign_role(
      {
        employeeNumber,
        roleCode: read_text(formData, "roleCode"),
        scope,
        area: build_area(scope, formData),
        validFrom: read_optional(formData, "validFrom") ?? undefined,
        validUntil: read_optional(formData, "validUntil"),
        reason: read_text(formData, "reason"),
      },
      actor,
    );
    return { message: "Rol asignado." };
  });
}

export async function revoke_role_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const employeeNumber = read_text(formData, "employeeNumber");
  return run_action([`/administracion/roles/${employeeNumber}`], async (actor) => {
    await get_repositories().access.revoke_role(read_text(formData, "assignmentId"), read_text(formData, "reason"), actor);
    return { message: "Rol revocado." };
  });
}

/** Aplica las sugerencias de rol del seed que el administrador marcó; omite las que ya están asignadas. */
export async function apply_role_suggestions_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return run_action(["/administracion/roles", "/administracion/roles/sugerencias"], async (actor) => {
    const selected = new Set(formData.getAll("suggestion").filter((value): value is string => typeof value === "string"));
    if (selected.size === 0) throw new ValidationError("Marca al menos una sugerencia");

    const repositories = get_repositories();
    const suggestions = load_role_suggestions().filter((item) => selected.has(item.key));
    let applied = 0;
    let skipped = 0;
    const failures: string[] = [];

    for (const suggestion of suggestions) {
      const current = await repositories.access.list_assignments_by_employee(suggestion.employeeNumber, { onlyCurrent: true });
      const exists = current.some(
        (assignment) =>
          assignment.roleCode === suggestion.roleCode &&
          assignment.scope === suggestion.scope &&
          (assignment.commandLineId ?? null) === suggestion.area.commandLineId &&
          (assignment.departmentId ?? null) === suggestion.area.departmentId &&
          (assignment.subdepartmentId ?? null) === suggestion.area.subdepartmentId,
      );
      if (exists) {
        skipped += 1;
        continue;
      }
      try {
        await repositories.access.assign_role(
          {
            employeeNumber: suggestion.employeeNumber,
            roleCode: suggestion.roleCode,
            scope: suggestion.scope,
            area: suggestion.area,
            reason: `Sugerencia del seed: ${suggestion.reason}`,
          },
          actor,
        );
        applied += 1;
      } catch (error) {
        if (!is_expected_error(error)) throw error;
        failures.push(`${suggestion.employeeNumber} (${suggestion.roleCode}): ${error.message}`);
      }
    }

    const parts = [`${applied} asignadas`, `${skipped} ya existían`];
    if (failures.length > 0) parts.push(`${failures.length} con error — ${failures.join("; ")}`);
    return { message: parts.join(", ") + "." };
  });
}

/** El PIN lo teclea la propia persona frente al administrador; nunca se guarda ni se audita en claro. */
export async function activate_pin_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const kind = read_text(formData, "kind");
  const subject = read_text(formData, "subject");
  const returnPath = read_text(formData, "returnPath");
  return run_action([returnPath], async (actor) => {
    const pin = String(formData.get("pin") ?? "");
    if (pin !== String(formData.get("confirmPin") ?? "")) {
      throw new ValidationError("La confirmación del PIN no coincide");
    }
    if (kind === "EMPLEADO") {
      await get_repositories().credentials.activate_pin({ kind: "EMPLEADO", employeeNumber: subject }, pin, actor);
    } else if (kind === "USUARIO_PROVEEDOR") {
      const providerUserId = Number(subject);
      if (!Number.isSafeInteger(providerUserId)) throw new ValidationError("Usuario de proveedor inválido");
      await get_repositories().credentials.activate_pin({ kind: "USUARIO_PROVEEDOR", providerUserId }, pin, actor);
    } else {
      throw new ValidationError("Tipo de firmante inválido");
    }
    return { message: "PIN activado. Si había uno anterior, quedó revocado." };
  });
}

export async function revoke_pin_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const kind = read_text(formData, "kind");
  const subject = read_text(formData, "subject");
  const returnPath = read_text(formData, "returnPath");
  return run_action([returnPath], async (actor) => {
    const signer =
      kind === "EMPLEADO"
        ? ({ kind: "EMPLEADO", employeeNumber: subject } as const)
        : ({ kind: "USUARIO_PROVEEDOR", providerUserId: Number(subject) } as const);
    await get_repositories().credentials.revoke_pin(signer, read_text(formData, "reason"), actor);
    return { message: "PIN revocado." };
  });
}

/* ---- Organización ---- */

export async function assign_area_role_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return run_action(["/administracion/organizacion"], async (actor) => {
    const level = read_scope(formData, "level");
    if (level === "GLOBAL") throw new ValidationError("Un cargo de área se asigna a una línea, departamento o subdepartamento");
    const position = read_text(formData, "position") as AreaPosition;
    await get_repositories().organization.assign_area_role(
      {
        employeeNumber: read_text(formData, "employeeNumber"),
        position,
        area: build_area(level, formData),
        validFrom: read_optional(formData, "validFrom") ?? undefined,
        reason: read_optional(formData, "reason"),
      },
      actor,
    );
    return { message: "Cargo asignado." };
  });
}

export async function end_area_role_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return run_action(["/administracion/organizacion"], async (actor) => {
    await get_repositories().organization.end_area_role(read_text(formData, "assignmentId"), read_text(formData, "reason"), actor);
    return { message: "Cargo cerrado." };
  });
}

export async function create_subdepartment_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return run_action(["/administracion/organizacion"], async (actor) => {
    const departmentId = read_id(formData, "departmentId");
    if (departmentId === null) throw new ValidationError("Elige el departamento");
    await get_repositories().organization.create_subdepartment(departmentId, read_text(formData, "name"), actor);
    return { message: "Subdepartamento creado." };
  });
}

/* ---- Proveedores ---- */

export async function set_provider_status_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const providerId = read_id(formData, "providerId");
  return run_action(["/administracion/proveedores", `/administracion/proveedores/${providerId}`], async (actor) => {
    const status = read_text(formData, "status") as Exclude<ProviderStatus, "PENDIENTE_VALIDACION">;
    if (providerId === null || (status !== "ACTIVO" && status !== "SUSPENDIDO")) {
      throw new ValidationError("Solicitud inválida");
    }
    await get_repositories().providers.set_provider_status(providerId, status, read_optional(formData, "reason"), actor);
    return { message: status === "ACTIVO" ? "Proveedor activado." : "Proveedor suspendido." };
  });
}

export async function create_provider_user_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const providerId = read_id(formData, "providerId");
  return run_action([`/administracion/proveedores/${providerId}`], async (actor) => {
    if (providerId === null) throw new ValidationError("Proveedor inválido");
    const created = await get_repositories().providerUsers.create_user(
      {
        providerId,
        firstName: read_text(formData, "firstName"),
        paternalSurname: read_text(formData, "paternalSurname"),
        maternalSurname: read_optional(formData, "maternalSurname"),
        providerEmployeeId: read_id(formData, "providerEmployeeId"),
        email: read_optional(formData, "email"),
        isAdministrator: formData.get("isAdministrator") === "on",
      },
      { kind: "EMPLEADO", employeeNumber: actor },
    );
    return { message: `Cuenta creada. Usuario: ${created.user.username}`, secret: created.temporaryPassword };
  });
}

export async function reset_provider_password_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const providerId = read_id(formData, "providerId");
  return run_action([`/administracion/proveedores/${providerId}`], async (actor) => {
    const userId = read_id(formData, "userId");
    if (userId === null) throw new ValidationError("Usuario inválido");
    const temporaryPassword = await get_repositories().providerUsers.reset_password(userId, {
      kind: "EMPLEADO",
      employeeNumber: actor,
    });
    return { message: "Contraseña restablecida y cuenta desbloqueada.", secret: temporaryPassword };
  });
}

export async function link_provider_user_employee_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const providerId = read_id(formData, "providerId");
  return run_action([`/administracion/proveedores/${providerId}`], async (actor) => {
    const userId = read_id(formData, "userId");
    if (userId === null) throw new ValidationError("Usuario inválido");
    const providerEmployeeId = read_id(formData, "providerEmployeeId");
    await get_repositories().providerUsers.set_user_employee(userId, providerEmployeeId, read_text(formData, "reason"), {
      kind: "EMPLEADO",
      employeeNumber: actor,
    });
    return { message: providerEmployeeId === null ? "Cuenta marcada como administrativa." : "Cuenta ligada al colaborador." };
  });
}

export async function set_provider_user_active_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const providerId = read_id(formData, "providerId");
  return run_action([`/administracion/proveedores/${providerId}`], async (actor) => {
    const userId = read_id(formData, "userId");
    if (userId === null) throw new ValidationError("Usuario inválido");
    const active = read_text(formData, "active") === "true";
    await get_repositories().providerUsers.set_user_active(userId, active, read_text(formData, "reason"), {
      kind: "EMPLEADO",
      employeeNumber: actor,
    });
    return { message: active ? "Cuenta activada." : "Cuenta desactivada." };
  });
}
