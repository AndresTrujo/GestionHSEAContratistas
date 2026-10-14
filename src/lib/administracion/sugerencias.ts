import type { RoleScope } from "@/domain/acceso";
import type { AreaRef } from "@/domain/organizacion";
import seedData from "@/lib/data/memoria/seed_organizacion.json";

/** Rol sugerido por el seed (por puesto o por cargo de área en el Excel); se aplica solo con confirmación. */
export interface RoleSuggestion {
  /** Identifica la sugerencia en el formulario. */
  key: string;
  employeeNumber: string;
  roleCode: string;
  scope: RoleScope;
  area: AreaRef;
  reason: string;
}

interface SeedSuggestion {
  no_empleado: number;
  rol: string;
  alcance: RoleScope;
  linea_mando_id?: number | null;
  departamento_id?: number | null;
  subdepartamento_id?: number | null;
  motivo: string;
}

function area_key(area: AreaRef): string {
  return `${area.commandLineId ?? ""}-${area.departmentId ?? ""}-${area.subdepartmentId ?? ""}`;
}

export function build_suggestion_key(employeeNumber: string, roleCode: string, scope: RoleScope, area: AreaRef): string {
  return `${employeeNumber}|${roleCode}|${scope}|${area_key(area)}`;
}

export function load_role_suggestions(): RoleSuggestion[] {
  const raw = (seedData as unknown as { sugerencias_empleado_roles?: SeedSuggestion[] }).sugerencias_empleado_roles ?? [];
  return raw.map((item) => {
    const employeeNumber = String(item.no_empleado);
    const area: AreaRef = {
      commandLineId: item.linea_mando_id ?? null,
      departmentId: item.departamento_id ?? null,
      subdepartmentId: item.subdepartamento_id ?? null,
    };
    return {
      key: build_suggestion_key(employeeNumber, item.rol, item.alcance, area),
      employeeNumber,
      roleCode: item.rol,
      scope: item.alcance,
      area,
      reason: item.motivo,
    };
  });
}
