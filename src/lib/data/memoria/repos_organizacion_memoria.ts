import { find_permit_type } from "@/config/tipos_permiso";
import {
  adminRoleCode,
  get_required_permission,
  providerSignerRoles,
  type PermissionCode,
} from "@/config/permisos";
import { lastAdminMessage } from "../errores";
import { lockoutMinutes, maxFailedAttempts, requireSigningPin } from "@/config/seguridad";
import type {
  CanSignRequest,
  RoleAssignment,
  SignDecision,
  SignDenialReason,
  SignerIdentity,
  SigningCredential,
} from "@/domain/acceso";
import type { AuditAction } from "@/domain/auditoria";
import type { Semaphore } from "@/domain/contratistas";
import type {
  AreaAssignment,
  AreaRef,
  Employee,
  PermitArea,
} from "@/domain/organizacion";
import { hash_pin, is_valid_pin_format, verify_pin_hash } from "@/lib/auth/pin";
import { does_scope_cover_area, get_scope_of_area_ref } from "../alcance";
import { AccessDeniedError, NotFoundError, ValidationError } from "../errores";
import {
  get_employee_full_name,
  get_signer_actor_id,
  get_signer_actor_type,
  get_today_mx,
  is_same_signer,
} from "../identidad";
import type { DataRepositories } from "../repositorios";
import type { OrganizationStore, StoredCredential } from "./almacen_organizacion";

/**
 * Lo que la firma necesita saber de los proveedores (cuentas, semáforo y proveedor del
 * permiso). Lo implementa la parte de contratistas; así organización no depende de ella.
 */
export interface ProviderSignerLookup {
  find_user(userId: number):
    | {
        name: string;
        providerId: number;
        providerEmployeeId: number | null;
        jobTitle: string;
        active: boolean;
      }
    | undefined;
  get_semaphore(providerEmployeeId: number): Semaphore | null;
  /** Proveedor asociado al permiso (null si no tiene o no existe). */
  get_permit_provider_id(permitId: string): Promise<number | null>;
}

type OrganizationRepositories = Pick<
  DataRepositories,
  "employees" | "organization" | "access" | "credentials" | "signatures"
>;

