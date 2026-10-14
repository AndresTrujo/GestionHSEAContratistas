import {
  allowedDocumentMimeTypes,
  find_document_type,
  is_work_type_code,
  maxDocumentFileBytes,
  type DocumentTypeDefinition,
  type DocumentTypeCode,
  type WorkTypeCode,
} from "@/config/documentos_contratista";
import type { PermissionCode } from "@/config/permisos";
import { lockoutMinutes, maxFailedAttempts } from "@/config/seguridad";
import { find_contractor_type, type ContractorTypeCode } from "@/config/tipos_contratista";
import type { ActorIdentity } from "@/domain/acceso";
import type { ActorType } from "@/domain/auditoria";
import type {
  ContractorDocument,
  DocumentReview,
  DocumentSubject,
  DocumentVersion,
  EmployeePhoto,
  EntryRecord,
  EntryResult,
  NewProviderEmployeeInput,
  ParticipantRef,
  PermitParticipant,
  Provider,
  ProviderEmployee,
  ProviderEquipment,
  ProviderStatus,
  ProviderUser,
  RequirementState,
  RequirementStatus,
  ReviewResult,
  Semaphore,
  SubjectSemaphore,
} from "@/domain/contratistas";
import {
  generate_temporary_password,
  hash_secret,
  minPasswordLength,
  verify_secret,
} from "@/lib/auth/secreto";
import { build_provider_username } from "@/lib/auth/usuario_proveedor";
import { AccessDeniedError, NotFoundError, ValidationError } from "../errores";
import { get_signer_actor_id } from "../identidad";
import type { DataRepositories } from "../repositorios";
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
import {
  get_db,
  get_pg_error,
  pgForeignKeyViolation,
  pgUniqueViolation,
  with_transaction,
  type Queryable,
} from "./conexion";
import {
  append_audit_db,
  has_permission_db,
  is_hsea_admin_db,
  require_permission_db,
  to_employee_int,
} from "./repos_organizacion_railway";

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

/* ---------------------------------------------------------------------
 * Filas y mapeadores
 * ------------------------------------------------------------------- */

interface ProviderAuditCols {
  creado_en: Date;
  creado_por: string | null;
  actualizado_en: Date;
  actualizado_por: string | null;
}

function map_audit(row: ProviderAuditCols) {
  return {
    createdAt: row.creado_en.toISOString(),
    createdBy: row.creado_por ?? "seed",
    updatedAt: row.actualizado_en.toISOString(),
    updatedBy: row.actualizado_por ?? "seed",
  };
}

interface ProviderRow extends ProviderAuditCols {
  id: number;
  razon_social: string;
  rfc: string;
  registro_patronal_imss: string | null;
  correo_contacto: string;
  telefono: string | null;
  estatus: ProviderStatus;
  tipos: string[];
}
interface UserRow extends ProviderAuditCols {
  id: number;
  proveedor_id: number;
  empleado_proveedor_id: number | null;
  nombre: string;
  usuario: string;
  password_hash: string;
  debe_cambiar_password: boolean;
  intentos_fallidos: number;
  bloqueado_hasta: Date | null;
  correo: string | null;
  es_administrador: boolean;
  activo: boolean;
}
interface EmployeeRow extends ProviderAuditCols {
  id: number;
  proveedor_id: number;
  primer_nombre: string;
  segundo_nombre: string | null;
  apellido_paterno: string;
  apellido_materno: string | null;
  curp: string;
  nss: string;
  puesto: string;
  activo: boolean;
  fecha_baja: string | null;
  trabajos: string[];
}
interface EquipmentRow extends ProviderAuditCols {
  id: number;
  proveedor_id: number;
  tipo_equipo: string;
  descripcion: string | null;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  placas: string | null;
  activo: boolean;
}
interface DocumentRow {
  id: string;
  empleado_proveedor_id: number | null;
  equipo_proveedor_id: number | null;
  /** Documentos del proveedor mismo (persona moral), p. ej. el comprobante de pago del IMSS. */
  proveedor_id: number | null;
  tipo_documento_codigo: DocumentTypeCode;
  creado_en: Date;
  creado_por: string;
}
interface PhotoRow {
  id: string;
  empleado_proveedor_id: number;
  nombre_archivo: string;
  tipo_mime: "image/jpeg" | "image/png";
  tamano_bytes: string | number;
  ruta_almacenamiento: string | null;
  archivo_eliminado_en: Date | null;
  sha256: string;
  subido_por: string;
  subido_en: Date;
}
function map_photo(row: PhotoRow): EmployeePhoto {
  return {
    id: row.id,
    providerEmployeeId: row.empleado_proveedor_id,
    fileName: row.nombre_archivo,
    mimeType: row.tipo_mime,
    sizeBytes: Number(row.tamano_bytes),
    storagePath: row.ruta_almacenamiento,
    fileDeletedAt: row.archivo_eliminado_en ? row.archivo_eliminado_en.toISOString() : null,
    sha256: row.sha256,
    uploadedBy: row.subido_por,
    uploadedAt: row.subido_en.toISOString(),
  };
}
interface VersionRow {
  id: string;
  documento_id: string;
  numero_version: number;
  nombre_archivo: string;
  tipo_mime: string;
  tamano_bytes: string;
  ruta_almacenamiento: string | null;
  archivo_eliminado_en: Date | null;
  sha256: string;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  subido_por: string;
  subido_en: Date;
}
interface ReviewRow {
  id: string;
  version_id: string;
  resultado: ReviewResult;
  revisor_no_empleado: number;
  motivo: string | null;
  revisado_en: Date;
  /** Presentes solo cuando la consulta une `revocaciones_revision`. */
  revocado_por?: number | null;
  motivo_revocacion?: string | null;
  revocado_en?: Date | null;
}
interface EntryRow {
  id: string;
  empleado_proveedor_id: number;
  ingreso_en: Date;
  resultado: EntryResult;
  semaforo_al_ingresar: Semaphore;
  epp_completo: boolean;
  observaciones: string | null;
  motivo_denegacion: string | null;
  permiso_id: string | null;
  registrado_por: number;
  salida_en: Date | null;
  salida_registrada_por: number | null;
}
interface ParticipantRow {
  id: string;
  permiso_id: string;
  funcion: string;
  posicion: number;
  participante_tipo: "EMPLEADO" | "EMPLEADO_PROVEEDOR";
  no_empleado: number | null;
  empleado_proveedor_id: number | null;
  nombre_registrado: string;
  creado_en: Date;
  creado_por: string;
  retirado_en: Date | null;
}

function map_provider(row: ProviderRow): Provider {
  return {
    id: row.id,
    name: row.razon_social,
    taxId: row.rfc,
    imssEmployerRegistration: row.registro_patronal_imss,
    contactEmail: row.correo_contacto,
    phone: row.telefono,
    status: row.estatus,
    contractorTypes: row.tipos.filter(
      (code): code is ContractorTypeCode => find_contractor_type(code) !== undefined,
    ),
    ...map_audit(row),
  };
}
function map_user(row: UserRow): ProviderUser {
  return {
    id: row.id,
    providerId: row.proveedor_id,
    providerEmployeeId: row.empleado_proveedor_id,
    name: row.nombre,
    username: row.usuario,
    email: row.correo,
    isAdministrator: row.es_administrador,
    active: row.activo,
    mustChangePassword: row.debe_cambiar_password,
    failedAttempts: row.intentos_fallidos,
    lockedUntil: row.bloqueado_hasta ? row.bloqueado_hasta.toISOString() : null,
    ...map_audit(row),
  };
}
function map_employee(row: EmployeeRow): ProviderEmployee {
  return {
    id: row.id,
    providerId: row.proveedor_id,
    firstName: row.primer_nombre,
    middleName: row.segundo_nombre,
    paternalSurname: row.apellido_paterno,
    maternalSurname: row.apellido_materno,
    curp: row.curp,
    nss: row.nss,
    jobTitle: row.puesto,
    active: row.activo,
    terminationDate: row.fecha_baja,
    workTypes: row.trabajos.filter(is_work_type_code),
    ...map_audit(row),
  };
}
function map_equipment(row: EquipmentRow): ProviderEquipment {
  return {
    id: row.id,
    providerId: row.proveedor_id,
    equipmentType: row.tipo_equipo,
    description: row.descripcion,
    brand: row.marca,
    model: row.modelo,
    serialNumber: row.numero_serie,
    plates: row.placas,
    active: row.activo,
    ...map_audit(row),
  };
}
function map_subject(row: {
  empleado_proveedor_id: number | null;
  equipo_proveedor_id: number | null;
  proveedor_id: number | null;
}): DocumentSubject {
  if (row.empleado_proveedor_id !== null) {
    return { kind: "EMPLEADO_PROVEEDOR", providerEmployeeId: row.empleado_proveedor_id };
  }
  if (row.equipo_proveedor_id !== null) return { kind: "EQUIPO", equipmentId: Number(row.equipo_proveedor_id) };
  return { kind: "PROVEEDOR", providerId: Number(row.proveedor_id) };
}
function map_document(row: DocumentRow): ContractorDocument {
  return {
    id: row.id,
    subject: map_subject(row),
    documentTypeCode: row.tipo_documento_codigo,
    createdAt: row.creado_en.toISOString(),
    createdBy: row.creado_por,
  };
}
function map_version(row: VersionRow): DocumentVersion {
  return {
    id: row.id,
    documentId: row.documento_id,
    versionNumber: row.numero_version,
    fileName: row.nombre_archivo,
    mimeType: row.tipo_mime,
    sizeBytes: Number(row.tamano_bytes),
    storagePath: row.ruta_almacenamiento,
    fileDeletedAt: row.archivo_eliminado_en ? row.archivo_eliminado_en.toISOString() : null,
    sha256: row.sha256,
    issueDate: row.fecha_emision,
    expiryDate: row.fecha_vencimiento,
    uploadedBy: row.subido_por,
    uploadedAt: row.subido_en.toISOString(),
  };
}
function map_review(row: ReviewRow): DocumentReview {
  return {
    id: row.id,
    versionId: row.version_id,
    result: row.resultado,
    reviewerEmployeeNumber: String(row.revisor_no_empleado),
    reason: row.motivo,
    reviewedAt: row.revisado_en.toISOString(),
    revocation:
      row.revocado_en && row.revocado_por != null
        ? {
            revokedAt: row.revocado_en.toISOString(),
            revokedByEmployeeNumber: String(row.revocado_por),
            reason: row.motivo_revocacion ?? "",
          }
        : null,
  };
}
function map_entry(row: EntryRow): EntryRecord {
  return {
    id: row.id,
    providerEmployeeId: row.empleado_proveedor_id,
    enteredAt: row.ingreso_en.toISOString(),
    result: row.resultado,
    semaphoreAtEntry: row.semaforo_al_ingresar,
    eppComplete: row.epp_completo,
    notes: row.observaciones,
    denialReason: row.motivo_denegacion,
    permitId: row.permiso_id,
    registeredByEmployeeNumber: String(row.registrado_por),
    exitedAt: row.salida_en ? row.salida_en.toISOString() : null,
    exitRegisteredByEmployeeNumber:
      row.salida_registrada_por === null ? null : String(row.salida_registrada_por),
  };
}
function map_participant(row: ParticipantRow): PermitParticipant {
  const participant: ParticipantRef =
    row.participante_tipo === "EMPLEADO"
      ? { kind: "EMPLEADO", employeeNumber: String(row.no_empleado) }
      : { kind: "EMPLEADO_PROVEEDOR", providerEmployeeId: Number(row.empleado_proveedor_id) };
  return {
    id: row.id,
    permitId: row.permiso_id,
    role: row.funcion,
    position: row.posicion,
    participant,
    registeredName: row.nombre_registrado,
    createdAt: row.creado_en.toISOString(),
    createdBy: row.creado_por,
    removedAt: row.retirado_en ? row.retirado_en.toISOString() : null,
  };
}

