"use client";

/**
 * Panneau Agent de Recherche en Direct :
 *  - import du CV (POST /api/parse-cv),
 *  - recherche manuelle OU recherche intelligente (mots-clés déduits du CV par Groq),
 *  - badges cliquables des mots-clés déduits (relance/affinage en un clic),
 *  - offres Remotive + Arbeitnow scorées, ouverture dans le Dossier via
 *    localStorage + CustomEvent (le panneau Dossier est toujours monté).
 */

import { useCallback, useRef, useState } from "react";
import {
  IconAlertCircle,
  IconArrowRight,
  IconCheck,
  IconExternalLink,
  IconFileUpload,
  IconLoader2,
  IconMapPin,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconTargetArrow,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { cx } from "@/lib/ui-classes";
import type { KeywordInsights, ScanResponse, ScoredJob } from "@/lib/types";

const OFFER_STORAGE_KEY = "nexirole:dossier-offer";
const OPEN_EVENT = "nexirole:open-dossier";

function scoreStyle(score: number): string {
  if (score >= 80) return "bg-gold text-navy";
  if (score >= 60) return "bg-sky-100 text-sky-700";
  if (score >= 40) return "bg-slate-100 text-slate-600";
  return "bg-red-50 text-red-600";
}

export function AgentScanPanel() {
  /* CV */
  const [cvText, setCvText] = useState("");
  const [cvFileName, setCvFileName] = useState<string | null>(null);
  const [cvLoading, setCvLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Recherche */
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("France");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [loading, setLoading] = useState(false);

  /* Résultats */
  const [keywords, setKeywords] = useState<KeywordInsights | null>(null);
  const [keywordsSource, setKeywordsSource] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ScoredJob[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [sources, setSources] = useState<{ remotive: boolean; arbeitnow: boolean } | null>(null);

  const cvReady = cvText.trim().length >= 60;

  /* ── Import du CV ──────────────────────────────────────────────── */
  async function handleCvFile(file: File) {
    setCvLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/parse-cv", { method: "POST", body: formData });
      const json = (await res.json().catch(() => null)) as
        | { text?: string; error?: string }
        | null;
      if (!res.ok || !json?.text) {
        throw new Error(json?.error ?? "Lecture du CV impossible.");
      }
      setCvText(json.text);
      setCvFileName(file.name);
      toast.success("CV analysé — la recherche intelligente est activée");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lecture du CV impossible.");
    } finally {
      setCvLoading(false);
    }
  }

  /* ── Scan ──────────────────────────────────────────────────────── */
  const runScan = useCallback(
    async (searchQuery: string) => {
      setLoading(true);
      setMessage(null);
      try {
        const res = await fetch("/api/agent/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cvText: cvText.trim() || undefined,
            query: searchQuery.trim() || undefined,
            region: region.trim() || undefined,
            remoteOnly,
          }),
        });
        const json = (await res.json().catch(() => null)) as
          | (ScanResponse & { error?: string })
          | null;
        if (!res.ok || !json) {
          throw new Error(json?.error ?? "Le scan a échoué.");
        }
        setKeywords(json.keywords ?? null);
        setKeywordsSource(json.keywordsSource ?? null);
        setJobs(json.jobs ?? []);
        setSources(json.sources ?? null);
        setMessage(json.message ?? null);
        if ((json.jobs ?? []).length === 0) {
          toast.info("Aucune offre trouvée — essaie un autre mot-clé.");
        } else {
          toast.success(`${json.jobs.length} offres trouvées et scorées`);
        }
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Le scan a échoué.");
        toast.error("Le scan a échoué. Réessayez dans quelques instants.");
      } finally {
        setLoading(false);
      }
    },
    [cvText, region, remoteOnly]
  );

  /* ── Ouvrir dans le Dossier (panneau toujours monté) ───────────── */
  function openInDossier(job: ScoredJob) {
    window.localStorage.setItem(
      OFFER_STORAGE_KEY,
      JSON.stringify({
        offerUrl: job.url,
        offerTitle: `${job.title} — ${job.company}`,
        offerDescription: (job.description ?? "").slice(0, 6000),
        createdAt: Date.now(),
      })
    );
    window.dispatchEvent(new CustomEvent(OPEN_EVENT));
    toast.success("Offre transmise au Dossier");
  }

  const hasResults = jobs.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold text-navy">Agent de recherche en direct</h2>
        <p className="text-sm text-slate-500">
          Importe ton CV : NexiRole déduit automatiquement ton métier et tes 3
          compétences les plus fortes pour interroger Remotive et Arbeitnow.
        </p>
      </div>

      {/* ── CV ────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-navy">1. Ton CV</h3>
          {cvReady && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <IconCheck className="size-3.5" />
              {cvFileName ?? "CV chargé"}
            </span>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,.md"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleCvFile(file);
            e.target.value = "";
          }}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={cvLoading}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-navy transition hover:bg-slate-50 disabled:opacity-60"
          >
            {cvLoading ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconFileUpload className="size-4 text-gold" />
            )}
            {cvFileName ? "Changer de CV" : "Importer mon CV (PDF/TXT/MD)"}
          </button>
          {cvReady && (
            <button
              type="button"
              onClick={() => {
                setCvText("");
                setCvFileName(null);
                setKeywords(null);
                setKeywordsSource(null);
              }}
              className="inline-flex size-9 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
              aria-label="Retirer le CV"
            >
              <IconX className="size-4" />
            </button>
          )}
        </div>
      </section>

      {/* ── Recherche ─────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-navy">2. La recherche</h3>
        <div className="grid gap-2.5 sm:grid-cols-[1fr_150px]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              cvReady
                ? "Vide = recherche intelligente depuis ton CV"
                : "ex : Développeur Full Stack"
            }
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy outline-none transition focus:border-navy/40 focus:ring-2 focus:ring-navy/10"
          />
          <input
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="Région / pays"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy outline-none transition focus:border-navy/40 focus:ring-2 focus:ring-navy/10"
          />
        </div>
        <label className="mt-2.5 flex w-fit cursor-pointer items-center gap-2 text-xs font-semibold text-navy">
          <input
            type="checkbox"
            checked={remoteOnly}
            onChange={(e) => setRemoteOnly(e.target.checked)}
            className="size-4 accent-[#051937]"
          />
          Uniquement le télétravail (remote)
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runScan(query)}
            disabled={loading}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-navy px-4 py-2.5 text-sm font-bold text-white transition hover:bg-navy/90 disabled:opacity-60 sm:flex-none"
          >
            {loading ? (
              <IconLoader2 className="size-4.5 animate-spin" />
            ) : (
              <IconSearch className="size-4.5" />
            )}
            {query.trim() ? "Lancer la recherche" : "Recherche intelligente"}
          </button>
          {cvReady && !query.trim() && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-soft px-3 py-2 text-xs font-semibold text-navy">
              <IconSparkles className="size-3.5 text-gold" />
              Ton CV pilotera la recherche
            </span>
          )}
        </div>
      </section>

      {/* ── Mots-clés déduits (badges cliquables) ─────────────────── */}
      {keywords && keywords.motsCles.length > 0 && (
        <section className="rounded-2xl border border-gold/40 bg-gold-soft p-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-navy">
            <IconTargetArrow className="size-4.5" />
            Mots-clés déduits automatiquement de ton CV
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
              {keywordsSource === "ia"
                ? "analyse IA"
                : keywordsSource === "local"
                  ? "analyse locale"
                  : "ta recherche"}
            </span>
          </p>
          <p className="mb-2.5 text-xs text-slate-600">
            Métier détecté : <span className="font-bold text-navy">{keywords.titre}</span> — clique
            sur un badge pour relancer ou affiner le scan en un clic.
          </p>
          <div className="flex flex-wrap gap-2">
            {[keywords.titre, ...keywords.motsCles].map((term) => (
              <button
                key={term}
                type="button"
                disabled={loading}
                onClick={() => {
                  setQuery(term);
                  void runScan(term);
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-navy shadow-sm transition hover:bg-navy hover:text-white disabled:opacity-60"
              >
                <IconSearch className="size-3.5 text-gold" />
                {term}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── État / message ────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          <IconLoader2 className="size-4 animate-spin text-navy" />
          Analyse de ton profil, interrogation de Remotive et Arbeitnow, scoring IA…
        </div>
      )}
      {!loading && message && (
        <div className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
          {message}
        </div>
      )}
      {!loading && sources && hasResults && (
        <p className="text-xs text-slate-400">
          Sources : {sources.remotive ? "Remotive ✓" : "Remotive ✕"} ·{" "}
          {sources.arbeitnow ? "Arbeitnow ✓" : "Arbeitnow ✕"}
        </p>
      )}

      {/* ── Résultats ─────────────────────────────────────────────── */}
      {hasResults && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-navy">
              {jobs.length} offres scorées pour ton profil
            </h3>
            <button
              type="button"
              onClick={() => void runScan(query)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-navy transition hover:bg-slate-50 disabled:opacity-60"
            >
              <IconRefresh className="size-3.5" />
              Relancer
            </button>
          </div>

          {jobs.map((job) => (
            <article
              key={job.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-navy/30 hover:shadow-md"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="truncate text-sm font-bold text-navy">{job.title}</h4>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{job.company}</span>
                    <span className="inline-flex items-center gap-1">
                      <IconMapPin className="size-3.5" />
                      {job.location}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {job.source}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={cx(
                      "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold",
                      scoreStyle(job.score)
                    )}
                  >
                    {job.score}%
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">
                    {job.scoreSource === "ia" ? "IA" : "mots-clés"}
                  </span>
                </div>
              </div>

              {job.strengths.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {job.strengths.slice(0, 3).map((s, i) => (
                    <li key={i} className="flex gap-1.5 text-xs text-emerald-700">
                      <span>+</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              )}
              {job.missingSkills.length > 0 && (
                <p className="mt-1.5 text-xs text-amber-700">
                  Manquant : {job.missingSkills.join(", ")}
                </p>
              )}
              {job.advice && (
                <p className="mt-1.5 text-xs italic text-slate-500">💡 {job.advice}</p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openInDossier(job)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-navy px-4 py-2 text-xs font-bold text-white transition hover:bg-navy/90"
                >
                  Ouvrir dans le Dossier
                  <IconArrowRight className="size-3.5" />
                </button>
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-navy transition hover:bg-slate-50"
                >
                  <IconExternalLink className="size-3.5" />
                  Voir l&apos;offre
                </a>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}