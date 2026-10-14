/** Quién tiene la sesión abierta: nombre y, debajo, su número de empleado o su empresa. */
export interface Identity {
  name: string;
  detail: string;
}

function get_initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/** Avatar con iniciales y dos líneas de texto. `compact` deja solo el avatar (el texto va en el title). */
export function IdentityBadge({ identity, compact = false }: { identity: Identity; compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5" title={`${identity.name} · ${identity.detail}`}>
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-cyan text-sm font-bold text-brand-navy"
      >
        {get_initials(identity.name)}
      </span>
      <span className={`min-w-0 leading-tight ${compact ? "sr-only" : ""}`}>
        <span className="block max-w-48 truncate text-sm font-bold text-white">{identity.name}</span>
        <span className="block max-w-48 truncate text-xs text-brand-cyan">{identity.detail}</span>
      </span>
    </div>
  );
}
