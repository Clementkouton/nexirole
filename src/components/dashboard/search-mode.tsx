"use client";

import { useState } from "react";
import {
  IconAlertCircle,
  IconBriefcase,
  IconDeviceLaptop,
  IconExternalLink,
  IconFilter,
  IconLoader2,
  IconMapPin,
  IconRadar,
  IconSearch,
  IconSparkles,
  IconTargetArrow,
  IconWand,
} from "@tabler/icons-react";
import { Button, Input, Label, Skeleton, Switch } from "@/components/ui";
import { buttonClasses, cx } from "@/lib/ui-classes";
import { CvUpload } from "@/components/dashboard/cv-upload";
import { toast } from "sonner";
import type { CvFileValue, ScoredJob, SearchJobsResponse } from "@/lib/types";

interface SearchModeProps {
  cvFile: CvFileValue | null;
  onCvFileChange: (value: CvFileValue | null) => void;
  profileText: string;
  onGenerateForJob: (job: ScoredJob) => void;
}

function scoreStyle(score: number): { pill: string; bar: string; label: string } {
  if (score >= 80)
    return {
      pill: "bg-gold-soft text-accent-foreground",
      bar: "bg-gold",
      label: "Excellente correspondance",
    };
  if (score >= 60)
    return {
      pill: "bg-navy/[0.06] text-navy",
      bar: "bg-navy",
      label: "Bonne correspondance",
    };
  if (score >= 40)
    return {
      pill: "bg-slate-100 text-slate-600",
      bar: "bg-slate-400",
      label: "Pertinence partielle",
    };
  return {
    pill: "bg-slate-100 text-slate-400",
    bar: "bg-slate-300",
    label: "Faible pertinence",
  };
}

function JobCard({
  job,
  rank,
  onGenerate,
}: {
  job: ScoredJob;
  rank: number;
  onGenerate: (job: ScoredJob) => void;
}) {
  const style = scoreStyle(job.score);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-navy font-heading text-xs font-extrabold text-gold">
              {rank}
            </span>
            <h4 className="font-heading text-base font-bold leading-snug text-navy">
              {job.title}
            </h4>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${style.pill}`}
            >
              {job.score}% — {style.label}
            </span>
            {job.scoreSource === "mots-cles" && (
              <span
                className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-400"
                title="Analyse IA momentanément indisponible : score calculé localement par mots-clés"
              >
                score mots-clés
              </span>
            )}
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 font-semibold text-navy">
              <IconBriefcase className="size-3.5" />
              {job.company}
            </span>
            <span className="inline-flex items-center gap-1">
              <IconMapPin className="size-3.5" />
              {job.location}
            </span>
            <span className="inline-flex items-center gap-1">
              <IconRadar className="size-3.5 text-gold-dark" />
              {job.source === "remotive" ? "Remotive" : "Arbeitnow"}
              {job.postedAt ? ` · publié le ${job.postedAt}` : ""}
            </span>
          </p>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-1.5 sm:w-40">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-700 ${style.bar}`}
              style={{ width: `${job.score}%` }}
            />
          </div>
          <Button
            onClick={() => onGenerate(job)}
            className="h-9 rounded-full bg-navy text-xs font-semibold text-white hover:bg-navy-800"
          >
            <IconWand className="mr-1.5 size-3.5 text-gold" />
            Générer CV &amp; Lettre
          </Button>
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className={cx(buttonClasses("outline"), "h-9 rounded-full border-slate-300 bg-white text-xs font-semibold text-navy hover:bg-slate-50")}
          >
            <IconExternalLink className="mr-1.5 size-3.5 text-gold-dark" />
            Voir l&apos;offre
          </a>
        </div>
      </div>

      {job.strengths.length > 0 ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl bg-ice p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-navy">
              <IconTargetArrow className="size-3.5 text-gold-dark" />
              Points forts correspondants
            </p>
            <ul className="mt-2 space-y-1">
              {job.strengths.map((s) => (
                <li key={s} className="flex gap-1.5 text-xs leading-relaxed text-slate-600">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-gold-dark" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-ice p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Compétences manquantes
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {job.missingSkills.length > 0 ? (
                job.missingSkills.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-dashed border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500"
                  >
                    {s}
                  </span>
                ))
              ) : (
                <span className="text-xs text-emerald-600">
                  Aucune lacune détectée — postez en priorité !
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        job.scoreSource === "mots-cles" && (
          <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-ice px-3.5 py-2.5 text-xs text-slate-500">
            Analyse IA momentanément indisponible pour cette offre — le score a
            été calculé localement par correspondance de mots-clés avec votre CV.
          </p>
        )
      )}

      {job.advice && (
        <p className="mt-3 rounded-lg border border-gold/40 bg-gold-soft/60 px-3.5 py-2.5 text-xs leading-relaxed text-accent-foreground">
          <span className="font-bold">Conseil d&apos;adaptation : </span>
          {job.advice}
        </p>
      )}
    </article>
  );
}

function JobCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-2/3 rounded-full" />
          <Skeleton className="h-3.5 w-1/2 rounded-full" />
        </div>
        <Skeleton className="h-9 w-40 rounded-full" />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    </div>
  );
}

