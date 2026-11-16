"use client";

import { useState } from "react";
import Link from "next/link";
import {
  IconUpload,
  IconFileText,
  IconSearch,
  IconSparkles,
  IconArrowRight,
  IconChartBar,
  IconBriefcase,
} from "@tabler/icons-react";

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [targetRole, setTargetRole] = useState("");
  const [location, setLocation] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleStartAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setIsAnalyzing(true);
    // Ici viendra l'appel vers /api/search-jobs
    setTimeout(() => {
      setIsAnalyzing(false);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#051937]">
      {/* Section Hero */}
      <section className="mx-auto max-w-7xl px-4 pb-16 pt-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-xs font-semibold text-[#051937]">
            <IconSparkles className="h-4 w-4 text-[#FFC107]" stroke={2} />
            <span>Agent IA de recherche d&apos;emploi & Générateur de CV</span>
          </div>

          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-[#051937] sm:text-5xl">
            Trouvez les offres qui correspondent{" "}
            <span className="underline decoration-[#FFC107] decoration-4 underline-offset-4">
              vraiment
            </span>{" "}
            à votre CV.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base text-slate-600 sm:text-lg">
            Importez votre CV ou créez-en un nouveau. L&apos;agent{" "}
            <strong className="font-semibold text-[#051937]">NexiRole</strong>{" "}
            scanne les offres d&apos;emploi en direct, compare vos compétences
            et génère un rapport classé par score de pertinence.
          </p>
        </div>

        {/* Carte Centrale : Dépôt de CV et Lancement de l'Agent */}
        <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <form onSubmit={handleStartAgent} className="space-y-6">
            {/* Zone d'upload PDF */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-[#051937]">
                1. Importez votre CV actuel (Format PDF)
              </label>
              <label
                htmlFor="cv-upload"
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition ${
                  file
                    ? "border-[#051937] bg-slate-50"
                    : "border-slate-300 hover:border-[#FFC107] hover:bg-amber-50/30"
                }`}
              >
                {file ? (
                  <div className="flex items-center gap-3 text-[#051937]">
                    <IconFileText className="h-8 w-8 text-[#FFC107]" stroke={1.8} />
                    <div className="text-left">
                      <p className="text-sm font-semibold">{file.name}</p>
                      <p className="text-xs text-slate-500">
                        {(file.size / 1024).toFixed(1)} Ko • Prêt pour l&apos;analyse
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 rounded-full bg-slate-100 p-3 text-[#051937]">
                      <IconUpload className="h-6 w-6" stroke={1.8} />
                    </div>
                    <p className="text-sm font-semibold text-[#051937]">
                      Cliquez pour sélectionner votre CV
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      PDF uniquement (max. 5 Mo)
                    </p>
                  </>
                )}
                <input
                  id="cv-upload"
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>

            {/* Critères de recherche en direct */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#051937]">
                  2. Poste ciblé (optionnel)
                </label>
                <div className="relative">
                  <IconBriefcase
                    className="absolute left-3 top-2.5 h-5 w-5 text-slate-400"
                    stroke={1.7}
                  />
                  <input
                    type="text"
                    placeholder="Ex: Développeur Fullstack, Comptable..."
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm focus:border-[#051937] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#051937]">
                  3. Localisation ou Télétravail
                </label>
                <div className="relative">
                  <IconSearch
                    className="absolute left-3 top-2.5 h-5 w-5 text-slate-400"
                    stroke={1.7}
                  />
                  <input
                    type="text"
                    placeholder="Ex: Cotonou, Paris, Remote..."
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm focus:border-[#051937] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Boutons d'action */}
            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <button
                type="submit"
                disabled={!file || isAnalyzing}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#051937] px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#0B2954] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <span>Analyse et recherche en cours...</span>
                ) : (
                  <>
                    <span>Lancer l&apos;agent de recherche IA</span>
                    <IconArrowRight className="h-4 w-4 text-[#FFC107]" stroke={2.2} />
                  </>
                )}
              </button>

              <Link
                href="/cv-builder"
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3.5 text-sm font-semibold text-[#051937] transition hover:bg-slate-50"
              >
                <span>Créer un CV de zéro</span>
              </Link>
            </div>
          </form>
        </div>

        {/* Les 3 étapes du fonctionnement */}
        <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-3 inline-flex rounded-lg bg-[#051937] p-2.5 text-[#FFC107]">
              <IconFileText className="h-5 w-5" stroke={1.8} />
            </div>
            <h3 className="text-base font-bold text-[#051937]">
              1. Lecture & Optimisation
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              L&apos;IA extrait vos compétences clés ou génère un nouveau CV
              structuré compatible avec les filtres recruteurs (ATS).
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-3 inline-flex rounded-lg bg-[#051937] p-2.5 text-[#FFC107]">
              <IconSearch className="h-5 w-5" stroke={1.8} />
            </div>
            <h3 className="text-base font-bold text-[#051937]">
              2. Recherche en direct
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              L&apos;agent parcourt le web en temps réel pour détecter les
              offres d&apos;emploi publiées récemment dans votre domaine.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-3 inline-flex rounded-lg bg-[#051937] p-2.5 text-[#FFC107]">
              <IconChartBar className="h-5 w-5" stroke={1.8} />
            </div>
            <h3 className="text-base font-bold text-[#051937]">
              3. Rapport classé par score
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Chaque annonce reçoit un score sur 100 avec vos points forts,
              les compétences manquantes et des conseils sur mesure.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
