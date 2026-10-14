"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  find_document_type,
  is_work_type_code,
  type DocumentTypeCode,
  type WorkTypeCode,
} from "@/config/documentos_contratista";
import { contractorTypes, type ContractorTypeCode } from "@/config/tipos_contratista";
import type { ActorIdentity } from "@/domain/acceso";
import type { DocumentSubject, ProviderEmployee, ReviewResult } from "@/domain/contratistas";
import type { ActionState } from "@/lib/administracion/estado";
import { can_register_employees } from "@/lib/auth/guardas";
import { get_session, type Session } from "@/lib/auth/sesion";
import { AccessDeniedError, is_expected_error, ValidationError } from "@/lib/data/errores";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { verify_access_token } from "@/lib/acceso/token_acceso";
import { delete_employee_photo, upload_employee_photo } from "@/lib/colaboradores/foto";
import { format_duration, get_worked_ms } from "./horas";
import { delete_document_file, upload_document } from "@/lib/documentos/servicio";
import { parse_employees_csv } from "./csv";

function read_text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function read_optional(formData: FormData, name: string): string | null {
  return read_text(formData, name) || null;
}

function read_id(formData: FormData, name: string): number {
  const id = Number(read_text(formData, name));
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError("Solicitud inválida");
  return id;
}

function to_actor(session: Session): ActorIdentity {
  return session.kind === "EMPLEADO"
    ? { kind: "EMPLEADO", employeeNumber: session.employeeNumber }
    : { kind: "USUARIO_PROVEEDOR", providerUserId: session.providerUserId };
}

/** Resultado de una acción: solo el mensaje, o el mensaje con datos de un solo uso (credenciales). */
type ActionOutcome = string | { message: string; secret?: string; credentials?: ActionState["credentials"] };

async function run_action(
  paths: string[],
  work: (session: Session, actor: ActorIdentity) => Promise<ActionOutcome>,
  options?: { allowProviderMember?: boolean },
): Promise<ActionState> {
  const session = await get_session();
  if (!session) redirect("/login");
  // El control de contratistas es del administrador del proveedor; un colaborador solo usa permisos de trabajo
  // (y las acciones que, como subir su propia foto, lo permiten expresamente).
  if (session.kind === "USUARIO_PROVEEDOR" && !session.isAdministrator && !options?.allowProviderMember) {
    return { ok: false, message: "Solo el administrador del proveedor puede gestionar el personal y los documentos." };
  }
  try {
    const outcome = await work(session, to_actor(session));
    for (const path of paths) revalidatePath(path);
    return typeof outcome === "string" ? { ok: true, message: outcome } : { ok: true, ...outcome };
  } catch (error) {
    if (is_expected_error(error)) return { ok: false, message: error.message };
    throw error;
  }
}

/** Solo empleados TFS (revisión médica/HSEA, bitácora de ingresos): los proveedores no. */
async function run_employee_action(
  paths: string[],
  work: (employeeNumber: string) => Promise<string>,
): Promise<ActionState> {
  return run_action(paths, async (session) => {
    if (session.kind !== "EMPLEADO") throw new AccessDeniedError("ser empleado TFS");
    return work(session.employeeNumber);
  });
}

/* ---- Personal ---- */

type AccountCredentials = NonNullable<ActionState["credentials"]>[number];

/**
 * Crea la cuenta de acceso (usuario y contraseña temporal) de un colaborador recién dado de alta, vinculada a él
 * y sin ser administradora. Si falla devuelve el motivo: el colaborador ya existe y se le puede crear la cuenta a mano.
 */
async function create_employee_account(
  providerId: number,
  employee: ProviderEmployee,
  actor: ActorIdentity,
): Promise<AccountCredentials | { error: string }> {
  try {
    const created = await get_repositories().providerUsers.create_user(
      {
        providerId,
        firstName: employee.firstName,
        paternalSurname: employee.paternalSurname,
        maternalSurname: employee.maternalSurname,
        providerEmployeeId: employee.id,
        email: null,
        isAdministrator: false,
      },
      actor,
    );
    const name = [employee.firstName, employee.middleName, employee.paternalSurname, employee.maternalSurname]
      .filter(Boolean)
      .join(" ");
    return { name, username: created.user.username, password: created.temporaryPassword };
  } catch (error) {
    if (is_expected_error(error)) return { error: error.message };
    throw error;
  }
}

