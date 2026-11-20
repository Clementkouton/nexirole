import type { Metadata } from "next";
import { AppSignIn } from "@/components/ui/app-sign-in";

export const metadata: Metadata = {
  title: "Créer un compte — NexiRole",
  description:
    "Créez votre compte gratuit NexiRole : agent IA de recherche d'emploi, CV et lettres calibrés ATS, export PDF A4.",
};

export default function RegisterPage() {
  return <AppSignIn initialMode="register" />;
}