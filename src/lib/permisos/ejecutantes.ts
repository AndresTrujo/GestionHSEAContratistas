import type { ActorIdentity } from "@/domain/acceso";
import type { ParticipantRef, Semaphore } from "@/domain/contratistas";
import { workTypes, type WorkTypeCode } from "@/config/documentos_contratista";
import { get_repositories } from "@/lib/data/proveedor_datos";
import type { PermitActor } from "./actor";

/** Colaborador de un proveedor que puede elegirse como ejecutante. */
export interface ExecutorOption {
  id: number;
  name: string;
  semaphore: Semaphore | null;
  workTypes: WorkTypeCode[];
}

export interface ExecutorProviderOption {
  id: number;
  name: string;
  staff: ExecutorOption[];
}

export interface ExecutorFormOptions {
  providers: ExecutorProviderOption[];
  /** Usuario de proveedor: su empresa está fija y no puede elegir otra. */
  fixedProviderId: number | null;
}

/** Empleado TFS que puede elegirse como participante. */
export interface TfsEmployeeOption {
  employeeNumber: string;
  name: string;
  job: string;
  department: string;
}

/** Códigos de error (`?error=`) de la selección de ejecutantes y de participantes. */
export const executorErrorMessages: Record<string, string> = {
  participant_provider: "El proveedor elegido no existe o no está activo.",
  participant_invalid: "Alguno de los participantes ligados no es un colaborador activo de ese proveedor (o está repetido).",
  participant_not_green: "Solo pueden participar colaboradores con semáforo VERDE (documentos aprobados y vigentes).",
  participant_employee: "Alguno de los números de empleado TFS de los participantes no existe o está inactivo.",
  certifications:
    "Algún colaborador de contratista no tiene las certificaciones (DC-3 aprobado) que exige el trabajo. Revisa a los participantes.",
  executor_provider: "El proveedor elegido no existe o no está activo.",
  executor_tfs: "Alguno de los empleados TFS elegidos no existe, está inactivo o está repetido.",
  executor_invalid: "Alguno de los ejecutantes no es un colaborador activo de ese proveedor.",
  executor_not_green:
    "Solo pueden ejecutar el trabajo colaboradores con semáforo VERDE (documentos aprobados y vigentes). Revisa a quién elegiste.",
  executor_work_type:
    "Alguno de los colaboradores no tiene declarado este tipo de trabajo, por lo que no hay un DC-3 aprobado que lo respalde.",
};

/**
 * Personal del proveedor que se puede elegir: sin quienes tienen su cuenta eliminada (inactiva), igual que en el
 * listado de personal. Los que nunca tuvieron cuenta sí se incluyen.
 */
async function list_selectable_staff(providerId: number) {
  const { providerEmployees, providerUsers } = get_repositories();
  const [staff, hiddenEmployeeIds] = await Promise.all([
    providerEmployees.list_employees(providerId),
    providerUsers.list_employee_ids_with_inactive_account(providerId),
  ]);
  const hiddenIds = new Set(hiddenEmployeeIds);
  return staff.filter((member) => !hiddenIds.has(member.id));
}

function get_full_name(parts: (string | null)[]): string {
  return parts.filter((part): part is string => Boolean(part)).join(" ");
}

function read_field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Empleado TFS activo a partir de su número (el que envía el selector); null si no existe o está inactivo. */
export async function resolve_tfs_employee(
  employeeNumber: string,
): Promise<{ employeeNumber: string; name: string; job: string } | null> {
  const employee = await get_repositories().employees.find_by_number(employeeNumber);
  if (!employee || !employee.active) return null;
  return {
    employeeNumber: employee.employeeNumber,
    name: get_full_name([employee.firstName, employee.middleName, employee.paternalSurname, employee.maternalSurname]),
    job: employee.jobTitle,
  };
}