function assert_can_register_employees(session: Session, providerId: number): void {
  if (!can_register_employees(session, providerId)) {
    throw new AccessDeniedError("ser Administrador HSEA o administrador del proveedor");
  }
}

export async function add_provider_employee_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return run_action([], async (session, actor) => {
    const providerId = read_id(formData, "providerId");
    assert_can_register_employees(session, providerId);
    revalidatePath(`/contratistas/${providerId}/personal`);
    const employee = await get_repositories().providerEmployees.add_employee(
      providerId,
      {
        firstName: read_text(formData, "firstName"),
        middleName: read_optional(formData, "middleName"),
        paternalSurname: read_text(formData, "paternalSurname"),
        maternalSurname: read_optional(formData, "maternalSurname"),
        curp: read_text(formData, "curp"),
        nss: read_text(formData, "nss"),
        jobTitle: read_text(formData, "jobTitle"),
        workTypes: formData.getAll("workTypes").filter((v): v is string => typeof v === "string").filter(is_work_type_code),
      },
      actor,
    );
    const account = await create_employee_account(providerId, employee, actor);
    const base = "Colaborador agregado. Queda en semáforo rojo hasta cargar y validar su documentación.";
    return "error" in account
      ? `${base} No se pudo generar su cuenta de acceso (${account.error}). Pide a HSEA que la cree.`
      : { message: `${base} Se generó su cuenta de acceso.`, credentials: [account] };
  });
}

export async function import_provider_employees_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return run_action([], async (session, actor) => {
    const providerId = read_id(formData, "providerId");
    assert_can_register_employees(session, providerId);
    revalidatePath(`/contratistas/${providerId}/personal`);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ValidationError("Selecciona el archivo CSV");
    if (file.size > 1024 * 1024) throw new ValidationError("El archivo CSV excede 1 MB");

    const parsed = parse_employees_csv(await file.text());
    if (parsed.error) throw new ValidationError(parsed.error);
    if (parsed.rows.length === 0) throw new ValidationError("El archivo no trae renglones de colaboradores");

    const result = await get_repositories().providerEmployees.import_employees(providerId, parsed.rows, actor);
    const rejected = result.rejected.slice(0, 10).map((item) => `renglón ${item.row + 1}: ${item.reason}`);
    const more = result.rejected.length > rejected.length ? ` (y ${result.rejected.length - rejected.length} más)` : "";

    const credentials: AccountCredentials[] = [];
    const accountErrors: string[] = [];
    for (const employee of result.created) {
      const account = await create_employee_account(providerId, employee, actor);
      if ("error" in account) accountErrors.push(account.error);
      else credentials.push(account);
    }
    const accountNote =
      accountErrors.length > 0
        ? ` A ${accountErrors.length} no se les pudo generar la cuenta (${accountErrors[0]}). Pide a HSEA que las cree.`
        : "";
    const message =
      result.rejected.length === 0
        ? `Se agregaron ${result.created.length} colaboradores.${accountNote}`
        : `Se agregaron ${result.created.length}; se rechazaron ${result.rejected.length}: ${rejected.join("; ")}${more}.${accountNote}`;
    return { message, credentials };
  });
}

export async function deactivate_provider_employee_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return run_action([], async (_session, actor) => {
    const providerId = read_id(formData, "providerId");
    revalidatePath(`/contratistas/${providerId}/personal`);
    await get_repositories().providerEmployees.deactivate_employee(read_id(formData, "employeeId"), read_text(formData, "reason"), actor);
    return "Colaborador dado de baja.";
  });
}

/**
 * Sube la fotografía del colaborador (pantalla de acceso a planta); la anterior se conserva en el historial.
 * Además del administrador del proveedor y del personal TFS, el propio colaborador puede subir la suya.
 */
export async function upload_employee_photo_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return run_action(
    [],
    async (session, actor) => {
      const employeeId = read_id(formData, "employeeId");
      if (session.kind === "USUARIO_PROVEEDOR" && !session.isAdministrator && session.providerEmployeeId !== employeeId) {
        throw new AccessDeniedError("ser el propio colaborador o el administrador del proveedor");
      }
      revalidatePath(read_text(formData, "returnPath"));
      const file = formData.get("file");
      if (!(file instanceof File)) throw new ValidationError("Selecciona una fotografía");
      await upload_employee_photo(employeeId, file, actor);
      return "Fotografía guardada.";
    },
    { allowProviderMember: true },
  );
}

