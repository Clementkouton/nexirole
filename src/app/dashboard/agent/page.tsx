"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconExternalLink,
  IconFileText,
  IconLoader2,
  IconMapPin,
  IconRadar,
  IconSparkles,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types locaux                                                       */
/* ------------------------------------------------------------------ */

interface ExtractedKeywords {
  metier: string;
  lieu: string;
  competences: string[];
}

interface ParseResponse {
  ok?: boolean;
  name?: string;
  keywords?: ExtractedKeywords;
  error?: string;
}

interface AgentJob {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  postedAt?: string;
  tags: string[];
  description?: string;
  score: number;
  reason: string;
  strengths: string[];
  missingSkills: string[];
  aiScored: boolean;
}

interface ScanResult {
  jobs: AgentJob[];
  totalFound: number;
  totalKept: number;
  aiAvailable: boolean;
  warnings?: string[];
  message?: string;
  error?: string;
}

/* Contrat conservé avec la page « Dossier & documents » */
const DOSSIER_STORAGE_KEY = "nexirole:dossier-offer";
const DOSSIER_EVENT_NAME = "nexirole:open-dossier";

const ACCEPTED_FORMATS =
  ".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt,.md";

function formatScoreStyle(score: number): string {
  if (score >= 80) return "border-amber-200 bg-amber-50 text-amber-700";
  if (score >= 60) return "border-sky-200 bg-sky-50 text-sky-700";
  if (score >= 40) return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-red-200 bg-red-50 text-red-600";
}

