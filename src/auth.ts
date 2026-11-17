import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import type { Provider } from "next-auth/providers";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";

// Hash fictif : égalise le temps de réponse quand l'utilisateur n'existe
// pas (protection contre l'énumération d'emails par analyse de timing).
const DUMMY_HASH = bcrypt.hashSync("nexirole-timing-equalizer", 12);

const providers: Provider[] = [
  Google({
    clientId: process.env.AUTH_GOOGLE_ID,
    clientSecret: process.env.AUTH_GOOGLE_SECRET,
    // SÉCURITÉ : valeur par défaut conservée (false). Auth.js refuse de lier
    // automatiquement un compte Google à un compte existant créé par mot de
    // passe => anti Account Takeover. L'utilisateur voit "OAuthAccountNotLinked".
  }),
  Credentials({
    credentials: { email: {}, password: {} },
    authorize: async (credentials) => {
      // 1. Validation serveur avec Zod
      const parsed = loginSchema.safeParse(credentials);
      if (!parsed.success) return null;

      const { email, password } = parsed.data;

      // 2. Recherche de l'utilisateur
      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
          passwordHash: true,
        },
      });

      // 3. Comparaison Bcrypt (temps constant même si l'email est inconnu)
      const passwordHash = user?.passwordHash ?? DUMMY_HASH;
      const isValid = await bcrypt.compare(password, passwordHash);

      if (!user || !user.passwordHash || !isValid) return null;

      // 4. passwordHash n'est JAMAIS renvoyé à la session
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
      };
    },
  }),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "user";
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.id === "string") session.user.id = token.id;
      if (typeof token.role === "string") session.user.role = token.role;
      return session;
    },
  },
});