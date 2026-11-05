const iconPaths: Record<string, string[]> = {
  // Portapapeles con palomita
  "permisos-trabajo": ["M9 4h6v3H9z", "M9 5.5H7a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6.5a1 1 0 0 0-1-1h-2", "m9 14 2 2 4-4"],
  // Escudo
  administracion: ["M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6z", "m9.5 12 2 2 3.5-4"],
  // Personas
  contratistas: ["M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20", "M10 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3", "M15.5 5.2a3.5 3.5 0 0 1 0 6.6"],
  // Documento
  "mis-documentos": ["M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z", "M14 3v4h4", "M9 13h6M9 17h6"],
  // Código QR
  "acceso-qr": [
    "M4 4h6v6H4z",
    "M14 4h6v6h-6z",
    "M4 14h6v6H4z",
    "M7 7h.01M17 7h.01M7 17h.01",
    "M14 14h3v3h-3z",
    "M20 14v3M14 20h3M20 20h.01",
  ],
};

/** Icono decorativo de cada módulo de la pantalla de inicio. */
export function ModuleIcon({ slug }: { slug: string }) {
  const paths = iconPaths[slug] ?? iconPaths["permisos-trabajo"] ?? [];
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}
