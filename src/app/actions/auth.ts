"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export type AuthActionResult = { error?: string };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// NextAuth v5 signale une redirection (succès / navigation forcée) via une
// erreur interne dont le digest commence par NEXT_REDIRECT.
// Elle ne doit JAMAIS être interceptée par un catch : on la relance.
function isNextRedirectError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function credentialsErrorMessage(error: AuthError): string {
  switch (error.type) {
    case "CredentialsSignin":
      return "E-mail ou mot de passe incorrect.";
    case "OAuthAccountNotLinked":
      return "Cet e-mail est déjà lié à un autre mode de connexion. Connectez-vous avec votre mot de passe.";
    default:
      return "Connexion impossible pour le moment. Réessayez dans un instant.";
  }
}

// ── Connexion e-mail + mot de passe ─────────────────────────
export async function loginAction(email: string, password: string): Promise<AuthActionResult> {
  const normalizedEmail = email.toLowerCase().trim();
  if (!EMAIL_REGEX.test(normalizedEmail) || password.length === 0) {
    return { error: "Vérifiez votre e-mail et votre mot de passe." };
  }

  try {
    await signIn("credentials", { email: normalizedEmail, password, redirect: false });
  } catch (error) {
    // Ne jamais avaler une redirection Next (sinon la connexion n'aboutit pas)
    if (isNextRedirectError(error)) throw error;
    if (error instanceof AuthError) return { error: credentialsErrorMessage(error) };
    throw error;
  }

  return {}; // succès — la session est posée, le client redirige vers /dashboard
}

// ── Inscription + connexion automatique ─────────────────────
export async function registerAction(name: string, email: string, password: string): Promise<AuthActionResult> {
  const normalizedName = name.trim();
  const normalizedEmail = email.toLowerCase().trim();

  if (normalizedName.length < 2) {
    return { error: "Indiquez votre nom complet (2 caractères minimum)." };
  }
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return { error: "Adresse e-mail invalide." };
  }
  if (password.length < 8 || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return { error: "Mot de passe trop faible : 8 caractères, 1 majuscule et 1 chiffre minimum." };
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return { error: "Un compte existe déjà avec cet e-mail. Connectez-vous." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { name: normalizedName, email: normalizedEmail, password: passwordHash },
  });

  try {
    await signIn("credentials", { email: normalizedEmail, password, redirect: false });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    if (error instanceof AuthError) {
      // Compte créé mais connexion auto impossible : l'utilisateur se connecte manuellement
      return { error: "Compte créé ! Connectez-vous avec vos identifiants." };
    }
    throw error;
  }

  return {}; // succès — inscription + session en un seul passage
}