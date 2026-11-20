import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
// NOTE : conservez le chemin d'import de prisma utilisé dans VOTRE fichier actuel
// (par exemple "@/lib/prisma", "@/db" ou "@/lib/db") si différent de celui-ci.
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    Google({
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string" ? credentials.email.toLowerCase().trim() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        // Champ de hachage tolérant : "password" OU "passwordHash" selon le schéma Prisma.
        const record = user as unknown as Record<string, unknown>;
        const storedHash =
          typeof record.password === "string" && record.password.length > 0
            ? record.password
            : typeof record.passwordHash === "string" && record.passwordHash.length > 0
              ? record.passwordHash
              : null;
        if (!storedHash) return null;

        const isValid = await bcrypt.compare(password, storedHash);
        if (!isValid) return null;

        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
  ],
});