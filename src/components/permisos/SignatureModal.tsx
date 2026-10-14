"use client";

import { useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";
import { primaryButtonClass, secondaryButtonClass } from "@/components/administracion/estilos";
import { pinLength, requireSigningPin } from "@/config/seguridad";

interface SignatureModalProps {
  /** Server action que recibe permitId, key y signatureImage (más los campos de children). */
  action: (formData: FormData) => Promise<void>;
  permitId: string;
  signatureKey: string;
  label: string;
  buttonLabel?: string;
  /** Campos extra del formulario que se muestran sobre el lienzo. */
  children?: ReactNode;
}

/** Botón "Firmar" que abre un modal con un lienzo para dibujar la firma. */
export function SignatureModal({
  action,
  permitId,
  signatureKey,
  label,
  buttonLabel = "Firmar",
  children,
}: SignatureModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const isDrawing = useRef(false);
  const [hasStrokes, set_has_strokes] = useState(false);

  function get_context(): CanvasRenderingContext2D | null {
    return canvasRef.current?.getContext("2d") ?? null;
  }

  function get_point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    };
  }

  function clear_canvas() {
    const canvas = canvasRef.current;
    get_context()?.clearRect(0, 0, canvas?.width ?? 0, canvas?.height ?? 0);
    set_has_strokes(false);
  }

  function open_modal() {
    clear_canvas();
    dialogRef.current?.showModal();
  }

  function handle_pointer_down(event: PointerEvent<HTMLCanvasElement>) {
    const context = get_context();
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, y } = get_point(event);
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#19243e";
    context.beginPath();
    context.moveTo(x, y);
    // Un toque sin movimiento deja un punto.
    context.lineTo(x + 0.01, y + 0.01);
    context.stroke();
    isDrawing.current = true;
    set_has_strokes(true);
  }

  function handle_pointer_move(event: PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return;
    const context = get_context();
    if (!context) return;
    const { x, y } = get_point(event);
    context.lineTo(x, y);
    context.stroke();
  }

  function handle_pointer_up() {
    isDrawing.current = false;
  }

  function prepare_submit() {
    if (imageInputRef.current && canvasRef.current) {
      imageInputRef.current.value = canvasRef.current.toDataURL("image/png");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open_modal}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-navy px-3 text-sm font-bold text-white transition hover:bg-brand-navy-alt sm:min-h-10"
      >
        {buttonLabel}
      </button>

      <dialog
        ref={dialogRef}
        className="m-auto w-[min(92vw,34rem)] rounded-2xl p-0 shadow-xl backdrop:bg-black/50"
      >
        <form action={action} onSubmit={prepare_submit} className="p-5">
          <input type="hidden" name="permitId" value={permitId} />
          <input type="hidden" name="key" value={signatureKey} />
          <input ref={imageInputRef} type="hidden" name="signatureImage" />

          <h2 className="mb-1 text-2xl uppercase">Firma digital</h2>
          <p className="mb-3 text-sm text-neutral-dark">{label}</p>

          {children}

          {requireSigningPin && (
            <label className="mb-3 block text-sm">
              <span className="mb-1 block font-bold">PIN de firma</span>
              <input
                name="pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                required
                minLength={pinLength}
                maxLength={pinLength}
                pattern={`\\d{${pinLength}}`}
                placeholder={`${pinLength} dígitos`}
                className="min-h-11 w-40 rounded-lg border border-neutral-dark/60 px-3 py-2 text-base focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-cyan sm:min-h-10"
              />
            </label>
          )}

          <canvas
            ref={canvasRef}
            width={600}
            height={240}
            onPointerDown={handle_pointer_down}
            onPointerMove={handle_pointer_move}
            onPointerUp={handle_pointer_up}
            onPointerCancel={handle_pointer_up}
            className="w-full touch-none rounded-lg border-2 border-dashed border-neutral-dark/60 bg-white"
            aria-label="Área de firma"
          />
          <p className="mt-1 text-xs text-neutral-dark">
            Dibuja tu firma dentro del recuadro.
          </p>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={clear_canvas} className={secondaryButtonClass}>
              Borrar
            </button>
            <button type="button" onClick={() => dialogRef.current?.close()} className={secondaryButtonClass}>
              Cancelar
            </button>
            <button type="submit" disabled={!hasStrokes} className={primaryButtonClass}>
              Confirmar firma
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
