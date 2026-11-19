"use client";

import { useState } from "react";
import {
  IconAlertTriangle,
  IconExternalLink,
  IconFileText,
  IconLoader2,
  IconRadar,
  IconSparkles,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import type { ScoredJob, ScanResponse } from "@/lib/types";

const STORAGE_KEY = "nexirole:dossier-offer";
const EVENT_NAME = "nexirole:open-dossier";

const scoreStyle = (score: number) =>
  score >= 80
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : score >= 60
      ? "border-sky-200 bg-sky-50 text-sky-700"
      : score >= 40
        ? "border-slate-200 bg-slate-50 text-slate-600"
        : "border-red-200 bg-red-50 text-red-600";

const scoreLabel = (score: number) =>
  score >= 80
    ? "Excellent match"
    : score >= 60
      ? "Bon match"
      : score >= 40
        ? "Match correct"
        : "Match faible";

export function AgentScanPanel() {
  const [cvName, setCvName] = useState("");
  const [cvText, setCvText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("France");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScanResponse | null>(null);

  const cvReady = cvText.trim().length >= 50;

  const handleFile = async (file: File) => {
    setError("");
    setParsing(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/parse-cv", { method: "POST", body: formData });
      const data = (await res.json().catch(() => null)) as {
        text?: string;
        name?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.text) {
        setError(data?.error ?? "Impossible de lire ce fichier.");
        return;
      }
      setCvText(data.text);
      setCvName(data.name ?? file.name);
    } catch {
      setError("Réseau indisponible : réessaie dans un instant.");
    } finally {
      setParsing(false);
    }
  };

  const handleScan = async () => {
    if (!cvReady) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/agent/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cvText: cvText.trim(),
          cvName: cvName.trim(),
          query: query.trim(),
          region: region.trim(),
          remoteOnly,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | (ScanResponse & { error?: string })
        | null;
      if (!res.ok || !data || data.error) {
        setError(data?.error ?? "Le scan a échoué. Réessaie dans un instant.");
        return;
      }
      setResult(data);
    } catch {
      setError("Réseau indisponible : réessaie dans un instant.");
    } finally {
      setLoading(false);
    }
  };

  // Transmet l'offre au panneau « CV & Lettre par offre » :
  // écriture dans localStorage + événement écouté par le shell et le DossierPanel.
  const openInDossier = (job: ScoredJob) => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        offerUrl: job.url,
        offerTitle: `${job.title} — ${job.company}`,
        offerDescription: (job.description ?? "").slice(0, 6000),
        createdAt: Date.now(),
      })
    );
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-bold text-navy">
          Agent Recherche en Direct
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Scan en direct de Remotive et Arbeitnow : chaque offre est scorée selon ton
          CV, puis transformable en dossier complet en un clic.
        </p>
      </div>

      {/* Étape 1 : le CV */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          Étape 1 — Ton CV
        </h3>
        <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-6 text-sm font-semibold text-slate-500 transition hover:border-navy hover:text-navy">
          <IconUpload className="h-5 w-5" />
          {parsing
            ? "Lecture du fichier..."
            : "Clique pour charger ton CV (PDF, TXT ou MD)"}
          <input
            type="file"
            accept=".pdf,.txt,.md"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
        </label>
        {cvName && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <IconFileText className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate font-semibold">
              CV chargé : {cvName}
            </span>
            <button
              type="button"
              onClick={() => {
                setCvName("");
                setCvText("");
                setResult(null);
              }}
              aria-label="Retirer le CV"
              className="rounded p-1 hover:bg-emerald-100"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
        )}
      </section>

      {/* Étape 2 : les filtres + scan */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          Étape 2 — Tes filtres
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="scan-query"
              className="text-xs font-semibold text-slate-600"
            >
              Poste, entreprise ou mot-clé
            </label>
            <input
              id="scan-query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex. React, Data Engineer, Product Manager..."
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/10"
            />
          </div>
          <div>
            <label
              htmlFor="scan-region"
              className="text-xs font-semibold text-slate-600"
            >
              Zone géographique
            </label>
            <input
              id="scan-region"
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Ex. France, Europe, Worldwide..."
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/10"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRemoteOnly(!remoteOnly)}
            aria-pressed={remoteOnly}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
              remoteOnly ? "bg-navy" : "bg-slate-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition ${
                remoteOnly ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <div>
            <p className="text-sm font-semibold text-navy">
              Télétravail uniquement
            </p>
            <p className="text-xs text-slate-400">
              Ne garder que les offres remote ou remote-friendly.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleScan}
            disabled={!cvReady || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-navy px-5 py-3 text-sm font-bold text-white shadow-md transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <IconLoader2 className="h-5 w-5 animate-spin" />
            ) : (
              <IconRadar className="h-5 w-5 text-gold" />
            )}
            {loading ? "Scan en cours..." : "Lancer le scan & le scoring"}
          </button>
          {!cvReady && (
            <p className="text-xs text-slate-400">
              Charge d'abord ton CV (étape 1).
            </p>
          )}
        </div>
        {loading && (
          <p className="mt-3 text-xs text-slate-400">
            Lecture des offres Remotive & Arbeitnow, puis scoring IA par lots. Compte
            20 à 60 secondes selon le nombre d'offres.
          </p>
        )}
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Fermer"
            className="rounded p-1 hover:bg-red-100"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Résultats */}
      {result && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h3 className="font-heading text-lg font-bold text-navy">
              {result.jobs.length} offres triées par pertinence
            </h3>
            <span className="text-xs text-slate-500">
              {result.totalKept} retenues sur {result.totalFound} trouvées
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                result.aiAvailable
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              <IconSparkles className="h-3.5 w-3.5" />
              {result.aiAvailable
                ? "Offres scorées par l'IA"
                : "Analyse IA partielle (repli mots-clés)"}
            </span>
          </div>

          {result.warnings?.length ? (
            <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              {result.warnings.map((w, i) => (
                <p
                  key={i}
                  className="flex items-start gap-2 text-sm text-amber-800"
                >
                  <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{w}</span>
                </p>
              ))}
            </div>
          ) : null}

          {result.jobs.map((job, index) => (
            <article
              key={`${job.url}-${index}`}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-400">
                      #{index + 1}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {job.source}
                    </span>
                    {job.aiScored && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                        <IconSparkles className="h-3 w-3" />
                        Score IA
                      </span>
                    )}
                    {!job.aiScored && (
                      <span className="text-[11px] text-slate-400">
                        score mots-clés
                      </span>
                    )}
                  </div>
                  <h4 className="mt-1.5 font-heading text-base font-bold text-navy">
                    {job.title}
                  </h4>
                  <p className="text-sm text-slate-500">
                    {job.company}
                    {job.location ? ` · ${job.location}` : ""}
                  </p>
                  {job.reason && (
                    <p className="mt-2 text-xs text-slate-500">{job.reason}</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openInDossier(job)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-sm font-bold text-navy transition hover:bg-gold-dark"
                    >
                      <IconFileText className="h-4 w-4" />
                      Générer CV et lettre
                    </button>
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      Voir l'offre
                      <IconExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
                <div
                  className={`flex flex-col items-center rounded-xl border px-4 py-3 ${scoreStyle(
                    job.score
                  )}`}
                >
                  <span className="text-xl font-bold">{job.score}%</span>
                  <span className="text-[11px] font-semibold">
                    {scoreLabel(job.score)}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
