"use server";

import { get_session } from "@/lib/auth/sesion";
import { is_expected_error } from "@/lib/data/errores";
import { get_repositories } from "@/lib/data/proveedor_datos";
import { verify_access_token } from "./token_acceso";
import type { ScanResult } from "./tipos";

/**
 * Escaneo del QR en caseta. Valida la firma y revisa EN VIVO el estado del colaborador: solo el semáforo VERDE
 * (con fotografía vigente) deja continuar al registro de ingreso, donde caseta confirma el EPP. Un QR cuyo
 * colaborador está en amarillo o rojo se rebota y el intento queda en la bitácora como DENEGADO. Si el colaborador
 * ya está dentro, se ofrece registrar su salida (la salida no depende del semáforo).
 */
export async function scan_access_token_action(token: string, expectedEntryId?: string): Promise<ScanResult> {
  const session = await get_session();
  if (!session || session.kind !== "EMPLEADO" || !session.permissions.includes("contratistas:registrar_ingresos")) {
    return { kind: "RECHAZADO", message: "No tienes permiso para registrar ingresos." };
  }

  const employeeId = typeof token === "string" ? verify_access_token(token) : null;
  if (employeeId === null) return { kind: "RECHAZADO", message: "QR inválido: no fue emitido por este sistema." };

  const { providerEmployees, providers, entries } = get_repositories();
  const employee = await providerEmployees.get_employee(employeeId);
  if (!employee || !employee.active) {
    return { kind: "RECHAZADO", message: "El colaborador no existe o está dado de baja." };
  }
  const [provider, photo, semaphoreState, openEntries, hiddenEmployeeIds] = await Promise.all([
    providers.get_provider(employee.providerId),
    providerEmployees.get_current_photo(employeeId),
    providerEmployees.get_semaphore(employeeId),
    entries.list_open_entries(employee.providerId),
    get_repositories().providerUsers.list_employee_ids_with_inactive_account(employee.providerId),
  ]);
  // Con la cuenta eliminada (inactiva) el QR deja de valer, aunque el colaborador siga en la base.
  if (hiddenEmployeeIds.includes(employeeId)) {
    return { kind: "RECHAZADO", message: "La cuenta de este colaborador está inactiva: su QR ya no es válido." };
  }

  const person = {
    employeeId,
    name: [employee.firstName, employee.middleName, employee.paternalSurname, employee.maternalSurname].filter(Boolean).join(" "),
    jobTitle: employee.jobTitle,
    company: provider?.name ?? `Proveedor ${employee.providerId}`,
    photoUrl: photo ? `/api/colaboradores/${employeeId}/foto` : null,
  };

  // Salida iniciada desde "Dentro de planta": el QR debe ser del colaborador que va a salir.
  if (expectedEntryId) {
    const expected = (await entries.list_open_entries()).find((entry) => entry.id === expectedEntryId);
    if (!expected) return { kind: "RECHAZADO", message: "Ese ingreso ya no está abierto: la salida ya se registró.", person };
    if (expected.providerEmployeeId !== employeeId) {
      return { kind: "RECHAZADO", message: "Este QR no corresponde al colaborador que va a salir.", person };
    }
  }

  const open = openEntries.find((entry) => entry.providerEmployeeId === employeeId);
  if (open) return { kind: "LISTO_SALIDA", person, entryId: open.id, enteredAt: open.enteredAt };

  const semaphore = semaphoreState?.semaphore ?? "ROJO";
  if (semaphore !== "VERDE") {
    // El intento queda en la bitácora como DENEGADO (por el semáforo), igual que en el registro manual.
    try {
      await entries.register_entry(
        { providerEmployeeId: employeeId, eppComplete: false, notes: "Intento de acceso con QR" },
        session.employeeNumber,
      );
    } catch (error) {
      if (!is_expected_error(error)) throw error;
    }
    return { kind: "RECHAZADO", message: `Acceso denegado: el colaborador está en semáforo ${semaphore}.`, person };
  }
  if (!photo) {
    return { kind: "RECHAZADO", message: "El colaborador no tiene fotografía vigente: no se puede verificar su identidad.", person };
  }
  return { kind: "LISTO_ENTRADA", person };
}
