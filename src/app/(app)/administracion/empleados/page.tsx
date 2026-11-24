import { AdminForm } from "@/components/administracion/AdminForm";
import { cardClass, inputClass, labelClass } from "@/components/administracion/estilos";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { create_tfs_employee_action } from "@/lib/administracion/acciones";
import { require_employee_permission } from "@/lib/auth/guardas";
import { get_repositories } from "@/lib/data/proveedor_datos";

export default async function TfsEmployeesPage() {
  await require_employee_permission("organizacion:administrar");
  const repositories = get_repositories();
  const [departments, subdepartments] = await Promise.all([
    repositories.organization.list_departments(),
    repositories.organization.list_subdepartments(),
  ]);

  return (
    <>
      <Breadcrumbs items={[
        { label: "Inicio", href: "/inicio" },
        { label: "Administración", href: "/administracion" },
        { label: "Empleados TFS" },
      ]} />
      <PageHeader
        title="Alta de empleados TFS"
        subtitle="Registra manualmente a una persona en el catálogo de empleados de TFS. El número de empleado debe ser único."
      />
      <section className={cardClass}>
        <h2 className="mb-1 text-xl uppercase">Nuevo empleado</h2>
        <p className="mb-4 text-sm text-neutral-dark">
          Los campos marcados son obligatorios. El empleado se registrará activo y podrá iniciar sesión con su número de empleado.
        </p>
        <AdminForm action={create_tfs_employee_action} submitLabel="Registrar empleado" className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="employeeNumber" className={labelClass}>Número de empleado *</label>
            <input id="employeeNumber" name="employeeNumber" required inputMode="numeric" pattern="[0-9]+" maxLength={10} className={inputClass} />
          </div>
          <div>
            <label htmlFor="firstName" className={labelClass}>Nombre(s) *</label>
            <input id="firstName" name="firstName" required maxLength={300} className={inputClass} />
          </div>
          <div>
            <label htmlFor="middleName" className={labelClass}>Segundo nombre</label>
            <input id="middleName" name="middleName" maxLength={300} className={inputClass} />
          </div>
          <div>
            <label htmlFor="paternalSurname" className={labelClass}>Apellido paterno *</label>
            <input id="paternalSurname" name="paternalSurname" required maxLength={300} className={inputClass} />
          </div>
          <div>
            <label htmlFor="maternalSurname" className={labelClass}>Apellido materno</label>
            <input id="maternalSurname" name="maternalSurname" maxLength={300} className={inputClass} />
          </div>
          <div>
            <label htmlFor="gender" className={labelClass}>Género</label>
            <select id="gender" name="gender" defaultValue="" className={inputClass}>
              <option value="">Sin especificar</option>
              <option value="MASCULINO">Masculino</option>
              <option value="FEMENINO">Femenino</option>
            </select>
          </div>
          <div>
            <label htmlFor="hireDate" className={labelClass}>Fecha de ingreso *</label>
            <input id="hireDate" name="hireDate" type="date" required className={inputClass} />
          </div>
          <div>
            <label htmlFor="jobTitle" className={labelClass}>Puesto *</label>
            <input id="jobTitle" name="jobTitle" required maxLength={450} className={inputClass} />
          </div>
          <div>
            <label htmlFor="departmentId" className={labelClass}>Departamento *</label>
            <select id="departmentId" name="departmentId" required defaultValue="" className={inputClass}>
              <option value="" disabled>Selecciona un departamento</option>
              {departments.filter((item) => item.active).map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="subdepartmentId" className={labelClass}>Subdepartamento</label>
            <select id="subdepartmentId" name="subdepartmentId" defaultValue="" className={inputClass}>
              <option value="">Sin subdepartamento</option>
              {subdepartments.filter((item) => item.active).map((subdepartment) => (
                <option key={subdepartment.id} value={subdepartment.id}>
                  {subdepartment.name} · {departments.find((department) => department.id === subdepartment.departmentId)?.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-neutral-dark">El sistema valida que pertenezca al departamento seleccionado.</p>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="directManagerEmployeeNumber" className={labelClass}>Número de empleado del jefe directo</label>
            <input id="directManagerEmployeeNumber" name="directManagerEmployeeNumber" inputMode="numeric" pattern="[0-9]+" className={inputClass} />
          </div>
        </AdminForm>
      </section>
    </>
  );
}
