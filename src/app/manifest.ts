import type { MetadataRoute } from "next";

/**
 * Manifest de la app instalable. En iPhone las notificaciones push solo funcionan con la app agregada a la
 * pantalla de inicio (modo standalone, iOS 16.4+).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Plataforma de gestión digital HSEA",
    short_name: "Gestión HSEA",
    description: "Permisos de trabajo y control de contratistas",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#19243E",
    lang: "es",
    icons: [
      { src: "/iconos/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/iconos/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/iconos/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
