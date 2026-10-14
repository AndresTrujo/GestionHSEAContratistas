import type { RoleScope } from "@/domain/acceso";
import type { AreaRef, CommandLine, Department, Subdepartment } from "@/domain/organizacion";

export interface OrganizationCatalog {
  lines: CommandLine[];
  departments: Department[];
  subdepartments: Subdepartment[];
}

export const roleScopeLabels: Record<RoleScope, string> = {
  GLOBAL: "Toda la organización",
  LINEA_MANDO: "Línea de mando",
  DEPARTAMENTO: "Departamento",
  SUBDEPARTAMENTO: "Subdepartamento",
};

/** Texto legible de un área: "Departamento: Seguridad" o "Toda la organización". */
export function describe_area(area: AreaRef, catalog: OrganizationCatalog): string {
  if (area.subdepartmentId !== null) {
    const subdepartment = catalog.subdepartments.find((s) => s.id === area.subdepartmentId);
    const department = catalog.departments.find((d) => d.id === subdepartment?.departmentId);
    return `Subdepartamento: ${subdepartment?.name ?? area.subdepartmentId}${department ? ` (${department.name})` : ""}`;
  }
  if (area.departmentId !== null) {
    return `Departamento: ${catalog.departments.find((d) => d.id === area.departmentId)?.name ?? area.departmentId}`;
  }
  if (area.commandLineId !== null) {
    return `Línea de mando: ${catalog.lines.find((l) => l.id === area.commandLineId)?.name ?? area.commandLineId}`;
  }
  return roleScopeLabels.GLOBAL;
}

/** Fecha ISO o AAAA-MM-DD a "dd/mm/aaaa" (sin cambiar de día por zona horaria). */
export function format_date(value: string | null): string {
  if (!value) return "—";
  const [date = ""] = value.split("T");
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}
