import type {
  AddParticipantInput,
  ContractorDocument,
  CreateProviderUserInput,
  CreatedProviderUser,
  DocumentReview,
  DocumentSubject,
  DocumentVersion,
  EmployeePhoto,
  EntryRecord,
  ImportEmployeesResult,
  NewEmployeePhotoInput,
  NewEquipmentInput,
  NewProviderEmployeeInput,
  PendingReview,
  PermitParticipant,
  Provider,
  ProviderEmployee,
  ProviderEquipment,
  ProviderLoginResult,
  ProviderStatus,
  ProviderUser,
  RegisterEntryInput,
  RegisterProviderInput,
  RequirementState,
  ReviewVersionInput,
  SubjectSemaphore,
  UploadVersionInput,
  VersionContext,
} from "@/domain/contratistas";
import type { WorkTypeCode } from "@/config/documentos_contratista";
import type { ContractorTypeCode } from "@/config/tipos_contratista";
import type { PermissionCode } from "@/config/permisos";
import type {
  ActorIdentity,
  AssignRoleInput,
  CanSignRequest,
  PinCheckResult,
  Role,
  RoleAssignment,
  SignDecision,
  SignatureRecord,
  SignerIdentity,
  SignPermitInput,
  SignResult,
  SigningCredential,
} from "@/domain/acceso";
import type {
  AreaAssignment,
  AreaRef,
  AssignAreaRoleInput,
  CommandLine,
  Department,
  Employee,
  PermitArea,
  Subdepartment,
} from "@/domain/organizacion";
import type { SignerRole } from "@/domain/permisos";
import type { AuditEvent } from "@/domain/auditoria";
import type { ServerLogEntry, ServerLogLevel } from "@/domain/registro_servidor";
import type { WorkPermit } from "@/domain/permisos";

/**
 * Contratos de acceso a datos. Las implementaciones (Firebase o Railway)
 * se eligen con DATA_PROVIDER; el resto de la app solo conoce estas interfaces.
 */
export interface AuditRepository {
  append_event(event: Omit<AuditEvent, "id">): Promise<AuditEvent>;
  list_events_by_entity(
    entityType: string,
    entityId: string,
  ): Promise<AuditEvent[]>;
  /** Consulta para la pantalla de auditoría: los más recientes primero. Las fechas son de Ciudad de México. */
  search_events(filter: AuditSearchFilter): Promise<AuditEvent[]>;
}

export interface AuditSearchFilter {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  /** YYYY-MM-DD, inclusive. */
  to?: string;
  /** Máximo de eventos devueltos. */
  limit: number;
}

export interface ServerLogFilter {
  level?: ServerLogLevel;
  source?: string;
  /** YYYY-MM-DD, inclusive (Ciudad de México). */
  from?: string;
  /** YYYY-MM-DD, inclusive (Ciudad de México). */
  to?: string;
  limit: number;
}

/** Registro técnico del servidor (aparte de la auditoría). Solo se agrega; los más recientes primero al consultar. */
export interface ServerLogRepository {
  append_entry(entry: Omit<ServerLogEntry, "id">): Promise<ServerLogEntry>;
  search_entries(filter: ServerLogFilter): Promise<ServerLogEntry[]>;
  /** Cuántas entradas de ese nivel hay desde la fecha ISO dada (para la alerta). */
  count_since(level: ServerLogLevel, sinceIso: string): Promise<number>;
}

export interface WorkPermitRepository {
  list_by_type(permitTypeSlug: string): Promise<WorkPermit[]>;
  get_by_id(id: string): Promise<WorkPermit | null>;
  save(permit: WorkPermit): Promise<WorkPermit>;
}

/**
 * Contratistas. Reglas de autorización (AccessDeniedError si no se cumplen):
 *  - Usuario de proveedor: solo opera sobre su propio proveedor (y solo un administrador
 *    del proveedor gestiona usuarios). Un proveedor SUSPENDIDO queda bloqueado.
 *  - Empleado TFS: `contratistas:gestionar` para administrar proveedores y su personal.
 * `actor` es quien opera: SignerIdentity sirve para ambos tipos.
 */
