"use server";

import { createHmac, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
// NOTE : conservez le chemin d'import de prisma utilisé dans VOTRE fichier actuel
// (par exemple "@/lib/prisma", "@/db" ou "@/lib/db") si différent de celui-ci.
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

type ActionResult = {
  error?: string;
  success?: string;
  resetUrl?: string;
};

/* ------------------------------------------------------------------ */
/* Utilitaires internes                                                 */
/* ------------------------------------------------------------------ */

function isNextRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function credentialsErrorMessage(error: AuthError): string {
  if (error.type === "CredentialsSignin") {
    return "E-mail ou mot de passe incorrect.";
  }
  if (error.type === "OAuthAccountNotLinked") {
    return "Cet e-mail est déjà associé à une autre méthode de connexion. Utilisez Google ou votre mot de passe habituel.";
  }
  return "Une erreur est survenue lors de la connexion. Réessayez.";
}

/**
 * Accepte indifféremment : un FormData (formulaire / useActionState),
 * un objet { email, password, ... }, ou des arguments positionnels.
 */
function normalizeFields(args: unknown[], keys: string[]): Record<string, string> {
  for (const arg of args) {
    if (typeof FormData !== "undefined" && arg instanceof FormData) {
      const fromForm: Record<string, string> = {};
      for (const key of keys) {
        const value = arg.get(key);
        if (typeof value === "string") fromForm[key] = value;
      }
      return fromForm;
    }
  }
  for (const arg of args) {
    if (arg && typeof arg === "object") {
      const record = arg as Record<string, unknown>;
      const fromObject: Record<string, string> = {};
      for (const key of keys) {
        const value = record[key];
        if (typeof value === "string") fromObject[key] = value;
      }
      if (Object.keys(fromObject).length > 0) return fromObject;
    }
  }
  const strings = args.filter((arg): arg is string => typeof arg === "string");
  const fromStrings: Record<string, string> = {};
  keys.forEach((key, index) => {
    if (typeof strings[index] === "string") fromStrings[key] = strings[index];
  });
  return fromStrings;
}

function getAuthSecret(): string {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
}

function createResetToken(email: string): string {
  const payload = Buffer.from(
    JSON.stringify({ email, exp: Date.now() + RESET_TOKEN_TTL_MS }),
    "utf8"
  ).toString("base64url");
  const signature = createHmac("sha256", getAuthSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyResetToken(token: string): { email: string } | null {
  const secret = getAuthSecret();
  if (!secret || !token) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");

  const given = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (given.length !== expectedBuffer.length || !timingSafeEqual(given, expectedBuffer)) {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: unknown;
      exp?: unknown;
    };
    if (typeof data.email !== "string" || typeof data.exp !== "number") return null;
    if (data.exp < Date.now()) return null;
    return { email: data.email.toLowerCase() };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Actions publiques                                                    */
/* ------------------------------------------------------------------ */

export async function loginAction(...args: unknown[]): Promise<ActionResult> {
  const fields = normalizeFields(args, ["email", "password"]);
  const email = (fields.email || "").toLowerCase().trim();
  const password = fields.password || "";

  if (!email || !password) {
    return { error: "Veuillez renseigner votre e-mail et votre mot de passe." };
  }
  if (!EMAIL_REGEX.test(email)) {
    return { error: "Adresse e-mail invalide." };
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
    return {};
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    if (error instanceof AuthError) return { error: credentialsErrorMessage(error) };
    throw error;
  }
}

export async function registerAction(...args: unknown[]): Promise<ActionResult> {
  const fields = normalizeFields(args, ["name", "email", "password"]);
  const name = (fields.name || "").trim();
  const email = (fields.email || "").toLowerCase().trim();
  const password = fields.password || "";

  if (name.length < 2) return { error: "Le nom doit contenir au moins 2 caractères." };
  if (!EMAIL_REGEX.test(email)) return { error: "Adresse e-mail invalide." };
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return { error: "Le mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Un compte existe déjà avec cet e-mail. Connectez-vous." };
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  try {
    await prisma.user.create({ data: { name, email, password: hashedPassword } as never });
  } catch {
    try {
      await prisma.user.create({ data: { name, email, passwordHash: hashedPassword } as never });
    } catch {
      return { error: "Impossible de créer le compte pour le moment. Réessayez." };
    }
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
    return {};
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    // Le compte est créé : l'utilisateur pourra se connecter avec ses identifiants.
    return {};
  }
}

export async function forgotPasswordAction(...args: unknown[]): Promise<ActionResult> {
  const fields = normalizeFields(args, ["email"]);
  const email = (fields.email || "").toLowerCase().trim();

  if (!EMAIL_REGEX.test(email)) {
    return { error: "Veuillez saisir une adresse e-mail valide." };
  }

  const secret = getAuthSecret();
  if (!secret) {
    return { error: "Configuration serveur incomplète (AUTH_SECRET manquante). Contactez le support." };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Message identique que le compte existe ou non (anti-énumération d'e-mails).
  const genericSuccess =
    "Si un compte existe avec cet e-mail, un lien de réinitialisation vient d'être généré.";

  if (!user) {
    return { success: genericSuccess };
  }

  const token = createResetToken(email);
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto =
    headerList.get("x-forwarded-pro") ?? (host.startsWith("localhost") ? "http" : "https");
  const resetUrl = `${proto}://${host}/reset-password?token=${encodeURIComponent(token)}`;

  // Envoi d'e-mail pas encore branché : le lien est journalisé côté serveur
  // et renvoyé dans la réponse pour pouvoir terminer le flux en test.
  console.log(`[NexiRole] Lien de réinitialisation pour ${email} : ${resetUrl}`);

  return { success: genericSuccess, resetUrl };
}

export async function resetPasswordAction(...args: unknown[]): Promise<ActionResult> {
  const fields = normalizeFields(args, ["token", "resetToken", "password", "newPassword"]);
  const token = fields.token || fields.resetToken || "";
  const password = fields.password || fields.newPassword || "";

  if (!token) {
    return { error: "Lien de réinitialisation invalide. Demandez un nouveau lien." };
  }
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return { error: "Le mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre." };
  }

  const payload = verifyResetToken(token);
  if (!payload) {
    return { error: "Ce lien de réinitialisation est invalide ou a expiré. Demandez un nouveau lien." };
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  try {
    await prisma.user.update({
      where: { email: payload.email },
      data: { password: hashedPassword } as never,
    });
  } catch {
    try {
      await prisma.user.update({
        where: { email: payload.email },
        data: { passwordHash: hashedPassword } as never,
      });
    } catch {
      return { error: "Impossible de mettre à jour le mot de passe pour le moment. Réessayez." };
    }
  }

  return {
    success: "Mot de passe réinitialisé. Vous pouvez vous connecter avec votre nouveau mot de passe.",
  };
}