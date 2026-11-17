import { z } from "zod";

// Politique de mot de passe : 8 caractères min, majuscule, minuscule,
// chiffre, caractère spécial. Utilisée côté client ET côté serveur.
export const passwordSchema = z
  .string()
  .min(8, "Minimum 8 caractères.")
  .max(72, "Maximum 72 caractères.")
  .regex(/[A-Z]/, "Ajoutez au moins une lettre majuscule.")
  .regex(/[a-z]/, "Ajoutez au moins une lettre minuscule.")
  .regex(/[0-9]/, "Ajoutez au moins un chiffre.")
  .regex(/[^A-Za-z0-9]/, "Ajoutez au moins un caractère spécial (ex : ! ? % &).");

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Nom trop court (2 caractères minimum).")
      .max(80, "Nom trop long."),
    email: z.string().trim().toLowerCase().email("Adresse email invalide."),
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
    token: z.string().min(1, "Token manquant."),
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