"use client";

import Link from "next/link";
import { useState } from "react";
import {
  IconArrowRight,
  IconCheck,
  IconConfetti,
  IconCrown,
  IconCurrencyDollar,
  IconLock,
  IconRocket,
  IconSparkles,
  IconWorld,
} from "@tabler/icons-react";

/**
 * PARTIE 1 — Page Tarifs /pricing avec sélecteur de devise FCFA / USD.
 * Les boutons d'achat redirigent vers les checkouts Chariow configurés dans
 * .env.local (NEXT_PUBLIC_CHARIOW_BOOST_URL / NEXT_PUBLIC_CHARIOW_PRO_URL)
 * en pré-remplissant ?email=... si l'utilisateur est connecté.
 */

type Currency = "FCFA" | "USD";

type PlanCard = {
  id: "FREE" | "BOOST" | "PRO";
  name: string;
  badge?: string;
  price: Record<Currency, string>;
  period: string;
  description: string;
  features: string[];
  icon: typeof IconRocket;
  highlighted?: boolean;
  buyUrl?: string;
};

const PLANS: PlanCard[] = [
  {
    id: "FREE",
    name: "Découverte",
    price: { FCFA: "0 FCFA", USD: "0 $" },
    period: "Gratuit, pour toujours",
    description: "Testez la puissance de l'IA NexiRole sans carte bancaire.",
    features: [
      "3 recherches en direct / mois",
      "2 dossiers complets par lien / mois",
      "2 templates ATS",
      "Scoring IA des offres",
    ],
    icon: IconSparkles,
  },
  {
    id: "BOOST",
    name: "Pass Boost",
    badge: "Le plus populaire",
    price: { FCFA: "4 500 FCFA", USD: "9,90 $" },
    period: "30 jours d'accès complet",
    description: "Pour accélérer une recherche d'emploi active dès maintenant.",
    features: [
      "Recherches en direct illimitées",
      "30 dossiers complets / mois",
      "4 templates ATS (avec / sans photo)",
      "Export PDF A4 prêt à envoyer",
      "Kit d'entretien IA sur chaque offre",
    ],
    icon: IconRocket,
    highlighted: true,
    buyUrl: process.env.NEXT_PUBLIC_CHARIOW_BOOST_URL,
  },
  {
    id: "PRO",
    name: "Carrière Pro",
    badge: "Meilleure valeur",
    price: { FCFA: "11 000 FCFA", USD: "24,90 $" },
    period: "90 jours — tout illimité",
    description: "Votre copilote carrière complet pendant 3 mois.",
    features: [
      "Tout illimité pendant 3 mois",
      "Traitement IA prioritaire",
      "Historique illimité de vos dossiers",
      "Suivi des candidatures intégré",
      "Support prioritaire NexiRole",
    ],
    icon: IconCrown,
    buyUrl: process.env.NEXT_PUBLIC_CHARIOW_PRO_URL,
  },
];

function buildCheckoutUrl(
  baseUrl: string | undefined,
  currency: Currency,
  email: string | null
): { href: string | null; title: string } {
  if (!baseUrl) return { href: null, title: "Checkout bientôt disponible" };
  try {
    const url = new URL(baseUrl);
    // Pré-remplissage du champ personnalisé email du compte NexiRole
    if (email) url.searchParams.set("email", email);
    // Monnaie demandée si le checkout Chariow la supporte
    url.searchParams.set("currency", currency === "FCFA" ? "XOF" : "USD");
    return { href: url.toString(), title: `Acheter — ${url.hostname}` };
  } catch {
    return { href: baseUrl, title: "Acheter" };
  }
}

