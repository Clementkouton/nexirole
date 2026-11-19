import type { MetadataRoute } from "next";

/**
 * PARTIE 4 — Robots.txt généré par Next.js.
 * Les pages publiques (/ , /pricing , /cv-builder) sont indexables ;
 * /api/ et les routes privées (/dashboard…) sont bloquées.
 *
 * ATTENTION : le fichier public/robots.txt doit être SUPPRIMÉ
 * (Next.js refuse le doublon app/robots.ts + public/robots.txt).
 */
export default function robots(): MetadataRoute.Robots {
  const base = "https://nexirole.vercel.app";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard",
          "/dashboard/",
          "/login",
          "/register",
          "/reset-password",
          "/forgot-password",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
