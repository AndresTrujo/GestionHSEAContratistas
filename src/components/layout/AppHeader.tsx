import Link from "next/link";
import { logout_action } from "@/lib/auth/acciones";
import { IdentityBadge, type Identity } from "./IdentityBadge";
import { MainNav, type NavItem } from "./MainNav";

interface AppHeaderProps {
  /** Quién inició sesión. */
  identity: Identity;
  /** Secciones a las que tiene acceso esta persona. */
  navItems: NavItem[];
}

export function AppHeader({ identity, navItems }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-brand-navy text-white shadow-md">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
        <Link href="/inicio" className="mr-2 font-display text-lg uppercase leading-tight focus-visible:outline-white sm:text-xl">
          Gestión HSEA <span className="text-brand-cyan">Contratistas</span>
        </Link>

        <MainNav items={navItems} identity={identity} />

        <form action={logout_action} className="ml-auto flex items-center gap-3 text-sm">
          {/* Avatar solo en pantallas pequeñas; nombre y detalle desde lg. */}
          <div className="hidden lg:block">
            <IdentityBadge identity={identity} />
          </div>
          <div className="lg:hidden">
            <IdentityBadge identity={identity} compact />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-lg border border-white/40 px-3 font-bold hover:bg-white/10 focus-visible:outline-white md:min-h-10"
          >
            Salir
          </button>
        </form>
      </div>
    </header>
  );
}
