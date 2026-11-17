/**
 * Auth.js v5 — configuration complète (runtime Node : Prisma + bcrypt ici).
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import type { Provider } from "next-auth/providers";

import { authConfig } from "./auth.config";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/auth-validations";

const providers: Provider[] = [
  Credentials({
    name: "Email et mot de passe",
    credentials: { email: { label: "Email" }, password: { label: "Mot de passe" } },
    authorize: async (credentials) => {
      // 1. Validation stricte des entrées (Zod) avant tout accès base.
      const parsed = loginSchema.safeParse(credentials);
      if (!parsed.success) return null;
      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({ where: { email } });

      // 2. Utilisateur inconnu OU compte Google sans mot de passe local :
      //    même traitement (pas de fuite d'information). Le message ciblé
      //    "utilisez Google" est géré dans loginAction (Server Action).
      if (!user?.passwordHash) return null;

      // 3. bcrypt — comparaison à coût constant.
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return null;

      return { id: user.id, name: user.name, email: user.email, image: user.image };
    },
  }),
  Google({
    clientId: process.env.AUTH_GOOGLE_ID,
    clientSecret: process.env.AUTH_GOOGLE_SECRET,
    // SÉCURITÉ (anti account-takeover) : la liaison automatique d'un compte
    // Google à un compte email/mot de passe EXISTANT est désactivée.
    allowDangerousEmailAccountLinking: false,
  }),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers,
  events: {
    // Un compte créé via Google : l'email est vérifié par Google → on le note.
    linkAccount: async ({ user }) => {
      if (user.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: { emailVerified: new Date() },
        });
      }
    },
  },
});