/* ---------------------------------------------------------------------
 * Consultas base
 * ------------------------------------------------------------------- */

const providerSelect = `
  SELECT p.*,
         COALESCE(array_agg(t.tipo_contratista_codigo)
                  FILTER (WHERE t.tipo_contratista_codigo IS NOT NULL AND t.retirado_en IS NULL), '{}') AS tipos
    FROM proveedores p
    LEFT JOIN proveedor_tipos_contratista t ON t.proveedor_id = p.id`;

const employeeSelect = `
  SELECT ep.*,
         COALESCE(array_agg(t.tipo_trabajo_codigo)
                  FILTER (WHERE t.tipo_trabajo_codigo IS NOT NULL AND t.retirado_en IS NULL), '{}') AS trabajos
    FROM empleados_proveedor ep
    LEFT JOIN empleado_proveedor_trabajos t ON t.empleado_proveedor_id = ep.id`;

async function find_provider_db(db: Queryable, providerId: number): Promise<Provider | null> {
  const { rows } = await db.query<ProviderRow>(`${providerSelect} WHERE p.id = $1 GROUP BY p.id`, [providerId]);
  return rows[0] ? map_provider(rows[0]) : null;
}

async function find_employee_db(db: Queryable, employeeId: number): Promise<ProviderEmployee | null> {
  const { rows } = await db.query<EmployeeRow>(`${employeeSelect} WHERE ep.id = $1 GROUP BY ep.id`, [employeeId]);
  return rows[0] ? map_employee(rows[0]) : null;
}

async function get_employee_or_throw(db: Queryable, employeeId: number): Promise<ProviderEmployee> {
  const employee = await find_employee_db(db, employeeId);
  if (!employee) throw new NotFoundError("Colaborador de proveedor", String(employeeId));
  return employee;
}

async function get_provider_or_throw(db: Queryable, providerId: number): Promise<Provider> {
  const provider = await find_provider_db(db, providerId);
  if (!provider) throw new NotFoundError("Proveedor", String(providerId));
  return provider;
}

/**
 * Empleado TFS con `contratistas:gestionar`, o usuario activo del proveedor (administrador si
 * `requireAdmin`). Un proveedor suspendido bloquea a sus usuarios.
 */
async function authorize_provider_db(
  db: Queryable,
  actor: ActorIdentity,
  providerId: number,
  options?: { requireAdmin?: boolean },
): Promise<void> {
  const provider = await get_provider_or_throw(db, providerId);
  if (actor.kind === "EMPLEADO") {
    await require_permission_db(db, actor.employeeNumber, "contratistas:gestionar");
    return;
  }
  if (actor.kind === "USUARIO_PROVEEDOR") {
    const { rows } = await db.query<{ proveedor_id: number; es_administrador: boolean; activo: boolean }>(
      `SELECT proveedor_id, es_administrador, activo FROM usuarios_proveedor WHERE id = $1`,
      [actor.providerUserId],
    );
    const user = rows[0];
    if (!user || !user.activo || user.proveedor_id !== providerId) {
      throw new AccessDeniedError("ser usuario activo de este proveedor");
    }
    if (options?.requireAdmin && !user.es_administrador) {
      throw new AccessDeniedError("ser administrador del proveedor");
    }
    if (provider.status === "SUSPENDIDO") throw new ValidationError("El proveedor está suspendido");
    return;
  }
  throw new AccessDeniedError("una identidad válida");
}

function to_audit_actor(identity: ActorIdentity): { type: ActorType; id: string } {
  return { type: identity.kind, id: get_signer_actor_id(identity) };
}

function validate_work_types(workTypes: string[]): WorkTypeCode[] {
  const result: WorkTypeCode[] = [];
  for (const code of workTypes) {
    if (!is_work_type_code(code)) throw new ValidationError(`Trabajo específico desconocido: ${code}`);
    if (!result.includes(code)) result.push(code);
  }
  return result;
}

async function get_subject_owner_db(
  db: Queryable,
  subject: DocumentSubject,
): Promise<{ providerId: number; active: boolean } | null> {
  const { rows } =
    subject.kind === "PROVEEDOR"
      ? await db.query<{ proveedor_id: number; activo: boolean }>(
          `SELECT id AS proveedor_id, true AS activo FROM proveedores WHERE id = $1`,
          [subject.providerId],
        )
      : subject.kind === "EMPLEADO_PROVEEDOR"
        ? await db.query<{ proveedor_id: number; activo: boolean }>(
            `SELECT proveedor_id, activo FROM empleados_proveedor WHERE id = $1`,
            [subject.providerEmployeeId],
          )
        : await db.query<{ proveedor_id: number; activo: boolean }>(
            `SELECT proveedor_id, activo FROM equipos_proveedor WHERE id = $1`,
            [subject.equipmentId],
          );
  return rows[0] ? { providerId: rows[0].proveedor_id, active: rows[0].activo } : null;
}

interface RequirementRow {
  tipo_documento_codigo: DocumentTypeCode;
  estado: RequirementStatus;
  vigente_hasta: string | null;
  documento_id: string | null;
  version_id: string | null;
}

function map_requirement(row: RequirementRow): RequirementState {
  return {
    documentTypeCode: row.tipo_documento_codigo,
    status: row.estado,
    documentId: row.documento_id,
    versionId: row.version_id,
    validUntil: row.vigente_hasta,
  };
}

/** Requisitos del sujeto con su estado, calculados por las vistas v_requisitos_* / v_documentos_estado. */
async function list_requirements_db(db: Queryable, subject: DocumentSubject): Promise<RequirementState[]> {
  if (subject.kind === "EMPLEADO_PROVEEDOR") {
    const { rows } = await db.query<RequirementRow>(
      `SELECT r.tipo_documento_codigo, r.estado, r.vigente_hasta, de.documento_id, de.version_id
         FROM v_requisitos_empleado_proveedor r
         LEFT JOIN v_documentos_estado de
           ON de.empleado_proveedor_id = r.empleado_proveedor_id
          AND de.tipo_documento_codigo = r.tipo_documento_codigo
        WHERE r.empleado_proveedor_id = $1
        ORDER BY r.tipo_documento_codigo`,
      [subject.providerEmployeeId],
    );
    return rows.map(map_requirement);
  }
  const isProvider = subject.kind === "PROVEEDOR";
  const { rows } = await db.query<RequirementRow>(
    `SELECT td.codigo AS tipo_documento_codigo, COALESCE(de.estado, 'FALTANTE') AS estado,
            de.vigente_hasta, de.documento_id, de.version_id
       FROM tipos_documento td
       LEFT JOIN v_documentos_estado de
         ON ${isProvider ? "de.proveedor_id" : "de.equipo_proveedor_id"} = $1 AND de.tipo_documento_codigo = td.codigo
      WHERE td.aplica_a = '${isProvider ? "PROVEEDOR" : "EQUIPO"}' AND td.activo AND td.obligatorio
      ORDER BY td.codigo`,
    [subject.kind === "PROVEEDOR" ? subject.providerId : subject.equipmentId],
  );
  return rows.map(map_requirement);
}

