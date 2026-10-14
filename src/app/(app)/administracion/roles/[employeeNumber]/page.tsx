import { notFound } from "next/navigation";
import { AdminForm } from "@/components/administracion/AdminForm";
import {
  cardClass,
  inputClass,
  labelClass,
  tableClass,
  tdClass,
  thClass,
} from "@/components/administracion/estilos";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import type { RoleAssignment } from "@/domain/acceso";
import {
  activate_pin_action,
  assign_role_action,
  revoke_pin_action,
  revoke_role_action,
} from "@/lib/administracion/acciones";
import { describe_area, format_date, roleScopeLabels } from "@/lib/administracion/etiquetas";
import { require_employee_permission } from "@/lib/auth/guardas";
import { get_employee_full_name, get_today_mx } from "@/lib/data/identidad";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { pinLength, requireSigningPin } from "@/config/seguridad";

interface EmployeeRolesPageProps {
  params: Promise<{ employeeNumber: string }>;
}

function get_assignment_status(assignment: RoleAssignment, today: string): string {
  if (assignment.revokedAt) return "Revocado";
  if (assignment.validUntil !== null && assignment.validUntil < today) return "Vencido";
  if (assignment.validFrom > today) return "Futuro";
  return "Vigente";
}

const statusTones: Record<string, BadgeTone> = {
  Vigente: "success",
  Futuro: "info",
  Vencido: "warning",
  Revocado: "danger",
};

