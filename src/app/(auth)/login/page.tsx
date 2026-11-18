import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Connexion — NexiRole" };

// Messages clairs pour les erreurs renvoyées par Auth.js
const OAUTH_ERRORS: Record<string, string> = {
  OAuthAccountNotLinked:
    "Un compte existe déjà avec cet email. Connectez-vous avec votre mot de passe : Google ne peut pas être lié automatiquement.",
  AccessDenied:
    "Connexion Google refusée. Réessayez ou connectez-vous avec votre mot de passe.",
  Configuration:
    "La connexion Google a échoué côté serveur. Vérifications : l'URI de redirection dans Google Console doit être EXACTEMENT « https://nexirole.vercel.app/api/auth/callback/google », la base de données doit être joignable et AUTH_SECRET définie sur Vercel, puis un Redeploy est nécessaire.",
  Verification:
    "Le lien de connexion a expiré ou a déjà été utilisé. Veuillez réessayer.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string; reset?: string; error?: string }>;
}) {
  const params = await searchParams;
  const oauthError = params.error ? OAUTH_ERRORS[params.error] : undefined;

  return (
    <LoginForm
      registered={params.registered === "1"}
      reset={params.reset === "1"}
      oauthError={oauthError}
    />
  );
}