"use client";

import { useState } from "react";
import Link from "next/link";
import {
  IconArrowRight,
  IconLink,
  IconListDetails,
  IconRadar,
  IconSparkles,
  IconWand,
} from "@tabler/icons-react";
import { Button } from "@/components/ui";
import { buttonClasses, cx } from "@/lib/ui-classes";
import { GenerateMode, type PrefillPayload } from "@/components/dashboard/generate-mode";
import { SearchMode } from "@/components/dashboard/search-mode";
import type { CvFileValue, ScoredJob } from "@/lib/types";

type WorkspaceMode = "generate" | "search" | "builder";

const MODES: Array<{
  id: WorkspaceMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "generate", label: "Générateur par Lien", icon: IconLink },
  { id: "search", label: "Agent de Recherche Live", icon: IconRadar },
  { id: "builder", label: "Créateur de CV", icon: IconListDetails },
];

export default function DashboardPage() {
  const [mode, setMode] = useState<WorkspaceMode>("generate");
  const [cvFile, setCvFile] = useState<CvFileValue | null>(null);
  const [profileText, setProfileText] = useState("");
  const [prefill, setPrefill] = useState<PrefillPayload | null>(null);

  function handleGenerateForJob(job: ScoredJob) {
    setPrefill({
      jobUrl: job.url,
      jobText: job.description,
      jobLabel: `${job.title} — ${job.company}`,
    });
    setMode("generate");
  }

  return (
    <div className="bg-ice">
      {/* En-tête du workspace */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-ice px-3 py-1 text-xs font-semibold text-navy">
                <IconSparkles className="size-3.5 text-gold-dark" />
                Espace de travail NexiRole
              </span>
              <h1 className="mt-3 font-heading text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">
                Votre assistant de candidature
              </h1>
              <p className="mt-1.5 max-w-xl text-sm text-slate-600">
                Trois outils, un seul objectif : décrocher l&apos;entretien.
                Votre CV importé reste actif dans tous les modes.
              </p>
            </div>
            <Link
              href="/cv-builder"
              className={cx(buttonClasses("outline"), "h-10 rounded-full border-slate-300 bg-white px-5 text-sm font-semibold text-navy hover:bg-slate-50")}
            >
              <IconListDetails className="mr-1.5 size-4 text-gold-dark" />
              Créer un CV de zéro
            </Link>
          </div>

          {/* Onglets de mode */}
          <div
            role="tablist"
            aria-label="Modes de travail NexiRole"
            className="mt-6 flex flex-wrap gap-2"
          >
            {MODES.map((m) => {
              const active = mode === m.id;
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMode(m.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-all ${
                    active
                      ? "border-navy bg-navy text-white shadow-[0_8px_20px_-8px_rgba(5,25,55,0.5)]"
                      : "border-slate-200 bg-white text-slate-600 hover:border-navy/30 hover:text-navy"
                  }`}
                >
                  <Icon className={`size-4 ${active ? "text-gold" : "text-gold-dark"}`} />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Contenu du mode actif */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div role="tabpanel">
          {mode === "generate" && (
            <GenerateMode
              cvFile={cvFile}
              onCvFileChange={setCvFile}
              profileText={profileText}
              onProfileTextChange={setProfileText}
              prefill={prefill}
            />
          )}
          {mode === "search" && (
            <SearchMode
              cvFile={cvFile}
              onCvFileChange={setCvFile}
              profileText={profileText}
              onGenerateForJob={handleGenerateForJob}
            />
          )}
          {mode === "builder" && (
            <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-navy">
                <IconWand className="size-7 text-gold" />
              </span>
              <h2 className="mt-5 font-heading text-xl font-extrabold text-navy">
                Créateur de CV de zéro
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
                Formulaire guidé en 6 étapes — infos personnelles, résumé,
                expériences, formations, compétences et langues — avec
                amélioration IA de chaque description et aperçu PDF en temps
                réel.
              </p>
              <ul className="mx-auto mt-5 max-w-sm space-y-2 text-left">
                {[
                  "Champ « Améliorer avec l'IA » sur chaque description",
                  "Aperçu professionnel synchronisé pendant la saisie",
                  "Export PDF compatible ATS prêt à envoyer",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 rounded-lg bg-ice px-3.5 py-2.5 text-sm text-slate-700"
                  >
                    <IconArrowRight className="mt-0.5 size-4 shrink-0 text-gold-dark" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/cv-builder"
                className={cx(buttonClasses(), "mt-7 h-12 rounded-full bg-navy px-8 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(5,25,55,0.5)] hover:bg-navy-800")}
              >
                <IconWand className="mr-2 size-5 text-gold" />
                Ouvrir le CV Builder
                <IconArrowRight className="ml-2 size-5" />
              </Link>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
