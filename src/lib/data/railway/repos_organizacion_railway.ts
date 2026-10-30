import {
  adminRoleCode,
  get_required_permission,
  is_permission_code,
  providerSignerRoles,
  type PermissionCode,
} from "@/config/permisos";
import { lastAdminMessage } from "../errores";
import { find_permit_type } from "@/config/tipos_permiso";
import { lockoutMinutes, maxFailedAttempts, requireSigningPin } from "@/config/seguridad";
import type {
  CanSignRequest,
  Role,
  RoleAssignment,
  RoleScope,
  SignDecision,
  SignDenialReason,
  SignatureRecord,
  SignerIdentity,
  SigningCredential,
  SigningCredentialStatus,
} from "@/domain/acceso";
import type { ActorType, AuditAction, AuditMetadata } from "@/domain/auditoria";
import type {
  AreaAssignment,
  AreaPosition,
  AreaRef,
  CommandLine,
  Department,
  Employee,
  Gender,
  PermitArea,
  Subdepartment,
} from "@/domain/organizacion";
import type { SignerRole } from "@/domain/permisos";
import { hash_pin, is_valid_pin_format, verify_pin_hash } from "@/lib/auth/pin";
import { get_scope_of_area_ref } from "../alcance";
import { AccessDeniedError, NotFoundError, ValidationError } from "../errores";
import { get_signer_actor_id, get_signer_actor_type } from "../identidad";
import type { DataRepositories } from "../repositorios";
import { insert_audit_event } from "./auditoria_railway";
import {
  get_db,
  get_pg_error,
  pgForeignKeyViolation,
  pgUniqueViolation,
  with_transaction,
  type Queryable,
} from "./conexion";

type OrganizationRepositories = Pick<
  DataRepositories,
  "employees" | "organization" | "access" | "credentials" | "signatures"
>;

/* ---------------------------------------------------------------------
 * Filas y mapeadores
 * ------------------------------------------------------------------- */

interface AuditCols {
  creado_en: Date;
  creado_por: number | null;
  actualizado_en: Date;
  actualizado_por: number | null;
}

/** Cargas iniciales (seed) no traen actor: se muestran como "seed". */
function map_audit(row: AuditCols): AuditMetadata {
  return {
    createdAt: row.creado_en.toISOString(),
    createdBy: row.creado_por === null ? "seed" : String(row.creado_por),
    updatedAt: row.actualizado_en.toISOString(),
    updatedBy: row.actualizado_por === null ? "seed" : String(row.actualizado_por),
  };
}

interface LineRow extends AuditCols {
  id: number;
  nombre: string;
  activa: boolean;
}
interface DepartmentRow extends AuditCols {
  id: number;
  linea_mando_id: number;
  nombre: string;
  activo: boolean;
}
interface SubdepartmentRow extends AuditCols {
  id: number;
  departamento_id: number;
  nombre: string;
  activo: boolean;
}
interface EmployeeRow extends AuditCols {
  no_empleado: number;
  primer_nombre: string;
  segundo_nombre: string | null;
  apellido_paterno: string;
  apellido_materno: string | null;
  genero: Gender | null;
  fecha_ingreso: string;
  fecha_baja: string | null;
  activo: boolean;
  puesto: string;
  linea_mando_id: number;
  departamento_id: number;
  subdepartamento_id: number | null;
  jefe_no_empleado: number | null;
}
interface AreaAssignmentRow extends AuditCols {
  id: string;
  no_empleado: number;
  cargo: AreaPosition;
  linea_mando_id: number | null;
  departamento_id: number | null;
  subdepartamento_id: number | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  motivo: string | null;
}
interface RoleRow extends AuditCols {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  es_sistema: boolean;
  activo: boolean;
  permisos: string[];
}
interface RoleAssignmentRow extends AuditCols {
  id: string;
  no_empleado: number;
  rol_id: number;
  rol_codigo: string;
  alcance: RoleScope;
  linea_mando_id: number | null;
  departamento_id: number | null;
  subdepartamento_id: number | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  otorgado_por: number;
  motivo: string | null;
  revocado_en: Date | null;
  revocado_por: number | null;
}
interface CredentialRow {
  id: string;
  firmante_tipo: "EMPLEADO" | "USUARIO_PROVEEDOR";
  no_empleado: number | null;
  usuario_proveedor_id: number | null;
  pin_hash: string;
  estado: SigningCredentialStatus;
  intentos_fallidos: number;
  bloqueada_hasta: Date | null;
  creado_en: Date;
  activada_por: number;
  revocada_en: Date | null;
  revocada_por: string | null;
}
interface SignatureRow {
  id: string;
  permiso_id: string;
  rol_firma: SignerRole;
  firmante_tipo: "EMPLEADO" | "USUARIO_PROVEEDOR";
  no_empleado: number | null;
  usuario_proveedor_id: number | null;
  linea_mando_id: number | null;
  departamento_id: number | null;
  subdepartamento_id: number | null;
  empleado_rol_id: string | null;
  cargo_area_id: string | null;
  credencial_firma_id: string | null;
  nombre_firmante: string;
  puesto_firmante: string;
  firmado_en: Date;
  hash_documento: string | null;
  imagen_firma: string | null;
}