export default async function EmployeeRolesPage({ params }: EmployeeRolesPageProps) {
  await require_employee_permission("roles:administrar");
  const { employeeNumber } = await params;
  const repositories = get_repositories();

  const employee = await repositories.employees.find_by_number(employeeNumber);
  if (!employee) notFound();

  const [assignments, roles, lines, departments, subdepartments, credential] = await Promise.all([
    repositories.access.list_assignments_by_employee(employeeNumber),
    repositories.access.list_roles(),
    repositories.organization.list_lines(),
    repositories.organization.list_departments(),
    repositories.organization.list_subdepartments(),
    requireSigningPin ? repositories.credentials.get_credential({ kind: "EMPLEADO", employeeNumber }) : Promise.resolve(null),
  ]);
  const catalog = { lines, departments, subdepartments };
  const today = get_today_mx();
  const returnPath = `/administracion/roles/${employeeNumber}`;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Administración", href: "/administracion" },
          { label: "Roles", href: "/administracion/roles" },
          { label: `Empleado ${employeeNumber}` },
        ]}
      />
      <PageHeader
        title={get_employee_full_name(employee)}
        eyebrow={!employee.active ? <StatusBadge tone="danger">INACTIVO</StatusBadge> : undefined}
        subtitle={`Empleado ${employee.employeeNumber} · ${employee.jobTitle}`}
      />

      <section className={cardClass}>
        <h2 className="mb-3 text-xl uppercase">Roles asignados</h2>
        {assignments.length === 0 ? (
          <p className="text-sm text-neutral-dark">Sin roles asignados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={`${tableClass} min-w-[52rem]`}>
              <thead>
                <tr>
                  <th className={thClass}>Rol</th>
                  <th className={thClass}>Alcance</th>
                  <th className={thClass}>Vigencia</th>
                  <th className={thClass}>Estado</th>
                  <th className={thClass}>Motivo / otorgado por</th>
                  <th className={thClass}>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => {
                  const status = get_assignment_status(assignment, today);
                  return (
                    <tr key={assignment.id}>
                      <td className={tdClass}>{roles.find((r) => r.id === assignment.roleId)?.name ?? assignment.roleCode}</td>
                      <td className={tdClass}>
                        {assignment.scope === "GLOBAL" ? roleScopeLabels.GLOBAL : describe_area(assignment, catalog)}
                      </td>
                      <td className={tdClass}>
                        {format_date(assignment.validFrom)} – {assignment.validUntil ? format_date(assignment.validUntil) : "sin fin"}
                      </td>
                      <td className={tdClass}>
                        <StatusBadge tone={statusTones[status] ?? "neutral"}>{status}</StatusBadge>
                        {assignment.revokedAt && <span className="mt-1 block text-xs text-neutral-dark">{format_date(assignment.revokedAt)}</span>}
                      </td>
                      <td className={tdClass}>
                        {assignment.reason ?? "—"}
                        <span className="block text-xs text-neutral-dark">por {assignment.grantedByEmployeeNumber}</span>
                      </td>
                      <td className={`${tdClass} min-w-64`}>
                        {!assignment.revokedAt && (
                          <AdminForm action={revoke_role_action} submitLabel="Revocar" variant="danger">
                            <input type="hidden" name="assignmentId" value={assignment.id} />
                            <input type="hidden" name="employeeNumber" value={employeeNumber} />
                            <input name="reason" placeholder="Motivo (obligatorio)" required className={inputClass} />
                          </AdminForm>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={cardClass}>
        <h2 className="mb-3 text-xl uppercase">Asignar rol</h2>
        <AdminForm action={assign_role_action} submitLabel="Asignar rol" className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="employeeNumber" value={employeeNumber} />
          <div>
            <label htmlFor="roleCode" className={labelClass}>Rol</label>
            <select id="roleCode" name="roleCode" required className={inputClass}>
              {roles.filter((role) => role.active).map((role) => (
                <option key={role.id} value={role.code}>{role.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="scope" className={labelClass}>Alcance</label>
            <select id="scope" name="scope" required className={inputClass} defaultValue="GLOBAL">
              {Object.entries(roleScopeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <p className="rounded-lg bg-brand-cyan/15 px-3 py-2 text-xs text-brand-navy sm:col-span-2">
            Elige solo el área que corresponde al alcance; los demás selectores se ignoran. Con alcance
            “Toda la organización” no se elige ninguno.
          </p>
          <div>
            <label htmlFor="commandLineId" className={labelClass}>Línea de mando</label>
            <select id="commandLineId" name="commandLineId" className={inputClass} defaultValue="">
              <option value="">—</option>
              {lines.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="departmentId" className={labelClass}>Departamento</label>
            <select id="departmentId" name="departmentId" className={inputClass} defaultValue="">
              <option value="">—</option>
              {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="subdepartmentId" className={labelClass}>Subdepartamento</label>
            <select id="subdepartmentId" name="subdepartmentId" className={inputClass} defaultValue="">
              <option value="">—</option>
              {subdepartments.map((subdepartment) => (
                <option key={subdepartment.id} value={subdepartment.id}>
                  {subdepartment.name} ({departments.find((d) => d.id === subdepartment.departmentId)?.name})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="validFrom" className={labelClass}>Vigente desde (opcional, por omisión hoy)</label>
            <input id="validFrom" name="validFrom" type="date" className={inputClass} />
          </div>
          <div>
            <label htmlFor="validUntil" className={labelClass}>Vigente hasta (opcional)</label>
            <input id="validUntil" name="validUntil" type="date" className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="reason" className={labelClass}>Motivo (obligatorio)</label>
            <input id="reason" name="reason" required className={inputClass} placeholder="Ej. Puesto: SUPERVISOR HSE" />
          </div>
        </AdminForm>
      </section>

      {requireSigningPin && (
      <section className={cardClass}>
        <h2 className="mb-1 text-xl uppercase">PIN de firma</h2>
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          Estado:
          {!credential ? (
            <StatusBadge tone="danger">Sin PIN (no puede firmar)</StatusBadge>
          ) : credential.status === "BLOQUEADA" ? (
            <StatusBadge tone="warning">Bloqueado hasta {format_date(credential.lockedUntil)}</StatusBadge>
          ) : (
            <StatusBadge tone="success">Activo</StatusBadge>
          )}
          {credential && (
            <span className="text-neutral-dark"> · activado el {format_date(credential.createdAt)} por {credential.activatedByEmployeeNumber}</span>
          )}
        </p>

        <AdminForm action={activate_pin_action} submitLabel={credential ? "Reiniciar PIN" : "Activar PIN"} className="mb-4 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="kind" value="EMPLEADO" />
          <input type="hidden" name="subject" value={employeeNumber} />
          <input type="hidden" name="returnPath" value={returnPath} />
          <p className="rounded-lg bg-brand-cyan/15 px-3 py-2 text-xs text-brand-navy sm:col-span-2">
            La propia persona debe teclear su PIN ({pinLength} dígitos) en este momento. No lo anotes ni se lo
            asignes tú: es lo que impide que otra persona firme en su nombre. Un PIN nuevo revoca el anterior.
          </p>
          <div>
            <label htmlFor="pin" className={labelClass}>PIN</label>
            <input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="off" maxLength={pinLength} required className={inputClass} />
          </div>
          <div>
            <label htmlFor="confirmPin" className={labelClass}>Confirmar PIN</label>
            <input id="confirmPin" name="confirmPin" type="password" inputMode="numeric" autoComplete="off" maxLength={pinLength} required className={inputClass} />
          </div>
        </AdminForm>

        {credential && (
          <AdminForm action={revoke_pin_action} submitLabel="Revocar PIN" variant="danger">
            <input type="hidden" name="kind" value="EMPLEADO" />
            <input type="hidden" name="subject" value={employeeNumber} />
            <input type="hidden" name="returnPath" value={returnPath} />
            <input name="reason" placeholder="Motivo (obligatorio)" required className={inputClass} />
          </AdminForm>
        )}
      </section>
      )}
    </>
  );
}
