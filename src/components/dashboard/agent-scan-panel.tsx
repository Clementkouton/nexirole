"use client";

// src/components/dashboard/agent-scan-panel.tsx
import { useCallback, useState } from "react";
import {
  IconAlertTriangle,
  IconBuilding,
  IconCheck,
  IconExternalLink,
  IconFileText,
  IconLoader2,
  IconMapPin,
  IconSearch,
  IconSparkles,
  IconUpload,
  IconWorld,
} from "@tabler/icons-react";
import type { ScanResponse, ScoredJob } from "@/lib/types";

function scoreStyle(score: number): string {
  if (score >= 80) return "bg-amber-100 text-amber-800 border-amber-300";
  if (score >= 60) return "bg-sky-100 text-sky-700 border-sky-300";
  if (score >= 40) return "bg-slate-100 text-slate-600 border-slate-300";
  return "bg-red-50 text-red-600 border-red-200";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Excellente correspondance";
  if (score >= 60) return "Bonne correspondance";
  if (score >= 40) return "Pertinence moyenne";
  return "Faible pertinence";
}

export function AgentScanPanel() {
  const [cvName, setCvName] = useState<string | null>(null);
  const [cvText, setCvText] = useState("");
  const [cvLoading, setCvLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("France");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<ScanResponse | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setCvLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-cv", { method: "POST", body: fd });
      const data = (await res.json()) as { text?: string; name?: string; error?: string };
      if (!res.ok || !data.text) {
        setError(data.error ?? "Extraction du CV impossible.");
        setCvName(null);
        setCvText("");
      } else {
        setCvText(data.text);
        setCvName(data.name ?? file.name);
      }
    } catch {
      setError("Import impossible — vérifie ta connexion puis réessaie.");
    } finally {
      setCvLoading(false);
    }
  }, []);

  const handleScan = async () => {
    if (!cvText) {
      setError("Ajoute d'abord ton CV : il sert de base au scoring des offres.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setWarnings([]);
    try {
      const res = await fetch("/api/agent/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvText, cvName, query, region, remoteOnly }),
      });
      const data = (await res.json()) as ScanResponse & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Le scan a échoué. Réessaie dans un instant.");
      } else {
        setResult(data);
        setWarnings(data.warnings ?? []);
      }
    } catch {
      setError("Serveur inaccessible — vérifie que le serveur de développement tourne puis réessaie.");
    } finally {
      setLoading(false);
    }
  };

  const openInDossier = (job: ScoredJob) => {
    window.localStorage.setItem(
      "nexirole:dossier-offer",
      JSON.stringify({
        offerUrl: job.url,
        offerTitle: `${job.title} — ${job.company}`,
        offerDescription: job.description ?? "",
      })
    );
    window.dispatchEvent(new CustomEvent("nexirole:open-dossier"));
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-navy">Agent Recherche en Direct</h2>
        <p className="mt-1 text-sm text-slate-500">
          Scan en direct Remotive + Arbeitnow, avec score de compatibilité IA pour chaque offre.
        </p>
      </div>

      {/* Étape 1 : CV de référence */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-bold text-navy">1. Ton CV de référence</h3>
        {cvName ? (
          <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <IconCheck className="size-4" />
              CV chargé : {cvName}
            </span>
            <button
              type="button"
              onClick={() => {
                setCvName(null);
                setCvText("");
              }}
              className="text-xs font-semibold text-slate-500 transition-colors hover:text-navy"
            >
              Remplacer
            </button>
          </div>
        ) : (
          <label className="mt-3 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition-colors hover:border-navy hover:bg-slate-100">
            {cvLoading ? (
              <IconLoader2 className="size-6 animate-spin text-navy" />
            ) : (
              <IconUpload className="size-6 text-slate-400" />
            )}
            <span className="text-sm font-semibold text-slate-600">
              {cvLoading ? "Extraction du texte en cours…" : "Clique pour importer ton CV (PDF)"}
            </span>
            <input
              type="file"
              accept=".pdf,.txt,.md"
              className="hidden"
              disabled={cvLoading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </label>
        )}
      </section>

      {/* Étape 2 : filtres */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-bold text-navy">2. Filtres de recherche</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Poste, mot-clé (ex. réseaux, React…)"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-navy focus:outline-none"
            />
          </div>
          <div className="relative">
            <IconMapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Région / pays"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-navy focus:outline-none"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setRemoteOnly((v) => !v)}
          className={`mt-3 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
            remoteOnly
              ? "border-navy bg-navy text-white"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
        >
          <IconWorld className="size-4" />
          Remote uniquement
        </button>
      </section>

      {/* Étape 3 : scan */}
      <button
        type="button"
        onClick={() => void handleScan()}
        disabled={loading || cvLoading || !cvText}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? <IconLoader2 className="size-5 animate-spin" /> : <IconSparkles className="size-5 text-gold" />}
        {loading ? "Scan et scoring en cours (1 à 2 minutes)…" : "Lancer le scan & le scoring"}
      </button>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {warnings.map((w) => (
        <div
          key={w}
          className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{w}</span>
        </div>
      ))}

      {/* Résultats */}
      {result && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-navy">
              {result.jobs.length} offres classées par compatibilité
            </h3>
            <span className="text-xs font-medium text-slate-400">
              {result.totalKept} retenues sur {result.totalFound} trouvées
            </span>
          </div>

          {result.jobs.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
              Aucune offre à afficher pour l&apos;instant.
            </div>
          )}

          <ul className="space-y-3">
            {result.jobs.map((job, index) => (
              <li
                key={job.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-slate-400">#{index + 1}</span>
                      <h4 className="truncate text-sm font-bold text-navy">{job.title}</h4>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <IconBuilding className="size-3.5" />
                        {job.company}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <IconMapPin className="size-3.5" />
                        {job.location}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          job.source === "Remotive" ? "bg-navy text-white" : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {job.source}
                      </span>
                      {job.aiScored && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600">
                          <IconSparkles className="size-3" />
                          Score IA
                        </span>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-slate-500">{job.reason}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-extrabold ${scoreStyle(job.score)}`}
                    >
                      {job.score}% — {scoreLabel(job.score)}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openInDossier(job)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-navy/90"
                      >
                        <IconFileText className="size-3.5" />
                        Générer CV et lettre
                      </button>
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:border-slate-300 hover:text-navy"
                      >
                        <IconExternalLink className="size-3.5" />
                        Voir l&apos;offre
                      </a>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}