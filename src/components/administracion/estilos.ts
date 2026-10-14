/**
 * Clases compartidas de las pantallas de administración (tokens de marca). Botones y campos miden al menos 44 px de
 * alto en pantallas táctiles; el foco usa el azul marino (contraste suficiente) además del borde.
 */
export const inputClass =
  "min-h-11 w-full rounded-lg border border-neutral-dark/60 bg-white px-3 py-2 text-base text-brand-navy placeholder:text-neutral-dark focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-cyan sm:min-h-10 sm:text-sm";
export const labelClass = "mb-1 block text-sm font-bold text-brand-navy";
export const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-green px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:brightness-95 focus-visible:outline-brand-navy disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10";
export const dangerButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-red-700 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10";
export const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-brand-navy px-4 py-2 text-sm font-bold text-brand-navy transition hover:bg-neutral-light/40 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10";
export const cardClass = "mb-6 rounded-xl border border-neutral-light bg-white p-5 shadow-sm";
export const tableClass = "w-full text-left text-sm";
export const thClass =
  "border-b-2 border-neutral-light bg-neutral-light/20 px-3 py-2 text-xs font-bold uppercase tracking-wide text-brand-navy";
export const tdClass = "border-b border-neutral-light/70 px-3 py-2.5 align-top";
