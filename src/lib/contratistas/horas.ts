import type { EntryRecord } from "@/domain/contratistas";
import { get_date_mx } from "@/lib/data/identidad";

/**
 * Horas en planta, calculadas siempre desde la bitácora (entrada y salida de cada ingreso permitido): no se guardan
 * aparte, así el acumulado no puede desviarse de los registros y conserva su trazabilidad.
 */

export type HoursPeriod = "semana" | "mes";

/** Milisegundos entre la entrada y la salida; null si fue denegado o todavía está dentro. */
export function get_worked_ms(entry: Pick<EntryRecord, "result" | "enteredAt" | "exitedAt">): number | null {
  if (entry.result !== "PERMITIDO" || !entry.exitedAt) return null;
  const ms = new Date(entry.exitedAt).getTime() - new Date(entry.enteredAt).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/** "8 h 05 min", "42 min" o "0 min". */
export function format_duration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${String(minutes).padStart(2, "0")} min`;
}

/** Horas con dos decimales, para sumar o exportar ("8.25"). */
export function format_decimal_hours(ms: number): string {
  return (ms / 3_600_000).toFixed(2);
}

/** Lunes de la semana (YYYY-MM-DD) de una fecha YYYY-MM-DD. */
export function get_week_start(date: string): string {
  const base = new Date(`${date}T00:00:00Z`);
  const daysSinceMonday = (base.getUTCDay() + 6) % 7;
  base.setUTCDate(base.getUTCDate() - daysSinceMonday);
  return base.toISOString().slice(0, 10);
}

const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Clave y etiqueta del periodo al que pertenece una entrada (por la fecha de entrada, hora de Ciudad de México). */
export function get_period(enteredAt: string, period: HoursPeriod): { key: string; label: string } {
  const date = get_date_mx(enteredAt);
  if (period === "semana") {
    const start = get_week_start(date);
    const [year, month, day] = start.split("-");
    return { key: start, label: `Semana del ${day}/${month}/${year}` };
  }
  const [year, month] = date.split("-");
  return { key: `${year}-${month}`, label: `${monthNames[Number(month) - 1] ?? month} ${year}` };
}

export interface HoursSummary {
  employeeId: number;
  periodKey: string;
  periodLabel: string;
  /** Ingresos con salida registrada que suman horas. */
  sessions: number;
  totalMs: number;
}

/** Acumula las horas por colaborador y periodo; los ingresos sin salida o denegados no suman. */
export function summarize_hours(entries: EntryRecord[], period: HoursPeriod): HoursSummary[] {
  const summaries = new Map<string, HoursSummary>();
  for (const entry of entries) {
    const worked = get_worked_ms(entry);
    if (worked === null) continue;
    const { key, label } = get_period(entry.enteredAt, period);
    const mapKey = `${entry.providerEmployeeId}|${key}`;
    const current = summaries.get(mapKey) ?? {
      employeeId: entry.providerEmployeeId,
      periodKey: key,
      periodLabel: label,
      sessions: 0,
      totalMs: 0,
    };
    current.sessions += 1;
    current.totalMs += worked;
    summaries.set(mapKey, current);
  }
  return [...summaries.values()];
}
