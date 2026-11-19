"use server";

// =============================================================================
// NexiRole — Server Actions d'authentification
// Fichier : src/app/actions/auth.ts
// Actions : registerAction, loginAction, forgotPasswordAction, resetPasswordAction
// =============================================================================

import { createHash, randomBytes } from "node:crypto";
import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/lib/auth";

export type AuthActionState = {
  error?: string;
  success?: string;
  resetUrl?: string; // renseigné uniquement en développement
} | null;

// -----------------------------------------------------------------------------
// Register
// -----------------------------------------------------------------------------
const registerSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères.").max(80),
  email: z.string().trim().toLowerCase().email("Adresse email invalide."),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
    .max(72, "Le mot de passe ne peut pas dépasser 72 caractères."),
});

export async function registerAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  const { name, email, password } = parsed.data;

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return { error: "Un compte existe déjà avec cette adresse email." };
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.create({
      data: { name, email, password: passwordHash },
    });
  } catch {
    return { error: "Impossible de créer le compte pour le moment. Réessayez." };
  }

  // Connexion automatique après inscription.
  // En cas de succès, signIn déclenche une redirection vers /dashboard :
  // l'erreur NEXT_REDIRECT est volontairement relancée pour que Next.js l'exécute.
  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error: "Compte créé, mais connexion automatique impossible. Connectez-vous manuellement.",
      };
    }
    throw error;
  }

  return { success: "Compte créé avec succès." };
}

// -----------------------------------------------------------------------------
// Login
// -----------------------------------------------------------------------------
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse email invalide."),
  password: z.string().min(1, "Mot de passe requis."),
});

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  try {
    await signIn("credentials", { ...parsed.data, redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Email ou mot de passe incorrect." };
    }
    throw error;
  }

  return null;
}

// -----------------------------------------------------------------------------
// Forgot password (demande de réinitialisation)
// -----------------------------------------------------------------------------
const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse email invalide."),
});

export async function forgotPasswordAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = forgotSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  const { email } = parsed.data;

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      // 1) Token aléatoire (256 bits d'entropie)
      const token = randomBytes(32).toString("hex");
      // 2) Stocker UNIQUEMENT le hash du token en base (le token clair n'est jamais persisté)
      const hashedToken = createHash("sha256").update(token).digest("hex");

      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetPasswordToken: hashedToken,
          resetPasswordExpiry: new Date(Date.now() + 60 * 60 * 1000), // valide 1 heure
        } as any,
      });

      const baseUrl =
        process.env.NEXTAUTH_URL ??
        process.env.AUTH_URL ??
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;

      // NOTE PRODUCTION : brancher ici un fournisseur d'email (Resend, Postmark...).
      // En attendant, le lien est journalisé côté serveur (visible dans les Vercel logs)
      // et retourné au client uniquement en développement.
      if (process.env.NODE_ENV === "production") {
        console.log(
          `[nexirole][forgot-password] Lien de réinitialisation pour ${email} : ${resetUrl}`,
        );
        return {
          success:
            "Si un compte existe pour cet email, un lien de réinitialisation vient d'être envoyé.",
        };
      }

      return {
        success: "Mode développement : utilisez le lien ci-dessous pour réinitialiser le mot de passe.",
        resetUrl,
      };
    }
  } catch {
    return { error: "Erreur serveur. Réessayez dans quelques instants." };
  }

  // Message identique que le compte existe ou non (anti-énumération d'emails)
  return {
    success:
      "Si un compte existe pour cet email, un lien de réinitialisation vient d'être envoyé.",
  };
}

// -----------------------------------------------------------------------------
// Reset password (validation du nouveau mot de passe)
// -----------------------------------------------------------------------------
const resetSchema = z.object({
  token: z.string().min(10, "Token manquant ou invalide."),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
    .max(72, "Le mot de passe ne peut pas dépasser 72 caractères."),
});

export async function resetPasswordAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  const { token, password } = parsed.data;
  const hashedToken = createHash("sha256").update(token).digest("hex");

  try {
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpiry: { gt: new Date() },
      } as any,
    });

    if (!user) {
      return { error: "Ce lien est invalide ou a expiré. Refaites une demande." };
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: passwordHash,
        resetPasswordToken: null,
        resetPasswordExpiry: null,
      } as any,
    });

    return { success: "Mot de passe réinitialisé avec succès. Vous pouvez vous connecter." };
  } catch {
    return { error: "Erreur serveur. Réessayez dans quelques instants." };
  }
}