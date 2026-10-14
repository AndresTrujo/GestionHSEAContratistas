import {
  defaultRolePermissions,
  firstAdminEmployeeNumber,
  systemRoleCodes,
  systemRoleNames,
} from "@/config/permisos";
import type {
  Role,
  RoleAssignment,
  SignatureRecord,
  SigningCredential,
} from "@/domain/acceso";
import type { AuditMetadata } from "@/domain/auditoria";
import type {
  AreaAssignment,
  AreaPosition,
  CommandLine,
  Department,
  Employee,
  Gender,
  Subdepartment,
} from "@/domain/organizacion";
import { get_today_mx } from "../identidad";
import seedData from "./seed_organizacion.json";

/** Forma del archivo seed_organizacion.json (extraído de Capacitacion_Master_v5.xlsx). */
export interface SeedFile {
  lineas_mando: { id: number; nombre: string }[];
  departamentos: { id: number; linea_mando_id: number; nombre: string }[];
  subdepartamentos: { id: number; departamento_id: number; nombre: string }[];
  empleados: {
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
  }[];
  cargos_area: {
    no_empleado: number;
    cargo: AreaPosition;
    linea_mando_id?: number | null;
    departamento_id?: number | null;
    subdepartamento_id?: number | null;
    vigente_desde: string;
    vigente_hasta: string | null;
    motivo: string | null;
  }[];
}

/** Credencial con su hash; el hash nunca sale de la capa de datos. */
export interface StoredCredential extends SigningCredential {
  pinHash: string;
}

export interface OrganizationStore {
  lines: CommandLine[];
  departments: Department[];
  subdepartments: Subdepartment[];
  employees: Employee[];
  areaAssignments: AreaAssignment[];
  roles: Role[];
  roleAssignments: RoleAssignment[];
  credentials: StoredCredential[];
  signatures: SignatureRecord[];
  nextId: {
    subdepartment: number;
    areaAssignment: number;
    roleAssignment: number;
    credential: number;
    signature: number;
  };
}

const seedAudit: AuditMetadata = {
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "seed",
  updatedAt: "2026-01-01T00:00:00.000Z",
  updatedBy: "seed",
};

/**
 * Carga la organización real del seed, los roles de sistema y, como arranque,
 * la asignación de ADMIN_HSEA al primer administrador (sin ella nadie podría
 * asignar roles). Las sugerencias de roles del seed NO se cargan solas.
 */
export function create_organization_store(): OrganizationStore {
  const seed = seedData as unknown as SeedFile;

  const roles: Role[] = systemRoleCodes.map((code, index) => ({
    id: index + 1,
    code,
    name: systemRoleNames[code],
    description: null,
    isSystem: true,
    active: true,
    permissions: [...defaultRolePermissions[code]],
    ...seedAudit,
  }));

  // Solo empleados activos: los dados de baja se conservan en la BD real (trazabilidad),
  // pero el modo memoria no los necesita ni expone sus datos personales.
  const activeRows = seed.empleados.filter((row) => row.activo);
  const activeNumbers = new Set(activeRows.map((row) => row.no_empleado));

  const employees: Employee[] = activeRows.map((row) => ({
    employeeNumber: String(row.no_empleado),
    firstName: row.primer_nombre,
    middleName: row.segundo_nombre ?? null,
    paternalSurname: row.apellido_paterno,
    maternalSurname: row.apellido_materno ?? null,
    gender: row.genero ?? null,
    hireDate: row.fecha_ingreso,
    terminationDate: row.fecha_baja ?? null,
    active: row.activo,
    jobTitle: row.puesto,
    commandLineId: row.linea_mando_id,
    departmentId: row.departamento_id,
    subdepartmentId: row.subdepartamento_id ?? null,
    // Si el jefe está dado de baja no se carga, así que no se referencia.
    directManagerEmployeeNumber:
      row.jefe_no_empleado !== null &&
      row.jefe_no_empleado !== undefined &&
      activeNumbers.has(row.jefe_no_empleado)
        ? String(row.jefe_no_empleado)
        : null,
    ...seedAudit,
  }));

  const areaAssignments: AreaAssignment[] = seed.cargos_area
    .filter((row) => activeNumbers.has(row.no_empleado))
    .map((row, index) => ({
      id: String(index + 1),
      employeeNumber: String(row.no_empleado),
      position: row.cargo,
      commandLineId: row.linea_mando_id ?? null,
      departmentId: row.departamento_id ?? null,
      subdepartmentId: row.subdepartamento_id ?? null,
      validFrom: row.vigente_desde,
      validUntil: row.vigente_hasta ?? null,
      reason: row.motivo ?? null,
      ...seedAudit,
    }));

  const roleAssignments: RoleAssignment[] = [];
  const adminRole = roles.find((role) => role.code === "ADMIN_HSEA");
  if (adminRole && employees.some((e) => e.employeeNumber === firstAdminEmployeeNumber)) {
    roleAssignments.push({
      id: "1",
      employeeNumber: firstAdminEmployeeNumber,
      roleId: adminRole.id,
      roleCode: adminRole.code,
      scope: "GLOBAL",
      commandLineId: null,
      departmentId: null,
      subdepartmentId: null,
      validFrom: get_today_mx(),
      validUntil: null,
      grantedByEmployeeNumber: firstAdminEmployeeNumber,
      reason: "Administrador inicial",
      revokedAt: null,
      revokedByEmployeeNumber: null,
      ...seedAudit,
    });
  }

  return {
    lines: seed.lineas_mando.map((row) => ({
      id: row.id,
      name: row.nombre,
      active: true,
      ...seedAudit,
    })),
    departments: seed.departamentos.map((row) => ({
      id: row.id,
      commandLineId: row.linea_mando_id,
      name: row.nombre,
      active: true,
      ...seedAudit,
    })),
    subdepartments: seed.subdepartamentos.map((row) => ({
      id: row.id,
      departmentId: row.departamento_id,
      name: row.nombre,
      active: true,
      ...seedAudit,
    })),
    employees,
    areaAssignments,
    roles,
    roleAssignments,
    credentials: [],
    signatures: [],
    nextId: {
      subdepartment: Math.max(0, ...seed.subdepartamentos.map((row) => row.id)) + 1,
      areaAssignment: areaAssignments.length + 1,
      roleAssignment: roleAssignments.length + 1,
      credential: 1,
      signature: 1,
    },
  };
}
