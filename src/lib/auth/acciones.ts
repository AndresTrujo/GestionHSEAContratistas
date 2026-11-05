"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safe_next_path, with_next } from "./destino";
import { get_client_address } from "./ip_cliente";
import { clear_login_failures, get_lockout_seconds, record_login_failure } from "./limite_intentos";
import { minPasswordLength } from "./secreto";
import { sessionCookieName, get_session } from "./sesion";
import { create_session_token, type SessionIdentity } from "./token_sesion";
import { sessionMaxAgeSeconds } from "@/config/seguridad";
import { ValidationError } from "@/lib/data/errores";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { log_server_event } from "@/lib/registro/registro_servidor";

function read_text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function start_session(identity: SessionIdentity): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, create_session_token(identity), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAgeSeconds,
  });
}

/**
 * Login de empleados TFS: solo número de empleado (sin contraseña, por decisión del proyecto),
 * pero ya se valida que exista y esté activo. La identidad queda en una cookie firmada.
 */
export async function login_employee_action(formData: FormData): Promise<void> {
  const nextPath = safe_next_path(formData.get("next"));
  const employeeNumber = read_text(formData, "employeeNumber");
  if (!employeeNumber) redirect(with_next("/login?error=required", nextPath));

  // Sin contraseña, el freno es por IP: cada número inválido o inactivo cuenta como intento fallido.
  const throttleKeys = [`empleado-ip:${await get_client_address()}`];
  const waitSeconds = get_lockout_seconds(throttleKeys);
  if (waitSeconds > 0) redirect(with_next(`/login?error=throttled&espera=${waitSeconds}`, nextPath));

  const repositories = get_repositories();
  const employee = /^\d{1,9}$/.test(employeeNumber) ? await repositories.employees.find_by_number(employeeNumber) : null;
  if (!employee || !employee.active) {
    const lockSeconds = record_login_failure(throttleKeys);
    if (lockSeconds > 0) {
      await log_server_event("WARN", "login", "Inicio de sesión de empleado bloqueado por intentos fallidos", {
        context: { clave: throttleKeys[0] ?? null, bloqueoSegundos: lockSeconds },
      });
      redirect(with_next(`/login?error=throttled&espera=${lockSeconds}`, nextPath));
    }
    redirect(with_next("/login?error=invalid_employee", nextPath));
  }

  clear_login_failures(throttleKeys);
  await start_session({ kind: "EMPLEADO", id: employee.employeeNumber });
  await repositories.audit.append_event({
    entityType: "empleados",
    entityId: employee.employeeNumber,
    action: "iniciar_sesion",
    actorType: "EMPLEADO",
    actorId: employee.employeeNumber,
    occurredAt: new Date().toISOString(),
    details: {},
  });
  redirect(nextPath ?? "/inicio");
}

/** Login de proveedores: usuario de 8 caracteres + contraseña. El repositorio cuenta los intentos y bloquea. */
export async function login_provider_action(formData: FormData): Promise<void> {
  const nextPath = safe_next_path(formData.get("next"));
  const username = read_text(formData, "username");
  const rawPassword = formData.get("password");
  const password = typeof rawPassword === "string" ? rawPassword : "";
  if (!username || !password) redirect(with_next("/login?tipo=proveedor&error=required", nextPath));

  // El freno cuenta por usuario (protege la cuenta) y por IP (frena el barrido de varios usuarios).
  const throttleKeys = [`proveedor-usuario:${username.toLowerCase()}`, `proveedor-ip:${await get_client_address()}`];
  const waitSeconds = get_lockout_seconds(throttleKeys);
  if (waitSeconds > 0) redirect(with_next(`/login?tipo=proveedor&error=throttled&espera=${waitSeconds}`, nextPath));

  const result = await get_repositories().providerUsers.login(username, password);
  if (!result.ok) {
    if (result.reason === "CREDENCIALES_INVALIDAS") {
      const lockSeconds = record_login_failure(throttleKeys);
      if (lockSeconds > 0) {
        await log_server_event("WARN", "login", "Inicio de sesión de proveedor bloqueado por intentos fallidos", {
          context: { usuario: username.toLowerCase(), bloqueoSegundos: lockSeconds },
        });
        redirect(with_next(`/login?tipo=proveedor&error=throttled&espera=${lockSeconds}`, nextPath));
      }
    }
    const errorByReason = {
      CREDENCIALES_INVALIDAS: "invalid_credentials",
      USUARIO_BLOQUEADO: "locked",
      USUARIO_INACTIVO: "inactive",
      PROVEEDOR_SUSPENDIDO: "suspended",
    } as const;
    redirect(with_next(`/login?tipo=proveedor&error=${errorByReason[result.reason]}`, nextPath));
  }

  clear_login_failures(throttleKeys);
  await start_session({ kind: "USUARIO_PROVEEDOR", id: String(result.user.id) });
  redirect(result.user.mustChangePassword ? "/cambiar-password" : (nextPath ?? "/inicio"));
}

/** Cambio de contraseña del usuario de proveedor en sesión (obligatorio tras recibir una temporal). */
export async function change_password_action(formData: FormData): Promise<void> {
  const session = await get_session();
  if (!session || session.kind !== "USUARIO_PROVEEDOR") redirect("/login?tipo=proveedor");

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");
  if (next.length < minPasswordLength) redirect("/cambiar-password?error=short");
  if (next !== confirmation) redirect("/cambiar-password?error=mismatch");

  try {
    await get_repositories().providerUsers.change_password(session.providerUserId, current, next);
  } catch (error) {
    if (error instanceof ValidationError) redirect("/cambiar-password?error=invalid");
    throw error;
  }
  redirect("/inicio");
}

export async function logout_action(): Promise<void> {
  const session = await get_session();
  if (session) {
    await get_repositories().audit.append_event({
      entityType: session.kind === "EMPLEADO" ? "empleados" : "usuarios_proveedor",
      entityId: session.kind === "EMPLEADO" ? session.employeeNumber : String(session.providerUserId),
      action: "cerrar_sesion",
      actorType: session.kind,
      actorId: session.kind === "EMPLEADO" ? session.employeeNumber : `P-${session.providerUserId}`,
      occurredAt: new Date().toISOString(),
      details: {},
    });
  }
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
  redirect("/login");
}
