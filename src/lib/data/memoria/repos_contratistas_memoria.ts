import {
  allowedDocumentMimeTypes,
  documentTypes,
  find_document_type,
  is_work_type_code,
  maxDocumentFileBytes,
  type DocumentTypeDefinition,
  type WorkTypeCode,
} from "@/config/documentos_contratista";
import { adminRoleCode, type PermissionCode } from "@/config/permisos";
import { lockoutMinutes, maxFailedAttempts } from "@/config/seguridad";
import { find_contractor_type, type ContractorTypeCode } from "@/config/tipos_contratista";
import type { ActorIdentity } from "@/domain/acceso";
import type { ActorId, ActorType, AuditAction } from "@/domain/auditoria";
import type {
  ContractorDocument,
  DocumentReview,
  DocumentSubject,
  DocumentVersion,
  EntryRecord,
  NewProviderEmployeeInput,
  PermitParticipant,
  ProviderEmployee,
  ProviderUser,
  RequirementState,
  SubjectSemaphore,
} from "@/domain/contratistas";
import type { WorkPermit } from "@/domain/permisos";
import {
  generate_temporary_password,
  hash_secret,
  minPasswordLength,
  verify_secret,
} from "@/lib/auth/secreto";
import { build_provider_username } from "@/lib/auth/usuario_proveedor";
import { AccessDeniedError, NotFoundError, ValidationError } from "../errores";
import {
  get_date_mx,
  get_employee_full_name,
  get_signer_actor_id,
  get_today_mx,
} from "../identidad";
import type {
  AccessRepository,
  DataRepositories,
  EmployeeRepository,
  WorkPermitRepository,
} from "../repositorios";
import {
  compute_semaphore,
  resolve_document_status,
  resolve_valid_until,
} from "../semaforo";
import {
  assert_valid_date,
  curpPattern,
  emailPattern,
  nssPattern,
  optional_text,
  require_text,
  sha256Pattern,
  taxIdPattern,
} from "../validaciones";
import { hash_pii } from "../huella_pii";
import type { ContractorStore, StoredProviderUser } from "./almacen_contratistas";
import type { ProviderSignerLookup } from "./repos_organizacion_memoria";

type ContractorRepositories = Pick<
  DataRepositories,
  | "providers"
  | "providerUsers"
  | "providerEmployees"
  | "equipment"
  | "documents"
  | "entries"
  | "participants"
>;

interface AuditActor {
  type: ActorType;
  id: ActorId;
}

function to_audit_actor(identity: ActorIdentity): AuditActor {
  return { type: identity.kind, id: get_signer_actor_id(identity) };
}

function to_public_user(stored: StoredProviderUser): ProviderUser {
  const { passwordHash, ...user } = stored;
  void passwordHash;
  return user;
}

function is_same_subject(a: DocumentSubject, b: DocumentSubject): boolean {
  if (a.kind === "EMPLEADO_PROVEEDOR" && b.kind === "EMPLEADO_PROVEEDOR") {
    return a.providerEmployeeId === b.providerEmployeeId;
  }
  if (a.kind === "EQUIPO" && b.kind === "EQUIPO") return a.equipmentId === b.equipmentId;
  if (a.kind === "PROVEEDOR" && b.kind === "PROVEEDOR") return a.providerId === b.providerId;
  return false;
}

function get_subject_provider_id(store: ContractorStore, subject: DocumentSubject): number | null {
  if (subject.kind === "PROVEEDOR") {
    return store.providers.some((p) => p.id === subject.providerId) ? subject.providerId : null;
  }
  if (subject.kind === "EMPLEADO_PROVEEDOR") {
    return store.employees.find((e) => e.id === subject.providerEmployeeId)?.providerId ?? null;
  }
  return store.equipment.find((e) => e.id === subject.equipmentId)?.providerId ?? null;
}

/** El colaborador, equipo o proveedor dueño del documento. */
function find_subject_owner(
  store: ContractorStore,
  subject: DocumentSubject,
): { providerId: number; active: boolean } | undefined {
  if (subject.kind === "PROVEEDOR") {
    return store.providers.some((p) => p.id === subject.providerId)
      ? { providerId: subject.providerId, active: true }
      : undefined;
  }
  return subject.kind === "EMPLEADO_PROVEEDOR"
    ? store.employees.find((e) => e.id === subject.providerEmployeeId)
    : store.equipment.find((e) => e.id === subject.equipmentId);
}

function find_latest_version(store: ContractorStore, documentId: string): DocumentVersion | undefined {
  return store.versions
    .filter((version) => version.documentId === documentId)
    .sort((a, b) => b.versionNumber - a.versionNumber)[0];
}

/** Tipos que el sujeto debe cumplir: los obligatorios + el DC-3 de los trabajos declarados. */
function list_required_types(store: ContractorStore, subject: DocumentSubject): DocumentTypeDefinition[] {
  if (subject.kind === "EQUIPO") {
    return documentTypes.filter((type) => type.appliesTo === "EQUIPO" && type.mandatory);
  }
  if (subject.kind === "PROVEEDOR") {
    return documentTypes.filter((type) => type.appliesTo === "PROVEEDOR" && type.mandatory);
  }
  const employee = store.employees.find((e) => e.id === subject.providerEmployeeId);
  const declared: WorkTypeCode[] = employee?.workTypes ?? [];
  return documentTypes.filter(
    (type) =>
      type.appliesTo === "EMPLEADO_PROVEEDOR" &&
      (type.mandatory || (type.workTypeCode !== null && declared.includes(type.workTypeCode))),
  );
}

function evaluate_requirement(
  store: ContractorStore,
  subject: DocumentSubject,
  type: DocumentTypeDefinition,
  today: string,
): RequirementState {
  const missing: RequirementState = {
    documentTypeCode: type.code,
    status: "FALTANTE",
    documentId: null,
    versionId: null,
    validUntil: null,
  };
  const document = store.documents.find(
    (d) => d.documentTypeCode === type.code && is_same_subject(d.subject, subject),
  );
  if (!document) return missing;
  const version = find_latest_version(store, document.id);
  if (!version) return missing;

  const review = store.reviews.find((r) => r.versionId === version.id);
  const validUntil = resolve_valid_until(type, version);
  return {
    documentTypeCode: type.code,
    status: resolve_document_status(validUntil, review, today),
    documentId: document.id,
    versionId: version.id,
    validUntil,
  };
}

