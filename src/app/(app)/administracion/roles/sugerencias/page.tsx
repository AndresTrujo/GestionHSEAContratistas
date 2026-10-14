import Link from "next/link";
import { AdminForm } from "@/components/administracion/AdminForm";
import { cardClass, secondaryButtonClass, tableClass, tdClass, thClass } from "@/components/administracion/estilos";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { systemRoleNames, type SystemRoleCode } from "@/config/permisos";
import { apply_role_suggestions_action } from "@/lib/administracion/acciones";
import { load_role_suggestions } from "@/lib/administracion/sugerencias";
import { require_employee_permission } from "@/lib/auth/guardas";
import { get_employee_full_name } from "@/lib/data/identidad";
import { get_repositories } from "@/lib/data/proveedor_datos";

const scopeLabels = {
  GLOBAL: "Global",
  LINEA_MANDO: "Línea de mando",
  DEPARTAMENTO: "Departamento",
  SUBDEPARTAMENTO: "Subdepartamento",
} as const;

export default async function RoleSuggestionsPage() {
  await require_employee_permission("roles:administrar");
  const repositories = get_repositories();
  const suggestions = load_role_suggestions();

  const [lines, departments, subdepartments] = await Promise.all([
    repositories.organization.list_lines(),
    repositories.organization.list_departments(),
    repositories.organization.list_subdepartments(),
  ]);
  const employeeNumbers = [...new Set(suggestions.map((item) => item.employeeNumber))];
  const [employees, assignments] = await Promise.all([
    Promise.all(employeeNumbers.map((number) => repositories.employees.find_by_number(number))),
    Promise.all(employeeNumbers.map((number) => repositories.access.list_assignments_by_employee(number, { onlyCurrent: true }))),
  ]);
  const employeeByNumber = new Map(employeeNumbers.map((number, index) => [number, employees[index] ?? null]));
  const assignmentsByNumber = new Map(employeeNumbers.map((number, index) => [number, assignments[index] ?? []]));

  function describe_area(area: { commandLineId: number | null; departmentId: number | null; subdepartmentId: number | null }): string {
    if (area.subdepartmentId !== null) {
      const sub = subdepartments.find((item) => item.id === area.subdepartmentId);
      const department = departments.find((item) => item.id === sub?.departmentId);
      return [department?.name, sub?.name].filter(Boolean).join(" / ");
    }
    if (area.departmentId !== null) return departments.find((item) => item.id === area.departmentId)?.name ?? "";
    if (area.commandLineId !== null) return lines.find((item) => item.id === area.commandLineId)?.name ?? "";
    return "Toda la organización";
  }

  const rows = suggestions.map((suggestion) => {
    const employee = employeeByNumber.get(suggestion.employeeNumber) ?? null;
    const alreadyAssigned = (assignmentsByNumber.get(suggestion.employeeNumber) ?? []).some(
      (assignment) =>
        assignment.roleCode === suggestion.roleCode &&
        assignment.scope === suggestion.scope &&
        (assignment.commandLineId ?? null) === suggestion.area.commandLineId &&
        (assignment.departmentId ?? null) === suggestion.area.departmentId &&
        (assignment.subdepartmentId ?? null) === suggestion.area.subdepartmentId,
    );
    const status = !employee || !employee.active ? "INACTIVO" : alreadyAssigned ? "ASIGNADA" : "PENDIENTE";
    return { suggestion, employee, status } as const;
  });
  const pendingCount = rows.filter((row) => row.status === "PENDIENTE").length;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Administración", href: "/administracion" },
          { label: "Roles", href: "/administracion/roles" },
          { label: "Sugerencias" },
        ]}
      />
      <PageHeader
        title="Sugerencias de roles"
        eyebrow={<StatusBadge tone={pendingCount > 0 ? "warning" : "success"}>{pendingCount} pendientes</StatusBadge>}
        subtitle="Roles propuestos por el puesto o el cargo de área del Excel. Nada se asigna solo: revisa la lista, desmarca lo que no corresponda y aplica. Cada asignación queda en auditoría."
        actions={
          <Link href="/administracion/roles" className={secondaryButtonClass}>
            Volver a roles
          </Link>
        }
      />

      <section className={cardClass}>
        <AdminForm action={apply_role_suggestions_action} submitLabel="Aplicar sugerencias marcadas">
          <div className="overflow-x-auto">
            <table className={`${tableClass} min-w-[40rem]`}>
              <thead>
                <tr>
                  <th className={thClass}>
                    <span className="sr-only">Aplicar</span>
                  </th>
                  <th className={thClass}>Empleado</th>
                  <th className={thClass}>Rol</th>
                  <th className={thClass}>Alcance</th>
                  <th className={thClass}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ suggestion, employee, status }) => (
                  <tr key={suggestion.key}>
                    <td className={tdClass}>
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-brand-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
                        name="suggestion"
                        value={suggestion.key}
                        defaultChecked={status === "PENDIENTE"}
                        disabled={status !== "PENDIENTE"}
                        aria-label={`Aplicar ${suggestion.roleCode} a ${suggestion.employeeNumber}`}
                      />
                    </td>
                    <td className={tdClass}>
                      {suggestion.employeeNumber}
                      <span className="block text-xs text-neutral-dark">
                        {employee ? `${get_employee_full_name(employee)} · ${employee.jobTitle}` : "No está en la organización cargada"}
                      </span>
                    </td>
                    <td className={tdClass}>
                      {systemRoleNames[suggestion.roleCode as SystemRoleCode] ?? suggestion.roleCode}
                      <span className="block text-xs text-neutral-dark">{suggestion.reason}</span>
                    </td>
                    <td className={tdClass}>
                      {scopeLabels[suggestion.scope]}
                      <span className="block text-xs text-neutral-dark">{describe_area(suggestion.area)}</span>
                    </td>
                    <td className={tdClass}>
                      {status === "PENDIENTE" && <StatusBadge tone="warning">Pendiente</StatusBadge>}
                      {status === "ASIGNADA" && <StatusBadge tone="success">Ya asignada</StatusBadge>}
                      {status === "INACTIVO" && <StatusBadge tone="danger">Empleado inactivo o inexistente</StatusBadge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminForm>
      </section>
    </>
  );
}
