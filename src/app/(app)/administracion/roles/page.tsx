import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { DisclosureCard } from "@/components/ui/DisclosureCard";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  cardClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  tableClass,
  tdClass,
  thClass,
} from "@/components/administracion/estilos";
import { permissionDescriptions } from "@/config/permisos";
import { require_employee_permission } from "@/lib/auth/guardas";
import { get_employee_full_name } from "@/lib/data/identidad";
import { get_repositories } from "@/lib/data/proveedor_datos";

interface RolesPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function RolesPage({ searchParams }: RolesPageProps) {
  await require_employee_permission("roles:administrar");
  const { q = "" } = await searchParams;
  const repositories = get_repositories();
  const [roles, results] = await Promise.all([
    repositories.access.list_roles(),
    q.trim() ? repositories.employees.search(q.trim(), { limit: 25 }) : Promise.resolve([]),
  ]);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Administración", href: "/administracion" },
          { label: "Roles" },
        ]}
      />
      <PageHeader
        title="Roles de firma"
        actions={
          <Link href="/administracion/roles/sugerencias" className={secondaryButtonClass}>
            Ver y aplicar las sugerencias de roles del Excel
          </Link>
        }
      />

      <section className={cardClass}>
        <h2 className="mb-3 text-xl uppercase">Buscar empleado</h2>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label htmlFor="q" className={labelClass}>
              Nombre, número de empleado o puesto
            </label>
            <input id="q" name="q" defaultValue={q} className={inputClass} autoFocus />
          </div>
          <button type="submit" className={primaryButtonClass}>
            Buscar
          </button>
        </form>

        {q.trim() && (
          <div className="mt-4 overflow-x-auto">
            {results.length === 0 ? (
              <p className="rounded-lg bg-neutral-light/30 px-3 py-2 text-sm text-neutral-dark">
                Sin resultados (solo se buscan empleados activos).
              </p>
            ) : (
              <table className={`${tableClass} min-w-[32rem]`}>
                <caption className="sr-only">Empleados encontrados</caption>
                <thead>
                  <tr>
                    <th className={thClass}>Número</th>
                    <th className={thClass}>Nombre</th>
                    <th className={thClass}>Puesto</th>
                    <th className={thClass}>
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((employee) => (
                    <tr key={employee.employeeNumber}>
                      <td className={tdClass}>{employee.employeeNumber}</td>
                      <td className={tdClass}>{get_employee_full_name(employee)}</td>
                      <td className={tdClass}>{employee.jobTitle}</td>
                      <td className={tdClass}>
                        <Link
                          href={`/administracion/roles/${employee.employeeNumber}`}
                          className={secondaryButtonClass}
                          aria-label={`Roles de ${get_employee_full_name(employee)}`}
                        >
                          Roles
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      {/* Referencia secundaria: abierta solo cuando no hay una búsqueda en curso. */}
      <DisclosureCard
        title="Roles del sistema"
        description="Permisos que otorga cada rol."
        badge={<span className="text-sm font-bold text-brand-navy">{roles.length} roles</span>}
        defaultOpen={!q.trim()}
      >
        <div className="overflow-x-auto">
          <table className={`${tableClass} min-w-[32rem]`}>
            <thead>
              <tr>
                <th className={thClass}>Rol</th>
                <th className={thClass}>Permisos</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id}>
                  <td className={tdClass}>
                    <span className="font-bold">{role.name}</span>
                    <span className="block text-xs text-neutral-dark">{role.code}</span>
                  </td>
                  <td className={tdClass}>
                    <ul className="list-inside list-disc text-xs">
                      {role.permissions.map((permission) => (
                        <li key={permission}>{permissionDescriptions[permission]}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DisclosureCard>
    </>
  );
}
