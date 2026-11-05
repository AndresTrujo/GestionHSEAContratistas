import { hseaDepartmentName } from "@/config/permisos";
import { get_repositories } from "@/lib/data/proveedor_datos";

/** ¿Es un empleado TFS activo del departamento HSEA? (mismo criterio que las verificaciones de los permisos) */
export async function is_hsea_department_employee(employeeNumber: string): Promise<boolean> {
  const { employees, organization } = get_repositories();
  const [employee, departments] = await Promise.all([
    employees.find_by_number(employeeNumber),
    organization.list_departments(),
  ]);
  if (!employee || !employee.active) return false;
  const hsea = departments.find((department) => department.name.trim().toUpperCase() === hseaDepartmentName);
  return hsea !== undefined && employee.departmentId === hsea.id;
}