/** Colaborador activo de un proveedor activo (con su proveedor); null si no existe o no pertenece a ese proveedor. */
export async function resolve_provider_staff(
  providerId: string,
  staffId: string,
): Promise<{ providerId: number; providerName: string; staffId: number; name: string; job: string } | null> {
  const id = Number(providerId);
  if (!Number.isSafeInteger(id)) return null;
  const provider = await get_repositories().providers.get_provider(id);
  if (!provider || provider.status !== "ACTIVO") return null;
  const member = (await list_selectable_staff(provider.id)).find((candidate) => String(candidate.id) === staffId);
  if (!member) return null;
  return {
    providerId: provider.id,
    providerName: provider.name,
    staffId: member.id,
    name: get_full_name([member.firstName, member.middleName, member.paternalSurname, member.maternalSurname]),
    job: member.jobTitle,
  };
}

/** Proveedores y colaboradores entre los que se puede elegir: un usuario de proveedor ve solo su empresa. */
export async function load_executor_options(actor: PermitActor): Promise<ExecutorFormOptions> {
  const { providers, providerEmployees } = get_repositories();
  const fixedProviderId = actor.providerId === null ? null : Number(actor.providerId);
  const candidates =
    fixedProviderId === null
      ? await providers.list_providers({ status: "ACTIVO" })
      : [await providers.get_provider(fixedProviderId)].filter((provider) => provider !== null);

  const result = await Promise.all(
    candidates.map(async (provider) => {
      const [staff, semaphores] = await Promise.all([
        list_selectable_staff(provider.id),
        providerEmployees.list_semaphores(provider.id),
      ]);
      const semaphoreById = new Map(
        semaphores.flatMap((item) =>
          item.subject.kind === "EMPLEADO_PROVEEDOR" ? [[item.subject.providerEmployeeId, item.semaphore] as const] : [],
        ),
      );
      return {
        id: provider.id,
        name: provider.name,
        staff: staff.map((member) => ({
          id: member.id,
          name: get_full_name([member.firstName, member.middleName, member.paternalSurname, member.maternalSurname]),
          semaphore: semaphoreById.get(member.id) ?? null,
          workTypes: member.workTypes,
        })),
      };
    }),
  );
  return { providers: result, fixedProviderId };
}

export interface ReadExecutors {
  ok: true;
  /** Proveedor del trabajo; null si lo ejecuta personal TFS. */
  providerId: string | null;
  /** Nombre de cada posición (cadena vacía si no se usa). */
  names: string[];
  /** Colaboradores de proveedor elegidos, para registrarlos como participantes del permiso. */
  providerParticipants: { position: number; providerEmployeeId: number }[];
}

/**
 * Lee y valida los ejecutantes del formulario. Con proveedor, cada uno debe ser un colaborador activo suyo, en
 * semáforo VERDE (examen médico y demás documentos aprobados y vigentes) y con declarado el tipo de trabajo del
 * permiso, para que su DC-3 esté entre lo verificado. Sin proveedor, son nombres de personal TFS.
 */
