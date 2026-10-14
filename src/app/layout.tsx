import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Plataforma de gestión digital HSEA",
  description: "Permisos de trabajo y control de contratistas",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