function map_line(row: LineRow): CommandLine {
  return { id: row.id, name: row.nombre, active: row.activa, ...map_audit(row) };
}
function map_department(row: DepartmentRow): Department {
  return {
    id: row.id,
    commandLineId: row.linea_mando_id,
    name: row.nombre,
    active: row.activo,
    ...map_audit(row),
  };
}
function map_subdepartment(row: SubdepartmentRow): Subdepartment {
  return {
    id: row.id,
    departmentId: row.departamento_id,
    name: row.nombre,
    active: row.activo,
    ...map_audit(row),
  };
}
function map_employee(row: EmployeeRow): Employee {
  return {
    employeeNumber: String(row.no_empleado),
    firstName: row.primer_nombre,
    middleName: row.segundo_nombre,
    paternalSurname: row.apellido_paterno,
    maternalSurname: row.apellido_materno,
    gender: row.genero,
    hireDate: row.fecha_ingreso,
    terminationDate: row.fecha_baja,
    active: row.activo,
    jobTitle: row.puesto,
    commandLineId: row.linea_mando_id,
    departmentId: row.departamento_id,
    subdepartmentId: row.subdepartamento_id,
    directManagerEmployeeNumber:
      row.jefe_no_empleado === null ? null : String(row.jefe_no_empleado),
    ...map_audit(row),
  };
}
function map_area_assignment(row: AreaAssignmentRow): AreaAssignment {
  return {
    id: row.id,
    employeeNumber: String(row.no_empleado),
    position: row.cargo,
    commandLineId: row.linea_mando_id,
    departmentId: row.departamento_id,
    subdepartmentId: row.subdepartamento_id,
    validFrom: row.vigente_desde,
    validUntil: row.vigente_hasta,
    reason: row.motivo,
    ...map_audit(row),
  };
}
function map_role(row: RoleRow): Role {
  return {
    id: row.id,
    code: row.codigo,
    name: row.nombre,
    description: row.descripcion,
    isSystem: row.es_sistema,
    active: row.activo,
    permissions: row.permisos.filter(is_permission_code),
    ...map_audit(row),
  };
}
function map_role_assignment(row: RoleAssignmentRow): RoleAssignment {
  return {
    id: row.id,
    employeeNumber: String(row.no_empleado),
    roleId: row.rol_id,
    roleCode: row.rol_codigo,
    scope: row.alcance,
    commandLineId: row.linea_mando_id,
    departmentId: row.departamento_id,
    subdepartmentId: row.subdepartamento_id,
    validFrom: row.vigente_desde,
    validUntil: row.vigente_hasta,
    grantedByEmployeeNumber: String(row.otorgado_por),
    reason: row.motivo,
    revokedAt: row.revocado_en ? row.revocado_en.toISOString() : null,
    revokedByEmployeeNumber: row.revocado_por === null ? null : String(row.revocado_por),
    ...map_audit(row),
  };
}
function map_signer(row: {
  firmante_tipo: "EMPLEADO" | "USUARIO_PROVEEDOR";
  no_empleado: number | null;
  usuario_proveedor_id: number | null;
}): SignerIdentity {
  return row.firmante_tipo === "EMPLEADO"
    ? { kind: "EMPLEADO", employeeNumber: String(row.no_empleado) }
    : { kind: "USUARIO_PROVEEDOR", providerUserId: Number(row.usuario_proveedor_id) };
}
function map_credential(row: CredentialRow): SigningCredential {
  return {
    id: row.id,
    signer: map_signer(row),
    status: row.estado,
    failedAttempts: row.intentos_fallidos,
    lockedUntil: row.bloqueada_hasta ? row.bloqueada_hasta.toISOString() : null,
    createdAt: row.creado_en.toISOString(),
    activatedByEmployeeNumber: String(row.activada_por),
    revokedAt: row.revocada_en ? row.revocada_en.toISOString() : null,
    revokedBy: row.revocada_por,
  };
}
function map_signature(row: SignatureRow): SignatureRecord {
  return {
    id: row.id,
    permitId: row.permiso_id,
    signerRole: row.rol_firma,
    signer: map_signer(row),
    area: {
      commandLineId: row.linea_mando_id,
      departmentId: row.departamento_id,
      subdepartmentId: row.subdepartamento_id,
    },
    roleAssignmentId: row.empleado_rol_id,
    areaAssignmentId: row.cargo_area_id,
    credentialId: row.credencial_firma_id,
    signerName: row.nombre_firmante,
    signerJobTitle: row.puesto_firmante,
    signedAt: row.firmado_en.toISOString(),
    image: row.imagen_firma,
    documentHash: row.hash_documento,
  };
}

/* ---------------------------------------------------------------------
 * Utilidades
 * ------------------------------------------------------------------- */

export function to_employee_int(employeeNumber: string): number {
  const value = Number(employeeNumber);
  if (!Number.isSafeInteger(value)) throw new ValidationError(`Número de empleado inválido: ${employeeNumber}`);
  return value;
}

function require_reason(reason: string | null): string {
  const text = reason?.trim() ?? "";
  if (!text) throw new ValidationError("El motivo es obligatorio");
  return text;
}

function require_one_area_level(ref: AreaRef): void {
  const informed = [ref.commandLineId, ref.departmentId, ref.subdepartmentId].filter(
    (id) => id !== null,
  ).length;
  if (informed !== 1) throw new ValidationError("Indica exactamente un nivel de área");
}

