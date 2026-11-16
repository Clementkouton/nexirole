import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  typescript: {
    // Ne bloque pas le démarrage en cas d'erreur de typage mineure.
    ignoreBuildErrors: true,
  },
  // pdf-parse (lecture des CV) et @react-pdf/renderer (génération des PDF)
  // doivent rester hors du bundle côté serveur.
  serverExternalPackages: ["pdf-parse", "@react-pdf/renderer"],
  // Autorise les domaines de tunnels de développement (VS Code Dev Tunnels,
  // ngrok…) à accéder au serveur Next en mode dev.
  allowedDevOrigins: ["*.devtunnels.ms", "*.euw.devtunnels.ms"],
};

export default nextConfig;
