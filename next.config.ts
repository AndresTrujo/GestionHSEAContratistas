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
  // `mssql` y `tedious` (driver de SQL Server) usan requires dinámicos, `net` y `tls`: se cargan desde
  // node_modules (que el modo standalone copia), no se empaquetan.
  serverExternalPackages: ["mssql", "tedious"],
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