/** null si el sujeto no existe o está inactivo. */
export function compute_subject_semaphore(
  store: ContractorStore,
  subject: DocumentSubject,
): SubjectSemaphore | null {
  const owner = find_subject_owner(store, subject);
  if (!owner || !owner.active) return null;
  const provider = store.providers.find((p) => p.id === owner.providerId);
  if (!provider) return null;

  const today = get_today_mx();
  const requirements = list_required_types(store, subject).map((type) =>
    evaluate_requirement(store, subject, type, today),
  );
  // Los documentos del proveedor (p. ej. el comprobante de pago del IMSS) cuentan para todo su personal.
  if (subject.kind === "EMPLEADO_PROVEEDOR") {
    const providerSubject: DocumentSubject = { kind: "PROVEEDOR", providerId: owner.providerId };
    for (const type of list_required_types(store, providerSubject)) {
      requirements.push(evaluate_requirement(store, providerSubject, type, today));
    }
  }
  return {
    subject,
    semaphore: compute_semaphore(
      requirements.map((r) => r.status),
      provider.status,
    ),
    requirements,
  };
}

/** Lo que la firma de permisos necesita saber de los proveedores. */
export function create_provider_signer_lookup(
  store: ContractorStore,
  permits: WorkPermitRepository,
): ProviderSignerLookup {
  return {
    find_user(userId) {
      const user = store.users.find((u) => u.id === userId);
      if (!user) return undefined;
      const employee =
        user.providerEmployeeId === null
          ? undefined
          : store.employees.find((e) => e.id === user.providerEmployeeId);
      return {
        name: user.name,
        providerId: user.providerId,
        providerEmployeeId: user.providerEmployeeId,
        jobTitle: employee?.jobTitle ?? "Representante del proveedor",
        active: user.active,
      };
    },
    get_semaphore(providerEmployeeId) {
      return (
        compute_subject_semaphore(store, { kind: "EMPLEADO_PROVEEDOR", providerEmployeeId })
          ?.semaphore ?? null
      );
    },
    async get_permit_provider_id(permitId) {
      const permit = await permits.get_by_id(permitId);
      if (!permit || permit.providerId === null) return null;
      const providerId = Number(permit.providerId);
      return Number.isInteger(providerId) ? providerId : null;
    },
  };
}