/** Texto sin acentos ni mayúsculas, igual que la expresión SQL de la búsqueda. */
function normalize_text(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Condición SQL que identifica a un firmante en credenciales_firma / firmas_permiso. */
function build_signer_filter(
  signer: SignerIdentity,
  paramIndex: number,
): { sql: string; value: number } | null {
  if (signer.kind === "EMPLEADO") {
    return { sql: `no_empleado = $${paramIndex}`, value: to_employee_int(signer.employeeNumber) };
  }
  if (signer.kind === "USUARIO_PROVEEDOR") {
    return { sql: `usuario_proveedor_id = $${paramIndex}`, value: signer.providerUserId };
  }
  return null;
}

export async function has_permission_db(
  db: Queryable,
  employeeNumber: string,
  permission: PermissionCode,
  area?: PermitArea,
): Promise<boolean> {
  const number = Number(employeeNumber);
  if (!Number.isSafeInteger(number)) return false;
  if (!area) {
    const { rows } = await db.query<{ ok: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM v_permisos_empleado
                       WHERE no_empleado = $1 AND permiso_codigo = $2) AS ok`,
      [number, permission],
    );
    return rows[0]?.ok === true;
  }
  const { rows } = await db.query<{ ok: boolean }>(
    `SELECT tiene_permiso($1::int, $2::text, $3::int, $4::int) AS ok`,
    [number, permission, area.departmentId, area.subdepartmentId],
  );
  return rows[0]?.ok === true;
}

/** ¿Tiene el empleado el rol de administrador HSEA vigente? Es la única excepción a la segregación de funciones. */
export async function is_hsea_admin_db(db: Queryable, employeeNumber: string): Promise<boolean> {
  const number = Number(employeeNumber);
  if (!Number.isSafeInteger(number)) return false;
  const { rows } = await db.query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM v_roles_vigentes WHERE no_empleado = $1 AND rol_codigo = $2) AS ok`,
    [number, adminRoleCode],
  );
  return rows[0]?.ok === true;
}

export async function require_permission_db(
  db: Queryable,
  employeeNumber: string,
  permission: PermissionCode,
): Promise<void> {
  if (!(await has_permission_db(db, employeeNumber, permission))) {
    throw new AccessDeniedError(`el permiso ${permission}`);
  }
}

async function require_active_employee_db(db: Queryable, employeeNumber: string): Promise<Employee> {
  const { rows } = await db.query<EmployeeRow>(
    `SELECT * FROM empleados WHERE no_empleado = $1`,
    [to_employee_int(employeeNumber)],
  );
  const row = rows[0];
  if (!row || !row.activo) {
    throw new ValidationError(`El empleado ${employeeNumber} no existe o está inactivo`);
  }
  return map_employee(row);
}

export async function append_audit_db(
  db: Queryable,
  actor: { type: ActorType; id: string },
  action: AuditAction,
  entityType: string,
  entityId: string,
  details: Record<string, string | number | boolean | null>,
): Promise<void> {
  await insert_audit_event(db, {
    entityType,
    entityId,
    action,
    actorType: actor.type,
    actorId: actor.id,
    occurredAt: new Date().toISOString(),
    details,
  });
}

function employee_actor(employeeNumber: string) {
  return { type: "EMPLEADO" as const, id: employeeNumber };
}

function signer_actor(signer: SignerIdentity) {
  const type = get_signer_actor_type(signer);
  if (type === "SISTEMA") throw new ValidationError("El sistema no firma");
  return { type, id: get_signer_actor_id(signer) };
}

const roleAssignmentSelect = `SELECT er.*, r.codigo AS rol_codigo
                                FROM empleado_roles er JOIN roles r ON r.id = er.rol_id`;

/* ---------------------------------------------------------------------
 * Autorización de firma (misma lógica que la versión en memoria)
 * ------------------------------------------------------------------- */

function deny(reason: SignDenialReason): SignDecision {
  return { allowed: false, reason };
}

async function can_sign_db(db: Queryable, request: CanSignRequest): Promise<SignDecision> {
  const permitType = find_permit_type(request.permitTypeSlug);
  if (!permitType || !permitType.signerRoles.includes(request.role)) {
    return deny("ROL_NO_EXIGIDO_POR_PERMISO");
  }

  if (request.signer.kind === "EMPLEADO") {
    const { rows } = await db.query<{ activo: boolean }>(
      `SELECT activo FROM empleados WHERE no_empleado = $1`,
      [to_employee_int(request.signer.employeeNumber)],
    );
    const employee = rows[0];
    if (!employee) return deny("ACTOR_NO_ENCONTRADO");
    if (!employee.activo) return deny("ACTOR_INACTIVO");

    const permission = get_required_permission(request.role);
    // El ADMIN_HSEA firma cualquier rol, sin importar permiso ni alcance.
    if (
      permission &&
      !(await is_hsea_admin_db(db, request.signer.employeeNumber)) &&
      !(await has_permission_db(db, request.signer.employeeNumber, permission, request.area))
    ) {
      return deny("SIN_PERMISO_O_ALCANCE");
    }
  } else if (request.signer.kind === "USUARIO_PROVEEDOR") {
    const { rows } = await db.query<{
      proveedor_id: number;
      empleado_proveedor_id: number | null;
      activo: boolean;
    }>(
      `SELECT proveedor_id, empleado_proveedor_id, activo FROM usuarios_proveedor WHERE id = $1`,
      [request.signer.providerUserId],
    );
    const user = rows[0];
    if (!user) return deny("ACTOR_NO_ENCONTRADO");
    if (!user.activo) return deny("ACTOR_INACTIVO");
    if (!providerSignerRoles.includes(request.role)) return deny("SIN_PERMISO_O_ALCANCE");

    const permit = await db.query<{ proveedor_id: number | null }>(
      `SELECT proveedor_id FROM permisos_trabajo WHERE id = $1`,
      [request.permitId],
    );
    if (permit.rows[0]?.proveedor_id !== user.proveedor_id) return deny("SIN_PERMISO_O_ALCANCE");

    if (user.empleado_proveedor_id !== null) {
      const semaphore = await db.query<{ semaforo: string }>(
        `SELECT semaforo FROM v_semaforo_empleado_proveedor WHERE empleado_proveedor_id = $1`,
        [user.empleado_proveedor_id],
      );
      if (semaphore.rows[0]?.semaforo !== "VERDE") return deny("SEMAFORO_NO_VERDE");
    } else if (get_required_permission(request.role) !== null) {
      // Responsable de la tarea: debe ser un colaborador (con semáforo), no una cuenta administrativa.
      return deny("CUENTA_SIN_COLABORADOR");
    }
  } else {
    return deny("ACTOR_NO_ENCONTRADO");
  }

  const existing = await db.query<{
    rol_firma: string;
    firmante_tipo: "EMPLEADO" | "USUARIO_PROVEEDOR";
    no_empleado: number | null;
    usuario_proveedor_id: number | null;
  }>(
    `SELECT rol_firma, firmante_tipo, no_empleado, usuario_proveedor_id
       FROM firmas_permiso WHERE permiso_id = $1`,
    [request.permitId],
  );
  if (existing.rows.some((row) => row.rol_firma === request.role)) return deny("ROL_YA_FIRMADO");
  const requestActorId = get_signer_actor_id(request.signer);
  if (
    existing.rows.some((row) => get_signer_actor_id(map_signer(row)) === requestActorId) &&
    !(request.signer.kind === "EMPLEADO" && (await is_hsea_admin_db(db, request.signer.employeeNumber)))
  ) {
    return deny("PERSONA_YA_FIRMO_OTRO_ROL");
  }
  return { allowed: true };
}

/** Verifica el PIN llevando el conteo de intentos y el bloqueo. Debe correr dentro de una transacción. */
async function check_pin_db(
  db: Queryable,
  signer: SignerIdentity,
  pin: string,
): Promise<"OK" | Extract<SignDenialReason, "PIN_NO_ACTIVADO" | "PIN_BLOQUEADO" | "PIN_INCORRECTO">> {
  const filter = build_signer_filter(signer, 1);
  if (!filter) return "PIN_NO_ACTIVADO";
  const { rows } = await db.query<CredentialRow>(
    `SELECT * FROM credenciales_firma WHERE ${filter.sql} AND estado <> 'REVOCADA' FOR UPDATE`,
    [filter.value],
  );
  const credential = rows[0];
  if (!credential) return "PIN_NO_ACTIVADO";

  const now = new Date();
  let attempts = credential.intentos_fallidos;
  if (credential.estado === "BLOQUEADA") {
    if (credential.bloqueada_hasta && credential.bloqueada_hasta > now) return "PIN_BLOQUEADO";
    attempts = 0;
  }

  if (verify_pin_hash(pin, credential.pin_hash)) {
    if (attempts !== 0 || credential.estado !== "ACTIVA") {
      await db.query(
        `UPDATE credenciales_firma
            SET intentos_fallidos = 0, estado = 'ACTIVA', bloqueada_hasta = NULL
          WHERE id = $1`,
        [credential.id],
      );
    }
    return "OK";
  }

  attempts += 1;
  const locked = attempts >= maxFailedAttempts;
  await db.query(
    `UPDATE credenciales_firma
        SET intentos_fallidos = $2, estado = $3, bloqueada_hasta = $4
      WHERE id = $1`,
    [
      credential.id,
      attempts,
      locked ? "BLOQUEADA" : "ACTIVA",
      locked ? new Date(now.getTime() + lockoutMinutes * 60_000).toISOString() : null,
    ],
  );
  await append_audit_db(db, signer_actor(signer), "verificar_pin_fallido", "credenciales_firma", credential.id, {
    failedAttempts: attempts,
    locked,
  });
  return "PIN_INCORRECTO";
}

/* ---------------------------------------------------------------------
 * Repositorios
 * ------------------------------------------------------------------- */

export function create_organization_repositories_railway(): OrganizationRepositories {
  return {
    employees: {
      async find_by_number(employeeNumber) {
        const number = Number(employeeNumber);
        if (!Number.isSafeInteger(number)) return null;
        const { rows } = await get_db().query<EmployeeRow>(
          `SELECT * FROM empleados WHERE no_empleado = $1`,
          [number],
        );
        return rows[0] ? map_employee(rows[0]) : null;
      },
      async list_by_department(departmentId, options) {
        const params: unknown[] = [departmentId, options?.includeInactive === true];
        let sql = `SELECT * FROM empleados WHERE departamento_id = $1 AND (activo OR $2::boolean)`;
        if (options?.subdepartmentId !== undefined) {
          params.push(options.subdepartmentId);
          sql += ` AND subdepartamento_id IS NOT DISTINCT FROM $3::int`;
        }
        const { rows } = await get_db().query<EmployeeRow>(`${sql} ORDER BY apellido_paterno, primer_nombre`, params);
        return rows.map(map_employee);
      },
      async search(query, options) {
        const terms = normalize_text(query).split(/\s+/).filter(Boolean);
        if (terms.length === 0) return [];
        const params: unknown[] = [options?.includeInactive === true, options?.limit ?? 25];
        const haystack = `translate(lower(no_empleado::text || ' ' || concat_ws(' ', primer_nombre, segundo_nombre, apellido_paterno, apellido_materno, puesto)), 'áéíóúñü', 'aeiounu')`;
        const conditions = terms.map((term) => {
          params.push(`%${term.replace(/[\\%_]/g, "\\$&")}%`);
          return `${haystack} LIKE $${params.length}`;
        });
        const { rows } = await get_db().query<EmployeeRow>(
          `SELECT * FROM empleados
            WHERE (activo OR $1::boolean) AND ${conditions.join(" AND ")}
            ORDER BY apellido_paterno, primer_nombre
            LIMIT $2`,
          params,
        );
        return rows.map(map_employee);
      },
    },

    organization: {
      async list_lines() {
        const { rows } = await get_db().query<LineRow>(`SELECT * FROM lineas_mando ORDER BY id`);
        return rows.map(map_line);
      },
      async list_departments(commandLineId) {
        const { rows } = await get_db().query<DepartmentRow>(
          `SELECT * FROM departamentos WHERE ($1::int IS NULL OR linea_mando_id = $1) ORDER BY id`,
          [commandLineId ?? null],
        );
        return rows.map(map_department);
      },
      async list_subdepartments(departmentId) {
        const { rows } = await get_db().query<SubdepartmentRow>(
          `SELECT * FROM subdepartamentos WHERE ($1::int IS NULL OR departamento_id = $1) ORDER BY id`,
          [departmentId ?? null],
        );
        return rows.map(map_subdepartment);
      },
      async list_area_roles(filter) {
        const params: unknown[] = [];
        const conditions: string[] = [];
        if (filter?.employeeNumber) {
          params.push(to_employee_int(filter.employeeNumber));
          conditions.push(`c.no_empleado = $${params.length}`);
        }
        if (filter?.area) {
          params.push(filter.area.commandLineId, filter.area.departmentId, filter.area.subdepartmentId);
          conditions.push(
            `c.linea_mando_id IS NOT DISTINCT FROM $${params.length - 2}::int
             AND c.departamento_id IS NOT DISTINCT FROM $${params.length - 1}::int
             AND c.subdepartamento_id IS NOT DISTINCT FROM $${params.length}::int`,
          );
        }
        // v_cargos_vigentes ya filtra por vigencia y empleado activo.
        const source = filter?.onlyCurrent ? "v_cargos_vigentes" : "cargos_area";
        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const { rows } = await get_db().query<AreaAssignmentRow>(
          `SELECT c.* FROM ${source} c ${where} ORDER BY c.id`,
          params,
        );
        return rows.map(map_area_assignment);
      },
      async assign_area_role(input, actorEmployeeNumber) {
        try {
          return await with_transaction(async (db) => {
            await require_permission_db(db, actorEmployeeNumber, "organizacion:administrar");
            await require_active_employee_db(db, input.employeeNumber);
            require_one_area_level(input.area);
            if (input.position === "GERENTE" && input.area.commandLineId === null) {
              throw new ValidationError("El gerente se asigna a una línea de mando");
            }
            if (input.position === "ENCARGADO" && input.area.commandLineId !== null) {
              throw new ValidationError("El encargado se asigna a un departamento o subdepartamento");
            }
            const actorNumber = to_employee_int(actorEmployeeNumber);
            const { rows } = await db.query<AreaAssignmentRow>(
              `INSERT INTO cargos_area
                 (no_empleado, cargo, linea_mando_id, departamento_id, subdepartamento_id,
                  vigente_desde, motivo, creado_por, actualizado_por)
               VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, hoy_mx()), $7, $8, $8)
               RETURNING *`,
              [
                to_employee_int(input.employeeNumber),
                input.position,
                input.area.commandLineId,
                input.area.departmentId,
                input.area.subdepartmentId,
                input.validFrom ?? null,
                input.reason?.trim() || null,
                actorNumber,
              ],
            );
            const row = rows[0];
            if (!row) throw new Error("No se pudo crear el cargo de área");
            await append_audit_db(db, employee_actor(actorEmployeeNumber), "crear", "cargos_area", row.id, {
              employeeNumber: input.employeeNumber,
              position: input.position,
              commandLineId: input.area.commandLineId,
              departmentId: input.area.departmentId,
              subdepartmentId: input.area.subdepartmentId,
            });
            return map_area_assignment(row);
          });
        } catch (error) {
          if (get_pg_error(error).code === pgForeignKeyViolation) {
            throw new ValidationError("El área indicada no existe");
          }
          throw error;
        }
      },
      async end_area_role(assignmentId, reason, actorEmployeeNumber) {
        return with_transaction(async (db) => {
          await require_permission_db(db, actorEmployeeNumber, "organizacion:administrar");
          const motive = require_reason(reason);
          const { rows } = await db.query<AreaAssignmentRow>(
            `UPDATE cargos_area
                SET vigente_hasta = GREATEST(vigente_desde, hoy_mx()), motivo = $2,
                    actualizado_en = now(), actualizado_por = $3
              WHERE id = $1 AND (vigente_hasta IS NULL OR vigente_hasta > hoy_mx())
              RETURNING *`,
            [assignmentId, motive, to_employee_int(actorEmployeeNumber)],
          );
          const row = rows[0];
          if (!row) {
            const exists = await db.query(`SELECT 1 FROM cargos_area WHERE id = $1`, [assignmentId]);
            if (exists.rowCount === 0) throw new NotFoundError("Cargo de área", assignmentId);
            throw new ValidationError("El cargo ya está cerrado");
          }
          await append_audit_db(db, employee_actor(actorEmployeeNumber), "actualizar", "cargos_area", row.id, {
            event: "end",
            validUntil: row.vigente_hasta,
            reason: motive,
          });
          return map_area_assignment(row);
        });
      },
      async create_subdepartment(departmentId, name, actorEmployeeNumber) {
        return with_transaction(async (db) => {
          await require_permission_db(db, actorEmployeeNumber, "organizacion:administrar");
          const cleanName = name.trim();
          if (!cleanName) throw new ValidationError("El nombre es obligatorio");
          const department = await db.query(`SELECT 1 FROM departamentos WHERE id = $1`, [departmentId]);
          if (department.rowCount === 0) throw new NotFoundError("Departamento", String(departmentId));
          const duplicated = await db.query(
            `SELECT 1 FROM subdepartamentos WHERE departamento_id = $1 AND lower(nombre) = lower($2)`,
            [departmentId, cleanName],
          );
          if (duplicated.rowCount > 0) {
            throw new ValidationError("Ya existe un subdepartamento con ese nombre");
          }
          const actorNumber = to_employee_int(actorEmployeeNumber);
          const { rows } = await db.query<SubdepartmentRow>(
            `INSERT INTO subdepartamentos (departamento_id, nombre, creado_por, actualizado_por)
             VALUES ($1, $2, $3, $3) RETURNING *`,
            [departmentId, cleanName, actorNumber],
          );
          const row = rows[0];
          if (!row) throw new Error("No se pudo crear el subdepartamento");
          await append_audit_db(db, employee_actor(actorEmployeeNumber), "crear", "subdepartamentos", String(row.id), {
            departmentId,
            name: cleanName,
          });
          return map_subdepartment(row);
        });
      },
    },

    access: {
      async list_roles() {
        const { rows } = await get_db().query<RoleRow>(
          `SELECT r.*, COALESCE(array_agg(rp.permiso_codigo) FILTER (WHERE rp.permiso_codigo IS NOT NULL), '{}') AS permisos
             FROM roles r LEFT JOIN rol_permisos rp ON rp.rol_id = r.id
            GROUP BY r.id ORDER BY r.id`,
        );
        return rows.map(map_role);
      },
      async list_assignments_by_employee(employeeNumber, options) {
        const number = Number(employeeNumber);
        if (!Number.isSafeInteger(number)) return [];
        const sql = options?.onlyCurrent
          ? `SELECT * FROM v_roles_vigentes WHERE no_empleado = $1 ORDER BY id`
          : `${roleAssignmentSelect} WHERE er.no_empleado = $1 ORDER BY er.id`;
        const { rows } = await get_db().query<RoleAssignmentRow>(sql, [number]);
        return rows.map(map_role_assignment);
      },
      async assign_role(input, actorEmployeeNumber) {
        try {
          return await with_transaction(async (db) => {
            await require_permission_db(db, actorEmployeeNumber, "roles:administrar");
            const motive = require_reason(input.reason);
            await require_active_employee_db(db, input.employeeNumber);
            const role = await db.query<{ id: number; codigo: string }>(
              `SELECT id, codigo FROM roles WHERE codigo = $1 AND activo`,
              [input.roleCode],
            );
            const roleRow = role.rows[0];
            if (!roleRow) throw new ValidationError(`El rol ${input.roleCode} no existe o está inactivo`);

            if (input.scope === "GLOBAL") {
              if (get_scope_of_area_ref(input.area) !== "GLOBAL") {
                throw new ValidationError("El alcance GLOBAL no lleva área");
              }
            } else {
              require_one_area_level(input.area);
              if (get_scope_of_area_ref(input.area) !== input.scope) {
                throw new ValidationError("El área no corresponde al alcance indicado");
              }
            }
            if (input.validFrom && input.validUntil && input.validUntil < input.validFrom) {
              throw new ValidationError("La vigencia final no puede ser anterior a la inicial");
            }

            const actorNumber = to_employee_int(actorEmployeeNumber);
            const { rows } = await db.query<Omit<RoleAssignmentRow, "rol_codigo">>(
              `INSERT INTO empleado_roles
                 (no_empleado, rol_id, alcance, linea_mando_id, departamento_id, subdepartamento_id,
                  vigente_desde, vigente_hasta, otorgado_por, motivo, creado_por, actualizado_por)
               VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::date, hoy_mx()), $8::date, $9, $10, $9, $9)
               RETURNING *`,
              [
                to_employee_int(input.employeeNumber),
                roleRow.id,
                input.scope,
                input.area.commandLineId,
                input.area.departmentId,
                input.area.subdepartmentId,
                input.validFrom ?? null,
                input.validUntil ?? null,
                actorNumber,
                motive,
              ],
            );
            const row = rows[0];
            if (!row) throw new Error("No se pudo asignar el rol");
            await append_audit_db(db, employee_actor(actorEmployeeNumber), "asignar_rol", "empleado_roles", row.id, {
              employeeNumber: input.employeeNumber,
              roleCode: roleRow.codigo,
              scope: input.scope,
              commandLineId: input.area.commandLineId,
              departmentId: input.area.departmentId,
              subdepartmentId: input.area.subdepartmentId,
              reason: motive,
            });
            return map_role_assignment({ ...row, rol_codigo: roleRow.codigo });
          });
        } catch (error) {
          if (get_pg_error(error).code === pgForeignKeyViolation) {
            throw new ValidationError("El área indicada no existe");
          }
          throw error;
        }
      },
      async revoke_role(assignmentId, reason, actorEmployeeNumber) {
        return with_transaction(async (db) => {
          await require_permission_db(db, actorEmployeeNumber, "roles:administrar");
          const motive = require_reason(reason);
          const actorNumber = to_employee_int(actorEmployeeNumber);

          // Nunca se queda el sistema sin quien administre roles. Se bloquean las asignaciones del rol para que
          // dos revocaciones simultáneas no dejen a nadie.
          const target = await db.query<{ rol_codigo: string }>(
            `SELECT rol_codigo FROM v_roles_vigentes WHERE id = $1`,
            [assignmentId],
          );
          if (target.rows[0]?.rol_codigo === adminRoleCode) {
            await db.query(
              `SELECT er.id FROM empleado_roles er JOIN roles r ON r.id = er.rol_id
                WHERE r.codigo = $1 AND er.revocado_en IS NULL FOR UPDATE OF er`,
              [adminRoleCode],
            );
            const others = await db.query<{ total: string }>(
              `SELECT count(*) AS total FROM v_roles_vigentes WHERE rol_codigo = $1 AND id <> $2`,
              [adminRoleCode, assignmentId],
            );
            if (Number(others.rows[0]?.total ?? 0) === 0) throw new ValidationError(lastAdminMessage);
          }

          const { rows } = await db.query<RoleAssignmentRow>(
            `WITH u AS (
               UPDATE empleado_roles
                  SET revocado_en = now(), revocado_por = $2, actualizado_en = now(), actualizado_por = $2
                WHERE id = $1 AND revocado_en IS NULL
                RETURNING *)
             SELECT u.*, r.codigo AS rol_codigo FROM u JOIN roles r ON r.id = u.rol_id`,
            [assignmentId, actorNumber],
          );
          const row = rows[0];
          if (!row) {
            const exists = await db.query(`SELECT 1 FROM empleado_roles WHERE id = $1`, [assignmentId]);
            if (exists.rowCount === 0) throw new NotFoundError("Asignación de rol", assignmentId);
            throw new ValidationError("La asignación ya fue revocada");
          }
          await append_audit_db(db, employee_actor(actorEmployeeNumber), "revocar_rol", "empleado_roles", row.id, {
            employeeNumber: String(row.no_empleado),
            roleCode: row.rol_codigo,
            reason: motive,
          });
          return map_role_assignment(row);
        });
      },
      async has_permission(employeeNumber, permission, area) {
        return has_permission_db(get_db(), employeeNumber, permission, area);
      },
      async can_sign(request) {
        return can_sign_db(get_db(), request);
      },
      async list_eligible_signers(role, area) {
        const permission = get_required_permission(role);
        if (!permission) return null;
        const { rows } = await get_db().query<EmployeeRow>(
          `SELECT e.* FROM empleados e
            WHERE e.activo AND tiene_permiso(e.no_empleado, $1::text, $2::int, $3::int)
            ORDER BY e.apellido_paterno, e.primer_nombre`,
          [permission, area.departmentId, area.subdepartmentId],
        );
        return rows.map(map_employee);
      },
    },

    credentials: {
      async get_credential(signer) {
        const filter = build_signer_filter(signer, 1);
        if (!filter) return null;
        const { rows } = await get_db().query<CredentialRow>(
          `SELECT * FROM credenciales_firma WHERE ${filter.sql} AND estado <> 'REVOCADA'`,
          [filter.value],
        );
        return rows[0] ? map_credential(rows[0]) : null;
      },
      async activate_pin(signer, pin, adminEmployeeNumber) {
        return with_transaction(async (db) => {
          await require_permission_db(db, adminEmployeeNumber, "roles:administrar");
          if (!is_valid_pin_format(pin)) throw new ValidationError("El PIN no tiene el formato válido");
          if (signer.kind === "EMPLEADO") {
            await require_active_employee_db(db, signer.employeeNumber);
          } else if (signer.kind === "USUARIO_PROVEEDOR") {
            const user = await db.query<{ activo: boolean }>(
              `SELECT activo FROM usuarios_proveedor WHERE id = $1`,
              [signer.providerUserId],
            );
            if (!user.rows[0]?.activo) {
              throw new ValidationError("La cuenta de proveedor no existe o está inactiva");
            }
          } else {
            throw new ValidationError("El sistema no firma");
          }

          const filter = build_signer_filter(signer, 2);
          if (!filter) throw new ValidationError("Firmante inválido");
          const revoked = await db.query(
            `UPDATE credenciales_firma
                SET estado = 'REVOCADA', revocada_en = now(), revocada_por = $1
              WHERE ${filter.sql} AND estado <> 'REVOCADA'`,
            [adminEmployeeNumber, filter.value],
          );
          const { rows } = await db.query<CredentialRow>(
            `INSERT INTO credenciales_firma
               (firmante_tipo, no_empleado, usuario_proveedor_id, pin_hash, activada_por)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [
              signer.kind,
              signer.kind === "EMPLEADO" ? to_employee_int(signer.employeeNumber) : null,
              signer.kind === "USUARIO_PROVEEDOR" ? signer.providerUserId : null,
              hash_pin(pin),
              to_employee_int(adminEmployeeNumber),
            ],
          );
          const row = rows[0];
          if (!row) throw new Error("No se pudo activar el PIN");
          await append_audit_db(db, employee_actor(adminEmployeeNumber), "establecer_pin", "credenciales_firma", row.id, {
            signer: get_signer_actor_id(signer),
            replacedPrevious: revoked.rowCount > 0,
          });
          return map_credential(row);
        });
      },
      async verify_pin(signer, pin) {
        // Si el PIN falla, el conteo de intentos se confirma (no se lanza excepción).
        return with_transaction((db) => check_pin_db(db, signer, pin));
      },
      async revoke_pin(signer, reason, adminEmployeeNumber) {
        await with_transaction(async (db) => {
          await require_permission_db(db, adminEmployeeNumber, "roles:administrar");
          const motive = require_reason(reason);
          const filter = build_signer_filter(signer, 2);
          if (!filter) throw new ValidationError("Firmante inválido");
          const { rows } = await db.query<{ id: string }>(
            `UPDATE credenciales_firma
                SET estado = 'REVOCADA', revocada_en = now(), revocada_por = $1
              WHERE ${filter.sql} AND estado <> 'REVOCADA'
              RETURNING id`,
            [adminEmployeeNumber, filter.value],
          );
          const row = rows[0];
          if (!row) throw new NotFoundError("PIN de firma", get_signer_actor_id(signer));
          await append_audit_db(db, employee_actor(adminEmployeeNumber), "revocar_pin", "credenciales_firma", row.id, {
            signer: get_signer_actor_id(signer),
            reason: motive,
          });
        });
      },
    },

    signatures: {
      async sign_permit(input) {
        try {
          return await with_transaction(async (db) => {
            const decision = await can_sign_db(db, input);
            if (!decision.allowed) return { ok: false as const, reason: decision.reason };

            // Si el PIN falla, el conteo de intentos se confirma (no se lanza excepción).
            if (requireSigningPin) {
              const pinResult = await check_pin_db(db, input.signer, input.pin);
              if (pinResult !== "OK") return { ok: false as const, reason: pinResult };
            }

            // can_sign_db ya garantizó que el firmante existe y está activo.
            let signerName = "";
            let signerJobTitle = "";
            let roleAssignmentId: string | null = null;
            let areaAssignmentId: string | null = null;
            if (input.signer.kind === "EMPLEADO") {
              const number = to_employee_int(input.signer.employeeNumber);
              const employee = await db.query<EmployeeRow>(
                `SELECT * FROM empleados WHERE no_empleado = $1`,
                [number],
              );
              const employeeRow = employee.rows[0];
              if (!employeeRow) return { ok: false as const, reason: "ACTOR_NO_ENCONTRADO" as const };
              signerName = [
                employeeRow.primer_nombre,
                employeeRow.segundo_nombre,
                employeeRow.apellido_paterno,
                employeeRow.apellido_materno,
              ]
                .filter((part): part is string => Boolean(part))
                .join(" ");
              signerJobTitle = employeeRow.puesto;

              const permission = get_required_permission(input.role);
              if (permission) {
                const role = await db.query<{ empleado_rol_id: string }>(
                  `SELECT pe.empleado_rol_id
                     FROM v_permisos_empleado pe
                     JOIN departamentos d ON d.id = $3::int
                    WHERE pe.no_empleado = $1 AND pe.permiso_codigo = $2
                      AND (pe.alcance = 'GLOBAL'
                        OR (pe.alcance = 'LINEA_MANDO'     AND pe.linea_mando_id = d.linea_mando_id)
                        OR (pe.alcance = 'DEPARTAMENTO'    AND pe.departamento_id = $3::int)
                        OR (pe.alcance = 'SUBDEPARTAMENTO' AND pe.subdepartamento_id = $4::int))
                    LIMIT 1`,
                  [number, permission, input.area.departmentId, input.area.subdepartmentId],
                );
                roleAssignmentId = role.rows[0]?.empleado_rol_id ?? null;
              }
              const post = await db.query<{ id: string }>(
                `SELECT c.id
                   FROM v_cargos_vigentes c
                   JOIN departamentos d ON d.id = $2::int
                  WHERE c.no_empleado = $1
                    AND (c.linea_mando_id = d.linea_mando_id
                      OR c.departamento_id = $2::int
                      OR c.subdepartamento_id = $3::int)
                  LIMIT 1`,
                [number, input.area.departmentId, input.area.subdepartmentId],
              );
              areaAssignmentId = post.rows[0]?.id ?? null;
            } else if (input.signer.kind === "USUARIO_PROVEEDOR") {
              const user = await db.query<{ nombre: string; puesto: string | null }>(
                `SELECT up.nombre, ep.puesto
                   FROM usuarios_proveedor up
                   LEFT JOIN empleados_proveedor ep ON ep.id = up.empleado_proveedor_id
                  WHERE up.id = $1`,
                [input.signer.providerUserId],
              );
              const userRow = user.rows[0];
              if (!userRow) return { ok: false as const, reason: "ACTOR_NO_ENCONTRADO" as const };
              signerName = userRow.nombre;
              signerJobTitle = userRow.puesto ?? "Representante del proveedor";
            } else {
              return { ok: false as const, reason: "ACTOR_NO_ENCONTRADO" as const };
            }

            const credential = build_signer_filter(input.signer, 1);
            const credentialRow = credential
              ? await db.query<{ id: string }>(
                  `SELECT id FROM credenciales_firma WHERE ${credential.sql} AND estado <> 'REVOCADA'`,
                  [credential.value],
                )
              : null;
            // Sin PIN exigido la firma no lleva credencial; con PIN, queda ligada a la verificada.
            const credentialId = credentialRow?.rows[0]?.id ?? null;
            if (requireSigningPin && !credentialId) return { ok: false as const, reason: "PIN_NO_ACTIVADO" as const };

            const commandLine = await db.query<{ linea_mando_id: number }>(
              `SELECT linea_mando_id FROM departamentos WHERE id = $1`,
              [input.area.departmentId],
            );
            const { rows } = await db.query<SignatureRow>(
              `INSERT INTO firmas_permiso
                 (permiso_id, rol_firma, firmante_tipo, no_empleado, usuario_proveedor_id,
                  linea_mando_id, departamento_id, subdepartamento_id, empleado_rol_id, cargo_area_id,
                  credencial_firma_id, nombre_firmante, puesto_firmante, hash_documento, imagen_firma)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
               RETURNING *`,
              [
                input.permitId,
                input.role,
                input.signer.kind,
                input.signer.kind === "EMPLEADO" ? to_employee_int(input.signer.employeeNumber) : null,
                input.signer.kind === "USUARIO_PROVEEDOR" ? input.signer.providerUserId : null,
                commandLine.rows[0]?.linea_mando_id ?? null,
                input.area.departmentId,
                input.area.subdepartmentId,
                roleAssignmentId,
                areaAssignmentId,
                credentialId,
                signerName,
                signerJobTitle,
                input.documentHash,
                input.image,
              ],
            );
            const row = rows[0];
            if (!row) throw new Error("No se pudo registrar la firma");
            await append_audit_db(db, signer_actor(input.signer), "firmar", "permisos_trabajo", input.permitId, {
              role: input.role,
              signatureId: row.id,
              departmentId: input.area.departmentId,
              subdepartmentId: input.area.subdepartmentId,
            });
            return { ok: true as const, signature: map_signature(row) };
          });
        } catch (error) {
          const { code, constraint } = get_pg_error(error);
          // Carrera entre dos firmas simultáneas: las restricciones únicas son la última defensa.
          if (code === pgUniqueViolation) {
            const reason: SignDenialReason =
              constraint === "firmas_permiso_permiso_id_rol_firma_key"
                ? "ROL_YA_FIRMADO"
                : "PERSONA_YA_FIRMO_OTRO_ROL";
            return { ok: false, reason };
          }
          if (code === pgForeignKeyViolation) throw new NotFoundError("Permiso", input.permitId);
          throw error;
        }
      },
      async list_by_permit(permitId) {
        const { rows } = await get_db().query<SignatureRow>(
          `SELECT * FROM firmas_permiso WHERE permiso_id = $1 ORDER BY id`,
          [permitId],
        );
        return rows.map(map_signature);
      },
    },
  };
}
