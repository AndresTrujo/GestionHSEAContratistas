import type { PermissionCode } from "@/config/permisos";
import type { Session } from "@/lib/auth/sesion";

export interface AppModule {
  slug: string;
  title: string;
  description: string;
  href: string;
  /** Quién ve el módulo: empleados TFS, usuarios de proveedor o ambos. */
  audience: "EMPLEADO" | "PROVEEDOR" | "TODOS";
  /** Empleados: basta con tener alguno de estos permisos (si se indican). */
  employeePermissions?: PermissionCode[];
  /** Usuarios de proveedor: qué tipo de cuenta ve el módulo (administrador del proveedor o colaborador). */
  providerRole?: "ADMINISTRADOR" | "COLABORADOR";
}

export const appModules: AppModule[] = [
  {
    slug: "permisos-trabajo",
    title: "Permisos de trabajo",
    description: "Solicitud, autorización y cierre de permisos por tipo.",
    href: "/permisos-trabajo",
    audience: "TODOS",
    providerRole: "COLABORADOR",
  },
  {
    slug: "administracion",
    title: "Administración",
    description: "Roles, cargos de área y proveedores.",
    href: "/administracion",
    audience: "EMPLEADO",
    employeePermissions: ["roles:administrar", "organizacion:administrar", "contratistas:gestionar", "auditoria:ver"],
  },
  {
    slug: "contratistas",
    title: "Control de contratistas",
    description: "Personal y documentación de cada proveedor.",
    href: "/contratistas",
    audience: "TODOS",
    providerRole: "ADMINISTRADOR",
    employeePermissions: [
      "contratistas:gestionar",
      "contratistas:revisar_documentos",
      "contratistas:validar_medico",
      "contratistas:registrar_ingresos",
    ],
  },
  {
    slug: "mis-documentos",
    title: "Mi documentación",
    description: "Consulta tus documentos y el estatus de tu semáforo.",
    href: "/mis-documentos",
    audience: "PROVEEDOR",
    providerRole: "COLABORADOR",
  },
];

export function find_module(slug: string): AppModule | undefined {
  return appModules.find((appModule) => appModule.slug === slug);
}

export function is_module_visible(appModule: AppModule, session: Session): boolean {
  if (session.kind === "USUARIO_PROVEEDOR") {
    if (appModule.audience === "EMPLEADO") return false;
    if (appModule.providerRole === "ADMINISTRADOR") return session.isAdministrator;
    if (appModule.providerRole === "COLABORADOR") return !session.isAdministrator;
    return true;
  }
  if (appModule.audience === "PROVEEDOR") return false;
  const required = appModule.employeePermissions;
  if (!required || required.length === 0) return true;
  return required.some((permission) => session.permissions.includes(permission));
}
