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
    // Contrôle d'accès centralisé, exécuté par le proxy
    authorized({ request, auth }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;

      const isLoginPage = pathname.startsWith("/login");
      const isRegisterPage = pathname.startsWith("/register");
      const isAuthPage = isLoginPage || isRegisterPage;
      const isProtected = pathname.startsWith("/dashboard");

      // REDIRECTION UNIQUEMENT SUR GET : les Server Actions arrivent en POST
      // sur la page où elles sont définies. Rediriger un POST provoque
      // l'erreur "Invalid Server Actions request".
      if (isAuthPage && isLoggedIn && request.method === "GET") {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }

      // /dashboard et sous-pages : réservées aux utilisateurs connectés
      if (isProtected) {
        return isLoggedIn;
      }

      return true;
    },
  },
} satisfies NextAuthConfig;