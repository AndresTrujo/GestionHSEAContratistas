import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Genera .next/standalone con server.js y solo las dependencias necesarias (despliegue en Azure).
  output: "standalone",
  allowedDevOrigins: [
    "10.10.16.36",
    "10.10.*.*",
    "*.devtunnels.ms",
    "*.*.devtunnels.ms",
  ],
  reactStrictMode: true,
  // `pg` usa módulos nativos de Node (fs, net, tls): se carga desde node_modules, no se empaqueta.
  serverExternalPackages: ["pg"],
  experimental: {
    // Los documentos de contratistas se suben con acciones de servidor (máx. 5 MB por archivo).
    serverActions: {
      bodySizeLimit: "6mb",
      allowedOrigins: [
        "localhost:3000",
        "10.10.16.36:3000",
        "*.devtunnels.ms",
        "*.*.devtunnels.ms",
        "tfs-hsea-bnhqc9g4bbhmcdg5.eastus-01.azurewebsites.net",
      ],
    },
  },
};

export default nextConfig;