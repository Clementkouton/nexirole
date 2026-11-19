// =============================================================================
// NexiRole — Configuration Auth.js / next-auth v5 (SOURCE UNIQUE DE VÉRITÉ)
// Fichier : src/lib/auth.ts
// Exports : authOptions, handlers, auth, signIn, signOut
// =============================================================================
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthConfig = {
  // Secret : AUTH_SECRET (v5) avec repli NEXTAUTH_SECRET (compatibilité v4)
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,

  // Obligatoire sur Vercel (hôte dynamique)
  trustHost: true,

  // Sessions JWT : aucun adapter Prisma requis
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 jours
  },

  pages: {
    signIn: "/login",
    error: "/login",
    newUser: "/register",
  },

  providers: [
    // ---------- Connexion email + mot de passe ----------
    Credentials({
      name: "Identifiants",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";

        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null; // compte créé via Google : pas de mot de passe local

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        return { id: user.id, name: user.name, email: user.email };
      },
    }),

    // ---------- Connexion Google (activée seulement si les clés existent) ----------
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],

  callbacks: {
    // ---------- JWT : charge plan / licence depuis la base ----------
    async jwt({ token, user, trigger }) {
      // 1) Connexion (credentials ou Google) : synchronisation avec la base
      if (user?.email) {
        const email = user.email.toLowerCase();
        const dbUser = await prisma.user.upsert({
          where: { email },
          update: {}, // ne jamais écraser un plan/licence existant
          create: {
            email,
            name: user.name ?? email.split("@")[0],
          },
        });

        token.id = dbUser.id;
        token.plan = dbUser.plan;
        token.licenseStatus = dbUser.licenseStatus;
        token.expiresAt = dbUser.expiresAt ? dbUser.expiresAt.toISOString() : null;
        token.searchesUsed = dbUser.searchesUsed;
        token.generationsUsed = dbUser.generationsUsed;
        return token;
      }

      // 2) session.update() : relecture de la base
      //    C'est ce qui rend le nouveau plan VISIBLE après un paiement Chariow.
      if (trigger === "update") {
        const dbUser = typeof token.id === "string"
          ? await prisma.user.findUnique({ where: { id: token.id } })
          : typeof token.email === "string"
            ? await prisma.user.findUnique({ where: { email: token.email.toLowerCase() } })
            : null;

        if (dbUser) {
          token.id = dbUser.id;
          token.plan = dbUser.plan;
          token.licenseStatus = dbUser.licenseStatus;
          token.expiresAt = dbUser.expiresAt ? dbUser.expiresAt.toISOString() : null;
          token.searchesUsed = dbUser.searchesUsed;
          token.generationsUsed = dbUser.generationsUsed;
        }
      }

      return token;
    },

    // ---------- Session : expose les champs métier au client ----------
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string | undefined) ?? (token.sub as string);
        (session.user as typeof session.user & { plan: string }).plan =
          (token.plan as string | undefined) ?? "FREE";
        session.user.licenseStatus =
          (token.licenseStatus as string | undefined) ?? "INACTIVE";
        session.user.expiresAt =
          (token.expiresAt as string | null | undefined) ?? null;
        session.user.searchesUsed = (token.searchesUsed as number | undefined) ?? 0;
        session.user.generationsUsed =
          (token.generationsUsed as number | undefined) ?? 0;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);