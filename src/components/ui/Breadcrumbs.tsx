import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Ruta de navegación" className="mb-4 text-sm text-neutral-dark">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-2">
            {item.href ? (
              <Link href={item.href} className="rounded text-brand-navy underline underline-offset-2 hover:text-brand-navy-alt">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-bold text-brand-navy">
                {item.label}
              </span>
            )}
            {index < items.length - 1 && (
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m9 6 6 6-6 6" />
              </svg>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
