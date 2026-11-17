import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Connexion — NexiRole" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string; reset?: string }>;
}) {
  const params = await searchParams;

  // Messages issus des autres flux (inscription terminée, mot de passe modifié).
  const info =
    params.reset === "1"
      ? "Votre mot de passe a été mis à jour. Connectez-vous avec votre nouveau mot de passe."
      : params.registered === "1"
        ? "Votre compte a été créé. Connectez-vous pour accéder à votre espace."
        : null;

  return <LoginForm {...({ info } as any)} />;
}
