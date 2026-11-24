import type { SignerIdentity } from "@/domain/acceso";
import type { ActorId, ActorType } from "@/domain/auditoria";
import type { Employee } from "@/domain/organizacion";

/** Identidad del actor tal como se guarda en auditoría: "204692" o "P-17". */
export function get_signer_actor_id(signer: SignerIdentity): ActorId {
  return signer.kind === "EMPLEADO" ? signer.employeeNumber : `P-${signer.providerUserId}`;
}

export function get_signer_actor_type(signer: SignerIdentity): ActorType {
  return signer.kind;
}

export function is_same_signer(a: SignerIdentity, b: SignerIdentity): boolean {
  return get_signer_actor_id(a) === get_signer_actor_id(b);
}

export function get_employee_full_name(employee: Employee): string {
  return [
    employee.firstName,
    employee.middleName,
    employee.paternalSurname,
    employee.maternalSurname,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

/** Fecha (YYYY-MM-DD) de un instante en la zona horaria de Ciudad de México. */
export function get_date_mx(instant: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof instant === "string" ? new Date(instant) : instant);
}

/** Fecha de hoy (YYYY-MM-DD) en Ciudad de México, como hoy_mx() en la BD. */
export function get_today_mx(): string {
  return get_date_mx(new Date());
}

/** Suma meses a una fecha YYYY-MM-DD; si el día no existe en el mes destino, usa el último (como SQL Server). */
export function add_months_to_date(date: string, months: number): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const targetIndex = month - 1 + months;
  const lastDay = new Date(Date.UTC(year, targetIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, targetIndex, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

/** Hora local HH:mm de un instante en Ciudad de México. */
export function get_time_mx(instant: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(typeof instant === "string" ? new Date(instant) : instant);
}

/** Año calendario vigente en Ciudad de México. */
export function get_year_mx(instant: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", year: "numeric" }).format(instant));
}

/** Hora local (0-23) de un instante en Ciudad de México. */
export function get_hour_mx(instant: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", hour: "2-digit", hourCycle: "h23" }).format(instant));
}

/** Inicio del día YYYY-MM-DD en CDMX, convertido a instante UTC sin fijar un offset. */
export function get_start_of_day_mx(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("Fecha inválida; se esperaba YYYY-MM-DD");
  const target = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const difference = target - represented;
    if (difference === 0) return guess;
    guess += difference;
  }
  return guess;
}
