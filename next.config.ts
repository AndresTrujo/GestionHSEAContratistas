import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    // Los documentos de contratistas se suben con acciones de servidor (máx. 10 MB por archivo).
    serverActions: {
      bodySizeLimit: "11mb",
      allowedOrigins: [
        "localhost:3000",
        "10.10.16.36:3000",
        "*.devtunnels.ms",
        "*.*.devtunnels.ms",
      ],
    },
  },
};

export default nextConfig;