export function PricingClient({
  email,
  currentPlan,
}: {
  email: string | null;
  currentPlan: "FREE" | "BOOST" | "PRO" | null;
}) {
  const [currency, setCurrency] = useState<Currency>("FCFA");

  return (
    <div className="bg-ice">
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        {/* En-tête */}
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-navy px-3 py-1 text-xs font-semibold text-gold">
            <IconConfetti className="size-3.5" />
            Tarifs NexiRole
          </div>
          <h1 className="mt-4 font-heading text-3xl font-bold text-navy sm:text-4xl">
            Investissez dans votre prochaine opportunité
          </h1>
          <p className="mt-3 text-base text-slate-600">
            CV, lettres de motivation et kits d&apos;entretien générés par l&apos;IA pour
            chaque offre. Payez une fois, avancez vite. Paiement sécurisé via{" "}
            <span className="font-semibold text-navy">Chariow</span>.
          </p>

          {/* Sélecteur de devise */}
          <div className="mt-6 inline-flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setCurrency("FCFA")}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                currency === "FCFA"
                  ? "bg-navy text-white"
                  : "text-slate-600 hover:text-navy"
              }`}
            >
              <IconWorld className="size-4" />
              FCFA
            </button>
            <button
              type="button"
              onClick={() => setCurrency("USD")}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                currency === "USD"
                  ? "bg-navy text-white"
                  : "text-slate-600 hover:text-navy"
              }`}
            >
              <IconCurrencyDollar className="size-4" />
              USD ($)
            </button>
          </div>
        </div>

        {/* Cartes de plans */}
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const checkout = plan.buyUrl
              ? buildCheckoutUrl(plan.buyUrl, currency, email)
              : { href: null, title: "" };
            const isCurrent = currentPlan === plan.id;

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-3xl border bg-white p-6 shadow-sm transition hover:shadow-lg sm:p-7 ${
                  plan.highlighted
                    ? "border-gold shadow-md shadow-amber-100 md:-translate-y-1"
                    : "border-slate-200"
                }`}
              >
                {plan.badge ? (
                  <span
                    className={`absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                      plan.highlighted
                        ? "bg-gold text-navy"
                        : "bg-navy text-gold"
                    }`}
                  >
                    {plan.badge}
                  </span>
                ) : null}

                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                      plan.highlighted ? "bg-gold/15 text-amber-600" : "bg-navy text-gold"
                    }`}
                  >
                    <Icon className="size-6" />
                  </span>
                  <h2 className="font-heading text-lg font-bold text-navy">
                    {plan.name}
                  </h2>
                </div>

                <div className="mt-5">
                  <p className="font-heading text-3xl font-bold text-navy">
                    {plan.price[currency]}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    {plan.period}
                  </p>
                </div>

                <p className="mt-3 text-sm text-slate-600">{plan.description}</p>

                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-slate-700">
                      <IconCheck
                        className={`mt-0.5 size-4 shrink-0 ${
                          plan.highlighted ? "text-amber-600" : "text-emerald-600"
                        }`}
                      />
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
                  {plan.id === "FREE" ? (
                    <Link
                      href={email ? "/dashboard" : "/register"}
                      className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-navy transition hover:bg-slate-50"
                    >
                      {email ? "Ouvrir le tableau de bord" : "Commencer gratuitement"}
                      <IconArrowRight className="size-4" />
                    </Link>
                  ) : checkout.href ? (
                    <a
                      href={checkout.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={checkout.title}
                      className={`flex h-11 w-full items-center justify-center gap-1.5 rounded-full px-5 text-sm font-semibold transition ${
                        plan.highlighted
                          ? "bg-navy text-white hover:bg-navy-800"
                          : "bg-navy text-white hover:bg-navy-800"
                      }`}
                    >
                      Acheter le {plan.name}
                      <IconArrowRight className="size-4" />
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      title="Configurez NEXT_PUBLIC_CHARIOW_BOOST_URL / NEXT_PUBLIC_CHARIOW_PRO_URL dans .env.local"
                      className="flex h-11 w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-full bg-slate-100 px-5 text-sm font-semibold text-slate-400"
                    >
                      Bientôt disponible
                    </button>
                  )}
                  {isCurrent ? (
                    <p className="mt-2 text-center text-xs font-semibold text-emerald-600">
                      Votre plan actuel
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bloc « Vous avez déjà une clé ? » */}
        <div className="mx-auto mt-10 flex max-w-2xl flex-col items-center gap-3 rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:flex-row sm:text-left">
          <IconLock className="size-8 shrink-0 text-navy" />
          <div className="flex-1">
            <p className="font-semibold text-navy">
              Vous avez déjà une clé de licence ?
            </p>
            <p className="text-sm text-slate-500">
              Activez-la en un clic depuis votre tableau de bord, bouton
              « Activer une clé de licence ».
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-navy px-5 text-sm font-semibold text-white transition hover:bg-navy-800"
          >
            Activer ma clé
            <IconArrowRight className="size-4" />
          </Link>
        </div>

        {/* Garanties */}
        <div className="mt-8 grid gap-4 text-center text-sm text-slate-500 sm:grid-cols-3">
          <p className="rounded-2xl border border-slate-200 bg-white p-4">
            Activation <span className="font-semibold text-navy">automatique</span> après paiement
          </p>
          <p className="rounded-2xl border border-slate-200 bg-white p-4">
            Paiement <span className="font-semibold text-navy">sécurisé</span> par Chariow
          </p>
          <p className="rounded-2xl border border-slate-200 bg-white p-4">
            Clé de secours activable <span className="font-semibold text-navy">manuellement</span>
          </p>
        </div>
      </main>
    </div>
  );
}
