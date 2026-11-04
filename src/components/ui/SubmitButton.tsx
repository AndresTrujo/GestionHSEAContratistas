"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

interface SubmitButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  /** Texto mientras el formulario se envía; sin él se conserva el texto y el botón solo se deshabilita. */
  pendingLabel?: string;
}

/**
 * Botón de envío para formularios con server action: se deshabilita mientras la acción corre, para
 * que un doble clic no cree dos permisos ni suba dos veces el mismo documento, y avisa que está trabajando.
 * Debe renderizarse dentro del `<form>` (usa `useFormStatus`).
 */
export function SubmitButton({ pendingLabel, children, disabled, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button {...props} type="submit" disabled={disabled || pending} aria-busy={pending}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
