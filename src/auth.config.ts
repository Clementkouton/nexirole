import type { NextAuthConfig } from "next-auth";

// Configuration utilisée par le middleware (runtime Edge).
// AUCUN import de Prisma ou bcrypt ici : non supportés sur l'Edge.
export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
  providers: [], // Providers réels déclarés dans src/auth.ts
  callbacks: {
    // Contrôle d'accès centralisé, exécuté par le middleware
    authorized({ request, auth }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;

      const isLoginPage = pathname.startsWith("/login");
      const isRegisterPage = pathname.startsWith("/register");
      const isAuthPage = isLoginPage || isRegisterPage;
      const isProtected = pathname.startsWith("/dashboard");

      // Déjà connecté : /login et /register renvoient vers /dashboard
      // (/forgot-password et /reset-password restent toujours accessibles)
      if (isAuthPage && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }

      // /dashboard et sous-pages : réservées aux utilisateurs connectés
      if (isProtected) {
        return isLoggedIn; // false => redirection automatique vers /login
      }

      return true;
    },
  },
} satisfies NextAuthConfig;