function normalize_text(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function is_current(validFrom: string, validUntil: string | null, today: string): boolean {
  return validFrom <= today && (validUntil === null || validUntil >= today);
}

function to_public_credential(stored: StoredCredential): SigningCredential {
  return {
    id: stored.id,
    signer: stored.signer,
    status: stored.status,
    failedAttempts: stored.failedAttempts,
    lockedUntil: stored.lockedUntil,
    createdAt: stored.createdAt,
    activatedByEmployeeNumber: stored.activatedByEmployeeNumber,
    revokedAt: stored.revokedAt,
    revokedBy: stored.revokedBy,
  };
}

/**
 * Organización, acceso, PIN y firmas en memoria. Replica las reglas de
 * esquema.sql (v_roles_vigentes, tiene_permiso, restricciones únicas de firmas).
 * No implementa cursos requeridos por rol: no hay ninguno configurado (en la BD
 * rol_cursos_requeridos está vacía), así que la regla es vacuamente verdadera.
 */
export function create_organization_repositories(
  store: OrganizationStore,
  audit: DataRepositories["audit"],
  providers: ProviderSignerLookup,
): OrganizationRepositories {
  async function append_audit(
    actorEmployeeNumber: string,
    action: AuditAction,
    entityType: string,
    entityId: string,
    details: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    await audit.append_event({
      entityType,
      entityId,
      action,
      actorType: "EMPLEADO",
      actorId: actorEmployeeNumber,
      occurredAt: new Date().toISOString(),
      details,
    });
  }

  async function append_audit_for_signer(
    signer: SignerIdentity,
    action: AuditAction,
    entityType: string,
    entityId: string,
    details: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    await audit.append_event({
      entityType,
      entityId,
      action,
      actorType: get_signer_actor_type(signer),
      actorId: get_signer_actor_id(signer),
      occurredAt: new Date().toISOString(),
      details,
    });
  }

  function find_employee(employeeNumber: string): Employee | undefined {
    return store.employees.find((employee) => employee.employeeNumber === employeeNumber);
  }

  function get_command_line_of_department(departmentId: number): number | null {
    return store.departments.find((d) => d.id === departmentId)?.commandLineId ?? null;
  }

  /** Roles vigentes de empleados activos: equivale a v_roles_vigentes. */
  function list_current_assignments(employeeNumber: string): RoleAssignment[] {
    const employee = find_employee(employeeNumber);
    if (!employee || !employee.active) return [];
    const today = get_today_mx();
    return store.roleAssignments.filter((assignment) => {
      if (assignment.employeeNumber !== employeeNumber || assignment.revokedAt) return false;
      const role = store.roles.find((r) => r.id === assignment.roleId);
      return role?.active && is_current(assignment.validFrom, assignment.validUntil, today);
    });
  }

  function find_covering_assignment(
    employeeNumber: string,
    permission: PermissionCode,
    area?: PermitArea,
  ): RoleAssignment | undefined {
    return list_current_assignments(employeeNumber).find((assignment) => {
      const role = store.roles.find((r) => r.id === assignment.roleId);
      if (!role?.permissions.includes(permission)) return false;
      if (!area) return true;
      return does_scope_cover_area(
        assignment.scope,
        assignment,
        area,
        get_command_line_of_department(area.departmentId),
      );
    });
  }

  function has_permission_sync(
    employeeNumber: string,
    permission: PermissionCode,
    area?: PermitArea,
  ): boolean {
    return find_covering_assignment(employeeNumber, permission, area) !== undefined;
  }

  function require_permission(employeeNumber: string, permission: PermissionCode): void {
    if (!has_permission_sync(employeeNumber, permission)) {
      throw new AccessDeniedError(`el permiso ${permission}`);
    }
  }

  function require_active_employee(employeeNumber: string): Employee {
    const employee = find_employee(employeeNumber);
    if (!employee || !employee.active) {
      throw new ValidationError(`El empleado ${employeeNumber} no existe o está inactivo`);
    }
    return employee;
  }

  function require_existing_area(ref: AreaRef): void {
    const exists =
      (ref.commandLineId !== null && store.lines.some((l) => l.id === ref.commandLineId)) ||
      (ref.departmentId !== null && store.departments.some((d) => d.id === ref.departmentId)) ||
      (ref.subdepartmentId !== null &&
        store.subdepartments.some((s) => s.id === ref.subdepartmentId));
    if (!exists) throw new ValidationError("El área indicada no existe");
  }

  function require_one_area_level(ref: AreaRef): void {
    const informed = [ref.commandLineId, ref.departmentId, ref.subdepartmentId].filter(
      (id) => id !== null,
    ).length;
    if (informed !== 1) throw new ValidationError("Indica exactamente un nivel de área");
  }

  function require_reason(reason: string | null): string {
    const text = reason?.trim() ?? "";
    if (!text) throw new ValidationError("El motivo es obligatorio");
    return text;
  }

  function get_active_credential(signer: SignerIdentity): StoredCredential | undefined {
    return store.credentials.find(
      (credential) => credential.status !== "REVOCADA" && is_same_signer(credential.signer, signer),
    );
  }

  function is_admin_signer(signer: SignerIdentity): boolean {
    return (
      signer.kind === "EMPLEADO" &&
      list_current_assignments(signer.employeeNumber).some((a) => a.roleCode === adminRoleCode)
    );
  }

  function deny(reason: SignDenialReason): SignDecision {
    return { allowed: false, reason };
  }

  /**
   * Empleados TFS: permiso + alcance. Usuarios de proveedor (no tienen roles): solo los
   * roles de providerSignerRoles, el permiso debe ser de su mismo proveedor y, si la cuenta
   * pertenece a un colaborador, este debe estar en semáforo VERDE.
   */
  async function can_sign_check(request: CanSignRequest): Promise<SignDecision> {
    const permitType = find_permit_type(request.permitTypeSlug);
    if (!permitType || !permitType.signerRoles.includes(request.role)) {
      return deny("ROL_NO_EXIGIDO_POR_PERMISO");
    }

    if (request.signer.kind === "EMPLEADO") {
      const employee = find_employee(request.signer.employeeNumber);
      if (!employee) return deny("ACTOR_NO_ENCONTRADO");
      if (!employee.active) return deny("ACTOR_INACTIVO");

      // El ADMIN_HSEA firma cualquier rol, sin importar permiso ni alcance.
      const permission = get_required_permission(request.role);
      if (
        permission &&
        !is_admin_signer(request.signer) &&
        !has_permission_sync(employee.employeeNumber, permission, request.area)
      ) {
        return deny("SIN_PERMISO_O_ALCANCE");
      }
    } else if (request.signer.kind === "USUARIO_PROVEEDOR") {
      const user = providers.find_user(request.signer.providerUserId);
      if (!user) return deny("ACTOR_NO_ENCONTRADO");
      if (!user.active) return deny("ACTOR_INACTIVO");
      if (!providerSignerRoles.includes(request.role)) return deny("SIN_PERMISO_O_ALCANCE");
      if ((await providers.get_permit_provider_id(request.permitId)) !== user.providerId) {
        return deny("SIN_PERMISO_O_ALCANCE");
      }
      if (user.providerEmployeeId !== null) {
        if (providers.get_semaphore(user.providerEmployeeId) !== "VERDE") {
          return deny("SEMAFORO_NO_VERDE");
        }
      } else if (get_required_permission(request.role) !== null) {
        // Responsable de la tarea: debe ser un colaborador (con semáforo), no una cuenta administrativa.
        return deny("CUENTA_SIN_COLABORADOR");
      }
    } else {
      return deny("ACTOR_NO_ENCONTRADO");
    }

    const permitSignatures = store.signatures.filter((s) => s.permitId === request.permitId);
    if (permitSignatures.some((s) => s.signerRole === request.role)) return deny("ROL_YA_FIRMADO");
    if (!is_admin_signer(request.signer) && permitSignatures.some((s) => is_same_signer(s.signer, request.signer))) {
      return deny("PERSONA_YA_FIRMO_OTRO_ROL");
    }
    return { allowed: true };
  }

  /** Verifica el PIN llevando el conteo de intentos y el bloqueo. */
  async function check_pin(
    signer: SignerIdentity,
    pin: string,
  ): Promise<"OK" | Extract<SignDenialReason, "PIN_NO_ACTIVADO" | "PIN_BLOQUEADO" | "PIN_INCORRECTO">> {
    const credential = get_active_credential(signer);
    if (!credential) return "PIN_NO_ACTIVADO";

    const now = new Date();
    if (credential.status === "BLOQUEADA") {
      if (credential.lockedUntil && new Date(credential.lockedUntil) > now) return "PIN_BLOQUEADO";
      credential.status = "ACTIVA";
      credential.failedAttempts = 0;
      credential.lockedUntil = null;
    }

    if (verify_pin_hash(pin, credential.pinHash)) {
      credential.failedAttempts = 0;
      return "OK";
    }

    credential.failedAttempts += 1;
    const locked = credential.failedAttempts >= maxFailedAttempts;
    if (locked) {
      credential.status = "BLOQUEADA";
      credential.lockedUntil = new Date(now.getTime() + lockoutMinutes * 60_000).toISOString();
    }
    await audit.append_event({
      entityType: "credenciales_firma",
      entityId: credential.id,
      action: "verificar_pin_fallido",
      actorType: get_signer_actor_type(signer),
      actorId: get_signer_actor_id(signer),
      occurredAt: now.toISOString(),
      details: { failedAttempts: credential.failedAttempts, locked },
    });
    return "PIN_INCORRECTO";
  }

  /** Cargo de área vigente del firmante que cubre el área del permiso (foto de la firma). */
  function find_covering_area_assignment(
    employeeNumber: string,
    area: PermitArea,
  ): AreaAssignment | undefined {
    const today = get_today_mx();
    return store.areaAssignments.find(
      (assignment) =>
        assignment.employeeNumber === employeeNumber &&
        is_current(assignment.validFrom, assignment.validUntil, today) &&
        does_scope_cover_area(
          get_scope_of_area_ref(assignment),
          assignment,
          area,
          get_command_line_of_department(area.departmentId),
        ),
    );
  }

  return {
    employees: {
      async find_by_number(employeeNumber) {
        return find_employee(employeeNumber) ?? null;
      },
      async list_by_department(departmentId, options) {
        return store.employees.filter(
          (employee) =>
            employee.departmentId === departmentId &&
            (options?.subdepartmentId === undefined ||
              employee.subdepartmentId === options.subdepartmentId) &&
            (options?.includeInactive || employee.active),
        );
      },
      async search(query, options) {
        const terms = normalize_text(query).split(/\s+/).filter(Boolean);
        if (terms.length === 0) return [];
        const limit = options?.limit ?? 25;
        return store.employees
          .filter((employee) => options?.includeInactive || employee.active)
          .filter((employee) => {
            const haystack = normalize_text(
              `${employee.employeeNumber} ${get_employee_full_name(employee)} ${employee.jobTitle}`,
            );
            return terms.every((term) => haystack.includes(term));
          })
          .slice(0, limit);
      },
    },

    organization: {
      async list_lines() {
        return store.lines;
      },
      async list_departments(commandLineId) {
        return store.departments.filter(
          (department) => commandLineId === undefined || department.commandLineId === commandLineId,
        );
      },
      async list_subdepartments(departmentId) {
        return store.subdepartments.filter(
          (subdepartment) => departmentId === undefined || subdepartment.departmentId === departmentId,
        );
      },
      async list_area_roles(filter) {
        const today = get_today_mx();
        return store.areaAssignments.filter(
          (assignment) =>
            (!filter?.employeeNumber || assignment.employeeNumber === filter.employeeNumber) &&
            (!filter?.area ||
              (assignment.commandLineId === filter.area.commandLineId &&
                assignment.departmentId === filter.area.departmentId &&
                assignment.subdepartmentId === filter.area.subdepartmentId)) &&
            (!filter?.onlyCurrent ||
              (is_current(assignment.validFrom, assignment.validUntil, today) &&
                find_employee(assignment.employeeNumber)?.active === true)),
        );
      },
      async assign_area_role(input, actorEmployeeNumber) {
        require_permission(actorEmployeeNumber, "organizacion:administrar");
        require_active_employee(input.employeeNumber);
        require_one_area_level(input.area);
        require_existing_area(input.area);
        if (input.position === "GERENTE" && input.area.commandLineId === null) {
          throw new ValidationError("El gerente se asigna a una línea de mando");
        }
        if (input.position === "ENCARGADO" && input.area.commandLineId !== null) {
          throw new ValidationError("El encargado se asigna a un departamento o subdepartamento");
        }

        const now = new Date().toISOString();
        const assignment: AreaAssignment = {
          id: String(store.nextId.areaAssignment++),
          employeeNumber: input.employeeNumber,
          position: input.position,
          ...input.area,
          validFrom: input.validFrom ?? get_today_mx(),
          validUntil: null,
          reason: input.reason?.trim() || null,
          createdAt: now,
          createdBy: actorEmployeeNumber,
          updatedAt: now,
          updatedBy: actorEmployeeNumber,
        };
        store.areaAssignments.push(assignment);
        await append_audit(actorEmployeeNumber, "crear", "cargos_area", assignment.id, {
          employeeNumber: assignment.employeeNumber,
          position: assignment.position,
          commandLineId: assignment.commandLineId,
          departmentId: assignment.departmentId,
          subdepartmentId: assignment.subdepartmentId,
        });
        return assignment;
      },
      async end_area_role(assignmentId, reason, actorEmployeeNumber) {
        require_permission(actorEmployeeNumber, "organizacion:administrar");
        const motive = require_reason(reason);
        const assignment = store.areaAssignments.find((a) => a.id === assignmentId);
        if (!assignment) throw new NotFoundError("Cargo de área", assignmentId);
        const today = get_today_mx();
        if (assignment.validUntil !== null && assignment.validUntil <= today) {
          throw new ValidationError("El cargo ya está cerrado");
        }
        assignment.validUntil = assignment.validFrom > today ? assignment.validFrom : today;
        assignment.reason = motive;
        assignment.updatedAt = new Date().toISOString();
        assignment.updatedBy = actorEmployeeNumber;
        await append_audit(actorEmployeeNumber, "actualizar", "cargos_area", assignment.id, {
          event: "end",
          validUntil: assignment.validUntil,
          reason: motive,
        });
        return assignment;
      },
      async create_subdepartment(departmentId, name, actorEmployeeNumber) {
        require_permission(actorEmployeeNumber, "organizacion:administrar");
        const cleanName = name.trim();
        if (!cleanName) throw new ValidationError("El nombre es obligatorio");
        if (!store.departments.some((d) => d.id === departmentId)) {
          throw new NotFoundError("Departamento", String(departmentId));
        }
        const duplicated = store.subdepartments.some(
          (s) => s.departmentId === departmentId && normalize_text(s.name) === normalize_text(cleanName),
        );
        if (duplicated) throw new ValidationError("Ya existe un subdepartamento con ese nombre");

        const now = new Date().toISOString();
        const subdepartment = {
          id: store.nextId.subdepartment++,
          departmentId,
          name: cleanName,
          active: true,
          createdAt: now,
          createdBy: actorEmployeeNumber,
          updatedAt: now,
          updatedBy: actorEmployeeNumber,
        };
        store.subdepartments.push(subdepartment);
        await append_audit(actorEmployeeNumber, "crear", "subdepartamentos", String(subdepartment.id), {
          departmentId,
          name: cleanName,
        });
        return subdepartment;
      },
    },

    access: {
      async list_roles() {
        return store.roles;
      },
      async list_assignments_by_employee(employeeNumber, options) {
        if (options?.onlyCurrent) return list_current_assignments(employeeNumber);
        return store.roleAssignments.filter((a) => a.employeeNumber === employeeNumber);
      },
      async assign_role(input, actorEmployeeNumber) {
        require_permission(actorEmployeeNumber, "roles:administrar");
        const motive = require_reason(input.reason);
        require_active_employee(input.employeeNumber);
        const role = store.roles.find((r) => r.code === input.roleCode && r.active);
        if (!role) throw new ValidationError(`El rol ${input.roleCode} no existe o está inactivo`);

        if (input.scope === "GLOBAL") {
          if (get_scope_of_area_ref(input.area) !== "GLOBAL") {
            throw new ValidationError("El alcance GLOBAL no lleva área");
          }
        } else {
          require_one_area_level(input.area);
          if (get_scope_of_area_ref(input.area) !== input.scope) {
            throw new ValidationError("El área no corresponde al alcance indicado");
          }
          require_existing_area(input.area);
        }

        const validFrom = input.validFrom ?? get_today_mx();
        const validUntil = input.validUntil ?? null;
        if (validUntil !== null && validUntil < validFrom) {
          throw new ValidationError("La vigencia final no puede ser anterior a la inicial");
        }

        const now = new Date().toISOString();
        const assignment: RoleAssignment = {
          id: String(store.nextId.roleAssignment++),
          employeeNumber: input.employeeNumber,
          roleId: role.id,
          roleCode: role.code,
          scope: input.scope,
          ...input.area,
          validFrom,
          validUntil,
          grantedByEmployeeNumber: actorEmployeeNumber,
          reason: motive,
          revokedAt: null,
          revokedByEmployeeNumber: null,
          createdAt: now,
          createdBy: actorEmployeeNumber,
          updatedAt: now,
          updatedBy: actorEmployeeNumber,
        };
        store.roleAssignments.push(assignment);
        await append_audit(actorEmployeeNumber, "asignar_rol", "empleado_roles", assignment.id, {
          employeeNumber: assignment.employeeNumber,
          roleCode: assignment.roleCode,
          scope: assignment.scope,
          commandLineId: assignment.commandLineId,
          departmentId: assignment.departmentId,
          subdepartmentId: assignment.subdepartmentId,
          reason: motive,
        });
        return assignment;
      },
      async revoke_role(assignmentId, reason, actorEmployeeNumber) {
        require_permission(actorEmployeeNumber, "roles:administrar");
        const motive = require_reason(reason);
        const assignment = store.roleAssignments.find((a) => a.id === assignmentId);
        if (!assignment) throw new NotFoundError("Asignación de rol", assignmentId);
        if (assignment.revokedAt) throw new ValidationError("La asignación ya fue revocada");

        // Nunca se queda el sistema sin quien administre roles.
        if (assignment.roleCode === adminRoleCode) {
          const otherAdmins = store.employees.filter(
            (employee) =>
              list_current_assignments(employee.employeeNumber).some(
                (current) => current.roleCode === adminRoleCode && current.id !== assignment.id,
              ),
          );
          if (otherAdmins.length === 0) throw new ValidationError(lastAdminMessage);
        }

        const now = new Date().toISOString();
        assignment.revokedAt = now;
        assignment.revokedByEmployeeNumber = actorEmployeeNumber;
        assignment.updatedAt = now;
        assignment.updatedBy = actorEmployeeNumber;
        await append_audit(actorEmployeeNumber, "revocar_rol", "empleado_roles", assignment.id, {
          employeeNumber: assignment.employeeNumber,
          roleCode: assignment.roleCode,
          reason: motive,
        });
        return assignment;
      },
      async has_permission(employeeNumber, permission, area) {
        return has_permission_sync(employeeNumber, permission, area);
      },
      async can_sign(request) {
        return can_sign_check(request);
      },
      async list_eligible_signers(role, area) {
        const permission = get_required_permission(role);
        if (!permission) return null;
        return store.employees.filter(
          (employee) =>
            employee.active && has_permission_sync(employee.employeeNumber, permission, area),
        );
      },
    },

    credentials: {
      async get_credential(signer) {
        const credential = get_active_credential(signer);
        return credential ? to_public_credential(credential) : null;
      },
      async activate_pin(signer, pin, adminEmployeeNumber) {
        require_permission(adminEmployeeNumber, "roles:administrar");
        if (!is_valid_pin_format(pin)) throw new ValidationError("El PIN no tiene el formato válido");
        if (signer.kind === "EMPLEADO") {
          require_active_employee(signer.employeeNumber);
        } else if (signer.kind === "USUARIO_PROVEEDOR") {
          if (!providers.find_user(signer.providerUserId)?.active) {
            throw new ValidationError("La cuenta de proveedor no existe o está inactiva");
          }
        } else {
          throw new ValidationError("El sistema no firma");
        }

        const now = new Date().toISOString();
        const previous = get_active_credential(signer);
        if (previous) {
          previous.status = "REVOCADA";
          previous.revokedAt = now;
          previous.revokedBy = adminEmployeeNumber;
        }
        const credential: StoredCredential = {
          id: String(store.nextId.credential++),
          signer,
          status: "ACTIVA",
          failedAttempts: 0,
          lockedUntil: null,
          createdAt: now,
          activatedByEmployeeNumber: adminEmployeeNumber,
          revokedAt: null,
          revokedBy: null,
          pinHash: hash_pin(pin),
        };
        store.credentials.push(credential);
        await append_audit(adminEmployeeNumber, "establecer_pin", "credenciales_firma", credential.id, {
          signer: get_signer_actor_id(signer),
          replacedPrevious: previous !== undefined,
        });
        return to_public_credential(credential);
      },
      async verify_pin(signer, pin) {
        return check_pin(signer, pin);
      },
      async revoke_pin(signer, reason, adminEmployeeNumber) {
        require_permission(adminEmployeeNumber, "roles:administrar");
        const motive = require_reason(reason);
        const credential = get_active_credential(signer);
        if (!credential) throw new NotFoundError("PIN de firma", get_signer_actor_id(signer));
        credential.status = "REVOCADA";
        credential.revokedAt = new Date().toISOString();
        credential.revokedBy = adminEmployeeNumber;
        await append_audit(adminEmployeeNumber, "revocar_pin", "credenciales_firma", credential.id, {
          signer: get_signer_actor_id(signer),
          reason: motive,
        });
      },
    },

    signatures: {
      async sign_permit(input) {
        const decision = await can_sign_check(input);
        if (!decision.allowed) return { ok: false, reason: decision.reason };

        if (requireSigningPin) {
          const pinResult = await check_pin(input.signer, input.pin);
          if (pinResult !== "OK") return { ok: false, reason: pinResult };
        }

        // can_sign_check ya garantizó que el firmante existe y está activo.
        let signerName = "";
        let signerJobTitle = "";
        let roleAssignmentId: string | null = null;
        let areaAssignmentId: string | null = null;
        if (input.signer.kind === "EMPLEADO") {
          const employee = find_employee(input.signer.employeeNumber);
          if (!employee) return { ok: false, reason: "ACTOR_NO_ENCONTRADO" };
          const permission = get_required_permission(input.role);
          roleAssignmentId = permission
            ? (find_covering_assignment(employee.employeeNumber, permission, input.area)?.id ?? null)
            : null;
          areaAssignmentId =
            find_covering_area_assignment(employee.employeeNumber, input.area)?.id ?? null;
          signerName = get_employee_full_name(employee);
          signerJobTitle = employee.jobTitle;
        } else if (input.signer.kind === "USUARIO_PROVEEDOR") {
          const user = providers.find_user(input.signer.providerUserId);
          if (!user) return { ok: false, reason: "ACTOR_NO_ENCONTRADO" };
          signerName = user.name;
          signerJobTitle = user.jobTitle;
        } else {
          return { ok: false, reason: "ACTOR_NO_ENCONTRADO" };
        }

        const signature = {
          id: String(store.nextId.signature++),
          permitId: input.permitId,
          signerRole: input.role,
          signer: input.signer,
          area: {
            commandLineId: get_command_line_of_department(input.area.departmentId),
            departmentId: input.area.departmentId,
            subdepartmentId: input.area.subdepartmentId,
          },
          roleAssignmentId,
          areaAssignmentId,
          credentialId: get_active_credential(input.signer)?.id ?? null,
          signerName,
          signerJobTitle,
          signedAt: new Date().toISOString(),
          image: input.image,
          documentHash: input.documentHash,
        };
        store.signatures.push(signature);
        await append_audit_for_signer(input.signer, "firmar", "permisos_trabajo", input.permitId, {
          role: input.role,
          signatureId: signature.id,
          departmentId: input.area.departmentId,
          subdepartmentId: input.area.subdepartmentId,
        });
        return { ok: true, signature };
      },
      async list_by_permit(permitId) {
        return store.signatures.filter((signature) => signature.permitId === permitId);
      },
    },
  };
}