function formatScoreLabel(score: number): string {
  if (score >= 80) return "Excellent match";
  if (score >= 60) return "Bon match";
  if (score >= 40) return "Match correct";
  return "Match faible";
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AgentPage() {
  const router = useRouter();

  const [metier, setMetier] = useState("");
  const [lieu, setLieu] = useState("");
  const [competences, setCompetences] = useState("");

  /* Import de CV */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [cvFileName, setCvFileName] = useState("");
  const [importError, setImportError] = useState("");
  const [extracted, setExtracted] = useState<ExtractedKeywords | null>(null);

  /* Recherche */
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);

  /* ---------------------------------------------------------------- */
  /*  Import de CV — PDF, PNG, JPEG, WEBP, DOCX, TXT (réparé)          */
  /* ---------------------------------------------------------------- */

  async function handleFile(file: File) {
    setImportError("");
    setExtracted(null);

    if (file.size > 10 * 1024 * 1024) {
      setImportError("Fichier trop volumineux — 10 Mo maximum.");
      return;
    }
    const name = file.name.toLowerCase();
    const ok = /\.(pdf|png|jpe?g|webp|docx|txt|md)$/.test(name);
    if (!ok) {
      setImportError(
        "Format non pris en charge. Utilisez un PDF, une image (PNG, JPG, WEBP), un fichier Word (.docx) ou un fichier texte."
      );
      return;
    }

    setParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/parse-cv", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json().catch(() => null)) as ParseResponse | null;
      if (!res.ok || !data || data.error) {
        setImportError(data?.error ?? "La lecture de ce fichier a échoué. Réessayez.");
        return;
      }

      const kw = data.keywords ?? { metier: "", lieu: "", competences: [] };
      if (kw.metier) setMetier(kw.metier);
      if (kw.lieu && !lieu.trim()) setLieu(kw.lieu);
      if (kw.competences.length > 0) {
        setCompetences(kw.competences.join(", "));
      }
      setCvFileName(data.name ?? file.name);
      setExtracted(kw);
      toast.success("CV lu avec succès — vérifiez les mots-clés extraits");
    } catch {
      setImportError(
        "Réseau indisponible : le serveur n'a pas répondu. Réessayez dans un instant."
      );
    } finally {
      setParsing(false);
    }
  }

  function clearCv() {
    setCvFileName("");
    setExtracted(null);
    setImportError("");
  }

  /* ---------------------------------------------------------------- */
  /*  Recherche en direct                                              */
  /* ---------------------------------------------------------------- */

  async function handleSearch() {
    if (!metier.trim() && !competences.trim()) {
      setSearchError(
        "Renseignez au moins un métier ou des compétences avant de lancer la recherche."
      );
      return;
    }
    setLoading(true);
    setSearchError("");
    setResult(null);
    try {
      const res = await fetch("/api/agent/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metier: metier.trim(),
          lieu: lieu.trim(),
          competences: competences
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
            .slice(0, 15),
        }),
      });
      const data = (await res.json().catch(() => null)) as (ScanResult & { ok?: boolean }) | null;
      if (!res.ok || !data || data.error) {
        setSearchError(data?.error ?? "Le scan a échoué. Réessayez dans un instant.");
        return;
      }
      setResult(data);
    } catch {
      setSearchError("Réseau indisponible : réessayez dans un instant.");
    } finally {
      setLoading(false);
    }
  }

  /* Transmet l'offre à la page « Dossier & documents » */
  function openInDossier(job: AgentJob) {
    window.localStorage.setItem(
      DOSSIER_STORAGE_KEY,
      JSON.stringify({
        offerUrl: job.url,
        offerTitle: `${job.title} — ${job.company}`,
        offerDescription: (job.description ?? "").slice(0, 6000),
        createdAt: Date.now(),
      })
    );
    window.dispatchEvent(new CustomEvent(DOSSIER_EVENT_NAME));
    router.push("/dashboard/dossiers");
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy shadow-sm outline-none transition placeholder:text-slate-400 focus:border-navy/40 focus:ring-2 focus:ring-navy/10";

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div>
        <h1 className="font-heading text-xl font-bold text-navy sm:text-2xl">
          Agent de recherche en direct
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Recherche en direct sur Remotive et Arbeitnow : chaque offre est notée
          par l&apos;IA selon votre profil, puis transformable en dossier complet.
        </p>
      </div>

      {/* Formulaire de recherche */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="metier" className="text-xs font-semibold text-slate-600">
              Métier ou poste visé
            </label>
            <input
              id="metier"
              type="text"
              value={metier}
              onChange={(evt) => setMetier(evt.target.value)}
              placeholder="Ex. Développeur web, Commercial, Data analyst…"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="lieu" className="text-xs font-semibold text-slate-600">
              Lieu / Télétravail (optionnel)
            </label>
            <input
              id="lieu"
              type="text"
              value={lieu}
              onChange={(evt) => setLieu(evt.target.value)}
              placeholder="Ex. Paris, France, Remote…"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="competences" className="text-xs font-semibold text-slate-600">
              Compétences clés (séparées par des virgules)
            </label>
            <input
              id="competences"
              type="text"
              value={competences}
              onChange={(evt) => setCompetences(evt.target.value)}
              placeholder="Ex. WordPress, PHP, MySQL"
              className={inputClass}
            />
          </div>
        </div>

        {/* Import de CV réparé : PDF, images, Word, texte + glisser-déposer */}
        <div className="mt-5 border-t border-slate-100 pt-5">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FORMATS}
            className="hidden"
            onChange={(evt) => {
              const file = evt.target.files?.[0];
              if (file) void handleFile(file);
              evt.target.value = "";
            }}
            aria-hidden
          />

          {!cvFileName ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(evt) => {
                evt.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(evt) => {
                evt.preventDefault();
                setDragging(false);
                const file = evt.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
              className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                dragging
                  ? "border-gold bg-gold-soft/60"
                  : "border-slate-300 bg-white hover:border-navy/40 hover:bg-slate-50"
              }`}
              aria-label="Importer votre CV"
            >
              {parsing ? (
                <IconLoader2 className="size-5 animate-spin text-navy" />
              ) : (
                <IconUpload className="size-5 text-navy" />
              )}
              <span className="text-sm font-semibold text-navy">
                {parsing
                  ? "Lecture du CV en cours… (10 à 30 s)"
                  : "Extraire depuis mon CV"}
              </span>
              <span className="text-xs text-slate-500">
                Glissez-déposez ou cliquez — PDF, PNG, JPEG, WEBP, Word (.docx), TXT
                · 10 Mo max
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <IconFileText className="size-5 shrink-0 text-emerald-700" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-emerald-800">
                  {cvFileName}
                </p>
                <p className="text-xs text-emerald-700">
                  CV analysé — mots-clés remplis ci-dessus, vérifiez puis lancez la
                  recherche.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-emerald-800 underline underline-offset-2 hover:bg-emerald-100"
              >
                Changer
              </button>
              <button
                type="button"
                onClick={clearCv}
                className="rounded-full p-1.5 text-emerald-700 transition-colors hover:bg-emerald-100"
                aria-label="Retirer le CV"
              >
                <IconX className="size-4" />
              </button>
            </div>
          )}

          {importError && (
            <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-red-600">
              <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {importError}
            </p>
          )}

          {extracted && !parsing && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-gold-soft/70 px-4 py-3 text-sm text-accent-foreground">
              <IconSparkles className="mt-0.5 size-4 shrink-0 text-gold-dark" />
              <p className="flex-1">
                <span className="font-semibold">Mots-clés extraits du CV</span> —
                vérifie puis lance la recherche.
                {extracted.metier ? ` Métier détecté : ${extracted.metier}.` : ""}
                {extracted.competences.length > 0
                  ? ` ${extracted.competences.length} compétences récupérées.`
                  : ""}
              </p>
            </div>
          )}
        </div>

        {/* Boutons d'action */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-navy px-5 py-3 text-sm font-bold text-white shadow-md transition hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <IconLoader2 className="size-5 animate-spin" />
            ) : (
              <IconRadar className="size-5 text-gold" />
            )}
            {loading ? "Recherche en cours…" : "Lancer la recherche en direct"}
          </button>
          {!cvFileName && !parsing && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-navy transition hover:bg-slate-50"
            >
              <IconUpload className="size-4 text-gold-dark" />
              Extraire depuis mon CV
            </button>
          )}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
          <IconMapPin className="size-3.5" />
          Le premier scan prend 30 à 90 secondes : l&apos;agent interroge les deux
          plateformes puis note chaque offre avec l&apos;IA.
        </p>
      </section>

      {/* Erreur de recherche */}
      {searchError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p className="flex-1">{searchError}</p>
          <button
            type="button"
            onClick={() => setSearchError("")}
            className="rounded p-1 hover:bg-red-100"
            aria-label="Fermer"
          >
            <IconX className="size-4" />
          </button>
        </div>
      )}

      {/* Résultats */}
      {result && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h2 className="font-heading text-lg font-bold text-navy">
              {result.jobs.length} offre{result.jobs.length > 1 ? "s" : ""} triée
              {result.jobs.length > 1 ? "s" : ""} par pertinence
            </h2>
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
              <IconSparkles className="size-3.5" />
              {result.aiAvailable
                ? "Offres notées par l'IA"
                : "Analyse IA partielle (repli mots-clés)"}
            </span>
          </div>

          {result.message && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p className="flex-1">{result.message}</p>
            </div>
          )}

          {result.warnings?.map((warning, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800"
            >
              <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <p className="flex-1">{warning}</p>
            </div>
          ))}

          {result.jobs.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <p className="text-sm font-semibold text-navy">
                Aucune offre trouvée pour ces critères
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Essayez un métier plus général (ex. « développeur ») ou retirez le
                filtre de lieu.
              </p>
            </div>
          )}

          {result.jobs.map((job, index) => (
            <article
              key={job.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-400">
                      #{index + 1}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-700">
                      {job.source}
                    </span>
                    {job.aiScored && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                        <IconSparkles className="size-3" />
                        Score IA
                      </span>
                    )}
                    {job.postedAt && (
                      <span className="text-[11px] text-slate-400">
                        publiée le {job.postedAt}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1.5 font-heading text-base font-bold text-navy">
                    {job.title}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {job.company}
                    {job.location ? ` · ${job.location}` : ""}
                  </p>
                  {job.reason && (
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                      {job.reason}
                    </p>
                  )}
                  {job.strengths.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {job.strengths.map((s, i) => (
                        <span
                          key={`s-${i}`}
                          className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                        >
                          + {s}
                        </span>
                      ))}
                    </div>
                  )}
                  {job.missingSkills.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {job.missingSkills.map((s, i) => (
                        <span
                          key={`m-${i}`}
                          className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600"
                        >
                          − {s}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openInDossier(job)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-sm font-bold text-navy transition hover:bg-gold-dark"
                    >
                      <IconFileText className="size-4" />
                      Générer CV et lettre
                    </button>
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      Voir l&apos;offre
                      <IconExternalLink className="size-4" />
                    </a>
                  </div>
                </div>
                <div
                  className={`flex flex-col items-center rounded-xl border px-4 py-3 ${formatScoreStyle(
                    job.score
                  )}`}
                >
                  <span className="text-xl font-bold">{job.score}%</span>
                  <span className="text-[11px] font-semibold">
                    {formatScoreLabel(job.score)}
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