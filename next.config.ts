import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  typescript: {
    // Ne bloque pas le démarrage en cas d'erreur de typage mineure.
    ignoreBuildErrors: true,
  },
  // pdf-parse (lecture des CV côté serveur) et @react-pdf/renderer
  // doivent rester HORS du bundle côté serveur. Les nouveaux documents
  // PDF (CvPdfDocument, LetterPdfDocument, KitPdfDocument) sont chargés
  // uniquement côté client via des imports dynamiques dans src/lib/pdf-client.tsx :
  // aucune erreur SSR possible au `next build`.
  serverExternalPackages: ["pdf-parse", "@react-pdf/renderer"],
  // Tunnels de dev (VS Code Dev Tunnels) : servir les assets en mode dev.
  allowedDevOrigins: ["*.devtunnels.ms", "*.euw.devtunnels.ms"],
  // Server Actions à travers un tunnel : comparer l'origine du navigateur
  // à une liste élargie. "**" = un ou plusieurs sous-domaines.
  experimental: {
    serverActions: {
      allowedOrigins: ["**.devtunnels.ms", "localhost:3000"],
    },
  },
};

export default nextConfig;