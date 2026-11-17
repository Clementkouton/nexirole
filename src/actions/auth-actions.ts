"use server";

/**
 * Server Actions d'authentification — toute la logique sensible côté serveur.
 *
 * Sécurité appliquée :
 *  - Validation Zod stricte de TOUTES les entrées (src/lib/auth-validations.ts)
 *  - Rate limiting sur chaque route sensible (anti force brute — OWASP)
 *  - bcrypt coût 12 (jamais de mot de passe en clair)
 *  - Token de réinitialisation : crypto.randomBytes + SHA-256 en base,
 *    expiration 1 h, jamais de révélation de l'existence d'un email
 *  - Anti account-takeover : messages différenciés compte Google vs local
 */
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { CredentialsSignin } from "@auth/core/errors";
import { signIn, signOut } from "@/auth";

import { prisma } from "@/lib/prisma";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  zodFieldErrors,
} from "@/lib/auth-validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/mail";

export interface FormState {
  status: "idle" | "error" | "success";
  /** Message global (bandeau d'erreur ou de succès). */
  message?: string;
  /** Erreurs par champ : { email: "Adresse email invalide." } */
  fieldErrors?: Record<string, string>;
}

const BCRYPT_COST = 12;
const RESET_TOKEN_TTL_MINUTES = 60;

function formDataToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/* ------------------------------------------------------------------ */
/*  Inscription                                                        */
/* ------------------------------------------------------------------ */

export async function registerAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const ip = getClientIp(await headers());
  const limit = rateLimit(`register:${ip}`, 5, 10 * 60_000);
  if (!limit.allowed) {
    return {
      status: "error",
      message: `Trop de tentatives. Réessayez dans ${limit.retryAfterSeconds} secondes.`,
    };
  }

  // 1. Validation Zod côté serveur (les valeurs brutes de FormData).
  const parsed = registerSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }
  const { name, email, password } = parsed.data;

  // 2. Unicité de l'email (comptes Google ET email/mot de passe).
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, accounts: { select: { provider: true } } },
  });
  if (existing) {
    const googleOnly = !existing.passwordHash && existing.accounts.length > 0;
    return {
      status: "error",
      message: googleOnly
        ? "Un compte existe déjà avec cet email via Google. Connectez-vous avec « Continuer avec Google »."
        : "Un compte existe déjà avec cet email. Connectez-vous ou réinitialisez votre mot de passe.",
    };
  }

  // 3. Hachage bcrypt (coût 12) — jamais de mot de passe en clair.
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  try {
    await prisma.user.create({
      data: { name, email, passwordHash },
    });
  } catch (error) {
    // Course concurrente sur l'unicité de l'email (P2002 = violation unique).
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return {
        status: "error",
        message: "Un compte existe déjà avec cet email. Connectez-vous.",
      };
    }
    console.error("[register]", error);
    return { status: "error", message: "Erreur inattendue. Réessayez." };
  }

  // 4. Connexion automatique puis redirection vers le dashboard.
  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch {
    // La connexion auto a échoué (rare) : on renvoie à la page de connexion.
    redirect("/login?registered=1");
  }
  redirect("/dashboard");
}

/* ------------------------------------------------------------------ */
/*  Connexion (email + mot de passe)                                   */
/* ------------------------------------------------------------------ */