/** null si el colaborador/equipo no existe o está inactivo. */
async function get_subject_semaphore_db(
  db: Queryable,
  subject: DocumentSubject,
): Promise<SubjectSemaphore | null> {
  // El proveedor no tiene semáforo propio: su documentación cuenta para el de su personal.
  if (subject.kind === "PROVEEDOR") return null;
  const { rows } =
    subject.kind === "EMPLEADO_PROVEEDOR"
      ? await db.query<{ semaforo: Semaphore }>(
          `SELECT semaforo FROM v_semaforo_empleado_proveedor WHERE empleado_proveedor_id = $1`,
          [subject.providerEmployeeId],
        )
      : await db.query<{ semaforo: Semaphore }>(
          `SELECT semaforo FROM v_semaforo_equipo_proveedor WHERE equipo_proveedor_id = $1`,
          [subject.equipmentId],
        );
  const row = rows[0];
  if (!row) return null;
  return { subject, semaphore: row.semaforo, requirements: await list_requirements_db(db, subject) };
}

async function get_employee_semaphore_db(db: Queryable, employeeId: number): Promise<Semaphore | null> {
  const { rows } = await db.query<{ semaforo: Semaphore }>(
    `SELECT semaforo FROM v_semaforo_empleado_proveedor WHERE empleado_proveedor_id = $1`,
    [employeeId],
  );
  return rows[0]?.semaforo ?? null;
}

async function is_type_required_db(
  db: Queryable,
  subject: DocumentSubject,
  type: DocumentTypeDefinition,
): Promise<boolean> {
  if (subject.kind === "EQUIPO") return type.appliesTo === "EQUIPO" && type.mandatory;
  if (subject.kind === "PROVEEDOR") return type.appliesTo === "PROVEEDOR" && type.mandatory;
  if (type.mandatory) return type.appliesTo === "EMPLEADO_PROVEEDOR";
  if (!type.workTypeCode) return false;
  const { rowCount } = await db.query(
    `SELECT 1 FROM empleado_proveedor_trabajos
      WHERE empleado_proveedor_id = $1 AND tipo_trabajo_codigo = $2 AND retirado_en IS NULL`,
    [subject.providerEmployeeId, type.workTypeCode],
  );
  return rowCount > 0;
}

