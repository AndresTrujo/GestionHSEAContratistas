import { redirect } from "next/navigation";
import { get_session } from "@/lib/auth/sesion";
import { get_repositories } from "@/lib/data/proveedor_datos";

/**
 * "Departamento / compañía del solicitante" de un permiso o JSA: un usuario de proveedor pertenece a una
 * compañía y un empleado TFS a un departamento. El valor por omisión sale del perfil de la sesión.
 */
export interface RequesterUnit {
  kind: "COMPANY" | "DEPARTMENT";
  /** Valor de su perfil: lo que aparece seleccionado por omisión. */
  value: string;
  /** Opciones que puede elegir. */
  options: string[];
}

/** Misma regla que `ejecutantes.ts` cuando el departamento no se encuentra. */
const fallbackDepartmentName = "TFS";

export async function get_current_requester_unit(): Promise<RequesterUnit> {
  const session = await get_session();
  if (!session) redirect("/login");
  // Un usuario de proveedor solo actúa a nombre de su empresa (sus permisos se ligan a ella): no se le listan
  // las demás compañías.
  if (session.kind === "USUARIO_PROVEEDOR") {
    return { kind: "COMPANY", value: session.providerName, options: [session.providerName] };
  }

  const { employees, organization } = get_repositories();
  const [employee, departments] = await Promise.all([
    employees.find_by_number(session.employeeNumber),
    organization.list_departments(),
  ]);
  const profileDepartment = departments.find((item) => item.id === employee?.departmentId);
  const value = profileDepartment?.name ?? fallbackDepartmentName;
  const options = departments.filter((item) => item.active).map((item) => item.name);
  // El departamento del perfil siempre debe poder seleccionarse, aunque ya no esté activo en el catálogo.
  if (!options.includes(value)) options.push(value);
  options.sort((a, b) => a.localeCompare(b, "es"));
  return { kind: "DEPARTMENT", value, options };
}

/**
 * Valor que se guarda en el documento: lo elegido en el formulario solo si es una de las opciones permitidas
 * para esta persona; si no (o si viene vacío o alterado), el de su perfil.
 */
export async function resolve_requester_unit(formData: FormData, name: string): Promise<string> {
  const unit = await get_current_requester_unit();
  const submitted = formData.get(name);
  const chosen = typeof submitted === "string" ? submitted.trim() : "";
  return unit.options.includes(chosen) ? chosen : unit.value;
}
