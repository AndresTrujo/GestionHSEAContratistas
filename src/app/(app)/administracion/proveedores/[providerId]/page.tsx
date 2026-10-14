import { notFound } from "next/navigation";
import { AdminForm } from "@/components/administracion/AdminForm";
import { inputClass, labelClass } from "@/components/administracion/estilos";
import { ProveedoresAccionDetalle } from "@/components/administracion/ProveedoresAccionDetalle";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { DisclosureCard } from "@/components/ui/DisclosureCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import { pinLength, requireSigningPin } from "@/config/seguridad";
import { find_contractor_type } from "@/config/tipos_contratista";
import type { ProviderStatus } from "@/domain/contratistas";
import {
  activate_pin_action,
  create_provider_user_action,
  reset_provider_password_action,
  revoke_pin_action,
  link_provider_user_employee_action,
  set_provider_user_active_action,
} from "@/lib/administracion/acciones";
import { format_date } from "@/lib/administracion/etiquetas";
import { require_employee_permission } from "@/lib/auth/guardas";
import { get_repositories } from "@/lib/data/proveedor_datos";

interface ProviderAdministrationPageProps {
  params: Promise<{ providerId: string }>;
}

const statusLabels: Record<ProviderStatus, string> = {
  ACTIVO: "Activo",
  SUSPENDIDO: "Suspendido",
  PENDIENTE_VALIDACION: "Pendiente de validación",
};

const statusTones: Record<ProviderStatus, BadgeTone> = {
  ACTIVO: "success",
  SUSPENDIDO: "danger",
  PENDIENTE_VALIDACION: "warning",
};

