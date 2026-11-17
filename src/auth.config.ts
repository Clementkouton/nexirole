/**
 * Configuration Auth.js "edge-safe" : SANS Prisma (le proxy s'exécute
 * sur le runtime Edge). Complétée dans src/auth.ts (adaptateur + providers).
 */
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    // JWT obligatoire avec le provider Credentials. Durée : 7 jours.
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24, // rotation quotidienne du token
  },
  // Requis derrière un tunnel (VS Code Dev Tunnels) ou un proxy ; sur Vercel
  // l'hôte de confiance est géré automatiquement.
  trustHost: true,
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
      options: {
        // OWASP : cookie inaccessible en JS, jamais transmis en cross-site,
        // chiffré en production (HTTPS).
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  providers: [], // complété dans src/auth.ts (providers + adaptateur Prisma)
  callbacks: {
    /**
     * Autorisation appliquée par le proxy (src/proxy.ts).
     * - /dashboard/*        → réservé aux utilisateurs connectés
     * - /login et /register → un utilisateur déjà connecté est renvoyé
     *                          vers /dashboard.
     */
    authorized({ request, auth }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = Boolean(auth?.user);

      if (pathname.startsWith("/dashboard")) {
        return isLoggedIn;
      }
      if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }
      return true;
    },
    /** Copie l'identité dans le JWT à la connexion. */
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id ?? token.sub;
        token.name = user.name ?? token.name;
        token.email = user.email ?? token.email;
        token.picture = user.image ?? token.picture;
      }
      return token;
    },
    /** Expose session.user.id (utile pour les pages protégées). */
    session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;