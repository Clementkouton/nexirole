import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

// ============================================================
// NextAuth v5 — adapter Prisma + stratégie JWT.
// ============================================================

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,

  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },

  providers: [
    Google({
      // Permet à un utilisateur inscrit par e-mail/mot de passe de se
      // connecter aussi via Google (même adresse) sans OAuthAccountNotLinked.
      allowDangerousEmailAccountLinking: true,
    }),

    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.toLowerCase().trim()
            : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.password) return null;

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return null;

        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
  ],
});