export interface ProviderRepository {
  /** Autorregistro: queda PENDIENTE_VALIDACION; el actor de auditoría es SISTEMA/AUTOREGISTRO. */
  register_provider(input: RegisterProviderInput): Promise<Provider>;
  list_providers(filter?: { status?: ProviderStatus }): Promise<Provider[]>;
  get_provider(id: number): Promise<Provider | null>;
  /** Aprueba, suspende o reactiva (exige `contratistas:gestionar`; el motivo es obligatorio al suspender). */
  set_provider_status(
    providerId: number,
    status: Exclude<ProviderStatus, "PENDIENTE_VALIDACION">,
    reason: string | null,
    actorEmployeeNumber: string,
  ): Promise<Provider>;
  set_contractor_types(
    providerId: number,
    types: ContractorTypeCode[],
    actor: ActorIdentity,
  ): Promise<Provider>;
}

/** Cuentas de acceso de proveedores (usuario de 8 caracteres + contraseña con hash). */
export interface ProviderUserRepository {
  /** Lectura sin autorización: la usa la sesión para validar a quien ya inició sesión. */
  get_user(userId: number): Promise<ProviderUser | null>;
  list_users(providerId: number, actor: ActorIdentity): Promise<ProviderUser[]>;
  /** Genera el usuario y una contraseña temporal que se muestra una sola vez. */
  create_user(input: CreateProviderUserInput, actor: ActorIdentity): Promise<CreatedProviderUser>;
  login(username: string, password: string): Promise<ProviderLoginResult>;
  change_password(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void>;
  /**
   * Colaboradores cuyas cuentas ligadas están todas inactivas (cuenta eliminada); se ocultan del listado de
   * personal. Los que nunca tuvieron cuenta no aparecen aquí. Sin autorización: solo ids.
   */
  list_employee_ids_with_inactive_account(providerId: number): Promise<number[]>;
  /** Restablece con una contraseña temporal nueva y desbloquea la cuenta. */
  reset_password(userId: number, actor: ActorIdentity): Promise<string>;
  set_user_active(
    userId: number,
    active: boolean,
    reason: string,
    actor: ActorIdentity,
  ): Promise<ProviderUser>;
  /** Liga la cuenta a un colaborador activo del mismo proveedor (o la deja administrativa con null). */
  set_user_employee(
    userId: number,
    providerEmployeeId: number | null,
    reason: string,
    actor: ActorIdentity,
  ): Promise<ProviderUser>;
}

/** Personal de proveedores. El semáforo se calcula con sus documentos; no se guarda. */
export interface ProviderEmployeeRepository {
  list_employees(
    providerId: number,
    options?: { includeInactive?: boolean },
  ): Promise<ProviderEmployee[]>;
  get_employee(employeeId: number): Promise<ProviderEmployee | null>;
  add_employee(
    providerId: number,
    input: NewProviderEmployeeInput,
    actor: ActorIdentity,
  ): Promise<ProviderEmployee>;
  /** Carga masiva de la lista de colaboradores: valida cada renglón y reporta los rechazados. */
  import_employees(
    providerId: number,
    rows: NewProviderEmployeeInput[],
    actor: ActorIdentity,
  ): Promise<ImportEmployeesResult>;
  deactivate_employee(
    employeeId: number,
    reason: string,
    actor: ActorIdentity,
  ): Promise<ProviderEmployee>;
  /** Fija los trabajos específicos que realizará (cada uno exige su DC-3). */
  set_work_types(
    employeeId: number,
    workTypes: WorkTypeCode[],
    actor: ActorIdentity,
  ): Promise<ProviderEmployee>;
  /** null si el colaborador no existe o está inactivo. */
  get_semaphore(employeeId: number): Promise<SubjectSemaphore | null>;
  list_semaphores(providerId: number): Promise<SubjectSemaphore[]>;
  /** Registra una fotografía nueva (la anterior se conserva en el historial). Exige pertenecer al proveedor o `contratistas:gestionar`. */
  add_photo(employeeId: number, input: NewEmployeePhotoInput, actor: ActorIdentity): Promise<EmployeePhoto>;
  /** La fotografía vigente (la más reciente; null si no hay o su archivo fue eliminado), sin autorización; quien llama debe validarla. */
  get_current_photo(employeeId: number): Promise<EmployeePhoto | null>;
  /** Marca como eliminado el archivo de la foto vigente; el borrado físico lo hace quien llama. Exige motivo. */
  delete_current_photo(employeeId: number, reason: string, actor: ActorIdentity): Promise<EmployeePhoto>;
}

/** Equipos de proveedores (grúas, etc.): exigen certificación vigente. */
export interface EquipmentRepository {
  list_equipment(
    providerId: number,
    options?: { includeInactive?: boolean },
  ): Promise<ProviderEquipment[]>;
  add_equipment(
    providerId: number,
    input: NewEquipmentInput,
    actor: ActorIdentity,
  ): Promise<ProviderEquipment>;
  deactivate_equipment(
    equipmentId: number,
    reason: string,
    actor: ActorIdentity,
  ): Promise<ProviderEquipment>;
  get_semaphore(equipmentId: number): Promise<SubjectSemaphore | null>;
}

/**
 * Documentos con versiones inmutables y revisión. Subir exige pertenecer al proveedor
 * (o `contratistas:gestionar`); revisar exige el permiso del tipo de documento
 * (el médico requiere `contratistas:validar_medico`).
 */
export interface ContractorDocumentRepository {
  /** Requisitos del sujeto con su estado (los obligatorios + el DC-3 de los trabajos declarados). */
  list_requirements(subject: DocumentSubject): Promise<RequirementState[]>;
  list_versions(documentId: string): Promise<DocumentVersion[]>;
  /** Versión con su expediente y proveedor; sin autorización (quien llama debe validarla). */
  get_version(versionId: string): Promise<VersionContext | null>;
  list_documents(subject: DocumentSubject): Promise<ContractorDocument[]>;
  list_reviews(documentId: string): Promise<DocumentReview[]>;
  upload_version(
    input: UploadVersionInput,
    actor: ActorIdentity,
  ): Promise<{ document: ContractorDocument; version: DocumentVersion }>;
  review_version(
    input: ReviewVersionInput,
    actorEmployeeNumber: string,
  ): Promise<DocumentReview>;
  /** Versiones sin revisar que el revisor puede atender según sus permisos. */
  list_pending_reviews(reviewerEmployeeNumber: string): Promise<PendingReview[]>;
  /**
   * Revoca la aprobación de la versión más reciente (error humano). Exige `contratistas:gestionar` y un
   * motivo. La revisión original se conserva; el documento pasa a REVOCADO (semáforo ROJO) y el proveedor
   * debe subir una versión nueva, que vuelve a pasar por revisión.
   */
  revoke_review(versionId: string, reason: string, actorEmployeeNumber: string): Promise<DocumentReview>;
  /**
   * Eliminación manual del archivo de una versión (ya no hay purga automática). Exige ser administrador
   * del proveedor dueño o `contratistas:gestionar` y un motivo. Conserva el registro, el hash y la revisión;
   * el borrado físico lo hace quien llama después de que esto resuelva.
   */
  delete_version_file(versionId: string, reason: string, actor: ActorIdentity): Promise<DocumentVersion>;
}

/** Bitácora de ingresos a planta con verificación de EPP. Exige `contratistas:registrar_ingresos`. */
export interface EntryLogRepository {
  /** Resultado automático: PERMITIDO solo con semáforo VERDE y EPP completo; si no, DENEGADO con motivo. */
  register_entry(
    input: RegisterEntryInput,
    actorEmployeeNumber: string,
  ): Promise<EntryRecord>;
  /**
   * Cierra el ingreso. Quien llama valida antes el QR del colaborador; con `manualReason` la salida se hizo sin QR
   * (respaldo) y el motivo queda en el evento de auditoría, porque la bitácora solo admite completar la salida.
   */
  register_exit(entryId: string, actorEmployeeNumber: string, options?: { manualReason?: string }): Promise<EntryRecord>;
  list_by_employee(
    providerEmployeeId: number,
    options?: { limit?: number },
  ): Promise<EntryRecord[]>;
  /** Quienes están dentro de la planta (ingreso permitido sin salida). */
  list_open_entries(providerId?: number): Promise<EntryRecord[]>;
  /**
   * Historial de entradas y salidas (incluye los intentos denegados), del más reciente al más antiguo.
   * `from` y `to` son fechas YYYY-MM-DD (hora de Ciudad de México), ambas inclusivas. Sin autorización:
   * quien llama debe validar el permiso.
   */
  list_history(options?: { providerId?: number; from?: string; to?: string; limit?: number }): Promise<EntryRecord[]>;
}

/** Participantes de un permiso: empleados TFS o colaboradores de proveedor (en VERDE). */
export interface PermitParticipantRepository {
  add_participant(input: AddParticipantInput, actor: ActorIdentity): Promise<PermitParticipant>;
  remove_participant(participantId: string, actor: ActorIdentity): Promise<PermitParticipant>;
  list_by_permit(
    permitId: string,
    options?: { includeRemoved?: boolean },
  ): Promise<PermitParticipant[]>;
}

/**
 * Empleados TFS (solo lectura por ahora; el alta/baja llega por importación de RH).
 * Por omisión no se incluyen inactivos.
 */
export interface EmployeeRepository {
  find_by_number(employeeNumber: string): Promise<Employee | null>;
  list_by_department(
    departmentId: number,
    options?: { subdepartmentId?: number | null; includeInactive?: boolean },
  ): Promise<Employee[]>;
  /** Busca por nombre, número de empleado o puesto (sin acentos ni mayúsculas). */
  search(
    query: string,
    options?: { limit?: number; includeInactive?: boolean },
  ): Promise<Employee[]>;
}

/**
 * Estructura organizacional y cargos de área (gerentes / encargados).
 * Las mutaciones exigen `organizacion:administrar`, lanzan AccessDeniedError
 * sin él, y registran el evento de auditoría.
 */
export interface OrganizationRepository {
  list_lines(): Promise<CommandLine[]>;
  list_departments(commandLineId?: number): Promise<Department[]>;
  list_subdepartments(departmentId?: number): Promise<Subdepartment[]>;
  list_area_roles(filter?: {
    area?: AreaRef;
    employeeNumber?: string;
    onlyCurrent?: boolean;
  }): Promise<AreaAssignment[]>;
  assign_area_role(
    input: AssignAreaRoleInput,
    actorEmployeeNumber: string,
  ): Promise<AreaAssignment>;
  /** Cierra la vigencia del cargo (no se borra). */
  end_area_role(
    assignmentId: string,
    reason: string,
    actorEmployeeNumber: string,
  ): Promise<AreaAssignment>;
  create_subdepartment(
    departmentId: number,
    name: string,
    actorEmployeeNumber: string,
  ): Promise<Subdepartment>;
}

/**
 * Roles, asignaciones y autorización. Asignar y revocar exige `roles:administrar`.
 * `area` omitida en has_permission = el permiso en cualquier alcance.
 */
export interface AccessRepository {
  list_roles(): Promise<Role[]>;
  list_assignments_by_employee(
    employeeNumber: string,
    options?: { onlyCurrent?: boolean },
  ): Promise<RoleAssignment[]>;
  assign_role(input: AssignRoleInput, actorEmployeeNumber: string): Promise<RoleAssignment>;
  revoke_role(
    assignmentId: string,
    reason: string,
    actorEmployeeNumber: string,
  ): Promise<RoleAssignment>;
  has_permission(
    employeeNumber: string,
    permission: PermissionCode,
    area?: PermitArea,
  ): Promise<boolean>;
  /** Autorización de firma sin PIN: actor activo, permiso y alcance, rol exigido y segregación. */
  can_sign(request: CanSignRequest): Promise<SignDecision>;
  /** Empleados autorizados a firmar el rol en el área; null si el rol no exige permiso. */
  list_eligible_signers(role: SignerRole, area: PermitArea): Promise<Employee[] | null>;
}

/** PIN de firma. Solo un administrador (`roles:administrar`) lo activa, reinicia o revoca. */
export interface SigningCredentialRepository {
  get_credential(signer: SignerIdentity): Promise<SigningCredential | null>;
  /** Activa el PIN; si ya había uno, lo revoca y conserva el historial. */
  activate_pin(
    signer: SignerIdentity,
    pin: string,
    adminEmployeeNumber: string,
  ): Promise<SigningCredential>;
  revoke_pin(
    signer: SignerIdentity,
    reason: string,
    adminEmployeeNumber: string,
  ): Promise<void>;
  /**
   * Verifica el PIN llevando el conteo de intentos y el bloqueo. Sirve para los pasos de un formato que no
   * son un rol de firma (verificaciones, revalidaciones, participantes).
   */
  verify_pin(signer: SignerIdentity, pin: string): Promise<PinCheckResult>;
}

/** Firmas inmutables. sign_permit autoriza, verifica el PIN, guarda y audita en una operación. */
export interface SignatureRepository {
  sign_permit(input: SignPermitInput): Promise<SignResult>;
  list_by_permit(permitId: string): Promise<SignatureRecord[]>;
}

export interface DataRepositories {
  audit: AuditRepository;
  serverLog: ServerLogRepository;
  employees: EmployeeRepository;
  organization: OrganizationRepository;
  access: AccessRepository;
  credentials: SigningCredentialRepository;
  signatures: SignatureRepository;
  permits: WorkPermitRepository;
  providers: ProviderRepository;
  providerUsers: ProviderUserRepository;
  providerEmployees: ProviderEmployeeRepository;
  equipment: EquipmentRepository;
  documents: ContractorDocumentRepository;
  entries: EntryLogRepository;
  participants: PermitParticipantRepository;
}
