"use client";

import type { ReactNode } from "react";
import { AdminForm } from "@/components/administracion/AdminForm";
import { cardClass, inputClass, labelClass, secondaryButtonClass } from "@/components/administracion/estilos";
import type { ScannedPerson, ScanResult } from "@/lib/acceso/tipos";
import { register_entry_action, register_exit_action } from "@/lib/contratistas/acciones";

function format_time(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", dateStyle: "short", timeStyle: "short" }).format(
    new Date(iso),
  );
}

function PersonCard({ person }: { person: ScannedPerson }) {
  return (
    <div className="flex items-center gap-4">
      {person.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- la foto sale de una ruta protegida con sesión
        <img src={person.photoUrl} alt={`Fotografía de ${person.name}`} className="h-44 w-36 rounded-lg border border-neutral-light object-cover" />
      ) : (
        <div className="flex h-44 w-36 items-center justify-center rounded-lg border border-dashed border-neutral-dark text-center text-xs text-neutral-dark">
          Sin fotografía
        </div>
      )}
      <div className="min-w-0">
        <p className="text-2xl font-bold uppercase leading-tight text-brand-navy">{person.name}</p>
        <p className="text-neutral-dark">{person.jobTitle}</p>
        <p className="font-bold text-brand-navy">{person.company}</p>
      </div>
    </div>
  );
}

/** Franja de estado grande y con símbolo: el resultado se entiende de un vistazo y sin depender del color. */
export function StatusBanner({ tone, symbol, children }: { tone: "ok" | "error" | "info"; symbol: string; children: ReactNode }) {
  const style = {
    ok: "border-brand-green bg-green-50 text-green-900",
    error: "border-red-400 bg-red-50 text-red-900",
    info: "border-brand-cyan bg-cyan-50 text-brand-navy",
  }[tone];
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`mb-5 flex items-start gap-3 rounded-xl border-2 px-4 py-3 text-lg font-bold ${style}`}>
      <span aria-hidden="true" className="text-2xl leading-none">{symbol}</span>
      <span>{children}</span>
    </p>
  );
}

interface ScanResultViewProps {
  result: ScanResult;
  /** Lo que se escaneó (token o URL del QR); la salida lo vuelve a validar en el servidor. */
  scannedToken: string;
  /** Pie de la ficha: botón "Escanear otro QR" en el escáner, enlaces en la página que abre la cámara del teléfono. */
  footer: ReactNode;
}

/** Ficha que ve caseta tras escanear un QR: rechazo, registro de ingreso (con EPP) o registro de salida. */
export function ScanResultView({ result, scannedToken, footer }: ScanResultViewProps) {
  return (
    <section className={`${cardClass} mx-auto max-w-2xl`}>
      {result.kind === "RECHAZADO" && (
        <>
          <StatusBanner tone="error" symbol="✕">
            Acceso rechazado — {result.message}
          </StatusBanner>
          {result.person && <PersonCard person={result.person} />}
        </>
      )}

      {result.kind === "LISTO_ENTRADA" && (
        <>
          <StatusBanner tone="ok" symbol="✓">
            Semáforo verde — compara la fotografía con la persona y verifica su EPP.
          </StatusBanner>
          <PersonCard person={result.person} />
          <AdminForm action={register_entry_action} submitLabel="Registrar ingreso" className="mt-5">
            <input type="hidden" name="providerEmployeeId" value={result.person.employeeId} />
            <label className="mb-3 flex min-h-11 items-center gap-3 rounded-lg border border-neutral-light px-3 text-sm font-bold">
              <input type="checkbox" name="eppComplete" className="h-5 w-5" /> EPP completo verificado
            </label>
            <label htmlFor="notes" className={labelClass}>Observaciones (opcional)</label>
            <input id="notes" name="notes" className={inputClass} />
          </AdminForm>
        </>
      )}

      {result.kind === "LISTO_SALIDA" && (
        <>
          <StatusBanner tone="info" symbol="↩">
            QR validado — ya está dentro de planta (entró {format_time(result.enteredAt)}). Registra su salida.
          </StatusBanner>
          <PersonCard person={result.person} />
          <AdminForm action={register_exit_action} submitLabel="Registrar salida" className="mt-5">
            <input type="hidden" name="entryId" value={result.entryId} />
            <input type="hidden" name="token" value={scannedToken} />
          </AdminForm>
        </>
      )}

      {footer}
    </section>
  );
}

export function RescanButton({ on_rescan }: { on_rescan: () => void }) {
  return (
    <button type="button" onClick={on_rescan} className={`mt-5 ${secondaryButtonClass}`}>
      Escanear otro QR
    </button>
  );
}
