/** Se muestra al instante mientras carga la página siguiente, para que la navegación responda sin esperar a la BD. */
export default function AppLoading() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-4">
      <div className="h-4 w-48 rounded bg-neutral-light" />
      <div className="h-10 w-2/3 rounded bg-neutral-light" />
      <div className="h-40 rounded bg-neutral-light/60" />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
