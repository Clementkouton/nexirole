"use server";

import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/validations/auth";

export type AuthState = { error?: string; success?: string } | null;

// Message générique anti-énumération : identique que l'email existe ou non
const GENERIC_RESET_MSG =
  "Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé. Vérifiez votre boîte de réception et vos spams.";

async function getClientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "local"
  );
}

// ─── INSCRIPTION ─────────────────────────────────────────────
export async function registerAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  // 1. Validation Zod côté serveur (jamais de confiance au client)
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  const { name, email, password } = parsed.data;

  // 2. Rate limiting : 5 inscriptions max / 15 min / IP
  const ip = await getClientIp();
  const rl = rateLimit(`register:${ip}`, 5, 15 * 60 * 1000);
  if (!rl.success) {
    return {
      error: `Trop de tentatives d'inscription. Réessayez dans ${Math.ceil(rl.retryAfterSec / 60)} minute(s).`,
    };
  }

  // 3. Email déjà utilisé ?
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return {
      error: "Un compte existe déjà avec cet email. Connectez-vous ou réinitialisez votre mot de passe.",
    };
  }

  // 4. Hachage Bcrypt coût 12 — le mot de passe en clair n'est jamais stocké
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await prisma.user.create({ data: { name, email, passwordHash } });
  } catch {
    // Course concurrente (double clic) : unicité de l'email violée
    return { error: "Un compte existe déjà avec cet email." };
  }

  // 5. Pas de session automatique après inscription : on passe par /login
  redirect("/login?registered=1");
}

// ─── CONNEXION ───────────────────────────────────────────────
export async function loginAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Email ou mot de passe invalide." };
  }

  const { email, password } = parsed.data;
  const ip = await getClientIp();

  // Rate limiting : 5 essais / 15 min par email ET 20 / 15 min par IP
  const rlEmail = rateLimit(`login:email:${email}`, 5, 15 * 60 * 1000);
  const rlIp = rateLimit(`login:ip:${ip}`, 20, 15 * 60 * 1000);
  if (!rlEmail.success || !rlIp.success) {
    const seconds = Math.max(
      !rlEmail.success ? rlEmail.retryAfterSec : 0,
      !rlIp.success ? rlIp.retryAfterSec : 0
    );
    return {
      error: `Trop de tentatives de connexion. Réessayez dans ${Math.ceil(seconds / 60)} minute(s).`,
    };
  }

  try {
    // En cas de succès, signIn lève une redirection NEXT_REDIRECT vers /dashboard
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) {
      // Message volontairement vague : aucun indice sur ce qui a échoué
      return { error: "Email ou mot de passe incorrect." };
    }
    throw error; // NEXT_REDIRECT et erreurs inattendues : on relance
  }

  return null;
}

// ─── MOT DE PASSE OUBLIÉ ─────────────────────────────────────
export async function forgotPasswordAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Veuillez saisir une adresse email valide." };
  }

  const { email } = parsed.data;
  const ip = await getClientIp();

  // Rate limiting : 3 demandes / heure / couple IP+email
  const rl = rateLimit(`forgot:${ip}:${email}`, 3, 60 * 60 * 1000);
  if (!rl.success) {
    // Réponse strictement identique au cas normal (anti-énumération)
    return { success: GENERIC_RESET_MSG };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  // Seuls les comptes avec mot de passe reçoivent un lien.
  // Les comptes Google-only n'ont rien à réinitialiser, mais la
  // réponse affichée reste identique.
  if (user?.passwordHash) {
    const rawToken = randomBytes(32).toString("hex"); // 256 bits d'entropie
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // expiration : 1 heure

    // Invalide les anciens tokens du même email
    await prisma.passwordResetToken.deleteMany({ where: { email } });
    await prisma.passwordResetToken.create({
      data: { email, token: tokenHash, expires },
    });

    const resetUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${rawToken}`;

    // PRODUCTION : remplacer ce log par un vrai envoi d'email
    // (Resend, Postmark, Nodemailer...). Le token brut n'est JAMAIS
    // stocké en base : seul son SHA-256 l'est.
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `\n[DEV] Lien de réinitialisation :\n${resetUrl}\n`
      );
    } else {
      console.log(
        `[forgot-password] Lien généré pour ${email} (service d'email non encore configuré).`
      );
    }
  }

  return { success: GENERIC_RESET_MSG };
}

// ─── RÉINITIALISATION DU MOT DE PASSE ────────────────────────
export async function resetPasswordAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  const { token, password } = parsed.data;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token: tokenHash },
  });

  if (!resetToken || resetToken.expires < new Date()) {
    return { error: "Ce lien est invalide ou a expiré. Veuillez refaire une demande." };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { email: resetToken.email },
    data: { passwordHash },
  });

  // Consomme le token : il ne peut plus être réutilisé
  await prisma.passwordResetToken.deleteMany({
    where: { email: resetToken.email },
  });

  redirect("/login?reset=1");
}