export function create_contractor_repositories(
  store: ContractorStore,
  audit: DataRepositories["audit"],
  access: AccessRepository,
  employees: EmployeeRepository,
  permits: WorkPermitRepository,
): ContractorRepositories {
  async function append_audit(
    actor: AuditActor,
    action: AuditAction,
    entityType: string,
    entityId: string,
    details: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    await audit.append_event({
      entityType,
      entityId,
      action,
      actorType: actor.type,
      actorId: actor.id,
      occurredAt: new Date().toISOString(),
      details,
    });
  }

  async function require_permission(employeeNumber: string, permission: PermissionCode): Promise<void> {
    if (!(await access.has_permission(employeeNumber, permission))) {
      throw new AccessDeniedError(`el permiso ${permission}`);
    }
  }

  /** El administrador HSEA es la única excepción a no revisar lo que él mismo subió. */
  async function is_hsea_admin(employeeNumber: string): Promise<boolean> {
    const assignments = await access.list_assignments_by_employee(employeeNumber, { onlyCurrent: true });
    return assignments.some((assignment) => assignment.roleCode === adminRoleCode);
  }

  function get_provider_or_throw(providerId: number) {
    const provider = store.providers.find((p) => p.id === providerId);
    if (!provider) throw new NotFoundError("Proveedor", String(providerId));
    return provider;
  }

  /**
   * Empleado TFS con `contratistas:gestionar`, o usuario activo del proveedor
   * (administrador si `requireAdmin`). Un proveedor suspendido bloquea a sus usuarios.
   */
  async function authorize_provider(
    actor: ActorIdentity,
    providerId: number,
    options?: { requireAdmin?: boolean },
  ): Promise<void> {
    const provider = get_provider_or_throw(providerId);
    if (actor.kind === "EMPLEADO") {
      await require_permission(actor.employeeNumber, "contratistas:gestionar");
      return;
    }
    if (actor.kind === "USUARIO_PROVEEDOR") {
      const user = store.users.find((u) => u.id === actor.providerUserId);
      if (!user || !user.active || user.providerId !== providerId) {
        throw new AccessDeniedError("ser usuario activo de este proveedor");
      }
      if (options?.requireAdmin && !user.isAdministrator) {
        throw new AccessDeniedError("ser administrador del proveedor");
      }
      if (provider.status === "SUSPENDIDO") throw new ValidationError("El proveedor está suspendido");
      return;
    }
    throw new AccessDeniedError("una identidad válida");
  }

  function get_employee_or_throw(employeeId: number): ProviderEmployee {
    const employee = store.employees.find((e) => e.id === employeeId);
    if (!employee) throw new NotFoundError("Colaborador de proveedor", String(employeeId));
    return employee;
  }

  function validate_work_types(workTypes: string[]): WorkTypeCode[] {
    const result: WorkTypeCode[] = [];
    for (const code of workTypes) {
      if (!is_work_type_code(code)) throw new ValidationError(`Trabajo específico desconocido: ${code}`);
      if (!result.includes(code)) result.push(code);
    }
    return result;
  }

  async function create_employee_record(
    providerId: number,
    input: NewProviderEmployeeInput,
    actor: ActorIdentity,
  ): Promise<ProviderEmployee> {
    const curp = require_text(input.curp, "La CURP").toUpperCase();
    const nss = require_text(input.nss, "El NSS").replace(/\s+/g, "");
    if (!curpPattern.test(curp)) throw new ValidationError("La CURP no tiene un formato válido");
    if (!nssPattern.test(nss)) throw new ValidationError("El NSS debe tener 11 dígitos");
    const curpHash = hash_pii("curp", curp);
    const nssHash = hash_pii("nss", nss);
    if (store.employees.some((e) => e.curp === curpHash)) throw new ValidationError("Ya existe un colaborador con esa CURP");
    if (store.employees.some((e) => e.nss === nssHash)) throw new ValidationError("Ya existe un colaborador con ese NSS");

    const now = new Date().toISOString();
    const actorId = get_signer_actor_id(actor);
    const employee: ProviderEmployee = {
      id: store.nextId.employee++,
      providerId,
      firstName: require_text(input.firstName, "El nombre"),
      middleName: optional_text(input.middleName),
      paternalSurname: require_text(input.paternalSurname, "El apellido paterno"),
      maternalSurname: optional_text(input.maternalSurname),
      curp: curpHash,
      nss: nssHash,
      jobTitle: require_text(input.jobTitle, "El puesto"),
      active: true,
      terminationDate: null,
      workTypes: validate_work_types(input.workTypes ?? []),
      createdAt: now,
      createdBy: actorId,
      updatedAt: now,
      updatedBy: actorId,
    };
    store.employees.push(employee);
    await append_audit(to_audit_actor(actor), "crear", "empleados_proveedor", String(employee.id), {
      providerId,
      workTypes: employee.workTypes.join(","),
    });
    return employee;
  }

  /** Quién puede alterar los participantes de un permiso: quien lo crea (TFS) o su proveedor. */
  async function authorize_permit_editor(actor: ActorIdentity, permit: WorkPermit): Promise<void> {
    if (actor.kind === "EMPLEADO") {
      // El empleado que creó el permiso administra a sus participantes sin necesitar un rol aparte.
      if (permit.requestedByEmployeeNumber === actor.employeeNumber) return;
      await require_permission(actor.employeeNumber, "permisos:crear");
      return;
    }
    if (actor.kind === "USUARIO_PROVEEDOR") {
      const user = store.users.find((u) => u.id === actor.providerUserId);
      if (!user || !user.active || String(user.providerId) !== permit.providerId) {
        throw new AccessDeniedError("ser usuario del proveedor de este permiso");
      }
      return;
    }
    throw new AccessDeniedError("una identidad válida");
  }

  return {
    providers: {
      async register_provider(input) {
        const name = require_text(input.name, "La razón social");
        const taxId = require_text(input.taxId, "El RFC").toUpperCase();
        const contactEmail = require_text(input.contactEmail, "El correo de contacto");
        if (!taxIdPattern.test(taxId)) throw new ValidationError("El RFC no tiene un formato válido");
        if (!emailPattern.test(contactEmail)) throw new ValidationError("El correo no es válido");
        if (store.providers.some((p) => p.taxId === taxId)) {
          throw new ValidationError("Ya existe un proveedor con ese RFC");
        }
        const types = [...new Set(input.contractorTypes)];
        if (types.length === 0) throw new ValidationError("Indica al menos un tipo de contratista");
        if (types.some((code) => !find_contractor_type(code))) {
          throw new ValidationError("Tipo de contratista desconocido");
        }

        const now = new Date().toISOString();
        const provider = {
          id: store.nextId.provider++,
          name,
          taxId,
          imssEmployerRegistration: optional_text(input.imssEmployerRegistration),
          contactEmail,
          phone: optional_text(input.phone),
          status: "PENDIENTE_VALIDACION" as const,
          contractorTypes: types,
          createdAt: now,
          createdBy: "AUTOREGISTRO",
          updatedAt: now,
          updatedBy: "AUTOREGISTRO",
        };
        store.providers.push(provider);
        await append_audit({ type: "SISTEMA", id: "AUTOREGISTRO" }, "crear", "proveedores", String(provider.id), {
          taxId,
          contractorTypes: types.join(","),
        });
        return provider;
      },
      async list_providers(filter) {
        return store.providers.filter((p) => !filter?.status || p.status === filter.status);
      },
      async get_provider(id) {
        return store.providers.find((p) => p.id === id) ?? null;
      },
      async set_provider_status(providerId, status, reason, actorEmployeeNumber) {
        await require_permission(actorEmployeeNumber, "contratistas:gestionar");
        const provider = get_provider_or_throw(providerId);
        if (provider.status === status) throw new ValidationError(`El proveedor ya está ${status}`);
        const motive = optional_text(reason);
        if (status === "SUSPENDIDO" && !motive) throw new ValidationError("El motivo es obligatorio al suspender");

        const previous = provider.status;
        provider.status = status;
        provider.updatedAt = new Date().toISOString();
        provider.updatedBy = actorEmployeeNumber;
        await append_audit({ type: "EMPLEADO", id: actorEmployeeNumber }, "actualizar", "proveedores", String(provider.id), {
          event: "status",
          from: previous,
          to: status,
          reason: motive,
        });
        return provider;
      },
      async set_contractor_types(providerId, types, actor) {
        await authorize_provider(actor, providerId, { requireAdmin: true });
        const unique = [...new Set<ContractorTypeCode>(types)];
        if (unique.length === 0) throw new ValidationError("Indica al menos un tipo de contratista");
        if (unique.some((code) => !find_contractor_type(code))) {
          throw new ValidationError("Tipo de contratista desconocido");
        }
        const provider = get_provider_or_throw(providerId);
        provider.contractorTypes = unique;
        provider.updatedAt = new Date().toISOString();
        provider.updatedBy = get_signer_actor_id(actor);
        await append_audit(to_audit_actor(actor), "actualizar", "proveedor_tipos_contratista", String(providerId), {
          contractorTypes: unique.join(","),
        });
        return provider;
      },
    },

    providerUsers: {
      async get_user(userId) {
        const user = store.users.find((u) => u.id === userId);
        return user ? to_public_user(user) : null;
      },
      async list_users(providerId, actor) {
        await authorize_provider(actor, providerId);
        return store.users.filter((u) => u.providerId === providerId).map(to_public_user);
      },
      async create_user(input, actor) {
        await authorize_provider(actor, input.providerId, { requireAdmin: true });
        const firstName = require_text(input.firstName, "El nombre");
        const paternalSurname = require_text(input.paternalSurname, "El apellido paterno");
        if (input.providerEmployeeId !== null) {
          const employee = get_employee_or_throw(input.providerEmployeeId);
          if (employee.providerId !== input.providerId) {
            throw new ValidationError("El colaborador no pertenece a este proveedor");
          }
        }
        const email = optional_text(input.email);
        if (email && !emailPattern.test(email)) throw new ValidationError("El correo no es válido");

        // El usuario son 8 caracteres con 2 dígitos aleatorios: ante colisión se reintenta.
        let username = "";
        for (let attempt = 0; attempt < 50; attempt += 1) {
          const candidate = build_provider_username(firstName, paternalSurname, input.maternalSurname);
          if (!store.users.some((u) => u.username === candidate)) {
            username = candidate;
            break;
          }
        }
        if (!username) throw new ValidationError("No se pudo generar un usuario único; intenta de nuevo");

        const temporaryPassword = generate_temporary_password();
        const now = new Date().toISOString();
        const actorId = get_signer_actor_id(actor);
        const user: StoredProviderUser = {
          id: store.nextId.user++,
          providerId: input.providerId,
          providerEmployeeId: input.providerEmployeeId,
          name: [firstName, paternalSurname, optional_text(input.maternalSurname)]
            .filter((part): part is string => Boolean(part))
            .join(" "),
          username,
          email,
          isAdministrator: input.isAdministrator,
          active: true,
          mustChangePassword: true,
          failedAttempts: 0,
          lockedUntil: null,
          passwordHash: hash_secret(temporaryPassword),
          createdAt: now,
          createdBy: actorId,
          updatedAt: now,
          updatedBy: actorId,
        };
        store.users.push(user);
        await append_audit(to_audit_actor(actor), "crear", "usuarios_proveedor", String(user.id), {
          providerId: user.providerId,
          username,
          isAdministrator: user.isAdministrator,
        });
        return { user: to_public_user(user), temporaryPassword };
      },
      async list_employee_ids_with_inactive_account(providerId) {
        const linked = store.users.filter((u) => u.providerId === providerId && u.providerEmployeeId !== null);
        const ids = new Set(linked.map((u) => u.providerEmployeeId as number));
        return [...ids].filter((id) => linked.filter((u) => u.providerEmployeeId === id).every((u) => !u.active));
      },
      async login(username, password) {
        const user = store.users.find((u) => u.username === username.trim().toLowerCase());
        if (!user) return { ok: false, reason: "CREDENCIALES_INVALIDAS" };

        const now = new Date();
        if (user.lockedUntil && new Date(user.lockedUntil) > now) {
          return { ok: false, reason: "USUARIO_BLOQUEADO" };
        }
        if (user.lockedUntil) {
          user.lockedUntil = null;
          user.failedAttempts = 0;
        }

        const actor: AuditActor = { type: "USUARIO_PROVEEDOR", id: `P-${user.id}` };
        if (!verify_secret(password, user.passwordHash)) {
          user.failedAttempts += 1;
          const locked = user.failedAttempts >= maxFailedAttempts;
          if (locked) user.lockedUntil = new Date(now.getTime() + lockoutMinutes * 60_000).toISOString();
          await append_audit(actor, "inicio_sesion_fallido", "usuarios_proveedor", String(user.id), {
            failedAttempts: user.failedAttempts,
            locked,
          });
          return { ok: false, reason: "CREDENCIALES_INVALIDAS" };
        }

        if (!user.active) return { ok: false, reason: "USUARIO_INACTIVO" };
        if (get_provider_or_throw(user.providerId).status === "SUSPENDIDO") {
          return { ok: false, reason: "PROVEEDOR_SUSPENDIDO" };
        }
        user.failedAttempts = 0;
        await append_audit(actor, "iniciar_sesion", "usuarios_proveedor", String(user.id), {});
        return { ok: true, user: to_public_user(user) };
      },
      async change_password(userId, currentPassword, newPassword) {
        const user = store.users.find((u) => u.id === userId);
        if (!user || !user.active) throw new NotFoundError("Usuario de proveedor", String(userId));
        if (!verify_secret(currentPassword, user.passwordHash)) {
          throw new ValidationError("La contraseña actual no es correcta");
        }
        if (newPassword.length < minPasswordLength) {
          throw new ValidationError(`La contraseña debe tener al menos ${minPasswordLength} caracteres`);
        }
        if (newPassword === currentPassword) throw new ValidationError("La contraseña nueva debe ser distinta");

        user.passwordHash = hash_secret(newPassword);
        user.mustChangePassword = false;
        user.updatedAt = new Date().toISOString();
        user.updatedBy = `P-${user.id}`;
        await append_audit({ type: "USUARIO_PROVEEDOR", id: `P-${user.id}` }, "actualizar", "usuarios_proveedor", String(user.id), {
          event: "change_password",
        });
      },
      async reset_password(userId, actor) {
        const user = store.users.find((u) => u.id === userId);
        if (!user) throw new NotFoundError("Usuario de proveedor", String(userId));
        await authorize_provider(actor, user.providerId, { requireAdmin: true });

        const temporaryPassword = generate_temporary_password();
        user.passwordHash = hash_secret(temporaryPassword);
        user.mustChangePassword = true;
        user.failedAttempts = 0;
        user.lockedUntil = null;
        user.updatedAt = new Date().toISOString();
        user.updatedBy = get_signer_actor_id(actor);
        await append_audit(to_audit_actor(actor), "restablecer_password", "usuarios_proveedor", String(user.id), {});
        return temporaryPassword;
      },
      async set_user_active(userId, active, reason, actor) {
        const user = store.users.find((u) => u.id === userId);
        if (!user) throw new NotFoundError("Usuario de proveedor", String(userId));
        await authorize_provider(actor, user.providerId, { requireAdmin: true });
        const motive = require_text(reason, "El motivo");
        if (actor.kind === "USUARIO_PROVEEDOR" && actor.providerUserId === userId && !active) {
          throw new ValidationError("No puedes desactivar tu propia cuenta");
        }
        user.active = active;
        user.updatedAt = new Date().toISOString();
        user.updatedBy = get_signer_actor_id(actor);
        await append_audit(to_audit_actor(actor), "actualizar", "usuarios_proveedor", String(user.id), {
          event: active ? "activate" : "deactivate",
          reason: motive,
        });
        return to_public_user(user);
      },
      async set_user_employee(userId, providerEmployeeId, reason, actor) {
        const user = store.users.find((u) => u.id === userId);
        if (!user) throw new NotFoundError("Usuario de proveedor", String(userId));
        await authorize_provider(actor, user.providerId, { requireAdmin: true });
        const motive = require_text(reason, "El motivo");
        if (
          providerEmployeeId !== null &&
          !store.employees.some((e) => e.id === providerEmployeeId && e.providerId === user.providerId && e.active)
        ) {
          throw new ValidationError("El colaborador no existe, está de baja o es de otro proveedor");
        }
        user.providerEmployeeId = providerEmployeeId;
        user.updatedAt = new Date().toISOString();
        user.updatedBy = get_signer_actor_id(actor);
        await append_audit(to_audit_actor(actor), "actualizar", "usuarios_proveedor", String(user.id), {
          event: "link_employee",
          providerEmployeeId,
          reason: motive,
        });
        return to_public_user(user);
      },
    },

    providerEmployees: {
      async list_employees(providerId, options) {
        return store.employees.filter(
          (e) => e.providerId === providerId && (options?.includeInactive || e.active),
        );
      },
      async get_employee(employeeId) {
        return store.employees.find((e) => e.id === employeeId) ?? null;
      },
      async add_employee(providerId, input, actor) {
        await authorize_provider(actor, providerId);
        return create_employee_record(providerId, input, actor);
      },
      async import_employees(providerId, rows, actor) {
        await authorize_provider(actor, providerId);
        const created: ProviderEmployee[] = [];
        const rejected: { row: number; reason: string }[] = [];
        for (const [index, row] of rows.entries()) {
          try {
            created.push(await create_employee_record(providerId, row, actor));
          } catch (error) {
            if (!(error instanceof ValidationError)) throw error;
            rejected.push({ row: index + 1, reason: error.message });
          }
        }
        return { created, rejected };
      },
      async deactivate_employee(employeeId, reason, actor) {
        const employee = get_employee_or_throw(employeeId);
        await authorize_provider(actor, employee.providerId);
        const motive = require_text(reason, "El motivo");
        if (!employee.active) throw new ValidationError("El colaborador ya está inactivo");

        employee.active = false;
        employee.terminationDate = get_today_mx();
        employee.updatedAt = new Date().toISOString();
        employee.updatedBy = get_signer_actor_id(actor);
        await append_audit(to_audit_actor(actor), "actualizar", "empleados_proveedor", String(employee.id), {
          event: "deactivate",
          reason: motive,
        });
        return employee;
      },
      async set_work_types(employeeId, workTypes, actor) {
        const employee = get_employee_or_throw(employeeId);
        await authorize_provider(actor, employee.providerId);
        if (!employee.active) throw new ValidationError("El colaborador está inactivo");

        employee.workTypes = validate_work_types(workTypes);
        employee.updatedAt = new Date().toISOString();
        employee.updatedBy = get_signer_actor_id(actor);
        await append_audit(to_audit_actor(actor), "actualizar", "empleado_proveedor_trabajos", String(employee.id), {
          workTypes: employee.workTypes.join(","),
        });
        return employee;
      },
      async get_semaphore(employeeId) {
        return compute_subject_semaphore(store, { kind: "EMPLEADO_PROVEEDOR", providerEmployeeId: employeeId });
      },
      async list_semaphores(providerId) {
        return store.employees
          .filter((e) => e.providerId === providerId && e.active)
          .flatMap((e) => {
            const result = compute_subject_semaphore(store, {
              kind: "EMPLEADO_PROVEEDOR",
              providerEmployeeId: e.id,
            });
            return result ? [result] : [];
          });
      },
      async add_photo(employeeId, input, actor) {
        const employee = get_employee_or_throw(employeeId);
        await authorize_provider(actor, employee.providerId);
        // Un usuario de proveedor que no es administrador solo sube la foto de su propio registro.
        if (actor.kind === "USUARIO_PROVEEDOR") {
          const user = store.users.find((u) => u.id === actor.providerUserId);
          if (user && !user.isAdministrator && user.providerEmployeeId !== employeeId) {
            throw new AccessDeniedError("ser el propio colaborador o el administrador del proveedor");
          }
        }
        if (!employee.active) throw new ValidationError("El colaborador está inactivo");
        if (!sha256Pattern.test(input.sha256)) throw new ValidationError("El hash sha256 no es válido");
        const photo = {
          id: String(store.nextId.photo++),
          providerEmployeeId: employeeId,
          fileName: require_text(input.fileName, "El nombre del archivo"),
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          storagePath: require_text(input.storagePath, "La ruta del archivo") as string | null,
          fileDeletedAt: null as string | null,
          sha256: input.sha256,
          uploadedBy: get_signer_actor_id(actor),
          uploadedAt: new Date().toISOString(),
        };
        store.photos.push(photo);
        await append_audit(to_audit_actor(actor), "crear", "fotos_colaborador", photo.id, {
          providerEmployeeId: employeeId,
          sha256: photo.sha256,
        });
        return photo;
      },
      async get_current_photo(employeeId) {
        const photos = store.photos.filter((p) => p.providerEmployeeId === employeeId);
        const latest = photos.at(-1);
        return latest && latest.storagePath !== null ? latest : null;
      },
      async delete_current_photo(employeeId, reason, actor) {
        const employee = get_employee_or_throw(employeeId);
        await authorize_provider(actor, employee.providerId);
        const motive = require_text(reason, "El motivo");
        const photo = store.photos.filter((p) => p.providerEmployeeId === employeeId).at(-1);
        if (!photo || photo.storagePath === null) throw new ValidationError("El colaborador no tiene fotografía");
        photo.storagePath = null;
        photo.fileDeletedAt = new Date().toISOString();
        await append_audit(to_audit_actor(actor), "purgar_archivo", "fotos_colaborador", photo.id, {
          providerEmployeeId: employeeId,
          sha256: photo.sha256,
          reason: motive,
        });
        return photo;
      },
    },

    equipment: {
      async list_equipment(providerId, options) {
        return store.equipment.filter(
          (e) => e.providerId === providerId && (options?.includeInactive || e.active),
        );
      },
      async add_equipment(providerId, input, actor) {
        await authorize_provider(actor, providerId);
        const now = new Date().toISOString();
        const actorId = get_signer_actor_id(actor);
        const equipment = {
          id: store.nextId.equipment++,
          providerId,
          equipmentType: require_text(input.equipmentType, "El tipo de equipo").toUpperCase(),
          description: optional_text(input.description),
          brand: optional_text(input.brand),
          model: optional_text(input.model),
          serialNumber: optional_text(input.serialNumber),
          plates: optional_text(input.plates),
          active: true,
          createdAt: now,
          createdBy: actorId,
          updatedAt: now,
          updatedBy: actorId,
        };
        store.equipment.push(equipment);
        await append_audit(to_audit_actor(actor), "crear", "equipos_proveedor", String(equipment.id), {
          providerId,
          equipmentType: equipment.equipmentType,
        });
        return equipment;
      },
      async deactivate_equipment(equipmentId, reason, actor) {
        const equipment = store.equipment.find((e) => e.id === equipmentId);
        if (!equipment) throw new NotFoundError("Equipo", String(equipmentId));
        await authorize_provider(actor, equipment.providerId);
        const motive = require_text(reason, "El motivo");
        if (!equipment.active) throw new ValidationError("El equipo ya está inactivo");

        equipment.active = false;
        equipment.updatedAt = new Date().toISOString();
        equipment.updatedBy = get_signer_actor_id(actor);
        await append_audit(to_audit_actor(actor), "actualizar", "equipos_proveedor", String(equipment.id), {
          event: "deactivate",
          reason: motive,
        });
        return equipment;
      },
      async get_semaphore(equipmentId) {
        return compute_subject_semaphore(store, { kind: "EQUIPO", equipmentId });
      },
    },

    documents: {
      async list_requirements(subject) {
        const today = get_today_mx();
        return list_required_types(store, subject).map((type) =>
          evaluate_requirement(store, subject, type, today),
        );
      },
      async list_versions(documentId) {
        return store.versions
          .filter((v) => v.documentId === documentId)
          .sort((a, b) => a.versionNumber - b.versionNumber);
      },
      async get_version(versionId) {
        const version = store.versions.find((v) => v.id === versionId);
        const document = version ? store.documents.find((d) => d.id === version.documentId) : undefined;
        if (!version || !document) return null;
        const providerId = get_subject_provider_id(store, document.subject);
        return providerId === null ? null : { document, version, providerId };
      },
      async list_documents(subject) {
        return store.documents.filter((d) => is_same_subject(d.subject, subject));
      },
      async list_reviews(documentId) {
        const versionIds = new Set(store.versions.filter((v) => v.documentId === documentId).map((v) => v.id));
        return store.reviews.filter((r) => versionIds.has(r.versionId));
      },
      async upload_version(input, actor) {
        const providerId = get_subject_provider_id(store, input.subject);
        if (providerId === null) throw new NotFoundError("Colaborador o equipo", "del documento");
        await authorize_provider(actor, providerId);

        if (!find_subject_owner(store, input.subject)?.active) {
          throw new ValidationError("El colaborador o equipo está inactivo");
        }

        const type = find_document_type(input.documentTypeCode);
        if (!type) throw new ValidationError(`Tipo de documento desconocido: ${input.documentTypeCode}`);
        if (type.appliesTo !== input.subject.kind) {
          throw new ValidationError("Ese documento no aplica a este tipo de sujeto");
        }
        if (!list_required_types(store, input.subject).some((t) => t.code === type.code)) {
          throw new ValidationError("Ese documento no se exige a este colaborador (declara primero el trabajo)");
        }

        const fileName = require_text(input.fileName, "El nombre del archivo");
        const storagePath = require_text(input.storagePath, "La ruta del archivo");
        if (!(allowedDocumentMimeTypes as readonly string[]).includes(input.mimeType)) {
          throw new ValidationError("Formato no permitido (usa PDF, JPG o PNG)");
        }
        if (input.sizeBytes <= 0 || input.sizeBytes > maxDocumentFileBytes) {
          throw new ValidationError("El archivo excede el tamaño permitido o está vacío");
        }
        if (!sha256Pattern.test(input.sha256)) throw new ValidationError("El hash sha256 no es válido");
        assert_valid_date(input.issueDate, "La fecha de emisión");
        assert_valid_date(input.expiryDate, "La fecha de vencimiento");
        if (input.issueDate && input.expiryDate && input.expiryDate < input.issueDate) {
          throw new ValidationError("El vencimiento no puede ser anterior a la emisión");
        }

        const now = new Date().toISOString();
        const actorId = get_signer_actor_id(actor);
        let document = store.documents.find(
          (d) => d.documentTypeCode === type.code && is_same_subject(d.subject, input.subject),
        );
        if (!document) {
          document = {
            id: String(store.nextId.document++),
            subject: input.subject,
            documentTypeCode: type.code,
            createdAt: now,
            createdBy: actorId,
          };
          store.documents.push(document);
        }
        const latest = find_latest_version(store, document.id);
        const version: DocumentVersion = {
          id: String(store.nextId.version++),
          documentId: document.id,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          fileName,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          storagePath,
          fileDeletedAt: null,
          sha256: input.sha256,
          issueDate: input.issueDate,
          expiryDate: input.expiryDate,
          uploadedBy: actorId,
          uploadedAt: now,
        };
        store.versions.push(version);
        await append_audit(to_audit_actor(actor), "subir_version", "versiones_documento", version.id, {
          documentId: document.id,
          documentTypeCode: type.code,
          versionNumber: version.versionNumber,
          sha256: version.sha256,
        });
        return { document, version };
      },
      async review_version(input, actorEmployeeNumber) {
        const version = store.versions.find((v) => v.id === input.versionId);
        if (!version) throw new NotFoundError("Versión de documento", input.versionId);
        const document = store.documents.find((d) => d.id === version.documentId);
        const type = document ? find_document_type(document.documentTypeCode) : undefined;
        if (!document || !type) throw new NotFoundError("Documento", version.documentId);

        await require_permission(actorEmployeeNumber, type.reviewPermission);
        if (find_latest_version(store, document.id)?.id !== version.id) {
          throw new ValidationError("Solo se revisa la versión más reciente");
        }
        if (store.reviews.some((r) => r.versionId === version.id)) {
          throw new ValidationError("Esta versión ya fue revisada");
        }
        if (version.uploadedBy === actorEmployeeNumber && !(await is_hsea_admin(actorEmployeeNumber))) {
          throw new ValidationError("No puedes revisar un documento que tú mismo subiste");
        }
        const reason = optional_text(input.reason);
        if (input.result === "RECHAZADO" && !reason) {
          throw new ValidationError("El motivo es obligatorio al rechazar");
        }

        const review: DocumentReview = {
          id: String(store.nextId.review++),
          versionId: version.id,
          result: input.result,
          reviewerEmployeeNumber: actorEmployeeNumber,
          reason,
          reviewedAt: new Date().toISOString(),
          revocation: null,
        };
        store.reviews.push(review);
        await append_audit(
          { type: "EMPLEADO", id: actorEmployeeNumber },
          input.result === "APROBADO" ? "aprobar_revision" : "rechazar_revision",
          "revisiones_documento",
          review.id,
          { versionId: version.id, documentTypeCode: document.documentTypeCode, reason },
        );
        return review;
      },
      async revoke_review(versionId, reason, actorEmployeeNumber) {
        await require_permission(actorEmployeeNumber, "contratistas:gestionar");
        const motive = require_text(reason, "El motivo");
        const version = store.versions.find((v) => v.id === versionId);
        const review = store.reviews.find((r) => r.versionId === versionId);
        if (!version || !review) throw new NotFoundError("Revisión de la versión", versionId);
        if (review.result !== "APROBADO") throw new ValidationError("Solo se revoca un documento aprobado");
        if (review.revocation) throw new ValidationError("Esta aprobación ya fue revocada");
        if (find_latest_version(store, version.documentId)?.id !== version.id) {
          throw new ValidationError("Solo se revoca la versión más reciente");
        }
        const document = store.documents.find((d) => d.id === version.documentId);
        review.revocation = {
          revokedAt: new Date().toISOString(),
          revokedByEmployeeNumber: actorEmployeeNumber,
          reason: motive,
        };
        await append_audit({ type: "EMPLEADO", id: actorEmployeeNumber }, "revocar_revision", "revisiones_documento", review.id, {
          versionId,
          documentTypeCode: document?.documentTypeCode ?? null,
          reason: motive,
        });
        return review;
      },
      async list_pending_reviews(reviewerEmployeeNumber) {
        const permissionCache = new Map<PermissionCode, boolean>();
        const result: { document: ContractorDocument; version: DocumentVersion; providerId: number }[] = [];
        for (const document of store.documents) {
          const type = find_document_type(document.documentTypeCode);
          const version = find_latest_version(store, document.id);
          if (!type || !version) continue;
          if (store.reviews.some((r) => r.versionId === version.id)) continue;

          let allowed = permissionCache.get(type.reviewPermission);
          if (allowed === undefined) {
            allowed = await access.has_permission(reviewerEmployeeNumber, type.reviewPermission);
            permissionCache.set(type.reviewPermission, allowed);
          }
          const providerId = get_subject_provider_id(store, document.subject);
          if (allowed && providerId !== null) result.push({ document, version, providerId });
        }
        return result;
      },
      async delete_version_file(versionId, reason, actor) {
        const motive = require_text(reason, "El motivo");
        const version = store.versions.find((v) => v.id === versionId);
        if (!version) throw new NotFoundError("Versión de documento", versionId);
        const document = store.documents.find((d) => d.id === version.documentId);
        const providerId = document ? get_subject_provider_id(store, document.subject) : null;
        if (providerId === null) throw new NotFoundError("Documento", version.documentId);
        await authorize_provider(actor, providerId, { requireAdmin: true });
        if (version.storagePath === null) throw new ValidationError("El archivo ya fue eliminado");
        version.storagePath = null;
        version.fileDeletedAt = new Date().toISOString();
        await append_audit(to_audit_actor(actor), "purgar_archivo", "versiones_documento", version.id, {
          documentId: version.documentId,
          sha256: version.sha256,
          reason: motive,
        });
        return version;
      },
    },

    entries: {
      async register_entry(input, actorEmployeeNumber) {
        await require_permission(actorEmployeeNumber, "contratistas:registrar_ingresos");
        const employee = get_employee_or_throw(input.providerEmployeeId);
        if (!employee.active) throw new ValidationError("El colaborador está inactivo");
        if (store.entries.some((e) => e.providerEmployeeId === employee.id && e.result === "PERMITIDO" && !e.exitedAt)) {
          throw new ValidationError("El colaborador ya tiene un ingreso abierto (falta registrar su salida)");
        }
        const permitId = input.permitId ?? null;
        if (permitId && !(await permits.get_by_id(permitId))) throw new NotFoundError("Permiso", permitId);

        const semaphore =
          compute_subject_semaphore(store, { kind: "EMPLEADO_PROVEEDOR", providerEmployeeId: employee.id })
            ?.semaphore ?? "ROJO";
        const reasons: string[] = [];
        if (semaphore !== "VERDE") reasons.push(`Semáforo ${semaphore}`);
        if (!input.eppComplete) reasons.push("EPP incompleto");
        const allowed = reasons.length === 0;

        const entry: EntryRecord = {
          id: String(store.nextId.entry++),
          providerEmployeeId: employee.id,
          enteredAt: new Date().toISOString(),
          result: allowed ? "PERMITIDO" : "DENEGADO",
          semaphoreAtEntry: semaphore,
          eppComplete: input.eppComplete,
          notes: optional_text(input.notes),
          denialReason: allowed ? null : reasons.join("; "),
          permitId,
          registeredByEmployeeNumber: actorEmployeeNumber,
          exitedAt: null,
          exitRegisteredByEmployeeNumber: null,
        };
        store.entries.push(entry);
        await append_audit({ type: "EMPLEADO", id: actorEmployeeNumber }, "crear", "registros_ingreso", entry.id, {
          providerEmployeeId: employee.id,
          result: entry.result,
          semaphore,
          eppComplete: entry.eppComplete,
        });
        return entry;
      },
      async register_exit(entryId, actorEmployeeNumber, options) {
        await require_permission(actorEmployeeNumber, "contratistas:registrar_ingresos");
        const entry = store.entries.find((e) => e.id === entryId);
        if (!entry) throw new NotFoundError("Ingreso", entryId);
        if (entry.result !== "PERMITIDO") throw new ValidationError("Un ingreso denegado no tiene salida");
        if (entry.exitedAt) throw new ValidationError("La salida ya fue registrada");

        entry.exitedAt = new Date().toISOString();
        entry.exitRegisteredByEmployeeNumber = actorEmployeeNumber;
        await append_audit({ type: "EMPLEADO", id: actorEmployeeNumber }, "actualizar", "registros_ingreso", entry.id, {
          event: "exit",
          method: options?.manualReason ? "manual" : "qr",
          reason: options?.manualReason ?? null,
        });
        return entry;
      },
      async list_by_employee(providerEmployeeId, options) {
        return store.entries
          .filter((e) => e.providerEmployeeId === providerEmployeeId)
          .sort((a, b) => b.enteredAt.localeCompare(a.enteredAt))
          .slice(0, options?.limit ?? 50);
      },
      async list_history(options) {
        return store.entries
          .filter((entry) => {
            if (options?.providerId !== undefined) {
              const owner = store.employees.find((e) => e.id === entry.providerEmployeeId);
              if (owner?.providerId !== options.providerId) return false;
            }
            const day = get_date_mx(entry.enteredAt);
            if (options?.from && day < options.from) return false;
            if (options?.to && day > options.to) return false;
            return true;
          })
          .sort((a, b) => b.enteredAt.localeCompare(a.enteredAt))
          .slice(0, options?.limit ?? 1000);
      },
      async list_open_entries(providerId) {
        return store.entries.filter((entry) => {
          if (entry.result !== "PERMITIDO" || entry.exitedAt) return false;
          if (providerId === undefined) return true;
          return store.employees.find((e) => e.id === entry.providerEmployeeId)?.providerId === providerId;
        });
      },
    },

    participants: {
      async add_participant(input, actor) {
        const permit = await permits.get_by_id(input.permitId);
        if (!permit) throw new NotFoundError("Permiso", input.permitId);
        if (permit.status === "closed") throw new ValidationError("El permiso está cerrado");
        await authorize_permit_editor(actor, permit);

        let registeredName: string;
        if (input.participant.kind === "EMPLEADO") {
          const employee = await employees.find_by_number(input.participant.employeeNumber);
          if (!employee || !employee.active) {
            throw new ValidationError("El empleado no existe o está inactivo");
          }
          registeredName = get_employee_full_name(employee);
        } else {
          const providerEmployee = get_employee_or_throw(input.participant.providerEmployeeId);
          if (permit.providerId === null || permit.providerId !== String(providerEmployee.providerId)) {
            throw new ValidationError("El colaborador no pertenece al proveedor de este permiso");
          }
          const semaphore = compute_subject_semaphore(store, {
            kind: "EMPLEADO_PROVEEDOR",
            providerEmployeeId: providerEmployee.id,
          })?.semaphore;
          if (semaphore !== "VERDE") {
            throw new ValidationError(`El colaborador no está en semáforo VERDE (${semaphore ?? "inactivo"})`);
          }
          registeredName = [
            providerEmployee.firstName,
            providerEmployee.middleName,
            providerEmployee.paternalSurname,
            providerEmployee.maternalSurname,
          ]
            .filter((part): part is string => Boolean(part))
            .join(" ");
        }

        const participant: PermitParticipant = {
          id: String(store.nextId.participant++),
          permitId: permit.id,
          role: require_text(input.role, "La función"),
          position: input.position ?? 1,
          participant: input.participant,
          registeredName,
          createdAt: new Date().toISOString(),
          createdBy: get_signer_actor_id(actor),
          removedAt: null,
        };
        store.participants.push(participant);
        await append_audit(to_audit_actor(actor), "crear", "permiso_participantes", participant.id, {
          permitId: permit.id,
          role: participant.role,
          kind: participant.participant.kind,
        });
        return participant;
      },
      async remove_participant(participantId, actor) {
        const participant = store.participants.find((p) => p.id === participantId);
        if (!participant) throw new NotFoundError("Participante", participantId);
        if (participant.removedAt) throw new ValidationError("El participante ya fue retirado");
        const permit = await permits.get_by_id(participant.permitId);
        if (!permit) throw new NotFoundError("Permiso", participant.permitId);
        if (permit.status === "closed") throw new ValidationError("El permiso está cerrado");
        await authorize_permit_editor(actor, permit);

        participant.removedAt = new Date().toISOString();
        await append_audit(to_audit_actor(actor), "actualizar", "permiso_participantes", participant.id, {
          event: "remove",
        });
        return participant;
      },
      async list_by_permit(permitId, options) {
        return store.participants
          .filter((p) => p.permitId === permitId && (options?.includeRemoved || !p.removedAt))
          .sort((a, b) => a.role.localeCompare(b.role) || a.position - b.position);
      },
    },
  };
}
