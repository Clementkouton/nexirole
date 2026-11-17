/**
 * Schémas Zod de l'authentification — utilisés CÔTÉ CLIENT (pré-validation)
 * et CÔTÉ SERVEUR (Server Actions). Source de vérité unique.
 */
import { z } from "zod";

/** Politique de mot de passe fort : 8+ caractères, majuscule, minuscule,
 * chiffre et caractère spécial (72 max = limite native de bcrypt). */
export const passwordSchema = z
  .string()
  .min(8, "8 caractères minimum.")
  .max(72, "72 caractères maximum.")
  .regex(/[A-Z]/, "Ajoutez au moins une majuscule.")
  .regex(/[a-z]/, "Ajoutez au moins une minuscule.")
  .regex(/[0-9]/, "Ajoutez au moins un chiffre.")
  .regex(/[^A-Za-z0-9]/, "Ajoutez au moins un caractère spécial (ex: ! ? %).");

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Votre nom doit contenir au moins 2 caractères.")
      .max(60, "60 caractères maximum."),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Adresse email invalide.")
      .max(255, "255 caractères maximum."),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse email invalide."),
  password: z.string().min(1, "Mot de passe requis."),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse email invalide."),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(32, "Token de réinitialisation manquant ou invalide."),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Transforme une erreur Zod en map { champ: premier message }. */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}