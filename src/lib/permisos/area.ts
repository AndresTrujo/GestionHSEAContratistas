import type { PermitArea } from "@/domain/organizacion";
import { get_repositories } from "@/lib/data/proveedor_datos";

export interface SelectedArea {
  area: PermitArea;
  /** Texto legible: "Departamento" o "Departamento / Subdepartamento". */
  label: string;
}

function read_id(formData: FormData, name: string): number | null {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Área elegida en el formulario, validada contra la organización; null si falta o no es válida. */
export async function read_permit_area(formData: FormData): Promise<SelectedArea | null> {
  const departmentId = read_id(formData, "departmentId");
  if (departmentId === null) return null;
  const subdepartmentId = read_id(formData, "subdepartmentId");

  const { organization } = get_repositories();
  const department = (await organization.list_departments()).find((item) => item.id === departmentId && item.active);
  if (!department) return null;
  if (subdepartmentId === null) return { area: { departmentId, subdepartmentId: null }, label: department.name };

  const subdepartment = (await organization.list_subdepartments(departmentId)).find(
    (item) => item.id === subdepartmentId && item.active,
  );
  if (!subdepartment) return null;
  return { area: { departmentId, subdepartmentId }, label: `${department.name} / ${subdepartment.name}` };
}
