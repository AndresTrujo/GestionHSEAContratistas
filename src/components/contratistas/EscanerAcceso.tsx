"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { AdminForm } from "@/components/administracion/AdminForm";
import { cardClass, inputClass, labelClass, secondaryButtonClass } from "@/components/administracion/estilos";
import type { ScannedPerson, ScanResult } from "@/lib/acceso/tipos";
import { scan_access_token_action } from "@/lib/acceso/acciones";
import { register_entry_action, register_exit_action } from "@/lib/contratistas/acciones";

interface AccessScannerProps {
  /** Salida iniciada desde "Dentro de planta": solo vale el QR de ese colaborador. */
  expected?: { entryId: string; name: string } | null;
}

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
function StatusBanner({ tone, symbol, children }: { tone: "ok" | "error" | "info"; symbol: string; children: ReactNode }) {
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

/**
 * Escáner de caseta: lee el QR con la cámara (o con un lector USB, que escribe en el campo de texto), valida
 * en el servidor y muestra la ficha. Sirve para entrar y para salir: solo con semáforo verde se llega al registro de
 * ingreso (con verificación de EPP); amarillo, rojo o QR inválido se rebotan. La salida también exige el QR.
 */
export function AccessScanner({ expected = null }: AccessScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const busyRef = useRef(false);
  // Se guarda en una ref para que el bucle de la cámara (efecto) no dependa de props.
  const expectedEntryIdRef = useRef(expected?.entryId);
  const [result, set_result] = useState<ScanResult | null>(null);
  const [scannedToken, set_scanned_token] = useState("");
  const [cameraError, set_camera_error] = useState<string | null>(null);
  const [manualToken, set_manual_token] = useState("");
  const [pending, start_transition] = useTransition();

  function handle_token(token: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    set_scanned_token(token);
    start_transition(async () => {
      try {
        set_result(await scan_access_token_action(token, expectedEntryIdRef.current));
      } catch {
        set_result({ kind: "RECHAZADO", message: "No se pudo validar el QR. Intenta de nuevo." });
      }
    });
  }

  function handle_manual_submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = manualToken.trim();
    if (token) handle_token(token);
    set_manual_token("");
  }

  function reset() {
    busyRef.current = false;
    set_scanned_token("");
    set_result(null);
  }

  // La cámara se enciende mientras no haya un resultado en pantalla y se apaga al mostrarlo.
  useEffect(() => {
    if (result !== null) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let cancelled = false;

    // El decodificador solo se descarga al abrir la cámara (no pesa en el resto de la app).
    let decode: typeof import("jsqr").default | null = null;

    function scan_frame() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (cancelled || !video || !canvas) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA && !busyRef.current) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = decode?.(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
          if (code?.data) handle_token(code.data);
        }
      }
      frame = requestAnimationFrame(scan_frame);
    }

    async function start_camera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        set_camera_error("Este navegador no permite usar la cámara (requiere HTTPS). Usa el campo de texto con un lector.");
        return;
      }
      try {
        const [jsqrModule, mediaStream] = await Promise.all([
          import("jsqr"),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }),
        ]);
        decode = jsqrModule.default;
        stream = mediaStream;
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        set_camera_error(null);
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        frame = requestAnimationFrame(scan_frame);
      } catch {
        set_camera_error("No se pudo abrir la cámara. Revisa el permiso del navegador o usa el campo de texto con un lector.");
      }
    }

    void start_camera();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
    // handle_token solo usa refs y setters estables.
  }, [result]);

  if (result) {
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

        <button type="button" onClick={reset} className={`mt-5 ${secondaryButtonClass}`}>
          Escanear otro QR
        </button>
      </section>
    );
  }

  return (
    <section className={`${cardClass} mx-auto max-w-2xl`}>
      {expected && (
        <StatusBanner tone="info" symbol="↩">
          Salida de {expected.name}: escanea su QR para registrarla.
        </StatusBanner>
      )}

      <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-2xl bg-brand-navy">
        <video ref={videoRef} playsInline muted aria-label="Vista de la cámara" className="h-full w-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        {/* Marco de encuadre. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-8">
          <span className="absolute left-0 top-0 h-10 w-10 rounded-tl-xl border-l-4 border-t-4 border-brand-cyan" />
          <span className="absolute right-0 top-0 h-10 w-10 rounded-tr-xl border-r-4 border-t-4 border-brand-cyan" />
          <span className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-xl border-b-4 border-l-4 border-brand-cyan" />
          <span className="absolute bottom-0 right-0 h-10 w-10 rounded-br-xl border-b-4 border-r-4 border-brand-cyan" />
        </div>
        {pending && (
          <div className="absolute inset-0 flex items-center justify-center bg-brand-navy/70 text-lg font-bold text-white">Validando…</div>
        )}
      </div>

      <p className="mt-3 text-center text-sm text-neutral-dark" aria-live="polite">
        {pending ? "Validando el QR…" : "Centra el QR del colaborador dentro del marco."}
      </p>
      {cameraError && (
        <p role="alert" className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-center text-sm text-red-800">
          {cameraError}
        </p>
      )}

      <form onSubmit={handle_manual_submit} className="mt-6 border-t border-neutral-light pt-5">
        <label htmlFor="manual-token" className={labelClass}>
          ¿Usas un lector USB o falla la cámara?
        </label>
        <div className="flex flex-wrap gap-3">
          <input
            id="manual-token"
            value={manualToken}
            onChange={(event) => set_manual_token(event.target.value)}
            autoComplete="off"
            placeholder="Escanea o pega aquí el código"
            className={`${inputClass} min-w-64 flex-1`}
          />
          <button type="submit" className={secondaryButtonClass}>Validar</button>
        </div>
      </form>
    </section>
  );
}
