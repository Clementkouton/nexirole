import type { Metadata } from "next";
import { AppSignIn } from "@/components/ui/app-sign-in";

export const metadata: Metadata = {
  title: "Connexion — NexiRole",
  description:
    "Connectez-vous à votre espace candidat NexiRole : agent IA de recherche d'emploi, CV et lettres calibrés ATS, export PDF A4.",
};

export default function LoginPage() {
  return <AppSignIn initialMode="login" />;
}