export function SearchMode({
  cvFile,
  onCvFileChange,
  profileText,
  onGenerateForJob,
}: SearchModeProps) {
  const [jobTitle, setJobTitle] = useState("");
  const [location, setLocation] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchJobsResponse | null>(null);

  const candidateReady = cvFile !== null || profileText.trim().length >= 60;

  async function handleSearch() {
    setError(null);
    if (!candidateReady) {
      setError("Importez votre CV PDF (ou un profil texte) pour activer le scoring IA.");
      return;
    }
    setLoading(true);
    setResults(null);
    try {
      const res = await fetch("/api/search-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cvPdfBase64: cvFile?.base64,
          cvText: !cvFile ? profileText.trim() : undefined,
          jobTitle: jobTitle.trim() || undefined,
          location: location.trim() || undefined,
          remoteOnly,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | (SearchJobsResponse & { error?: string })
        | null;
      if (!res.ok || !json || json.error) {
        setError(json?.error ?? `La recherche a échoué (erreur ${res.status}).`);
        return;
      }
      setResults(json);
      if (json.jobs.length === 0) {
        toast.message("Aucune offre trouvée", {
          description: json.message ?? "Élargissez vos filtres et réessayez.",
        });
      } else {
        toast.success(
          `${json.jobs.length} offres analysées et classées par compatibilité`
        );
      }
    } catch {
      setError("Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Panneau de recherche */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <h3 className="flex items-center gap-2 font-heading text-base font-bold text-navy">
            <span className="flex size-8 items-center justify-center rounded-lg bg-navy">
              <IconRadar className="size-4 text-gold" />
            </span>
            Agent de recherche en direct
          </h3>
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-gold opacity-70" />
              <span className="relative inline-flex size-1.5 rounded-full bg-gold-dark" />
            </span>
            Remotive · Arbeitnow
          </span>
        </div>

        <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="mb-2 text-xs font-semibold text-navy">
              Votre CV (base du scoring IA)
            </p>
            <CvUpload value={cvFile} onChange={onCvFileChange} />
            {cvFile === null && profileText.trim().length >= 60 && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
                <IconDeviceLaptop className="size-3.5" />
                Profil texte détecté — le scoring utilisera ce profil.
              </p>
            )}
          </div>

          <div className="space-y-3.5">
            <p className="text-xs font-semibold text-navy">
              Filtres optionnels
            </p>
            <div>
              <Label htmlFor="filter-title" className="text-xs text-slate-600">
                Poste recherché
              </Label>
              <div className="relative mt-1">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="filter-title"
                  placeholder="Ex : Développeur React, Data Analyst…"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="h-10 rounded-xl border-slate-200 pl-9 text-sm"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="filter-location" className="text-xs text-slate-600">
                Localisation
              </Label>
              <div className="relative mt-1">
                <IconMapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="filter-location"
                  placeholder="Ex : France, Berlin, Europe…"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="h-10 rounded-xl border-slate-200 pl-9 text-sm"
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-ice px-3.5 py-3">
              <div>
                <p className="text-xs font-semibold text-navy">Remote uniquement</p>
                <p className="text-[11px] text-slate-500">
                  Priorise les offres 100 % télétravail
                </p>
              </div>
              <Switch
                checked={remoteOnly}
                onCheckedChange={setRemoteOnly}
                aria-label="Filtrer les offres remote uniquement"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col items-center gap-2 sm:flex-row">
          <Button
            onClick={handleSearch}
            disabled={loading}
            size="lg"
            className="h-12 w-full rounded-full bg-navy px-8 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(5,25,55,0.5)] hover:bg-navy-800 sm:w-auto"
          >
            {loading ? (
              <IconLoader2 className="mr-2 size-5 animate-spin" />
            ) : (
              <IconFilter className="mr-2 size-5 text-gold" />
            )}
            {loading ? "Scan en direct en cours…" : "Lancer le scan & le scoring"}
          </Button>
          {loading && (
            <p className="text-xs text-slate-500">
              Lecture des deux sources + comparaison IA de votre CV avec chaque offre…
            </p>
          )}
        </div>
      </section>

      {/* Erreur */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <IconAlertCircle className="mt-0.5 size-5 shrink-0 text-red-500" />
          <div>
            <p className="text-sm font-semibold text-red-700">Recherche bloquée</p>
            <p className="mt-1 text-sm text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Résultats */}
      {loading && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <IconSparkles className="size-4 animate-pulse text-gold-dark" />
            <p className="text-sm font-semibold text-navy">
              Les offres arrivent — classement IA par compatibilité…
            </p>
          </div>
          <JobCardSkeleton />
          <JobCardSkeleton />
          <JobCardSkeleton />
        </div>
      )}

      {!loading && results && results.jobs.length > 0 && (
        <section className="space-y-4">
          {results.message && (
            <p className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-700">
              {results.message}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h3 className="font-heading text-base font-bold text-navy">
              {results.jobs.length} offres classées par score de compatibilité
            </h3>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                  results.sources.remotive
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                Remotive {results.sources.remotive ? "connecté" : "hors ligne"}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                  results.sources.arbeitnow
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                Arbeitnow {results.sources.arbeitnow ? "connecté" : "hors ligne"}
              </span>
              {results.partialScoring && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-600">
                  Scoring partiel
                </span>
              )}
            </div>
          </div>
          {results.jobs.map((job, index) => (
            <JobCard
              key={job.id}
              job={job}
              rank={index + 1}
              onGenerate={onGenerateForJob}
            />
          ))}
        </section>
      )}

      {!loading && results && results.jobs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <IconBriefcase className="mx-auto size-8 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-navy">
            Aucune offre ne correspond à ces filtres
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Essayez un intitulé plus large (ex : « Développeur ») ou désactivez
            « Remote uniquement ».
          </p>
        </div>
      )}
    </div>
  );
}
