import { AdminIcon } from "@/components/administracion/AdminIcon";
import { ServerErrorAlert } from "@/components/administracion/ServerErrorAlert";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { ModuleCard } from "@/components/ui/ModuleCard";
import { PageHeader } from "@/components/ui/PageHeader";
import type { PermissionCode } from "@/config/permisos";
import { require_employee_session } from "@/lib/auth/guardas";
import { alertWindowHours, count_recent_server_errors } from "@/lib/registro/alerta";

const sections: { title: string; description: string; href: string; permission: PermissionCode }[] = [
  {
    title: "Roles de firma",
    description: "Asignar y revocar roles con alcance y vigencia.",
    href: "/administracion/roles",
    permission: "roles:administrar",
  },
  {
    title: "Organización y cargos de área",
    description: "Gerentes y encargados por línea, departamento y subdepartamento.",
    href: "/administracion/organizacion",
    permission: "organizacion:administrar",
  },
  {
    title: "Auditoría",
    description: "Consultar quién hizo qué y cuándo: permisos, firmas, documentos, roles y accesos.",
    href: "/administracion/auditoria",
    permission: "auditoria:ver",
  },
  {
    title: "Registro del servidor",
    description: "Errores y avisos técnicos: fallos de peticiones, de la purga de archivos y bloqueos de acceso.",
    href: "/administracion/registro-servidor",
    permission: "auditoria:ver",
  },
  {
    title: "Proveedores",
    description: "Aprobar proveedores y gestionar las cuentas de acceso de su personal.",
    href: "/administracion/proveedores",
    permission: "contratistas:gestionar",
  },
];

export default async function AdministrationPage() {
  const session = await require_employee_session();
  const visible = sections.filter((section) => session.permissions.includes(section.permission));
  const recentErrors = session.permissions.includes("auditoria:ver") ? await count_recent_server_errors() : null;

  return (
    <>
      <Breadcrumbs items={[{ label: "Inicio", href: "/inicio" }, { label: "Administración" }]} />
      <PageHeader title="Administración" subtitle="Roles, organización, proveedores y consulta de auditoría." />
      {recentErrors !== null && recentErrors > 0 && (
        <ServerErrorAlert count={recentErrors} windowHours={alertWindowHours} showLink />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {visible.map((section) => (
          <ModuleCard
            key={section.href}
            title={section.title}
            description={section.description}
            href={section.href}
            icon={<AdminIcon slug={section.href.split("/").pop() ?? ""} />}
          />
        ))}
      </div>
    </>
  );
}
