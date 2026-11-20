import type { NextAuthConfig } from "next-auth";

// ============================================================
// Configuration de base NextAuth v5 (compatible edge/middleware).
// Fusionnée dans src/auth.ts via ...authConfig.
// ============================================================

export const authConfig = {
  // Accepte localhost:3000 ET https://nexirole.vercel.app sans erreur de domaine
  trustHost: true,

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    // Sécurise TOUTES les redirections : URL relative ou même origine OK,
    // tout le reste (ex. devtunnels.ms) retombe sur /dashboard.
    redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      let origin = "";
      try {
        origin = new URL(url).origin;
      } catch {
        return `${baseUrl}/dashboard`;
      }
      const allowedOrigins = new Set([
        baseUrl,
        "https://nexirole.vercel.app",
        "http://localhost:3000",
      ]);
      if (allowedOrigins.has(origin)) return url;
      return `${baseUrl}/dashboard`;
    },

    // Aucune route bloquée au niveau middleware : l'interface protège
    // elle-même ses contenus (ex. /dashboard affiche « Se connecter »
    // quand la session est absente — comportement conservé à l'identique).
    authorized() {
      return true;
    },
  },

  providers: [], // providers réels déclarés dans src/auth.ts
} satisfies NextAuthConfig;