export async function loginAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const ip = getClientIp(await headers());

  // 1. Rate limiting anti force brute : 5 essais / minute / IP et / email.
  const byIp = rateLimit(`login-ip:${ip}`, 5, 60_000);
  if (!byIp.allowed) {
    return {
      status: "error",
      message: `Trop de tentatives depuis votre connexion. Réessayez dans ${byIp.retryAfterSeconds} secondes.`,
    };
  }

  const parsed = loginSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }
  const { email, password } = parsed.data;

  const byEmail = rateLimit(`login-email:${email}`, 5, 60_000);
  if (!byEmail.allowed) {
    return {
      status: "error",
      message: `Trop de tentatives pour ce compte. Réessayez dans ${byEmail.retryAfterSeconds} secondes.`,
    };
  }

  // 2. Cas « compte créé via Google » → message d'aide précis (le compte
  //    n'a PAS de mot de passe local : on évite la boucle d'échecs).
  const user = await prisma.user.findUnique({
    where: { email },
    select: { passwordHash: true, accounts: { select: { provider: true } } },
  });
  if (user && !user.passwordHash && user.accounts.length > 0) {
    return {
      status: "error",
      message:
        "Ce compte a été créé avec Google. Utilisez le bouton « Continuer avec Google » pour vous connecter.",
    };
  }

  // 3. Authentification Auth.js (email OU mot de passe incorrect → même
  //    message générique : pas de fuite d'existence du compte).
  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof CredentialsSignin) {
      return { status: "error", message: "Email ou mot de passe incorrect." };
    }
    if (error instanceof AuthError) {
      console.error("[login] AuthError:", error.type);
      return {
        status: "error",
        message: "Connexion impossible pour le moment. Réessayez.",
      };
    }
    throw error; // NEXT_REDIRECT etc.
  }

  redirect("/dashboard");
}

/* ------------------------------------------------------------------ */
/*  Mot de passe oublié                                                */
/* ------------------------------------------------------------------ */

export async function forgotPasswordAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const ip = getClientIp(await headers());
  const limit = rateLimit(`forgot:${ip}`, 3, 10 * 60_000);
  if (!limit.allowed) {
    return {
      status: "error",
      message: `Trop de demandes. Réessayez dans ${limit.retryAfterSeconds} secondes.`,
    };
  }

  const parsed = forgotPasswordSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }
  const { email } = parsed.data;

  // RÉPONSE IDENTIQUE que l'email existe ou non (prévention de
  // l'énumération d'utilisateurs — OWASP).
  const GENERIC_SUCCESS =
    "Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé. Vérifiez votre boîte de réception (et vos spams).";

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { status: "success", message: GENERIC_SUCCESS };
  }

  // Invalide les anciens tokens de cet utilisateur (1 seul actif à la fois).
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

  // Token cryptographiquement sûr : 32 octets aléatoires (256 bits).
  // Seule l'empreinte SHA-256 est stockée — la base ne peut pas régénérer le lien.
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000);
  await prisma.passwordResetToken.create({
    data: { tokenHash: sha256(token), userId: user.id, expires },
  });

  const origin = await requestOrigin();
  const resetUrl = `${origin}/reset-password?token=${token}`;
  await sendPasswordResetEmail(email, resetUrl, RESET_TOKEN_TTL_MINUTES);

  return { status: "success", message: GENERIC_SUCCESS };
}

/* ------------------------------------------------------------------ */
/*  Réinitialisation du mot de passe                                   */
/* ------------------------------------------------------------------ */

export async function resetPasswordAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const ip = getClientIp(await headers());
  const limit = rateLimit(`reset:${ip}`, 5, 10 * 60_000);
  if (!limit.allowed) {
    return {
      status: "error",
      message: `Trop de tentatives. Réessayez dans ${limit.retryAfterSeconds} secondes.`,
    };
  }

  const parsed = resetPasswordSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }
  const { token, password } = parsed.data;

  // 1. Validation du token : empreinte SHA-256 + expiration 1 h.
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: sha256(token) },
  });
  if (!record || record.expires < new Date()) {
    return {
      status: "error",
      message: "Ce lien est invalide ou a expiré. Demandez un nouveau lien.",
    };
  }

  // 2. Mise à jour du mot de passe (bcrypt coût 12) + invalidation de
  //    TOUS les tokens de réinitialisation du compte.
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.deleteMany({ where: { userId: record.userId } }),
  ]);

  // 3. Redirection vers la connexion (message de succès via ?reset=1).
  redirect("/login?reset=1");
}

/* ------------------------------------------------------------------ */
/*  Déconnexion                                                        */
/* ------------------------------------------------------------------ */

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}