export async function read_executors(
  formData: FormData,
  actor: PermitActor,
  permitTypeSlug: string,
  maxExecutors: number,
): Promise<ReadExecutors | { ok: false; errorCode: string }> {
  const rawProvider = actor.providerId ?? (String(formData.get("providerId") ?? "").trim() || null);
  const names: string[] = Array.from({ length: maxExecutors }, () => "");

  if (rawProvider === null) {
    const used = new Set<string>();
    for (let position = 1; position <= maxExecutors; position += 1) {
      const employeeNumber = read_field(formData, `executorTfs${position}`);
      if (employeeNumber) {
        const person = await resolve_tfs_employee(employeeNumber);
        if (!person || used.has(person.employeeNumber)) return { ok: false, errorCode: "executor_tfs" };
        used.add(person.employeeNumber);
        names[position - 1] = person.name;
        continue;
      }
      // Compatibilidad: nombre escrito a mano.
      names[position - 1] = read_field(formData, `executor${position}`);
    }
    return { ok: true, providerId: null, names, providerParticipants: [] };
  }

  const providerId = Number(rawProvider);
  const { providers, providerEmployees } = get_repositories();
  const provider = Number.isSafeInteger(providerId) ? await providers.get_provider(providerId) : null;
  if (!provider || provider.status !== "ACTIVO") return { ok: false, errorCode: "executor_provider" };

  const [staff, semaphores] = await Promise.all([
    list_selectable_staff(provider.id),
    providerEmployees.list_semaphores(provider.id),
  ]);
  const requiredWorkType = workTypes.find((type) => type.permitTypeSlug === permitTypeSlug)?.code ?? null;
  const providerParticipants: { position: number; providerEmployeeId: number }[] = [];

  for (let position = 1; position <= maxExecutors; position += 1) {
    const value = formData.get(`executorEmployee${position}`);
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) continue;

    const member = staff.find((candidate) => String(candidate.id) === raw);
    if (!member) return { ok: false, errorCode: "executor_invalid" };
    if (providerParticipants.some((item) => item.providerEmployeeId === member.id)) {
      return { ok: false, errorCode: "executor_invalid" };
    }
    const semaphore = semaphores.find(
      (item) => item.subject.kind === "EMPLEADO_PROVEEDOR" && item.subject.providerEmployeeId === member.id,
    )?.semaphore;
    if (semaphore !== "VERDE") return { ok: false, errorCode: "executor_not_green" };
    if (requiredWorkType !== null && !member.workTypes.includes(requiredWorkType)) {
      return { ok: false, errorCode: "executor_work_type" };
    }
    names[position - 1] = get_full_name([member.firstName, member.middleName, member.paternalSurname, member.maternalSurname]);
    providerParticipants.push({ position, providerEmployeeId: member.id });
  }
  return { ok: true, providerId: String(provider.id), names, providerParticipants };
}

export interface JsaParticipantRow {
  position: number;
  name: string;
  job: string;
  company: string;
  /** Persona ligada (empleado TFS o colaborador de proveedor); null si se capturó solo el texto. */
  link: ParticipantRef | null;
}

export interface ReadJsaParticipants {
  ok: true;
  providerId: string | null;
  rows: JsaParticipantRow[];
}

/**
 * Participantes del JSA. Cada uno puede ligarse a un colaborador del proveedor (en semáforo VERDE) o a un empleado
 * TFS por su número; al ligarse, nombre, puesto y compañía salen de su registro. Sin liga, valen los textos escritos.
 */
export async function read_jsa_participants(
  formData: FormData,
  actor: PermitActor,
  maxParticipants: number,
): Promise<ReadJsaParticipants | { ok: false; errorCode: string }> {
  const rawProvider = actor.providerId ?? (read_field(formData, "providerId") || null);
  const { providers, providerEmployees, employees, organization } = get_repositories();

  let provider: Awaited<ReturnType<typeof providers.get_provider>> = null;
  let staff: Awaited<ReturnType<typeof providerEmployees.list_employees>> = [];
  let semaphores: Awaited<ReturnType<typeof providerEmployees.list_semaphores>> = [];
  if (rawProvider !== null) {
    const providerId = Number(rawProvider);
    provider = Number.isSafeInteger(providerId) ? await providers.get_provider(providerId) : null;
    if (!provider || provider.status !== "ACTIVO") return { ok: false, errorCode: "participant_provider" };
    [staff, semaphores] = await Promise.all([
      list_selectable_staff(provider.id),
      providerEmployees.list_semaphores(provider.id),
    ]);
  }
  const departments = await organization.list_departments();

  const rows: JsaParticipantRow[] = [];
  const usedStaff = new Set<number>();
  for (let position = 1; position <= maxParticipants; position += 1) {
    const staffId = read_field(formData, `participantStaff${position}`);
    const employeeNumber = read_field(formData, `participantEmployee${position}`);

    if (staffId && provider) {
      const member = staff.find((candidate) => String(candidate.id) === staffId);
      if (!member || usedStaff.has(member.id)) return { ok: false, errorCode: "participant_invalid" };
      const semaphore = semaphores.find(
        (item) => item.subject.kind === "EMPLEADO_PROVEEDOR" && item.subject.providerEmployeeId === member.id,
      )?.semaphore;
      if (semaphore !== "VERDE") return { ok: false, errorCode: "participant_not_green" };
      usedStaff.add(member.id);
      rows.push({
        position,
        name: get_full_name([member.firstName, member.middleName, member.paternalSurname, member.maternalSurname]),
        job: member.jobTitle,
        company: provider.name,
        link: { kind: "EMPLEADO_PROVEEDOR", providerEmployeeId: member.id },
      });
      continue;
    }

    if (employeeNumber) {
      const employee = await employees.find_by_number(employeeNumber);
      if (!employee || !employee.active) return { ok: false, errorCode: "participant_employee" };
      rows.push({
        position,
        name: get_full_name([employee.firstName, employee.middleName, employee.paternalSurname, employee.maternalSurname]),
        job: employee.jobTitle,
        company: departments.find((department) => department.id === employee.departmentId)?.name ?? "TFS",
        link: { kind: "EMPLEADO", employeeNumber: employee.employeeNumber },
      });
      continue;
    }

    const name = read_field(formData, `participant${position}Name`);
    if (!name) continue;
    rows.push({
      position,
      name,
      job: read_field(formData, `participant${position}Job`),
      company: read_field(formData, `participant${position}Company`),
      link: null,
    });
  }
  return { ok: true, providerId: provider ? String(provider.id) : null, rows };
}