export default async function ProviderAdministrationPage({ params }: ProviderAdministrationPageProps) {
  const session = await require_employee_permission("contratistas:gestionar");
  const { providerId: rawProviderId } = await params;
  const providerId = Number(rawProviderId);
  if (!Number.isSafeInteger(providerId)) notFound();

  const repositories = get_repositories();
  const provider = await repositories.providers.get_provider(providerId);
  if (!provider) notFound();

  const actor = { kind: "EMPLEADO", employeeNumber: session.employeeNumber } as const;
  const [users, staff] = await Promise.all([
    repositories.providerUsers.list_users(providerId, actor),
    repositories.providerEmployees.list_employees(providerId),
  ]);
  const credentials = requireSigningPin
    ? await Promise.all(
        users.map((user) => repositories.credentials.get_credential({ kind: "USUARIO_PROVEEDOR", providerUserId: user.id })),
      )
    : [];
  const returnPath = `/administracion/proveedores/${providerId}`;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/inicio" },
          { label: "Administración", href: "/administracion" },
          { label: "Proveedores", href: "/administracion/proveedores" },
          { label: provider.name },
        ]}
      />
      <PageHeader
        title={provider.name}
        eyebrow={<StatusBadge tone={statusTones[provider.status]}>{statusLabels[provider.status]}</StatusBadge>}
        subtitle={
          <>
            {provider.taxId} · {provider.contactEmail} ·{" "}
            {provider.contractorTypes.map((code) => find_contractor_type(code)?.label ?? code).join(", ")}
          </>
        }
      />

      <section className="mb-6" aria-labelledby="cuentas-acceso">
        <h2 id="cuentas-acceso" className="mb-3 text-2xl uppercase">
          Cuentas de acceso
        </h2>
        {users.length === 0 ? (
          <p className="rounded-xl border border-neutral-light bg-white p-5 text-sm text-neutral-dark shadow-sm">
            Aún no tiene cuentas. Crea la primera abajo (debe ser administrador del proveedor).
          </p>
        ) : (
          <ul className="space-y-3">
            {users.map((user, index) => {
              const credential = credentials[index];
              return (
                <li key={user.id} className="rounded-xl border border-neutral-light bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-lg font-bold text-brand-navy">{user.name}</p>
                      <p className="text-sm text-neutral-dark">
                        {user.isAdministrator ? "Administrador" : "Usuario"}
                        {user.providerEmployeeId !== null && ` · colaborador ${user.providerEmployeeId}`}
                      </p>
                      <p className="mt-1 text-sm">
                        <span className="font-bold text-brand-navy">Usuario: </span>
                        <code>{user.username}</code>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={user.active ? "success" : "danger"}>{user.active ? "Activa" : "Inactiva"}</StatusBadge>
                      {requireSigningPin && (
                        <StatusBadge tone={credential ? "success" : "neutral"}>
                          {credential ? "PIN activo" : "Sin PIN"}
                        </StatusBadge>
                      )}
                    </div>
                  </div>
                  {(user.mustChangePassword || user.lockedUntil) && (
                    <div className="mt-2 space-y-1 text-sm">
                      {user.mustChangePassword && <p>Contraseña temporal pendiente de cambio</p>}
                      {user.lockedUntil && (
                        <p className="font-bold text-red-700">Bloqueada hasta {format_date(user.lockedUntil)}</p>
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex flex-col items-start gap-2 border-t border-neutral-light pt-4">
                    <ProveedoresAccionDetalle label="Ligar a un colaborador">
                      <AdminForm action={link_provider_user_employee_action} submitLabel="Guardar" variant="secondary" className="space-y-2">
                        <input type="hidden" name="providerId" value={provider.id} />
                        <input type="hidden" name="userId" value={user.id} />
                        <select
                          name="providerEmployeeId"
                          aria-label="Colaborador"
                          defaultValue={user.providerEmployeeId ?? ""}
                          className={inputClass}
                        >
                          <option value="">Ninguno (cuenta administrativa)</option>
                          {staff.map((member) => (
                            <option key={member.id} value={member.id}>
                              {[member.firstName, member.paternalSurname, member.maternalSurname].filter(Boolean).join(" ")}
                            </option>
                          ))}
                        </select>
                        <input name="reason" aria-label="Motivo" placeholder="Motivo (obligatorio)" required className={inputClass} />
                      </AdminForm>
                    </ProveedoresAccionDetalle>
                    <ProveedoresAccionDetalle label="Restablecer contraseña">
                      <AdminForm action={reset_provider_password_action} submitLabel="Restablecer" variant="secondary">
                        <input type="hidden" name="providerId" value={provider.id} />
                        <input type="hidden" name="userId" value={user.id} />
                      </AdminForm>
                    </ProveedoresAccionDetalle>
                    {requireSigningPin && (
                      <>
                        <ProveedoresAccionDetalle label={credential ? "Reiniciar PIN" : "Activar PIN"}>
                          <AdminForm action={activate_pin_action} submitLabel="Guardar PIN" className="space-y-2">
                            <input type="hidden" name="kind" value="USUARIO_PROVEEDOR" />
                            <input type="hidden" name="subject" value={user.id} />
                            <input type="hidden" name="returnPath" value={returnPath} />
                            <p className="text-xs text-neutral-dark">La propia persona teclea su PIN ({pinLength} dígitos).</p>
                            <input name="pin" aria-label="PIN" type="password" inputMode="numeric" autoComplete="off" maxLength={pinLength} required placeholder="PIN" className={inputClass} />
                            <input name="confirmPin" aria-label="Confirmar PIN" type="password" inputMode="numeric" autoComplete="off" maxLength={pinLength} required placeholder="Confirmar PIN" className={inputClass} />
                          </AdminForm>
                        </ProveedoresAccionDetalle>
                        {credential && (
                          <ProveedoresAccionDetalle label="Revocar PIN" tone="danger">
                            <AdminForm action={revoke_pin_action} submitLabel="Revocar PIN" variant="danger">
                              <input type="hidden" name="kind" value="USUARIO_PROVEEDOR" />
                              <input type="hidden" name="subject" value={user.id} />
                              <input type="hidden" name="returnPath" value={returnPath} />
                              <input name="reason" aria-label="Motivo" placeholder="Motivo (obligatorio)" required className={inputClass} />
                            </AdminForm>
                          </ProveedoresAccionDetalle>
                        )}
                      </>
                    )}
                    <ProveedoresAccionDetalle label={user.active ? "Eliminar cuenta" : "Reactivar cuenta"} tone={user.active ? "danger" : "default"}>
                      <AdminForm
                        action={set_provider_user_active_action}
                        submitLabel={user.active ? "Eliminar cuenta" : "Reactivar"}
                        variant={user.active ? "danger" : "primary"}
                      >
                        <p className="mb-2 text-xs text-neutral-dark">
                          {user.active
                            ? "La cuenta deja de poder entrar y su colaborador desaparece del listado de personal. El registro se conserva para trazabilidad y se puede reactivar."
                            : "La cuenta vuelve a poder entrar y su colaborador reaparece en el listado de personal."}
                        </p>
                        <input type="hidden" name="providerId" value={provider.id} />
                        <input type="hidden" name="userId" value={user.id} />
                        <input type="hidden" name="active" value={user.active ? "false" : "true"} />
                        <input name="reason" aria-label="Motivo" placeholder="Motivo (obligatorio)" required className={inputClass} />
                      </AdminForm>
                    </ProveedoresAccionDetalle>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <DisclosureCard
        title="Crear cuenta"
        description="El usuario se genera solo (2 letras del nombre, 2 del apellido paterno, 2 del materno y 2 dígitos) y la contraseña temporal se muestra una sola vez al crearla."
        defaultOpen={users.length === 0}
      >
        <AdminForm action={create_provider_user_action} submitLabel="Crear cuenta" className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="providerId" value={provider.id} />
          <div>
            <label htmlFor="firstName" className={labelClass}>Nombre</label>
            <input id="firstName" name="firstName" required className={inputClass} />
          </div>
          <div>
            <label htmlFor="paternalSurname" className={labelClass}>Apellido paterno</label>
            <input id="paternalSurname" name="paternalSurname" required className={inputClass} />
          </div>
          <div>
            <label htmlFor="maternalSurname" className={labelClass}>Apellido materno (opcional)</label>
            <input id="maternalSurname" name="maternalSurname" className={inputClass} />
          </div>
          <div>
            <label htmlFor="email" className={labelClass}>Correo de contacto (opcional)</label>
            <input id="email" name="email" type="email" className={inputClass} />
          </div>
          <div>
            <label htmlFor="providerEmployeeId" className={labelClass}>Colaborador al que pertenece (opcional)</label>
            <select id="providerEmployeeId" name="providerEmployeeId" className={inputClass} defaultValue="">
              <option value="">Ninguno (cuenta administrativa)</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {[member.firstName, member.paternalSurname, member.maternalSurname].filter(Boolean).join(" ")}
                </option>
              ))}
            </select>
          </div>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm">
            <input type="checkbox" name="isAdministrator" className="size-5 accent-brand-green" />
            Administrador del proveedor
          </label>
        </AdminForm>
      </DisclosureCard>
    </>
  );
}