export async function delete_employee_photo_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return run_action([], async (_session, actor) => {
    revalidatePath(read_text(formData, "returnPath"));
    await delete_employee_photo(read_id(formData, "employeeId"), read_text(formData, "reason"), actor);
    return "Fotografía eliminada. Sin fotografía no se genera la pantalla de acceso.";
  });
}

export async function set_work_types_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return run_action([], async (_session, actor) => {
    const providerId = read_id(formData, "providerId");
    const employeeId = read_id(formData, "employeeId");
    revalidatePath(`/contratistas/${providerId}/personal/${employeeId}/documentos`);
    const workTypes: WorkTypeCode[] = formData
      .getAll("workTypes")
      .filter((value): value is string => typeof value === "string")
      .filter(is_work_type_code);
    await get_repositories().providerEmployees.set_work_types(employeeId, workTypes, actor);
    return "Trabajos específicos actualizados. Cada uno exige su DC-3.";
  });
}

/* ---- Equipos ---- */

export async function add_equipment_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return run_action([], async (_session, actor) => {
    const providerId = read_id(formData, "providerId");
    revalidatePath(`/contratistas/${providerId}/equipos`);
    await get_repositories().equipment.add_equipment(
      providerId,
      {
        equipmentType: read_text(formData, "equipmentType"),
        description: read_optional(formData, "description"),
        brand: read_optional(formData, "brand"),
        model: read_optional(formData, "model"),
        serialNumber: read_optional(formData, "serialNumber"),
        plates: read_optional(formData, "plates"),
      },
      actor,
    );
    return "Equipo motorizado agregado. Sube sus cinco documentos para ponerlo en semáforo amarillo.";
  });
}

export async function deactivate_equipment_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return run_action([], async (_session, actor) => {
    const providerId = read_id(formData, "providerId");
    revalidatePath(`/contratistas/${providerId}/equipos`);
    await get_repositories().equipment.deactivate_equipment(read_id(formData, "equipmentId"), read_text(formData, "reason"), actor);
    return "Equipo motorizado dado de baja.";
  });
}

/* ---- Documentos ---- */

function read_subject(formData: FormData): DocumentSubject {
  const id = read_id(formData, "subjectId");
  const kind = read_text(formData, "subjectKind");
  if (kind === "EQUIPO") return { kind: "EQUIPO", equipmentId: id };
  if (kind === "PROVEEDOR") return { kind: "PROVEEDOR", providerId: id };
  return { kind: "EMPLEADO_PROVEEDOR", providerEmployeeId: id };
}

export async function upload_document_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return run_action([], async (_session, actor) => {
    revalidatePath(read_text(formData, "returnPath"));
    const file = formData.get("file");
    if (!(file instanceof File)) throw new ValidationError("Selecciona un archivo");
    const documentTypeCode = read_text(formData, "documentTypeCode");
    const type = find_document_type(documentTypeCode);
    if (!type) throw new ValidationError("Tipo de documento desconocido");

    const { version } = await upload_document(
      {
        subject: read_subject(formData),
        documentTypeCode: type.code as DocumentTypeCode,
        file,
        issueDate: read_optional(formData, "issueDate"),
        expiryDate: read_optional(formData, "expiryDate"),
      },
      actor,
    );
    return `Documento cargado (versión ${version.versionNumber}). Queda en revisión.`;
  });
}

export async function review_document_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  // Se puede revisar desde la bandeja o desde la documentación de cada colaborador o equipo.
  const returnPath = read_text(formData, "returnPath");
  return run_employee_action(returnPath ? ["/contratistas/revision", returnPath] : ["/contratistas/revision"], async (employeeNumber) => {
    const result = read_text(formData, "result");
    if (result !== "APROBADO" && result !== "RECHAZADO") throw new ValidationError("Resultado inválido");
    await get_repositories().documents.review_version(
      { versionId: read_text(formData, "versionId"), result: result as ReviewResult, reason: read_optional(formData, "reason") },
      employeeNumber,
    );
    return result === "APROBADO" ? "Documento aprobado." : "Documento rechazado; el proveedor deberá subir uno nuevo.";
  });
}

/** Elimina a mano el archivo de una versión (administrador del proveedor o `contratistas:gestionar`); el registro se conserva. */
export async function delete_document_file_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return run_action([], async (_session, actor) => {
    revalidatePath(read_text(formData, "returnPath"));
    await delete_document_file(read_text(formData, "versionId"), read_text(formData, "reason"), actor);
    return "Archivo eliminado. Se conserva el registro del documento para trazabilidad.";
  });
}