/**
 * ¿Puede esta persona firmar la posición de participante? Si está ligado a un empleado TFS, solo ese empleado; si lo
 * está a un colaborador de proveedor, un usuario de su proveedor (muchos colaboradores no tienen cuenta propia).
 * Un participante sin liga (solo texto) lo firma quien sea, como antes. El ADMIN_HSEA puede firmar por cualquiera.
 */
export async function can_sign_participant(actor: PermitActor, permitId: string, position: number): Promise<boolean> {
  if (actor.isAdmin) return true;
  const { participants, providerEmployees } = get_repositories();
  const linked = (await participants.list_by_permit(permitId)).find(
    (item) => item.role === "participant" && item.position === position,
  );
  if (!linked) return true;
  if (linked.participant.kind === "EMPLEADO") {
    return actor.actorType === "EMPLEADO" && actor.actorId === linked.participant.employeeNumber;
  }
  if (actor.actorType !== "USUARIO_PROVEEDOR" || actor.providerId === null) return false;
  const member = await providerEmployees.get_employee(linked.participant.providerEmployeeId);
  return member !== null && String(member.providerId) === actor.providerId;
}

/** Registra como participantes (función "participant") a los ligados del JSA ya guardado. */
export async function register_jsa_participants(
  permitId: string,
  participants: ReadJsaParticipants,
  actor: PermitActor,
): Promise<void> {
  const { participants: repository } = get_repositories();
  for (const row of participants.rows) {
    if (!row.link) continue;
    await repository.add_participant(
      { permitId, role: "participant", position: row.position, participant: row.link },
      to_actor_identity(actor),
    );
  }
}

function to_actor_identity(actor: PermitActor): ActorIdentity {
  return actor.actorType === "USUARIO_PROVEEDOR" && actor.providerUserId !== null
    ? { kind: "USUARIO_PROVEEDOR", providerUserId: actor.providerUserId }
    : { kind: "EMPLEADO", employeeNumber: actor.actorId };
}

/** Registra a los colaboradores elegidos como participantes (función "executor") del permiso ya guardado. */
export async function register_executor_participants(
  permitId: string,
  executors: ReadExecutors,
  actor: PermitActor,
): Promise<void> {
  const { participants } = get_repositories();
  for (const item of executors.providerParticipants) {
    await participants.add_participant(
      {
        permitId,
        role: "executor",
        position: item.position,
        participant: { kind: "EMPLEADO_PROVEEDOR", providerEmployeeId: item.providerEmployeeId },
      },
      to_actor_identity(actor),
    );
  }
}