async function create_employee_db(
  db: Queryable,
  providerId: number,
  input: NewProviderEmployeeInput,
  actor: ActorIdentity,
): Promise<ProviderEmployee> {
  const curp = require_text(input.curp, "La CURP").toUpperCase();
  const nss = require_text(input.nss, "El NSS").replace(/\s+/g, "");
  if (!curpPattern.test(curp)) throw new ValidationError("La CURP no tiene un formato válido");
  if (!nssPattern.test(nss)) throw new ValidationError("El NSS debe tener 11 dígitos");
  const workTypes = validate_work_types(input.workTypes ?? []);
  const actorId = get_signer_actor_id(actor);

  // Cada alta va en su propio SAVEPOINT: un rechazo (CURP/NSS repetido) no tumba el resto de una carga masiva.
  await db.query("SAVEPOINT alta_colaborador");
  try {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO empleados_proveedor
         (proveedor_id, primer_nombre, segundo_nombre, apellido_paterno, apellido_materno,
          curp, nss, puesto, creado_por, actualizado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       RETURNING id`,
      [
        providerId,
        require_text(input.firstName, "El nombre"),
        optional_text(input.middleName),
        require_text(input.paternalSurname, "El apellido paterno"),
        optional_text(input.maternalSurname),
        hash_pii("curp", curp),
        hash_pii("nss", nss),
        require_text(input.jobTitle, "El puesto"),
        actorId,
      ],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new Error("No se pudo crear el colaborador");
    for (const workType of workTypes) {
      await db.query(
        `INSERT INTO empleado_proveedor_trabajos (empleado_proveedor_id, tipo_trabajo_codigo, declarado_por)
         VALUES ($1, $2, $3)`,
        [id, workType, actorId],
      );
    }
    await db.query("RELEASE SAVEPOINT alta_colaborador");
    await append_audit_db(db, to_audit_actor(actor), "crear", "empleados_proveedor", String(id), {
      providerId,
      workTypes: workTypes.join(","),
    });
    return await get_employee_or_throw(db, id);
  } catch (error) {
    await db.query("ROLLBACK TO SAVEPOINT alta_colaborador");
    const { code, constraint } = get_pg_error(error);
    if (code === pgUniqueViolation) {
      throw new ValidationError(
        constraint?.includes("nss") ? "Ya existe un colaborador con ese NSS" : "Ya existe un colaborador con esa CURP",
      );
    }
    throw error;
  }
}

/* ---------------------------------------------------------------------
 * Repositorios
 * ------------------------------------------------------------------- */

export function create_contractor_repositories_railway(): ContractorRepositories {
  return {
    providers: {
      async register_provider(input) {
        const name = require_text(input.name, "La razón social");
        const taxId = require_text(input.taxId, "El RFC").toUpperCase();
        const contactEmail = require_text(input.contactEmail, "El correo de contacto");
        if (!taxIdPattern.test(taxId)) throw new ValidationError("El RFC no tiene un formato válido");
        if (!emailPattern.test(contactEmail)) throw new ValidationError("El correo no es válido");
        const types = [...new Set(input.contractorTypes)];
        if (types.length === 0) throw new ValidationError("Indica al menos un tipo de contratista");
        if (types.some((code) => !find_contractor_type(code))) {
          throw new ValidationError("Tipo de contratista desconocido");
        }

        try {
          return await with_transaction(async (db) => {
            const { rows } = await db.query<{ id: number }>(
              `INSERT INTO proveedores
                 (razon_social, rfc, registro_patronal_imss, correo_contacto, telefono, creado_por, actualizado_por)
               VALUES ($1, $2, $3, $4, $5, 'AUTOREGISTRO', 'AUTOREGISTRO')
               RETURNING id`,
              [name, taxId, optional_text(input.imssEmployerRegistration), contactEmail, optional_text(input.phone)],
            );
            const id = rows[0]?.id;
            if (id === undefined) throw new Error("No se pudo registrar el proveedor");
            for (const type of types) {
              await db.query(
                `INSERT INTO proveedor_tipos_contratista (proveedor_id, tipo_contratista_codigo, asignado_por)
                 VALUES ($1, $2, 'AUTOREGISTRO')`,
                [id, type],
              );
            }
            await append_audit_db(db, { type: "SISTEMA", id: "AUTOREGISTRO" }, "crear", "proveedores", String(id), {
              taxId,
              contractorTypes: types.join(","),
            });
            return await get_provider_or_throw(db, id);
          });
        } catch (error) {
          if (get_pg_error(error).code === pgUniqueViolation) {
            throw new ValidationError("Ya existe un proveedor con ese RFC");
          }
          throw error;
        }
      },
      async list_providers(filter) {
        const { rows } = await get_db().query<ProviderRow>(
          `${providerSelect} WHERE ($1::text IS NULL OR p.estatus = $1) GROUP BY p.id ORDER BY p.id`,
          [filter?.status ?? null],
        );
        return rows.map(map_provider);
      },
      async get_provider(id) {
        return find_provider_db(get_db(), id);
      },
      async set_provider_status(providerId, status, reason, actorEmployeeNumber) {
        return with_transaction(async (db) => {
          await require_permission_db(db, actorEmployeeNumber, "contratistas:gestionar");
          const provider = await get_provider_or_throw(db, providerId);
          if (provider.status === status) throw new ValidationError(`El proveedor ya está ${status}`);
          const motive = optional_text(reason);
          if (status === "SUSPENDIDO" && !motive) throw new ValidationError("El motivo es obligatorio al suspender");

          await db.query(
            `UPDATE proveedores SET estatus = $2, actualizado_en = now(), actualizado_por = $3 WHERE id = $1`,
            [providerId, status, actorEmployeeNumber],
          );
          await append_audit_db(db, { type: "EMPLEADO", id: actorEmployeeNumber }, "actualizar", "proveedores", String(providerId), {
            event: "status",
            from: provider.status,
            to: status,
            reason: motive,
          });
          return await get_provider_or_throw(db, providerId);
        });
      },
      async set_contractor_types(providerId, types, actor) {
        const unique = [...new Set<ContractorTypeCode>(types)];
        if (unique.length === 0) throw new ValidationError("Indica al menos un tipo de contratista");
        if (unique.some((code) => !find_contractor_type(code))) {
          throw new ValidationError("Tipo de contratista desconocido");
        }
        return with_transaction(async (db) => {
          await authorize_provider_db(db, actor, providerId, { requireAdmin: true });
          const actorId = get_signer_actor_id(actor);
          await db.query(
            `UPDATE proveedor_tipos_contratista SET retirado_en = now()
              WHERE proveedor_id = $1 AND retirado_en IS NULL AND NOT (tipo_contratista_codigo = ANY($2::text[]))`,
            [providerId, unique],
          );
          for (const type of unique) {
            await db.query(
              `INSERT INTO proveedor_tipos_contratista (proveedor_id, tipo_contratista_codigo, asignado_por)
               VALUES ($1, $2, $3)
               ON CONFLICT (proveedor_id, tipo_contratista_codigo)
               DO UPDATE SET retirado_en = NULL, asignado_en = now(), asignado_por = $3
                 WHERE proveedor_tipos_contratista.retirado_en IS NOT NULL`,
              [providerId, type, actorId],
            );
          }
          await db.query(`UPDATE proveedores SET actualizado_en = now(), actualizado_por = $2 WHERE id = $1`, [
            providerId,
            actorId,
          ]);
          await append_audit_db(db, to_audit_actor(actor), "actualizar", "proveedor_tipos_contratista", String(providerId), {
            contractorTypes: unique.join(","),
          });
          return await get_provider_or_throw(db, providerId);
        });
      },
    },

    providerUsers: {
      async get_user(userId) {
        const { rows } = await get_db().query<UserRow>(`SELECT * FROM usuarios_proveedor WHERE id = $1`, [userId]);
        return rows[0] ? map_user(rows[0]) : null;
      },
      async list_users(providerId, actor) {
        await authorize_provider_db(get_db(), actor, providerId);
        const { rows } = await get_db().query<UserRow>(
          `SELECT * FROM usuarios_proveedor WHERE proveedor_id = $1 ORDER BY id`,
          [providerId],
        );
        return rows.map(map_user);
      },
      async create_user(input, actor) {
        const firstName = require_text(input.firstName, "El nombre");
        const paternalSurname = require_text(input.paternalSurname, "El apellido paterno");
        const email = optional_text(input.email);
        if (email && !emailPattern.test(email)) throw new ValidationError("El correo no es válido");

        return with_transaction(async (db) => {
          await authorize_provider_db(db, actor, input.providerId, { requireAdmin: true });
          if (input.providerEmployeeId !== null) {
            const employee = await get_employee_or_throw(db, input.providerEmployeeId);
            if (employee.providerId !== input.providerId) {
              throw new ValidationError("El colaborador no pertenece a este proveedor");
            }
          }

          const temporaryPassword = generate_temporary_password();
          const passwordHash = hash_secret(temporaryPassword);
          const name = [firstName, paternalSurname, optional_text(input.maternalSurname)]
            .filter((part): part is string => Boolean(part))
            .join(" ");
          const actorId = get_signer_actor_id(actor);

          // El usuario son 8 caracteres con 2 dígitos aleatorios: ante colisión se reintenta.
          for (let attempt = 0; attempt < 50; attempt += 1) {
            const username = build_provider_username(firstName, paternalSurname, input.maternalSurname);
            await db.query("SAVEPOINT alta_usuario");
            try {
              const { rows } = await db.query<UserRow>(
                `INSERT INTO usuarios_proveedor
                   (proveedor_id, empleado_proveedor_id, nombre, usuario, password_hash, correo,
                    es_administrador, creado_por, actualizado_por)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
                 RETURNING *`,
                [input.providerId, input.providerEmployeeId, name, username, passwordHash, email, input.isAdministrator, actorId],
              );
              await db.query("RELEASE SAVEPOINT alta_usuario");
              const row = rows[0];
              if (!row) throw new Error("No se pudo crear el usuario");
              await append_audit_db(db, to_audit_actor(actor), "crear", "usuarios_proveedor", String(row.id), {
                providerId: row.proveedor_id,
                username,
                isAdministrator: row.es_administrador,
              });
              return { user: map_user(row), temporaryPassword };
            } catch (error) {
              await db.query("ROLLBACK TO SAVEPOINT alta_usuario");
              if (get_pg_error(error).code !== pgUniqueViolation) throw error;
            }
          }
          throw new ValidationError("No se pudo generar un usuario único; intenta de nuevo");
        });
      },
      async list_employee_ids_with_inactive_account(providerId) {
        const { rows } = await get_db().query<{ empleado_proveedor_id: number }>(
          `SELECT empleado_proveedor_id FROM usuarios_proveedor
            WHERE proveedor_id = $1 AND empleado_proveedor_id IS NOT NULL
            GROUP BY empleado_proveedor_id
           HAVING NOT bool_or(activo)`,
          [providerId],
        );
        return rows.map((row) => row.empleado_proveedor_id);
      },
      async login(username, password) {
        return with_transaction(async (db) => {
          const { rows } = await db.query<UserRow>(
            `SELECT * FROM usuarios_proveedor WHERE usuario = $1 FOR UPDATE`,
            [username.trim().toLowerCase()],
          );
          const user = rows[0];
          if (!user) return { ok: false as const, reason: "CREDENCIALES_INVALIDAS" as const };

          const now = new Date();
          if (user.bloqueado_hasta && user.bloqueado_hasta > now) {
            return { ok: false as const, reason: "USUARIO_BLOQUEADO" as const };
          }
          let attempts = user.bloqueado_hasta ? 0 : user.intentos_fallidos;
          const actor = { type: "USUARIO_PROVEEDOR" as const, id: `P-${user.id}` };

          if (!verify_secret(password, user.password_hash)) {
            attempts += 1;
            const locked = attempts >= maxFailedAttempts;
            await db.query(
              `UPDATE usuarios_proveedor SET intentos_fallidos = $2, bloqueado_hasta = $3 WHERE id = $1`,
              [user.id, attempts, locked ? new Date(now.getTime() + lockoutMinutes * 60_000).toISOString() : null],
            );
            await append_audit_db(db, actor, "inicio_sesion_fallido", "usuarios_proveedor", String(user.id), {
              failedAttempts: attempts,
              locked,
            });
            return { ok: false as const, reason: "CREDENCIALES_INVALIDAS" as const };
          }

          if (!user.activo) return { ok: false as const, reason: "USUARIO_INACTIVO" as const };
          const provider = await get_provider_or_throw(db, user.proveedor_id);
          if (provider.status === "SUSPENDIDO") {
            return { ok: false as const, reason: "PROVEEDOR_SUSPENDIDO" as const };
          }
          await db.query(
            `UPDATE usuarios_proveedor SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1`,
            [user.id],
          );
          await append_audit_db(db, actor, "iniciar_sesion", "usuarios_proveedor", String(user.id), {});
          return { ok: true as const, user: map_user({ ...user, intentos_fallidos: 0, bloqueado_hasta: null }) };
        });
      },
      async change_password(userId, currentPassword, newPassword) {
        await with_transaction(async (db) => {
          const { rows } = await db.query<UserRow>(
            `SELECT * FROM usuarios_proveedor WHERE id = $1 AND activo FOR UPDATE`,
            [userId],
          );
          const user = rows[0];
          if (!user) throw new NotFoundError("Usuario de proveedor", String(userId));
          if (!verify_secret(currentPassword, user.password_hash)) {
            throw new ValidationError("La contraseña actual no es correcta");
          }
          if (newPassword.length < minPasswordLength) {
            throw new ValidationError(`La contraseña debe tener al menos ${minPasswordLength} caracteres`);
          }
          if (newPassword === currentPassword) throw new ValidationError("La contraseña nueva debe ser distinta");

          await db.query(
            `UPDATE usuarios_proveedor
                SET password_hash = $2, debe_cambiar_password = false, actualizado_en = now(), actualizado_por = $3
              WHERE id = $1`,
            [userId, hash_secret(newPassword), `P-${userId}`],
          );
          await append_audit_db(db, { type: "USUARIO_PROVEEDOR", id: `P-${userId}` }, "actualizar", "usuarios_proveedor", String(userId), {
            event: "change_password",
          });
        });
      },
      async reset_password(userId, actor) {
        return with_transaction(async (db) => {
          const { rows } = await db.query<{ proveedor_id: number }>(
            `SELECT proveedor_id FROM usuarios_proveedor WHERE id = $1 FOR UPDATE`,
            [userId],
          );
          const user = rows[0];
          if (!user) throw new NotFoundError("Usuario de proveedor", String(userId));
          await authorize_provider_db(db, actor, user.proveedor_id, { requireAdmin: true });

          const temporaryPassword = generate_temporary_password();
          await db.query(
            `UPDATE usuarios_proveedor
                SET password_hash = $2, debe_cambiar_password = true, intentos_fallidos = 0,
                    bloqueado_hasta = NULL, actualizado_en = now(), actualizado_por = $3
              WHERE id = $1`,
            [userId, hash_secret(temporaryPassword), get_signer_actor_id(actor)],
          );
          await append_audit_db(db, to_audit_actor(actor), "restablecer_password", "usuarios_proveedor", String(userId), {});
          return temporaryPassword;
        });
      },
      async set_user_active(userId, active, reason, actor) {
        return with_transaction(async (db) => {
          const { rows } = await db.query<{ proveedor_id: number }>(
            `SELECT proveedor_id FROM usuarios_proveedor WHERE id = $1 FOR UPDATE`,
            [userId],
          );
          const found = rows[0];
          if (!found) throw new NotFoundError("Usuario de proveedor", String(userId));
          await authorize_provider_db(db, actor, found.proveedor_id, { requireAdmin: true });
          const motive = require_text(reason, "El motivo");
          if (actor.kind === "USUARIO_PROVEEDOR" && actor.providerUserId === userId && !active) {
            throw new ValidationError("No puedes desactivar tu propia cuenta");
          }
          const updated = await db.query<UserRow>(
            `UPDATE usuarios_proveedor SET activo = $2, actualizado_en = now(), actualizado_por = $3
              WHERE id = $1 RETURNING *`,
            [userId, active, get_signer_actor_id(actor)],
          );
          const row = updated.rows[0];
          if (!row) throw new NotFoundError("Usuario de proveedor", String(userId));
          await append_audit_db(db, to_audit_actor(actor), "actualizar", "usuarios_proveedor", String(userId), {
            event: active ? "activate" : "deactivate",
            reason: motive,
          });
          return map_user(row);
        });
      },
      async set_user_employee(userId, providerEmployeeId, reason, actor) {
        return with_transaction(async (db) => {
          const { rows } = await db.query<{ proveedor_id: number }>(
            `SELECT proveedor_id FROM usuarios_proveedor WHERE id = $1 FOR UPDATE`,
            [userId],
          );
          const found = rows[0];
          if (!found) throw new NotFoundError("Usuario de proveedor", String(userId));
          await authorize_provider_db(db, actor, found.proveedor_id, { requireAdmin: true });
          const motive = require_text(reason, "El motivo");
          if (providerEmployeeId !== null) {
            const employee = await db.query(
              `SELECT 1 FROM empleados_proveedor WHERE id = $1 AND proveedor_id = $2 AND activo`,
              [providerEmployeeId, found.proveedor_id],
            );
            if (employee.rowCount === 0) {
              throw new ValidationError("El colaborador no existe, está de baja o es de otro proveedor");
            }
          }
          const updated = await db.query<UserRow>(
            `UPDATE usuarios_proveedor SET empleado_proveedor_id = $2, actualizado_en = now(), actualizado_por = $3
              WHERE id = $1 RETURNING *`,
            [userId, providerEmployeeId, get_signer_actor_id(actor)],
          );
          const row = updated.rows[0];
          if (!row) throw new NotFoundError("Usuario de proveedor", String(userId));
          await append_audit_db(db, to_audit_actor(actor), "actualizar", "usuarios_proveedor", String(userId), {
            event: "link_employee",
            providerEmployeeId,
            reason: motive,
          });
          return map_user(row);
        });
      },
    },

    providerEmployees: {
      async list_employees(providerId, options) {
        const { rows } = await get_db().query<EmployeeRow>(
          `${employeeSelect} WHERE ep.proveedor_id = $1 AND (ep.activo OR $2::boolean)
            GROUP BY ep.id ORDER BY ep.apellido_paterno, ep.primer_nombre`,
          [providerId, options?.includeInactive === true],
        );
        return rows.map(map_employee);
      },
      async get_employee(employeeId) {
        return find_employee_db(get_db(), employeeId);
      },
      async add_employee(providerId, input, actor) {
        return with_transaction(async (db) => {
          await authorize_provider_db(db, actor, providerId);
          return create_employee_db(db, providerId, input, actor);
        });
      },
      async import_employees(providerId, rows, actor) {
        return with_transaction(async (db) => {
          await authorize_provider_db(db, actor, providerId);
          const created: ProviderEmployee[] = [];
          const rejected: { row: number; reason: string }[] = [];
          for (const [index, row] of rows.entries()) {
            try {
              created.push(await create_employee_db(db, providerId, row, actor));
            } catch (error) {
              if (!(error instanceof ValidationError)) throw error;
              rejected.push({ row: index + 1, reason: error.message });
            }
          }
          return { created, rejected };
        });
      },
      async deactivate_employee(employeeId, reason, actor) {
        return with_transaction(async (db) => {
          const employee = await get_employee_or_throw(db, employeeId);
          await authorize_provider_db(db, actor, employee.providerId);
          const motive = require_text(reason, "El motivo");
          if (!employee.active) throw new ValidationError("El colaborador ya está inactivo");

          await db.query(
            `UPDATE empleados_proveedor
                SET activo = false, fecha_baja = hoy_mx(), actualizado_en = now(), actualizado_por = $2
              WHERE id = $1`,
            [employeeId, get_signer_actor_id(actor)],
          );
          await append_audit_db(db, to_audit_actor(actor), "actualizar", "empleados_proveedor", String(employeeId), {
            event: "deactivate",
            reason: motive,
          });
          return await get_employee_or_throw(db, employeeId);
        });
      },
      async set_work_types(employeeId, workTypes, actor) {
        const desired = validate_work_types(workTypes);
        return with_transaction(async (db) => {
          const employee = await get_employee_or_throw(db, employeeId);
          await authorize_provider_db(db, actor, employee.providerId);
          if (!employee.active) throw new ValidationError("El colaborador está inactivo");
          const actorId = get_signer_actor_id(actor);

          await db.query(
            `UPDATE empleado_proveedor_trabajos SET retirado_en = now()
              WHERE empleado_proveedor_id = $1 AND retirado_en IS NULL AND NOT (tipo_trabajo_codigo = ANY($2::text[]))`,
            [employeeId, desired],
          );
          for (const workType of desired) {
            await db.query(
              `INSERT INTO empleado_proveedor_trabajos (empleado_proveedor_id, tipo_trabajo_codigo, declarado_por)
               VALUES ($1, $2, $3)
               ON CONFLICT (empleado_proveedor_id, tipo_trabajo_codigo)
               DO UPDATE SET retirado_en = NULL, declarado_en = now(), declarado_por = $3
                 WHERE empleado_proveedor_trabajos.retirado_en IS NOT NULL`,
              [employeeId, workType, actorId],
            );
          }
          await db.query(
            `UPDATE empleados_proveedor SET actualizado_en = now(), actualizado_por = $2 WHERE id = $1`,
            [employeeId, actorId],
          );
          await append_audit_db(db, to_audit_actor(actor), "actualizar", "empleado_proveedor_trabajos", String(employeeId), {
            workTypes: desired.join(","),
          });
          return await get_employee_or_throw(db, employeeId);
        });
      },
      async get_semaphore(employeeId) {
        return get_subject_semaphore_db(get_db(), { kind: "EMPLEADO_PROVEEDOR", providerEmployeeId: employeeId });
      },
      async list_semaphores(providerId) {
        const db = get_db();
        const { rows } = await db.query<{ empleado_proveedor_id: number }>(
          `SELECT empleado_proveedor_id FROM v_semaforo_empleado_proveedor
            WHERE proveedor_id = $1 ORDER BY empleado_proveedor_id`,
          [providerId],
        );
        const result: SubjectSemaphore[] = [];
        for (const row of rows) {
          const semaphore = await get_subject_semaphore_db(db, {
            kind: "EMPLEADO_PROVEEDOR",
            providerEmployeeId: row.empleado_proveedor_id,
          });
          if (semaphore) result.push(semaphore);
        }
        return result;
      },
      async add_photo(employeeId, input, actor) {
        if (!sha256Pattern.test(input.sha256)) throw new ValidationError("El hash sha256 no es válido");
        return with_transaction(async (db) => {
          const employee = await get_employee_or_throw(db, employeeId);
          await authorize_provider_db(db, actor, employee.providerId);
          // Un usuario de proveedor que no es administrador solo sube la foto de su propio registro.
          if (actor.kind === "USUARIO_PROVEEDOR") {
            const { rows: userRows } = await db.query<{ es_administrador: boolean; empleado_proveedor_id: number | null }>(
              `SELECT es_administrador, empleado_proveedor_id FROM usuarios_proveedor WHERE id = $1`,
              [actor.providerUserId],
            );
            const user = userRows[0];
            if (user && !user.es_administrador && user.empleado_proveedor_id !== employeeId) {
              throw new AccessDeniedError("ser el propio colaborador o el administrador del proveedor");
            }
          }
          if (!employee.active) throw new ValidationError("El colaborador está inactivo");
          const actorId = get_signer_actor_id(actor);
          const { rows } = await db.query<PhotoRow>(
            `INSERT INTO fotos_colaborador
               (empleado_proveedor_id, nombre_archivo, tipo_mime, tamano_bytes, ruta_almacenamiento, sha256, subido_por)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
              employeeId,
              require_text(input.fileName, "El nombre del archivo"),
              input.mimeType,
              input.sizeBytes,
              require_text(input.storagePath, "La ruta del archivo"),
              input.sha256,
              actorId,
            ],
          );
          const row = rows[0];
          if (!row) throw new Error("No se pudo registrar la fotografía");
          await append_audit_db(db, to_audit_actor(actor), "crear", "fotos_colaborador", row.id, {
            providerEmployeeId: employeeId,
            sha256: row.sha256,
          });
          return map_photo(row);
        });
      },
      async get_current_photo(employeeId) {
        const { rows } = await get_db().query<PhotoRow>(
          `SELECT * FROM fotos_colaborador WHERE empleado_proveedor_id = $1 ORDER BY id DESC LIMIT 1`,
          [employeeId],
        );
        const row = rows[0];
        return row && row.ruta_almacenamiento !== null ? map_photo(row) : null;
      },
      async delete_current_photo(employeeId, reason, actor) {
        const motive = require_text(reason, "El motivo");
        return with_transaction(async (db) => {
          const employee = await get_employee_or_throw(db, employeeId);
          await authorize_provider_db(db, actor, employee.providerId);
          const found = await db.query<PhotoRow>(
            `SELECT * FROM fotos_colaborador WHERE empleado_proveedor_id = $1 ORDER BY id DESC LIMIT 1 FOR UPDATE`,
            [employeeId],
          );
          const photo = found.rows[0];
          if (!photo || photo.ruta_almacenamiento === null) throw new ValidationError("El colaborador no tiene fotografía");
          const { rows } = await db.query<PhotoRow>(
            `UPDATE fotos_colaborador
                SET ruta_almacenamiento = NULL, archivo_eliminado_en = now(), archivo_eliminado_por = $2
              WHERE id = $1 RETURNING *`,
            [photo.id, get_signer_actor_id(actor)],
          );
          const row = rows[0];
          if (!row) throw new NotFoundError("Fotografía", photo.id);
          await append_audit_db(db, to_audit_actor(actor), "purgar_archivo", "fotos_colaborador", row.id, {
            providerEmployeeId: employeeId,
            sha256: row.sha256,
            reason: motive,
          });
          return map_photo(row);
        });
      },
    },

    equipment: {
      async list_equipment(providerId, options) {
        const { rows } = await get_db().query<EquipmentRow>(
          `SELECT * FROM equipos_proveedor WHERE proveedor_id = $1 AND (activo OR $2::boolean) ORDER BY id`,
          [providerId, options?.includeInactive === true],
        );
        return rows.map(map_equipment);
      },
      async add_equipment(providerId, input, actor) {
        const equipmentType = require_text(input.equipmentType, "El tipo de equipo").toUpperCase();
        return with_transaction(async (db) => {
          await authorize_provider_db(db, actor, providerId);
          const actorId = get_signer_actor_id(actor);
          const { rows } = await db.query<EquipmentRow>(
            `INSERT INTO equipos_proveedor
               (proveedor_id, tipo_equipo, descripcion, marca, modelo, numero_serie, placas, creado_por, actualizado_por)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
             RETURNING *`,
            [
              providerId,
              equipmentType,
              optional_text(input.description),
              optional_text(input.brand),
              optional_text(input.model),
              optional_text(input.serialNumber),
              optional_text(input.plates),
              actorId,
            ],
          );
          const row = rows[0];
          if (!row) throw new Error("No se pudo crear el equipo");
          await append_audit_db(db, to_audit_actor(actor), "crear", "equipos_proveedor", String(row.id), {
            providerId,
            equipmentType,
          });
          return map_equipment(row);
        });
      },
      async deactivate_equipment(equipmentId, reason, actor) {
        return with_transaction(async (db) => {
          const found = await db.query<EquipmentRow>(`SELECT * FROM equipos_proveedor WHERE id = $1 FOR UPDATE`, [
            equipmentId,
          ]);
          const equipment = found.rows[0];
          if (!equipment) throw new NotFoundError("Equipo", String(equipmentId));
          await authorize_provider_db(db, actor, equipment.proveedor_id);
          const motive = require_text(reason, "El motivo");
          if (!equipment.activo) throw new ValidationError("El equipo ya está inactivo");

          const { rows } = await db.query<EquipmentRow>(
            `UPDATE equipos_proveedor SET activo = false, actualizado_en = now(), actualizado_por = $2
              WHERE id = $1 RETURNING *`,
            [equipmentId, get_signer_actor_id(actor)],
          );
          const row = rows[0];
          if (!row) throw new NotFoundError("Equipo", String(equipmentId));
          await append_audit_db(db, to_audit_actor(actor), "actualizar", "equipos_proveedor", String(equipmentId), {
            event: "deactivate",
            reason: motive,
          });
          return map_equipment(row);
        });
      },
      async get_semaphore(equipmentId) {
        return get_subject_semaphore_db(get_db(), { kind: "EQUIPO", equipmentId });
      },
    },

    documents: {
      async list_requirements(subject) {
        return list_requirements_db(get_db(), subject);
      },
      async list_versions(documentId) {
        const { rows } = await get_db().query<VersionRow>(
          `SELECT * FROM versiones_documento WHERE documento_id = $1 ORDER BY numero_version`,
          [documentId],
        );
        return rows.map(map_version);
      },
      async get_version(versionId) {
        const { rows } = await get_db().query<
          VersionRow & {
            doc_id: string;
            empleado_proveedor_id: number | null;
            equipo_proveedor_id: number | null;
            doc_proveedor_id: number | null;
            tipo_documento_codigo: DocumentTypeCode;
            doc_creado_en: Date;
            doc_creado_por: string;
            proveedor_id: number;
          }
        >(
          `SELECT v.*, d.id AS doc_id, d.empleado_proveedor_id, d.equipo_proveedor_id, d.proveedor_id AS doc_proveedor_id,
                  d.tipo_documento_codigo, d.creado_en AS doc_creado_en, d.creado_por AS doc_creado_por,
                  COALESCE(ep.proveedor_id, eq.proveedor_id, d.proveedor_id) AS proveedor_id
             FROM versiones_documento v
             JOIN documentos_contratista d ON d.id = v.documento_id
             LEFT JOIN empleados_proveedor ep ON ep.id = d.empleado_proveedor_id
             LEFT JOIN equipos_proveedor eq ON eq.id = d.equipo_proveedor_id
            WHERE v.id = $1`,
          [versionId],
        );
        const row = rows[0];
        if (!row) return null;
        return {
          document: map_document({
            id: row.doc_id,
            empleado_proveedor_id: row.empleado_proveedor_id,
            equipo_proveedor_id: row.equipo_proveedor_id,
            proveedor_id: row.doc_proveedor_id,
            tipo_documento_codigo: row.tipo_documento_codigo,
            creado_en: row.doc_creado_en,
            creado_por: row.doc_creado_por,
          }),
          version: map_version(row),
          providerId: row.proveedor_id,
        };
      },
      async list_documents(subject) {
        const { rows } =
          subject.kind === "EMPLEADO_PROVEEDOR"
            ? await get_db().query<DocumentRow>(
                `SELECT * FROM documentos_contratista WHERE empleado_proveedor_id = $1 ORDER BY id`,
                [subject.providerEmployeeId],
              )
            : subject.kind === "PROVEEDOR"
              ? await get_db().query<DocumentRow>(
                  `SELECT * FROM documentos_contratista WHERE proveedor_id = $1 ORDER BY id`,
                  [subject.providerId],
                )
              : await get_db().query<DocumentRow>(
                  `SELECT * FROM documentos_contratista WHERE equipo_proveedor_id = $1 ORDER BY id`,
                  [subject.equipmentId],
                );
        return rows.map(map_document);
      },
      async list_reviews(documentId) {
        const { rows } = await get_db().query<ReviewRow>(
          `SELECT r.*, rv.revocado_por, rv.motivo AS motivo_revocacion, rv.revocado_en
             FROM revisiones_documento r
             JOIN versiones_documento v ON v.id = r.version_id
             LEFT JOIN revocaciones_revision rv ON rv.revision_id = r.id
            WHERE v.documento_id = $1 ORDER BY r.id`,
          [documentId],
        );
        return rows.map(map_review);
      },
      async upload_version(input, actor) {
        const type = find_document_type(input.documentTypeCode);
        if (!type) throw new ValidationError(`Tipo de documento desconocido: ${input.documentTypeCode}`);
        if (type.appliesTo !== input.subject.kind) {
          throw new ValidationError("Ese documento no aplica a este tipo de sujeto");
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

        return with_transaction(async (db) => {
          const owner = await get_subject_owner_db(db, input.subject);
          if (!owner) throw new NotFoundError("Colaborador o equipo", "del documento");
          await authorize_provider_db(db, actor, owner.providerId);
          if (!owner.active) throw new ValidationError("El colaborador o equipo está inactivo");
          if (!(await is_type_required_db(db, input.subject, type))) {
            throw new ValidationError("Ese documento no se exige a este colaborador (declara primero el trabajo)");
          }

          const actorId = get_signer_actor_id(actor);
          const ownerColumn =
            input.subject.kind === "EMPLEADO_PROVEEDOR"
              ? "empleado_proveedor_id"
              : input.subject.kind === "PROVEEDOR"
                ? "proveedor_id"
                : "equipo_proveedor_id";
          const ownerId =
            input.subject.kind === "EMPLEADO_PROVEEDOR"
              ? input.subject.providerEmployeeId
              : input.subject.kind === "PROVEEDOR"
                ? input.subject.providerId
                : input.subject.equipmentId;

          const found = await db.query<DocumentRow>(
            `SELECT * FROM documentos_contratista WHERE ${ownerColumn} = $1 AND tipo_documento_codigo = $2`,
            [ownerId, type.code],
          );
          let documentRow = found.rows[0];
          if (!documentRow) {
            const created = await db.query<DocumentRow>(
              `INSERT INTO documentos_contratista (${ownerColumn}, tipo_documento_codigo, creado_por)
               VALUES ($1, $2, $3) RETURNING *`,
              [ownerId, type.code, actorId],
            );
            documentRow = created.rows[0];
          }
          if (!documentRow) throw new Error("No se pudo crear el expediente del documento");

          // Bloqueo del expediente para que dos cargas simultáneas no repitan el número de versión.
          await db.query(`SELECT 1 FROM documentos_contratista WHERE id = $1 FOR UPDATE`, [documentRow.id]);
          const { rows } = await db.query<VersionRow>(
            `INSERT INTO versiones_documento
               (documento_id, numero_version, nombre_archivo, tipo_mime, tamano_bytes, ruta_almacenamiento,
                sha256, fecha_emision, fecha_vencimiento, subido_por)
             VALUES ($1,
                     (SELECT COALESCE(max(numero_version), 0) + 1 FROM versiones_documento WHERE documento_id = $1),
                     $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
              documentRow.id,
              fileName,
              input.mimeType,
              input.sizeBytes,
              storagePath,
              input.sha256,
              input.issueDate,
              input.expiryDate,
              actorId,
            ],
          );
          const versionRow = rows[0];
          if (!versionRow) throw new Error("No se pudo registrar la versión");
          await append_audit_db(db, to_audit_actor(actor), "subir_version", "versiones_documento", versionRow.id, {
            documentId: documentRow.id,
            documentTypeCode: type.code,
            versionNumber: versionRow.numero_version,
            sha256: versionRow.sha256,
          });
          return { document: map_document(documentRow), version: map_version(versionRow) };
        });
      },
      async review_version(input, actorEmployeeNumber) {
        try {
          return await with_transaction(async (db) => {
            const found = await db.query<VersionRow & { tipo_documento_codigo: DocumentTypeCode }>(
              `SELECT v.*, d.tipo_documento_codigo
                 FROM versiones_documento v JOIN documentos_contratista d ON d.id = v.documento_id
                WHERE v.id = $1 FOR UPDATE OF v`,
              [input.versionId],
            );
            const version = found.rows[0];
            if (!version) throw new NotFoundError("Versión de documento", input.versionId);
            const type = find_document_type(version.tipo_documento_codigo);
            if (!type) throw new NotFoundError("Tipo de documento", version.tipo_documento_codigo);

            await require_permission_db(db, actorEmployeeNumber, type.reviewPermission);
            const latest = await db.query<{ id: string }>(
              `SELECT id FROM versiones_documento WHERE documento_id = $1 ORDER BY numero_version DESC LIMIT 1`,
              [version.documento_id],
            );
            if (latest.rows[0]?.id !== version.id) throw new ValidationError("Solo se revisa la versión más reciente");
            if (version.subido_por === actorEmployeeNumber && !(await is_hsea_admin_db(db, actorEmployeeNumber))) {
              throw new ValidationError("No puedes revisar un documento que tú mismo subiste");
            }
            const reason = optional_text(input.reason);
            if (input.result === "RECHAZADO" && !reason) throw new ValidationError("El motivo es obligatorio al rechazar");

            const { rows } = await db.query<ReviewRow>(
              `INSERT INTO revisiones_documento (version_id, resultado, revisor_no_empleado, motivo)
               VALUES ($1, $2, $3, $4) RETURNING *`,
              [version.id, input.result, to_employee_int(actorEmployeeNumber), reason],
            );
            const row = rows[0];
            if (!row) throw new Error("No se pudo registrar la revisión");
            await append_audit_db(
              db,
              { type: "EMPLEADO", id: actorEmployeeNumber },
              input.result === "APROBADO" ? "aprobar_revision" : "rechazar_revision",
              "revisiones_documento",
              row.id,
              { versionId: version.id, documentTypeCode: type.code, reason },
            );
            return map_review(row);
          });
        } catch (error) {
          if (get_pg_error(error).code === pgUniqueViolation) throw new ValidationError("Esta versión ya fue revisada");
          throw error;
        }
      },
      async revoke_review(versionId, reason, actorEmployeeNumber) {
        try {
          return await with_transaction(async (db) => {
            await require_permission_db(db, actorEmployeeNumber, "contratistas:gestionar");
            const motive = require_text(reason, "El motivo");
            const found = await db.query<ReviewRow & { documento_id: string; tipo_documento_codigo: DocumentTypeCode }>(
              `SELECT r.*, v.documento_id, d.tipo_documento_codigo
                 FROM revisiones_documento r
                 JOIN versiones_documento v ON v.id = r.version_id
                 JOIN documentos_contratista d ON d.id = v.documento_id
                WHERE r.version_id = $1 FOR UPDATE OF r`,
              [versionId],
            );
            const review = found.rows[0];
            if (!review) throw new NotFoundError("Revisión de la versión", versionId);
            if (review.resultado !== "APROBADO") throw new ValidationError("Solo se revoca un documento aprobado");

            const latest = await db.query<{ id: string }>(
              `SELECT id FROM versiones_documento WHERE documento_id = $1 ORDER BY numero_version DESC LIMIT 1`,
              [review.documento_id],
            );
            if (latest.rows[0]?.id !== versionId) throw new ValidationError("Solo se revoca la versión más reciente");

            const { rows } = await db.query<{ revocado_por: number; motivo: string; revocado_en: Date }>(
              `INSERT INTO revocaciones_revision (revision_id, revocado_por, motivo)
               VALUES ($1, $2, $3) RETURNING revocado_por, motivo, revocado_en`,
              [review.id, to_employee_int(actorEmployeeNumber), motive],
            );
            const revoked = rows[0];
            if (!revoked) throw new Error("No se pudo registrar la revocación");
            await append_audit_db(db, { type: "EMPLEADO", id: actorEmployeeNumber }, "revocar_revision", "revisiones_documento", review.id, {
              versionId,
              documentTypeCode: review.tipo_documento_codigo,
              reason: motive,
            });
            return map_review({
              ...review,
              revocado_por: revoked.revocado_por,
              motivo_revocacion: revoked.motivo,
              revocado_en: revoked.revocado_en,
            });
          });
        } catch (error) {
          if (get_pg_error(error).code === pgUniqueViolation) throw new ValidationError("Esta aprobación ya fue revocada");
          throw error;
        }
      },
      async list_pending_reviews(reviewerEmployeeNumber) {
        const db = get_db();
        const { rows } = await db.query<
          VersionRow & {
            doc_id: string;
            empleado_proveedor_id: number | null;
            equipo_proveedor_id: number | null;
            doc_proveedor_id: number | null;
            tipo_documento_codigo: DocumentTypeCode;
            doc_creado_en: Date;
            doc_creado_por: string;
            proveedor_id: number;
          }
        >(
          `SELECT v.*, d.id AS doc_id, d.empleado_proveedor_id, d.equipo_proveedor_id, d.proveedor_id AS doc_proveedor_id,
                  d.tipo_documento_codigo, d.creado_en AS doc_creado_en, d.creado_por AS doc_creado_por,
                  COALESCE(ep.proveedor_id, eq.proveedor_id, d.proveedor_id) AS proveedor_id
             FROM documentos_contratista d
             JOIN LATERAL (SELECT * FROM versiones_documento x WHERE x.documento_id = d.id
                            ORDER BY x.numero_version DESC LIMIT 1) v ON true
             LEFT JOIN revisiones_documento r ON r.version_id = v.id
             LEFT JOIN empleados_proveedor ep ON ep.id = d.empleado_proveedor_id
             LEFT JOIN equipos_proveedor eq ON eq.id = d.equipo_proveedor_id
            WHERE r.id IS NULL
            ORDER BY v.subido_en`,
        );
        const permissionCache = new Map<PermissionCode, boolean>();
        const result = [];
        for (const row of rows) {
          const type = find_document_type(row.tipo_documento_codigo);
          if (!type) continue;
          let allowed = permissionCache.get(type.reviewPermission);
          if (allowed === undefined) {
            allowed = await has_permission_db(db, reviewerEmployeeNumber, type.reviewPermission);
            permissionCache.set(type.reviewPermission, allowed);
          }
          if (!allowed) continue;
          result.push({
            document: map_document({
              id: row.doc_id,
              empleado_proveedor_id: row.empleado_proveedor_id,
              equipo_proveedor_id: row.equipo_proveedor_id,
              proveedor_id: row.doc_proveedor_id,
              tipo_documento_codigo: row.tipo_documento_codigo,
              creado_en: row.doc_creado_en,
              creado_por: row.doc_creado_por,
            }),
            version: map_version(row),
            providerId: row.proveedor_id,
          });
        }
        return result;
      },
      async delete_version_file(versionId, reason, actor) {
        const motive = require_text(reason, "El motivo");
        return with_transaction(async (db) => {
          const found = await db.query<VersionRow & { proveedor_id: number | null }>(
            `SELECT v.*, COALESCE(ep.proveedor_id, eq.proveedor_id, d.proveedor_id) AS proveedor_id
               FROM versiones_documento v
               JOIN documentos_contratista d ON d.id = v.documento_id
               LEFT JOIN empleados_proveedor ep ON ep.id = d.empleado_proveedor_id
               LEFT JOIN equipos_proveedor eq ON eq.id = d.equipo_proveedor_id
              WHERE v.id = $1 FOR UPDATE OF v`,
            [versionId],
          );
          const version = found.rows[0];
          if (!version || version.proveedor_id === null) throw new NotFoundError("Versión de documento", versionId);
          await authorize_provider_db(db, actor, version.proveedor_id, { requireAdmin: true });
          if (version.ruta_almacenamiento === null) throw new ValidationError("El archivo ya fue eliminado");

          const { rows } = await db.query<VersionRow>(
            `UPDATE versiones_documento
                SET ruta_almacenamiento = NULL, archivo_eliminado_en = now(), archivo_eliminado_por = $2
              WHERE id = $1 RETURNING *`,
            [versionId, get_signer_actor_id(actor)],
          );
          const row = rows[0];
          if (!row) throw new NotFoundError("Versión de documento", versionId);
          await append_audit_db(db, to_audit_actor(actor), "purgar_archivo", "versiones_documento", versionId, {
            documentId: row.documento_id,
            sha256: row.sha256,
            reason: motive,
          });
          return map_version(row);
        });
      },
    },

    entries: {
      async register_entry(input, actorEmployeeNumber) {
        try {
          return await with_transaction(async (db) => {
            await require_permission_db(db, actorEmployeeNumber, "contratistas:registrar_ingresos");
            const employee = await get_employee_or_throw(db, input.providerEmployeeId);
            if (!employee.active) throw new ValidationError("El colaborador está inactivo");
            const permitId = input.permitId ?? null;
            if (permitId) {
              const permit = await db.query(`SELECT 1 FROM permisos_trabajo WHERE id = $1`, [permitId]);
              if (permit.rowCount === 0) throw new NotFoundError("Permiso", permitId);
            }

            const semaphore = (await get_employee_semaphore_db(db, employee.id)) ?? "ROJO";
            const reasons: string[] = [];
            if (semaphore !== "VERDE") reasons.push(`Semáforo ${semaphore}`);
            if (!input.eppComplete) reasons.push("EPP incompleto");
            const allowed = reasons.length === 0;

            const { rows } = await db.query<EntryRow>(
              `INSERT INTO registros_ingreso
                 (empleado_proveedor_id, resultado, semaforo_al_ingresar, epp_completo, observaciones,
                  motivo_denegacion, permiso_id, registrado_por)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               RETURNING *`,
              [
                employee.id,
                allowed ? "PERMITIDO" : "DENEGADO",
                semaphore,
                input.eppComplete,
                optional_text(input.notes),
                allowed ? null : reasons.join("; "),
                permitId,
                to_employee_int(actorEmployeeNumber),
              ],
            );
            const row = rows[0];
            if (!row) throw new Error("No se pudo registrar el ingreso");
            await append_audit_db(db, { type: "EMPLEADO", id: actorEmployeeNumber }, "crear", "registros_ingreso", row.id, {
              providerEmployeeId: employee.id,
              result: row.resultado,
              semaphore,
              eppComplete: row.epp_completo,
            });
            return map_entry(row);
          });
        } catch (error) {
          if (get_pg_error(error).code === pgUniqueViolation) {
            throw new ValidationError("El colaborador ya tiene un ingreso abierto (falta registrar su salida)");
          }
          throw error;
        }
      },
      async register_exit(entryId, actorEmployeeNumber, options) {
        return with_transaction(async (db) => {
          await require_permission_db(db, actorEmployeeNumber, "contratistas:registrar_ingresos");
          const found = await db.query<EntryRow>(`SELECT * FROM registros_ingreso WHERE id = $1 FOR UPDATE`, [entryId]);
          const entry = found.rows[0];
          if (!entry) throw new NotFoundError("Ingreso", entryId);
          if (entry.resultado !== "PERMITIDO") throw new ValidationError("Un ingreso denegado no tiene salida");
          if (entry.salida_en) throw new ValidationError("La salida ya fue registrada");

          const { rows } = await db.query<EntryRow>(
            `UPDATE registros_ingreso SET salida_en = now(), salida_registrada_por = $2 WHERE id = $1 RETURNING *`,
            [entryId, to_employee_int(actorEmployeeNumber)],
          );
          const row = rows[0];
          if (!row) throw new NotFoundError("Ingreso", entryId);
          await append_audit_db(db, { type: "EMPLEADO", id: actorEmployeeNumber }, "actualizar", "registros_ingreso", entryId, {
            event: "exit",
            method: options?.manualReason ? "manual" : "qr",
            reason: options?.manualReason ?? null,
          });
          return map_entry(row);
        });
      },
      async list_by_employee(providerEmployeeId, options) {
        const { rows } = await get_db().query<EntryRow>(
          `SELECT * FROM registros_ingreso WHERE empleado_proveedor_id = $1 ORDER BY ingreso_en DESC LIMIT $2`,
          [providerEmployeeId, options?.limit ?? 50],
        );
        return rows.map(map_entry);
      },
      async list_history(options) {
        const { rows } = await get_db().query<EntryRow>(
          `SELECT r.* FROM registros_ingreso r
             JOIN empleados_proveedor ep ON ep.id = r.empleado_proveedor_id
            WHERE ($1::int IS NULL OR ep.proveedor_id = $1)
              AND ($2::date IS NULL OR (r.ingreso_en AT TIME ZONE 'America/Mexico_City')::date >= $2::date)
              AND ($3::date IS NULL OR (r.ingreso_en AT TIME ZONE 'America/Mexico_City')::date <= $3::date)
            ORDER BY r.ingreso_en DESC
            LIMIT $4`,
          [options?.providerId ?? null, options?.from ?? null, options?.to ?? null, options?.limit ?? 1000],
        );
        return rows.map(map_entry);
      },
      async list_open_entries(providerId) {
        const { rows } = await get_db().query<EntryRow>(
          `SELECT r.* FROM registros_ingreso r
             JOIN empleados_proveedor ep ON ep.id = r.empleado_proveedor_id
            WHERE r.resultado = 'PERMITIDO' AND r.salida_en IS NULL
              AND ($1::int IS NULL OR ep.proveedor_id = $1)
            ORDER BY r.ingreso_en`,
          [providerId ?? null],
        );
        return rows.map(map_entry);
      },
    },

    participants: {
      async add_participant(input, actor) {
        const role = require_text(input.role, "La función");
        try {
          return await with_transaction(async (db) => {
            const permit = await load_permit_for_edit(db, input.permitId);
            await authorize_permit_editor_db(db, actor, permit);

            let registeredName: string;
            if (input.participant.kind === "EMPLEADO") {
              const { rows } = await db.query<{
                activo: boolean;
                nombre: string;
              }>(
                `SELECT activo, concat_ws(' ', primer_nombre, segundo_nombre, apellido_paterno, apellido_materno) AS nombre
                   FROM empleados WHERE no_empleado = $1`,
                [to_employee_int(input.participant.employeeNumber)],
              );
              const employee = rows[0];
              if (!employee || !employee.activo) throw new ValidationError("El empleado no existe o está inactivo");
              registeredName = employee.nombre;
            } else {
              const employee = await get_employee_or_throw(db, input.participant.providerEmployeeId);
              if (permit.proveedor_id === null || permit.proveedor_id !== employee.providerId) {
                throw new ValidationError("El colaborador no pertenece al proveedor de este permiso");
              }
              const semaphore = await get_employee_semaphore_db(db, employee.id);
              if (semaphore !== "VERDE") {
                throw new ValidationError(`El colaborador no está en semáforo VERDE (${semaphore ?? "inactivo"})`);
              }
              registeredName = [employee.firstName, employee.middleName, employee.paternalSurname, employee.maternalSurname]
                .filter((part): part is string => Boolean(part))
                .join(" ");
            }

            const { rows } = await db.query<ParticipantRow>(
              `INSERT INTO permiso_participantes
                 (permiso_id, funcion, posicion, participante_tipo, no_empleado, empleado_proveedor_id,
                  nombre_registrado, creado_por)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               RETURNING *`,
              [
                input.permitId,
                role,
                input.position ?? 1,
                input.participant.kind,
                input.participant.kind === "EMPLEADO" ? to_employee_int(input.participant.employeeNumber) : null,
                input.participant.kind === "EMPLEADO_PROVEEDOR" ? input.participant.providerEmployeeId : null,
                registeredName,
                get_signer_actor_id(actor),
              ],
            );
            const row = rows[0];
            if (!row) throw new Error("No se pudo agregar el participante");
            await append_audit_db(db, to_audit_actor(actor), "crear", "permiso_participantes", row.id, {
              permitId: input.permitId,
              role,
              kind: input.participant.kind,
            });
            return map_participant(row);
          });
        } catch (error) {
          if (get_pg_error(error).code === pgForeignKeyViolation) throw new NotFoundError("Permiso", input.permitId);
          throw error;
        }
      },
      async remove_participant(participantId, actor) {
        return with_transaction(async (db) => {
          const found = await db.query<ParticipantRow>(
            `SELECT * FROM permiso_participantes WHERE id = $1 FOR UPDATE`,
            [participantId],
          );
          const participant = found.rows[0];
          if (!participant) throw new NotFoundError("Participante", participantId);
          if (participant.retirado_en) throw new ValidationError("El participante ya fue retirado");
          const permit = await load_permit_for_edit(db, participant.permiso_id);
          await authorize_permit_editor_db(db, actor, permit);

          const { rows } = await db.query<ParticipantRow>(
            `UPDATE permiso_participantes SET retirado_en = now() WHERE id = $1 RETURNING *`,
            [participantId],
          );
          const row = rows[0];
          if (!row) throw new NotFoundError("Participante", participantId);
          await append_audit_db(db, to_audit_actor(actor), "actualizar", "permiso_participantes", participantId, {
            event: "remove",
          });
          return map_participant(row);
        });
      },
      async list_by_permit(permitId, options) {
        const { rows } = await get_db().query<ParticipantRow>(
          `SELECT * FROM permiso_participantes
            WHERE permiso_id = $1 AND (retirado_en IS NULL OR $2::boolean)
            ORDER BY funcion, posicion, id`,
          [permitId, options?.includeRemoved === true],
        );
        return rows.map(map_participant);
      },
    },
  };
}

/* ---------------------------------------------------------------------
 * Participantes: permiso y autorización
 * ------------------------------------------------------------------- */

interface PermitRef {
  id: string;
  estatus: string;
  proveedor_id: number | null;
  solicitante_no_empleado: number | null;
}

async function load_permit_for_edit(db: Queryable, permitId: string): Promise<PermitRef> {
  const { rows } = await db.query<PermitRef>(
    `SELECT id, estatus, proveedor_id, solicitante_no_empleado FROM permisos_trabajo WHERE id = $1`,
    [permitId],
  );
  const permit = rows[0];
  if (!permit) throw new NotFoundError("Permiso", permitId);
  if (permit.estatus === "closed") throw new ValidationError("El permiso está cerrado");
  return permit;
}

/** Quién puede alterar los participantes de un permiso: quien lo crea (TFS) o su proveedor. */
async function authorize_permit_editor_db(db: Queryable, actor: ActorIdentity, permit: PermitRef): Promise<void> {
  if (actor.kind === "EMPLEADO") {
    // El empleado que creó el permiso administra a sus participantes sin necesitar un rol aparte.
    if (permit.solicitante_no_empleado !== null && String(permit.solicitante_no_empleado) === actor.employeeNumber) return;
    await require_permission_db(db, actor.employeeNumber, "permisos:crear");
    return;
  }
  if (actor.kind === "USUARIO_PROVEEDOR") {
    const { rows } = await db.query<{ proveedor_id: number; activo: boolean }>(
      `SELECT proveedor_id, activo FROM usuarios_proveedor WHERE id = $1`,
      [actor.providerUserId],
    );
    const user = rows[0];
    if (!user || !user.activo || user.proveedor_id !== permit.proveedor_id) {
      throw new AccessDeniedError("ser usuario del proveedor de este permiso");
    }
    return;
  }
  throw new AccessDeniedError("una identidad válida");
}
