const iconPaths: Record<string, string[]> = {
  // Llave
  roles: ["M14.5 9.5a4 4 0 1 1-7.9 1 4 4 0 0 1 7.9-1z", "m13 12 7 7", "m17 16 2-2", "m15 18 2-2"],
  // Organigrama
  organizacion: ["M10 3h4v4h-4z", "M3 17h4v4H3z", "M17 17h4v4h-4z", "M12 7v5", "M5 17v-5h14v5"],
  // Lupa sobre documento
  auditoria: ["M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h5", "M14 3v4h4v2", "M9 12h5M9 16h2", "M17 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z", "m19 18.5 2 2"],
  // Terminal
  "registro-servidor": ["M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", "m7 10 3 2-3 2", "M12 15h5"],
  // Edificio
  proveedores: ["M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16", "M14 10h5a1 1 0 0 1 1 1v10", "M3 21h18", "M8 8h2M8 12h2M8 16h2"],
};

/** Icono decorativo de cada sección de Administración. */
export function AdminIcon({ slug }: { slug: string }) {
  const paths = iconPaths[slug] ?? iconPaths.roles ?? [];
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}
