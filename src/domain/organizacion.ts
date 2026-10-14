import type { AuditMetadata } from "./auditoria";

/**
 * Estructura organizacional (tablas lineas_mando, departamentos,
 * subdepartamentos, empleados, cargos_area). Los números de empleado se
 * manejan como texto, igual que la sesión y los campos de auditoría.
 */
export interface CommandLine extends AuditMetadata {
  id: number;
  name: string;
  active: boolean;
}

export interface Department extends AuditMetadata {
  id: number;
  commandLineId: number;
  name: string;
  active: boolean;
}

export interface Subdepartment extends AuditMetadata {
  id: number;
  departmentId: number;
  name: string;
  active: boolean;
}

export type Gender = "MASCULINO" | "FEMENINO";

export interface Employee extends AuditMetadata {
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  paternalSurname: string;
  maternalSurname: string | null;
  gender: Gender | null;
  hireDate: string; // YYYY-MM-DD
  /** Con fecha de baja el empleado debe estar inactivo. */
  terminationDate: string | null;
  active: boolean;
  jobTitle: string;
  commandLineId: number;
  departmentId: number;
  /** null = el empleado pertenece al departamento completo. */
  subdepartmentId: number | null;
  directManagerEmployeeNumber: string | null;
}

/** GERENTE: responsable de una línea de mando. ENCARGADO: de un departamento o subdepartamento. */
export type AreaPosition = "GERENTE" | "ENCARGADO";

/** Área a la que aplica un cargo, un rol o una firma; solo un nivel viene informado. */
export interface AreaRef {
  commandLineId: number | null;
  departmentId: number | null;
  subdepartmentId: number | null;
}

/** Cargo de área con vigencia; puede haber varios encargados vigentes por área (no hay suplentes). */
export interface AreaAssignment extends AuditMetadata, AreaRef {
  id: string;
  employeeNumber: string;
  position: AreaPosition;
  validFrom: string; // YYYY-MM-DD
  validUntil: string | null;
  reason: string | null;
}

/**
 * Alta de un cargo de área. GERENTE exige línea de mando; ENCARGADO, departamento
 * o subdepartamento (un solo nivel informado).
 */
export interface AssignAreaRoleInput {
  employeeNumber: string;
  position: AreaPosition;
  area: AreaRef;
  validFrom?: string; // YYYY-MM-DD; por omisión, hoy (CDMX)
  reason: string | null;
}

/** Área concreta de un permiso: siempre tiene departamento; el subdepartamento es opcional. */
export interface PermitArea {
  departmentId: number;
  subdepartmentId: number | null;
}
