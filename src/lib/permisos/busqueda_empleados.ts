"use server";

import { get_repositories } from "@/lib/data/proveedor_datos";
import { require_permit_actor } from "./actor";
import type { TfsEmployeeOption } from "./ejecutantes";

const maxResults = 20;
const minQueryLength = 2;

/**
 * Busca empleados TFS activos por nombre o número de empleado para el selector de participantes. La búsqueda
 * es del lado del servidor: el formulario no recibe la lista completa de empleados, solo las coincidencias.
 */
export async function search_tfs_employees(query: string): Promise<TfsEmployeeOption[]> {
  await require_permit_actor();
  const term = typeof query === "string" ? query.trim() : "";
  if (term.length < minQueryLength) return [];

  const { employees, organization } = get_repositories();
  const [matches, departments] = await Promise.all([
    employees.search(term, { limit: maxResults }),
    organization.list_departments(),
  ]);
  return matches.map((employee) => ({
    employeeNumber: employee.employeeNumber,
    name: [employee.firstName, employee.middleName, employee.paternalSurname, employee.maternalSurname]
      .filter(Boolean)
      .join(" "),
    job: employee.jobTitle,
    department: departments.find((department) => department.id === employee.departmentId)?.name ?? "TFS",
  }));
}
