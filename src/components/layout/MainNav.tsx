"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { IdentityBadge, type Identity } from "./IdentityBadge";

export interface NavItem {
  href: string;
  label: string;
}

interface MainNavProps {
  items: NavItem[];
  /** Quién inició sesión; se muestra dentro del menú en pantallas pequeñas. */
  identity: Identity;
}

/** Cada opción centra su texto dentro de su propio recuadro. */
const linkBase =
  "flex min-h-11 items-center justify-center rounded-lg px-4 text-center text-sm font-bold transition focus-visible:outline-white md:min-h-10";

/**
 * Navegación principal: barra horizontal en pantallas medianas y grandes, y menú desplegable en celulares.
 * Marca la sección actual (aria-current) y se cierra al elegir una opción. En la pantalla de inicio no se muestra:
 * ahí las tarjetas ya son la navegación.
 */
export function MainNav({ items, identity }: MainNavProps) {
  const pathname = usePathname();
  const [open, set_open] = useState(false);

  if (pathname === "/inicio") return null;

  function is_active(href: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function get_link_class(href: string): string {
    return `${linkBase} ${is_active(href) ? "bg-white/15 text-white" : "text-white/85 hover:bg-white/10 hover:text-white"}`;
  }

  return (
    <>
      <nav aria-label="Navegación principal" className="hidden items-center gap-1 md:flex">
        {items.map((item) => (
          <Link key={item.href} href={item.href} aria-current={is_active(item.href) ? "page" : undefined} className={`${get_link_class(item.href)} min-w-28`}>
            {item.label}
          </Link>
        ))}
      </nav>

      <button
        type="button"
        onClick={() => set_open((current) => !current)}
        aria-expanded={open}
        aria-controls="menu-movil"
        className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/40 px-3 text-sm font-bold text-white hover:bg-white/10 focus-visible:outline-white md:hidden"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
        Menú
      </button>

      {open && (
        <nav id="menu-movil" aria-label="Navegación principal" className="absolute inset-x-0 top-full border-t border-white/20 bg-brand-navy-alt px-4 py-3 shadow-lg md:hidden">
          <div className="mb-3 border-b border-white/15 pb-3">
            <IdentityBadge identity={identity} />
          </div>
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => set_open(false)}
                  aria-current={is_active(item.href) ? "page" : undefined}
                  className={get_link_class(item.href)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}
