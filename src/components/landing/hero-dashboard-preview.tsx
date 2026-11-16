"use client";

import { useState } from "react";
import Link from "next/link";
import {
  IconBriefcase,
  IconChevronDown,
  IconTargetArrow,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

interface DemoOffer {
  id: string;
  title: string;
  company: string;
  location: string;
  score: number;
  strengths: string[];
  missing: string[];
  keywords: { word: string; matched: boolean }[];
}

const DEMO_OFFERS: DemoOffer[] = [
  {
    id: "senior-fe",
    title: "Senior Frontend Engineer",
    company: "Datawave",
    location: "Remote (Europe)",
    score: 87,
    strengths: [
      "5 ans d'expérience React confirmés",
      "Maîtrise TypeScript + design systems",
      "Expérience d'équipe distribuée",
    ],
    missing: ["GraphQL (comblable via projet perso)", "Tests E2E Playwright"],
    keywords: [
      { word: "React", matched: true },
      { word: "TypeScript", matched: true },
      { word: "Next.js", matched: true },
      { word: "GraphQL", matched: false },
      { word: "CI/CD", matched: true },
    ],
  },
  {
    id: "product-manager",
    title: "Product Manager — SaaS B2B",
    company: "Kolibri",
    location: "Paris — Hybride",
    score: 64,
    strengths: [
      "Solide culture produit tech",
      "Expérience de coordination d'équipes cross-fonctionnelles",
    ],
    missing: ["Pragmatic Institute cert.", "Gestion de roadmap B2B chiffrée"],
    keywords: [
      { word: "Roadmap", matched: false },
      { word: "SaaS", matched: true },
      { word: "Analytics", matched: true },
      { word: "SQL", matched: false },
      { word: "Discovery", matched: false },
    ],
  },
  {
    id: "fullstack",
    title: "Fullstack Developer (Node / React)",
    company: "Fintrust",
    location: "Remote — Mondial",
    score: 79,
    strengths: [
      "React + Node.js au cœur de votre CV",
      "API REST conçues et maintenues en production",
    ],
    missing: ["PostgreSQL avancé", "Kubernetes"],
    keywords: [
      { word: "Node.js", matched: true },
      { word: "React", matched: true },
      { word: "PostgreSQL", matched: false },
      { word: "Docker", matched: true },
      { word: "K8s", matched: false },
    ],
  },
];

function ScoreRing({ score }: { score: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  return (
    <div className="relative size-[132px] shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="10"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#ffc107"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-heading text-3xl font-extrabold text-navy tabular-nums transition-all duration-700">
          {score}
        </span>
        <span className="text-[11px] font-medium text-slate-500">/ 100</span>
      </div>
    </div>
  );
}

export function HeroDashboardPreview() {
  const [activeId, setActiveId] = useState(DEMO_OFFERS[0].id);
  const active = DEMO_OFFERS.find((o) => o.id === activeId)!;

  return (
    <div className="relative mx-auto mt-16 max-w-5xl px-4 sm:px-6">
      {/* Lueur décorative */}
      <div className="pointer-events-none absolute -inset-x-8 top-10 h-64 bg-[radial-gradient(ellipse_at_top,rgba(255,193,7,0.16),transparent_65%)]" />

      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-18px_rgba(5,25,55,0.18)]">
        {/* Barre de fenêtre */}
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <span className="size-2.5 rounded-full bg-slate-300" />
          <span className="size-2.5 rounded-full bg-slate-300" />
          <span className="size-2.5 rounded-full bg-slate-300" />
          <div className="ml-3 flex h-7 flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-400">
            <IconBriefcase className="size-3.5 text-slate-400" />
            nexirole.app/dashboard
          </div>
          <span className="rounded-full bg-gold-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent-foreground">
            Agent IA en direct
          </span>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[300px_1fr]">
          {/* Colonne gauche : liste d'offres scannées */}
          <div className="flex flex-col gap-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Offres scannées en direct
            </p>
            {DEMO_OFFERS.map((offer) => (
              <button
                key={offer.id}
                onClick={() => setActiveId(offer.id)}
                className={`group rounded-xl border p-3 text-left transition-all ${
                  offer.id === activeId
                    ? "border-navy/25 bg-navy/[0.04] shadow-[0_6px_18px_-8px_rgba(5,25,55,0.25)]"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
                aria-pressed={offer.id === activeId}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-navy">
                      {offer.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {offer.company} · {offer.location}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                      offer.score >= 80
                        ? "bg-gold-soft text-accent-foreground"
                        : offer.score >= 60
                          ? "bg-slate-100 text-navy"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {offer.score}%
                  </span>
                </div>
                <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gold transition-all duration-700 ease-out"
                    style={{ width: `${offer.score}%` }}
                  />
                </div>
              </button>
            ))}
            <div className="mt-1 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-200 py-2 text-[11px] text-slate-400">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-gold opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-gold-dark" />
              </span>
              Remotive · Arbeitnow — 47 nouvelles offres analysées
            </div>
          </div>

          {/* Colonne droite : analyse de l'offre sélectionnée */}
          <div className="rounded-xl border border-slate-200 bg-ice/60 p-5">
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <ScoreRing score={active.score} />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Score de compatibilité
                </p>
                <p className="mt-1 font-heading text-lg font-bold leading-snug text-navy">
                  {active.title}
                  <span className="block text-sm font-medium text-slate-500">
                    {active.company} — {active.location}
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-navy">
                  <IconTargetArrow className="size-3.5 text-gold-dark" />
                  Points forts détectés
                </p>
                <ul className="space-y-1.5">
                  {active.strengths.map((s) => (
                    <li key={s} className="flex gap-1.5 text-xs text-slate-600">
                      <IconChevronDown className="size-3.5 shrink-0 rotate-[-90deg] text-gold-dark" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-slate-500">
                  Mots-clés de l&apos;offre
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {active.keywords.map((kw) => (
                    <span
                      key={kw.word}
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-all duration-500 ${
                        kw.matched
                          ? "border-navy/10 bg-white text-navy"
                          : "border-dashed border-slate-300 bg-white text-slate-400 line-through decoration-slate-300"
                      }`}
                    >
                      {kw.word}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                  <span className="font-semibold text-navy">Conseil IA : </span>
                  intégrez les mots-clés barrés dans vos réalisations les plus
                  récentes pour franchir les filtres ATS.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button
                asChild
                size="sm"
                className="h-8 rounded-full bg-navy px-4 text-xs text-white hover:bg-navy-800"
              >
                <Link href="/dashboard">Générer CV &amp; Lettre pour cette offre</Link>
              </Button>
              <span className="text-[11px] text-slate-400">
                CV optimisé · Lettre · Kit entretien — en un clic
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-slate-400">
        Aperçu interactif — cliquez sur une offre pour voir le score évoluer
      </p>
    </div>
  );
}
