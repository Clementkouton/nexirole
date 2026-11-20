import crypto from "crypto";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

// Vérifie le mot de passe selon le format réellement stocké en base
async function verifyStoredPassword(password: string, storedRaw: string): Promise<boolean> {
  const stored = storedRaw.trim();

  // 1) bcrypt / bcryptjs ($2a$, $2b$, $2y$) — format standard
  if (/^\$2[aby]\$/.test(stored)) {
    try {
      return await bcrypt.compare(password, stored);
    } catch {
      return false;
    }
  }

  // 2) SHA-256 hexadécimal (64 caractères) — possible avec l'ancien code
  if (/^[0-9a-f]{64}$/i.test(stored)) {
    const candidate = crypto.createHash("sha256").update(password, "utf8").digest("hex");
    return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(stored.toLowerCase()));
  }

  // 3) Format inconnu (peut-être stocké en clair par l'ancien code) — récupération
  console.warn("[Auth][Credentials] Format de hash non reconnu — comparaison directe temporaire");
  return stored === password;
}

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
          typeof credentials?.email === "string"
            ? credentials.email.toLowerCase().trim()
            : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";

        if (!email || !password) {
          console.warn("[Auth][Credentials] ÉCHEC : e-mail ou mot de passe absent de la requête");
          return null;
        }

        console.log(`[Auth][Credentials] Tentative de connexion : ${email}`);

        // 1) Recherche exacte, puis insensible à la casse (anciens comptes)
        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          user = await prisma.user.findFirst({
            where: { email: { mode: "insensitive" } },
          });
          if (user) {
            console.log(`[Auth][Credentials] Trouvé avec une casse différente en base : ${user.email}`);
          }
        }
        if (!user) {
          console.warn(`[Auth][Credentials] ÉCHEC : utilisateur introuvable en base pour ${email}`);
          return null;
        }

        // 2) Mot de passe stocké — champ « password » ou « passwordHash » selon le schéma
        const record = user as unknown as Record<string, unknown>;
        const stored =
          typeof record.password === "string" && record.password.length > 0
            ? record.password
            : typeof record.passwordHash === "string" && record.passwordHash.length > 0
              ? record.passwordHash
              : null;

        if (!stored) {
          console.warn(
            `[Auth][Credentials] ÉCHEC : aucun mot de passe stocké pour ${email} (compte créé via Google ?)`
          );
          return null;
        }

        console.log(
          `[Auth][Credentials] Hash stocké : préfixe="${stored.slice(0, 10)}" longueur=${stored.length}`
        );

        // 3) Vérification selon le format détecté
        const isValid = await verifyStoredPassword(password, stored);
        console.log(
          `[Auth][Credentials] Résultat : ${isValid ? "OK — connexion autorisée" : "ÉCHEC — mot de passe différent du hash stocké"}`
        );
        if (!isValid) return null;

        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
  ],
});