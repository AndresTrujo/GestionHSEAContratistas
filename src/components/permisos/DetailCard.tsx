import type { ReactNode } from "react";

export interface DetailItem {
  label: string;
  value: ReactNode;
  /** Ocupa las dos columnas. */
  wide?: boolean;
}

/** Datos del permiso en una tarjeta: pares etiqueta/valor en una lista de definición. */
export function DetailCard({ title, items }: { title?: string; items: DetailItem[] }) {
  return (
    <section className="mb-6 rounded-xl border border-neutral-light bg-white p-5 shadow-sm">
      {title && <h2 className="mb-3 text-2xl uppercase">{title}</h2>}
      <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className={item.wide ? "sm:col-span-2" : undefined}>
            <dt className="text-xs font-bold uppercase tracking-wide text-neutral-dark">{item.label}</dt>
            <dd className="mt-0.5 text-base">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