/** Revoca una aprobación por error humano (solo administración); el semáforo del colaborador pasa a ROJO. */
export async function revoke_review_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const returnPath = read_text(formData, "returnPath");
  return run_employee_action(returnPath ? [returnPath, "/contratistas/revision"] : ["/contratistas/revision"], async (employeeNumber) => {
    await get_repositories().documents.revoke_review(read_text(formData, "versionId"), read_text(formData, "reason"), employeeNumber);
    return "Aprobación revocada. El documento queda sin vigencia (semáforo en rojo) hasta que el proveedor suba uno nuevo.";
  });
}

/* ---- Bitácora de ingresos ---- */

export async function register_entry_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return run_employee_action(["/contratistas/ingresos", "/contratistas/ingresos/historial"], async (employeeNumber) => {
    const entry = await get_repositories().entries.register_entry(
      {
        providerEmployeeId: read_id(formData, "providerEmployeeId"),
        eppComplete: formData.get("eppComplete") === "on",
        notes: read_optional(formData, "notes"),
      },
      employeeNumber,
    );
    return entry.result === "PERMITIDO"
      ? "Ingreso PERMITIDO registrado."
      : `Ingreso DENEGADO registrado: ${entry.denialReason}.`;
  });
}

/**
 * Registra la salida. Exige el texto del QR del propio colaborador (escaneado en caseta): debe ser válido y pertenecer
 * al ingreso que se cierra, así nadie sale en nombre de otro.
 */
export async function register_exit_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return run_employee_action(["/contratistas/ingresos", "/contratistas/ingresos/historial"], async (employeeNumber) => {
    const entryId = read_text(formData, "entryId");
    const scannedEmployeeId = verify_access_token(read_text(formData, "token"));
    if (scannedEmployeeId === null) throw new ValidationError("Escanea el QR del colaborador para registrar su salida");

    const { entries } = get_repositories();
    const open = (await entries.list_open_entries()).find((entry) => entry.id === entryId);
    if (!open) throw new ValidationError("Ese ingreso ya no está abierto");
    if (open.providerEmployeeId !== scannedEmployeeId) throw new ValidationError("El QR no corresponde a este colaborador");

    const closed = await entries.register_exit(entryId, employeeNumber);
    const worked = get_worked_ms(closed);
    return worked === null ? "Salida registrada." : `Salida registrada. Tiempo en planta: ${format_duration(worked)}.`;
  });
}

/**
 * Salida manual (respaldo, sin QR): igual que el ingreso manual, pero con motivo obligatorio. La bitácora solo admite
 * completar la salida, así que el motivo y el método quedan en el evento de auditoría.
 */
export async function register_manual_exit_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return run_employee_action(["/contratistas/ingresos", "/contratistas/ingresos/historial"], async (employeeNumber) => {
    const entryId = read_text(formData, "entryId");
    const reason = read_text(formData, "reason");
    if (!reason) throw new ValidationError("Indica el motivo de la salida manual");
    const closed = await get_repositories().entries.register_exit(entryId, employeeNumber, { manualReason: reason });
    const worked = get_worked_ms(closed);
    return worked === null
      ? "Salida manual registrada."
      : `Salida manual registrada. Tiempo en planta: ${format_duration(worked)}.`;
  });
}

/* ---- Registro público de proveedores ---- */

/**
 * Autorregistro de una empresa (sin sesión): queda pendiente hasta que HSEA la apruebe y le cree su
 * cuenta. Un campo oculto "website" atrapa a los robots simples (los humanos no lo ven ni lo llenan).
 */
export async function register_provider_action(_previous: ActionState, formData: FormData): Promise<ActionState> {
  if (read_text(formData, "website")) return { ok: true, message: "Registro recibido." };
  const types = formData
    .getAll("contractorTypes")
    .filter((value): value is ContractorTypeCode => contractorTypes.some((type) => type.code === value));
  try {
    await get_repositories().providers.register_provider({
      name: read_text(formData, "name"),
      taxId: read_text(formData, "taxId"),
      imssEmployerRegistration: read_optional(formData, "imssEmployerRegistration"),
      contactEmail: read_text(formData, "contactEmail"),
      phone: read_optional(formData, "phone"),
      contractorTypes: types,
    });
    return {
      ok: true,
      message: "Registro recibido. HSEA validará tu empresa y te entregará tu usuario y contraseña.",
    };
  } catch (error) {
    if (is_expected_error(error)) return { ok: false, message: error.message };
    throw error;
  }
}
