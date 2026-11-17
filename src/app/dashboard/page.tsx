import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  IconBriefcase,
  IconFileText,
  IconMail,
  IconMessages,
  IconShieldCheck,
  IconSparkles,
} from "@tabler/icons-react";

import { auth } from "@/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";

export const metadata: Metadata = { title: "Dashboard | NexiRole" };

const FEATURES = [
  {
    icon: IconBriefcase,
    title: "Recherche d'offres",
    description: "Les offres Remotive et Arbeitnow adaptées à votre profil.",
    href: "#",
  },
  {
    icon: IconFileText,
    title: "Générateur de CV",
    description: "Un CV optimisé pour chaque offre, généré par l'IA.",
    href: "#",
  },
  {
    icon: IconMail,
    title: "Lettre de motivation",
    description: "Une lettre personnalisée en quelques secondes.",
    href: "#",
  },
  {
    icon: IconMessages,
    title: "Kit entretien",
    description: "Questions probables et réponses modèles pour réussir.",
    href: "#",
  },
];

export default async function DashboardPage() {
  // Double protection : le middleware filtre déjà, ici ceinture et bretelles
  const session = await auth();
  if (!session?.user) redirect("/login");

  const firstName = session.user.name?.split(" ")[0] ?? "cher utilisateur";

  return (
    <div className="min-h-screen bg-ice">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <img src="/logo.png" alt="NexiRole" className="h-8 w-8 rounded-lg object-cover" />
            <span className="text-lg font-bold text-navy">NexiRole</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 sm:inline-flex">
              <IconShieldCheck className="size-3.5" />
              {session.user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <section className="rounded-3xl bg-navy px-6 py-10 text-white sm:px-10">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-gold">
            <IconSparkles className="size-3.5" />
            Assisté par IA
          </div>
          <h1 className="mt-4 text-2xl font-bold sm:text-3xl">Bienvenue, {firstName}</h1>
          <p className="mt-2 max-w-xl text-sm text-white/70">
            Votre espace carrière sécurisé. Choisissez un outil pour continuer : recherche
            d'offres, CV, lettre de motivation ou préparation d'entretien.
          </p>
        </section>

        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <Link
              key={feature.title}
              href={feature.href}
              className="group rounded-3xl border border-slate-200 bg-white p-6 transition hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-200/60"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                <feature.icon className="size-6" />
              </div>
              <h2 className="mt-4 font-bold text-navy transition group-hover:text-gold">
                {feature.title}
              </h2>
              <p className="mt-1.5 text-sm text-slate-500">{feature.description}</p>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}