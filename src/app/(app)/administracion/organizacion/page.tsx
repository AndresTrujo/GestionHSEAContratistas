import Link from "next/link";
import { AdminForm } from "@/components/administracion/AdminForm";
import {
  cardClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
  tableClass,
  tdClass,
  thClass,
} from "@/components/administracion/estilos";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { DisclosureCard } from "@/components/ui/DisclosureCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AreaAssignment } from "@/domain/organizacion";
import {
  assign_area_role_action,
  create_subdepartment_action,
  end_area_role_action,
} from "@/lib/administracion/acciones";
import { format_date, roleScopeLabels } from "@/lib/administracion/etiquetas";
import { require_employee_permission } from "@/lib/auth/guardas";
import { get_employee_full_name } from "@/lib/data/identidad";
import { get_repositories } from "@/lib/data/proveedor_datos";

interface OrganizationPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function OrganizationPage({ searchParams }: OrganizationPageProps) {
  await require_employee_permission("organizacion:administrar");
  const { q = "" } = await searchParams;
  const repositories = get_repositories();

  const [lines, departments, subdepartments, currentPosts, results] = await Promise.all([
    repositories.organization.list_lines(),
    repositories.organization.list_departments(),
    repositories.organization.list_subdepartments(),
    repositories.organization.list_area_roles({ onlyCurrent: true }),
    q.trim() ? repositories.employees.search(q.trim(), { limit: 15 }) : Promise.resolve([]),
  ]);

  // Nombres de quienes ocupan un cargo vigente.
  const holderNumbers = [...new Set(currentPosts.map((post) => post.employeeNumber))];
  const holders = await Promise.all(holderNumbers.map((number) => repositories.employees.find_by_number(number)));
  const holderNames = new Map(
    holders.flatMap((holder) => (holder ? [[holder.employeeNumber, get_employee_full_name(holder)] as const] : [])),
  );

  const get_posts_for = (key: "commandLineId" | "departmentId" | "subdepartmentId", id: number): AreaAssignment[] =>
    currentPosts.filter((post) => post[key] === id);

  const departmentsWithoutManager = departments.filter((department) => get_posts_for("departmentId", department.id).length === 0);
  const subdepartmentsWithoutManager = subdepartments.filter(
    (subdepartment) => get_posts_for("subdepartmentId", subdepartment.id).length === 0,
  );

