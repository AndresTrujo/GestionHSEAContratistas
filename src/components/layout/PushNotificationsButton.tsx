"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { remove_push_subscription, save_push_subscription } from "@/lib/notificaciones/acciones";

type PushState = "loading" | "unsupported" | "ios_install" | "denied" | "off" | "on";

interface PushNotificationsButtonProps {
  /** Llave pública VAPID (base64url) para suscribir el dispositivo. */
  vapidPublicKey: string;
}

/** La llave VAPID viaja en base64url; el navegador la pide como bytes. */
function url_base64_to_bytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function is_ios(): boolean {
  // iPadOS se presenta como Mac; se distingue por la pantalla táctil.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function is_standalone(): boolean {
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return legacy || window.matchMedia("(display-mode: standalone)").matches;
}

function is_push_supported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function to_input(subscription: PushSubscription) {
  const keys = subscription.toJSON().keys ?? {};
  return { endpoint: subscription.endpoint, p256dh: keys.p256dh ?? "", auth: keys.auth ?? "" };
}

const stateLabels: Record<PushState, string> = {
  loading: "Notificaciones",
  unsupported: "Notificaciones no disponibles",
  ios_install: "Notificaciones: instala la app",
  denied: "Notificaciones bloqueadas",
  off: "Notificaciones desactivadas",
  on: "Notificaciones activadas",
};

/**
 * Campana del encabezado: activa o desactiva los avisos push de firmas pendientes en este dispositivo.
 * En iPhone explica cómo agregar la app a la pantalla de inicio (sin eso iOS no permite push).
 */
export function PushNotificationsButton({ vapidPublicKey }: PushNotificationsButtonProps) {
  const [state, set_state] = useState<PushState>("loading");
  const [isOpen, set_is_open] = useState(false);
  const [isBusy, set_is_busy] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const refresh_state = useCallback(async () => {
    if (!is_push_supported()) {
      set_state(is_ios() && !is_standalone() ? "ios_install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      set_state("denied");
      return;
    }
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const subscription = await registration.pushManager.getSubscription();
    if (subscription && Notification.permission === "granted") {
      // Si el dispositivo es compartido, la suscripción pasa a quien tiene la sesión ahora.
      const result = await save_push_subscription(to_input(subscription));
      set_state(result.ok ? "on" : "off");
      return;
    }
    set_state("off");
  }, []);

  useEffect(() => {
    refresh_state().catch(() => set_state("unsupported"));
  }, [refresh_state]);

  useEffect(() => {
    if (!isOpen) return;
    function close_on_outside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) set_is_open(false);
    }
    function close_on_escape(event: KeyboardEvent) {
      if (event.key === "Escape") set_is_open(false);
    }
    document.addEventListener("mousedown", close_on_outside);
    document.addEventListener("keydown", close_on_escape);
    return () => {
      document.removeEventListener("mousedown", close_on_outside);
      document.removeEventListener("keydown", close_on_escape);
    };
  }, [isOpen]);

  async function enable_notifications() {
    set_is_busy(true);
    set_error(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        set_state(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: url_base64_to_bytes(vapidPublicKey),
        }));
      const result = await save_push_subscription(to_input(subscription));
      if (!result.ok) {
        set_error("No se pudo registrar este dispositivo. Intenta de nuevo.");
        return;
      }
      set_state("on");
    } catch {
      set_error("No se pudieron activar las notificaciones en este dispositivo.");
    } finally {
      set_is_busy(false);
    }
  }

  async function disable_notifications() {
    set_is_busy(true);
    set_error(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await remove_push_subscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      set_state("off");
    } catch {
      set_error("No se pudieron desactivar las notificaciones.");
    } finally {
      set_is_busy(false);
    }
  }

  const needsAttention = state === "off" || state === "ios_install";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => set_is_open((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={stateLabels[state]}
        title={stateLabels[state]}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/40 hover:bg-white/10 focus-visible:outline-white md:h-10 md:w-10"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          {(state === "denied" || state === "unsupported") && <path d="M3 3l18 18" />}
        </svg>
        {state === "on" && (
          <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-brand-navy bg-brand-green" />
        )}
        {needsAttention && (
          <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-brand-navy bg-brand-cyan" />
        )}
      </button>

      {isOpen && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notificaciones de firmas"
          className="absolute right-0 top-full z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl bg-white p-4 text-sm text-neutral-dark shadow-xl ring-1 ring-neutral-light"
        >
          <h2 className="font-display text-base uppercase text-brand-navy">Notificaciones</h2>

          {state === "loading" && <p className="mt-2">Revisando este dispositivo…</p>}

          {state === "unsupported" && (
            <p className="mt-2">Este navegador no admite notificaciones push. Usa Chrome, Edge o Safari actualizados.</p>
          )}

          {state === "ios_install" && (
            <div className="mt-2 space-y-2">
              <p>En iPhone los avisos solo llegan si la app está en tu pantalla de inicio:</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>
                  Abre esta página en <strong>Safari</strong> y toca <strong>Compartir</strong> (el cuadro con la flecha).
                </li>
                <li>
                  Elige <strong>Agregar a pantalla de inicio</strong>.
                </li>
                <li>Abre la app desde el ícono nuevo y activa aquí las notificaciones.</li>
              </ol>
              <p className="text-xs">Requiere iOS 16.4 o posterior.</p>
            </div>
          )}

          {state === "denied" && (
            <p className="mt-2">
              Bloqueaste las notificaciones para este sitio. Permítelas en la configuración del navegador (o del
              teléfono) y vuelve a abrir la app.
            </p>
          )}

          {state === "off" && (
            <div className="mt-2 space-y-3">
              <p>Recibe un aviso en este dispositivo cuando un permiso necesite tu firma o cambie de estado.</p>
              <button
                type="button"
                onClick={enable_notifications}
                disabled={isBusy}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-navy px-4 font-bold text-white hover:bg-brand-navy-alt disabled:opacity-60"
              >
                {isBusy ? "Activando…" : "Activar notificaciones"}
              </button>
            </div>
          )}

          {state === "on" && (
            <div className="mt-2 space-y-3">
              <p>Las notificaciones están activadas en este dispositivo.</p>
              <button
                type="button"
                onClick={disable_notifications}
                disabled={isBusy}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-neutral-light px-4 font-bold text-brand-navy hover:bg-neutral-light/30 disabled:opacity-60"
              >
                {isBusy ? "Desactivando…" : "Desactivar en este dispositivo"}
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-800">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
