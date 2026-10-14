import type { RoleScope } from "@/domain/acceso";
import type { AreaRef, PermitArea } from "@/domain/organizacion";

/** Nivel de una referencia de área (el único id informado). */
export function get_scope_of_area_ref(ref: AreaRef): RoleScope {
  if (ref.subdepartmentId !== null) return "SUBDEPARTAMENTO";
  if (ref.departmentId !== null) return "DEPARTAMENTO";
  if (ref.commandLineId !== null) return "LINEA_MANDO";
  return "GLOBAL";
}

/**
 * ¿El alcance cubre el área del permiso? Misma lógica que tiene_permiso() en la BD:
 * GLOBAL cubre todo; los demás cubren esa área y lo que cuelga de ella.
 * `commandLineOfArea` es la línea de mando del departamento del permiso.
 */
export function does_scope_cover_area(
  scope: RoleScope,
  ref: AreaRef,
  area: PermitArea,
  commandLineOfArea: number | null,
): boolean {
  switch (scope) {
    case "GLOBAL":
      return true;
    case "LINEA_MANDO":
      return ref.commandLineId !== null && ref.commandLineId === commandLineOfArea;
    case "DEPARTAMENTO":
      return ref.departmentId !== null && ref.departmentId === area.departmentId;
    case "SUBDEPARTAMENTO":
      return ref.subdepartmentId !== null && ref.subdepartmentId === area.subdepartmentId;
  }
}
