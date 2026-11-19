import type { MetadataRoute } from "next";

/**
 * PARTIE 4 — Plan du site pour l'indexation Google.
 * Racine canonique : https://nexirole.vercel.app
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://nexirole.vercel.app";
  const lastModified = new Date();

  return [
    {
      url: base,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/pricing`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${base}/cv-builder`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${base}/dashboard`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.5,
    },
  ];
}