  function PostList({ posts, emptyText }: { posts: AreaAssignment[]; emptyText: string }) {
    if (posts.length === 0) return <StatusBadge tone="danger">{emptyText}</StatusBadge>;
    return (
      <ul className="space-y-2">
        {posts.map((post) => (
          <li key={post.id}>
            <span className="font-bold">{holderNames.get(post.employeeNumber) ?? post.employeeNumber}</span>
            <span className="text-xs text-neutral-dark"> · {post.employeeNumber} · desde {format_date(post.validFrom)}</span>
            <details className="mt-1">
              <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-2 text-xs font-bold text-red-700 underline hover:bg-red-50 focus-visible:outline-brand-navy sm:min-h-10">
                Cerrar cargo
              </summary>
              <AdminForm action={end_area_role_action} submitLabel="Cerrar cargo" variant="danger" className="mt-2">
                <input type="hidden" name="assignmentId" value={post.id} />
                <input name="reason" placeholder="Motivo (obligatorio)" required className={inputClass} />
              </AdminForm>
            </details>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Administración", href: "/administracion" },
          { label: "Organización" },
        ]}
      />
      <PageHeader
        title="Organización y cargos de área"
        subtitle="Gerente por línea de mando; encargados por departamento o subdepartamento (puede haber varios por área). Quien firma como encargado del área necesita además el rol ENCARGADO_AREA."
        actions={
          <Link href="/administracion/roles" className={secondaryButtonClass}>
            Roles de firma
          </Link>
        }
      />

      {(departmentsWithoutManager.length > 0 || subdepartmentsWithoutManager.length > 0) && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <span aria-hidden="true" className="text-lg font-bold leading-none">✕</span>
          <p>
            Áreas sin encargado vigente: {departmentsWithoutManager.length} departamento(s) y{" "}
            {subdepartmentsWithoutManager.length} subdepartamento(s). Un subdepartamento sin encargado propio
            sigue cubierto por los encargados de su departamento.
          </p>
        </div>
      )}

      <DisclosureCard
        title="Asignar cargo"
        description="Busca al empleado y asígnale un cargo en una línea, departamento o subdepartamento."
        defaultOpen={q.trim() !== ""}
      >
        <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label htmlFor="q" className={labelClass}>Buscar empleado (para obtener su número)</label>
            <input id="q" name="q" defaultValue={q} className={inputClass} />
          </div>
          <button type="submit" className={secondaryButtonClass}>Buscar</button>
        </form>
        {results.length > 0 && (
          <ul className="mb-4 divide-y divide-neutral-light rounded-lg border border-neutral-light text-sm">
            {results.map((employee) => (
              <li key={employee.employeeNumber} className="px-3 py-2">
                <strong>{employee.employeeNumber}</strong> · {get_employee_full_name(employee)} · {employee.jobTitle}
              </li>
            ))}
          </ul>
        )}

        <AdminForm action={assign_area_role_action} submitLabel="Asignar cargo" className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="employeeNumber" className={labelClass}>Número de empleado</label>
            <input id="employeeNumber" name="employeeNumber" inputMode="numeric" required className={inputClass} />
          </div>
          <div>
            <label htmlFor="position" className={labelClass}>Cargo</label>
            <select id="position" name="position" className={inputClass} defaultValue="ENCARGADO">
              <option value="ENCARGADO">Encargado (departamento o subdepartamento)</option>
              <option value="GERENTE">Gerente (línea de mando)</option>
            </select>
          </div>
          <div>
            <label htmlFor="level" className={labelClass}>Nivel del área</label>
            <select id="level" name="level" className={inputClass} defaultValue="DEPARTAMENTO">
              <option value="LINEA_MANDO">{roleScopeLabels.LINEA_MANDO}</option>
              <option value="DEPARTAMENTO">{roleScopeLabels.DEPARTAMENTO}</option>
              <option value="SUBDEPARTAMENTO">{roleScopeLabels.SUBDEPARTAMENTO}</option>
            </select>
          </div>
          <div>
            <label htmlFor="validFrom" className={labelClass}>Vigente desde (opcional, por omisión hoy)</label>
            <input id="validFrom" name="validFrom" type="date" className={inputClass} />
          </div>
          <p className="text-xs text-neutral-dark sm:col-span-2">Elige solo el área del nivel indicado; los demás selectores se ignoran.</p>
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
            <label htmlFor="reason" className={labelClass}>Motivo (opcional)</label>
            <input id="reason" name="reason" className={inputClass} />
          </div>
        </AdminForm>
      </DisclosureCard>

      <DisclosureCard title="Agregar subdepartamento" description="Crea un subdepartamento dentro de un departamento existente.">
        <AdminForm action={create_subdepartment_action} submitLabel="Crear subdepartamento" className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="newSubdepartmentDepartment" className={labelClass}>Departamento</label>
            <select id="newSubdepartmentDepartment" name="departmentId" required className={inputClass} defaultValue="">
              <option value="" disabled>Elige…</option>
              {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="name" className={labelClass}>Nombre</label>
            <input id="name" name="name" required className={inputClass} />
          </div>
        </AdminForm>
      </DisclosureCard>

      {lines.map((line) => {
        const lineDepartments = departments.filter((department) => department.commandLineId === line.id);
        return (
          <section key={line.id} className={cardClass}>
            <h2 className="text-2xl uppercase">{line.name}</h2>
            <p className="mb-3 text-sm">
              <span className="font-bold text-brand-navy">Gerente: </span>
              <PostList posts={get_posts_for("commandLineId", line.id)} emptyText="Sin gerente vigente" />
            </p>
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Departamento / subdepartamento</th>
                    <th className={thClass}>Encargados vigentes</th>
                  </tr>
                </thead>
                <tbody>
                  {lineDepartments.map((department) => (
                    <FragmentRows
                      key={department.id}
                      name={department.name}
                      posts={<PostList posts={get_posts_for("departmentId", department.id)} emptyText="Sin encargado vigente" />}
                      sub_rows={subdepartments
                        .filter((subdepartment) => subdepartment.departmentId === department.id)
                        .map((subdepartment) => ({
                          id: subdepartment.id,
                          name: subdepartment.name,
                          posts: <PostList posts={get_posts_for("subdepartmentId", subdepartment.id)} emptyText="Sin encargado propio" />,
                        }))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <p className="text-sm text-neutral-dark">
        ¿Buscas roles de firma? Están en{" "}
        <Link
          href="/administracion/roles"
          className="inline-flex min-h-11 items-center font-bold text-brand-navy underline focus-visible:outline-brand-navy sm:min-h-10"
        >
          Roles
        </Link>
        .
      </p>
    </>
  );
}

/** Fila de un departamento con sus subdepartamentos debajo. */
function FragmentRows({
  name,
  posts,
  sub_rows,
}: {
  name: string;
  posts: React.ReactNode;
  sub_rows: { id: number; name: string; posts: React.ReactNode }[];
}) {
  return (
    <>
      <tr>
        <td className={`${tdClass} font-bold`}>{name}</td>
        <td className={tdClass}>{posts}</td>
      </tr>
      {sub_rows.map((child) => (
        <tr key={child.id}>
          <td className={`${tdClass} pl-6 text-neutral-dark`}>↳ {child.name}</td>
          <td className={tdClass}>{child.posts}</td>
        </tr>
      ))}
    </>
  );
}
