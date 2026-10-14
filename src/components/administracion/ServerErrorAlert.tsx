"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface ServerErrorAlertProps {
  count: number;
  windowHours: number;
  /** Muestra el enlace al registro (en el propio registro no hace falta). */
  showLink?: boolean;
}

/**
 * Aviso de errores recientes del servidor que se puede ocultar. Queda oculto mientras dure la sesión del
 * navegador y vuelve a aparecer si el número de errores cambia.
 */
export function ServerErrorAlert({ count, windowHours, showLink = false }: ServerErrorAlertProps) {
  const storageKey = `hsea_server_error_alert_${count}`;
  const [hidden, set_hidden] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(storageKey) === "1") set_hidden(true);
    } catch {
      // Sin almacenamiento disponible: el aviso simplemente se muestra.
    }
  }, [storageKey]);

  function dismiss() {
    set_hidden(true);
    try {
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      // Sin almacenamiento: se oculta solo en esta vista.
    }
  }

  if (hidden) return null;

  return (
    <div
      role="alert"
      className="mb-5 flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
    >
      <span aria-hidden="true" className="text-lg font-bold leading-none">✕</span>
      <p className="flex-1">
        <strong>
          Hubo {count} error{count === 1 ? "" : "es"} del servidor
        </strong>{" "}
        en las últimas {windowHours} horas.{" "}
        {showLink && (
          <Link href="/administracion/registro-servidor" className="font-bold underline">
            Ver el registro
          </Link>
        )}
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Ocultar aviso"
        className="-my-2 -mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg font-bold hover:bg-red-100"
      >
        ×
      </button>
    </div>
  );
}
