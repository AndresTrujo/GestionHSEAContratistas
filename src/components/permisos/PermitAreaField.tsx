import { AreaSelector } from "@/components/permisos/AreaSelector";
import { get_repositories } from "@/lib/data/proveedor_datos";

/**
 * Selector del área del permiso (departamento y subdepartamento). De ella depende quién puede autorizar:
 * los roles de firma tienen alcance por área. Va dentro de una cuadrícula de dos columnas.
 */
export async function PermitAreaField() {
  const { organization } = get_repositories();
  const [departments, subdepartments] = await Promise.all([
    organization.list_departments(),
    organization.list_subdepartments(),
  ]);

  return (
    <AreaSelector
      departments={departments.filter((item) => item.active).map((item) => ({ id: item.id, name: item.name }))}
      subdepartments={subdepartments
        .filter((item) => item.active)
        .map((item) => ({ id: item.id, name: item.name, departmentId: item.departmentId }))}
    />
  );
}
