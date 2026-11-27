import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plataforma de gestión digital HSEA",
  description: "Permisos de trabajo y control de contratistas",
  // Instalable en iPhone (pantalla de inicio): requisito de iOS para recibir notificaciones push.
  appleWebApp: { capable: true, title: "Gestión HSEA", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#19243E",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
