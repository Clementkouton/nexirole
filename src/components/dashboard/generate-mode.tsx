"use client";

import { useEffect, useState } from "react";
import {
  IconAlertCircle,
  IconFileText,
  IconLoader2,
  IconLink,
  IconSparkles,
  IconUser,
  IconWand,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CvUpload } from "@/components/dashboard/cv-upload";
import { ApplicationResults } from "@/components/dashboard/application-results";
import { toast } from "sonner";
import type { ApplicationResponse, CvFileValue } from "@/lib/types";

export interface PrefillPayload {
  jobUrl?: string;
  jobText?: string;
  jobLabel?: string;
}

interface GenerateModeProps {
  cvFile: CvFileValue | null;
  onCvFileChange: (value: CvFileValue | null) => void;
  profileText: string;
  onProfileTextChange: (value: string) => void;
  prefill: PrefillPayload | null;
}

const LOADING_STEPS = [
  "Analyse du contenu de l'offre…",
  "Extraction des mots-clés ATS…",
  "Réécriture du CV pour le poste…",
  "Rédaction de la lettre de motivation…",
  "Préparation du kit entretien…",
];

export function GenerateMode({
  cvFile,
  onCvFileChange,
  profileText,
  onProfileTextChange,
  prefill,
}: GenerateModeProps) {
  const [jobUrl, setJobUrl] = useState("");
  const [jobText, setJobText] = useState("");
  const [showPasteMode, setShowPasteMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplicationResponse | null>(null);
  const [prefillLabel, setPrefillLabel] = useState<string | null>(null);

  /* Pré-remplissage depuis l'agent de recherche (Mode 2 → Mode 1) */
  useEffect(() => {
    if (!prefill) return;
    setJobUrl(prefill.jobUrl ?? "");
    setJobText(prefill.jobText ?? "");
    setShowPasteMode(Boolean(prefill.jobText));
    setPrefillLabel(prefill.jobLabel ?? null);
    setResult(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [prefill]);

  /* Rotation des étapes de chargement */
  useEffect(() => {
    if (!loading) return;
    setLoadingStep(0);
    const timer = window.setInterval(() => {
      setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1));
    }, 3200);
    return () => window.clearInterval(timer);
  }, [loading]);

  const hasJobContent = jobUrl.trim().length > 5 || jobText.trim().length > 80;
  const hasCandidate = cvFile !== null || profileText.trim().length >= 60;

  async function handleGenerate() {
    setError(null);
    setResult(null);

    if (!hasJobContent) {
      setError(
        "Collez l'URL de l'offre (ou le texte complet de l'annonce) pour commencer."
      );
      return;
    }
    if (!hasCandidate) {
      setError(
        "Importez votre CV PDF ou renseignez votre profil rapide (au moins quelques lignes)."
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/generate-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobUrl: jobUrl.trim() || undefined,
          jobText: jobText.trim() || undefined,
          cvPdfBase64: cvFile?.base64,
          profileText: !cvFile ? profileText.trim() || undefined : undefined,
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | (ApplicationResponse & { error?: string })
        | null;

      if (!res.ok || !json || json.error) {
        const message =
          json?.error ??
          `La génération a échoué (erreur ${res.status}). Réessayez.`;
        setError(message);
        return;
      }

      setResult(json);
      toast.success("Votre dossier de candidature est prêt !");
    } catch {
      setError(
        "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Offre d'emploi */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-heading text-base font-bold text-navy">
            <span className="flex size-8 items-center justify-center rounded-lg bg-navy">
              <IconLink className="size-4 text-gold" />
            </span>
            1. L&apos;offre visée
          </h3>
          {prefillLabel && (
            <span className="rounded-full bg-gold-soft px-3 py-1 text-[11px] font-semibold text-accent-foreground">
              Pré-remplie : {prefillLabel}
            </span>
          )}
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="job-url" className="text-xs font-semibold text-navy">
              URL de l&apos;offre d&apos;emploi
            </Label>
            <div className="relative mt-1.5">
              <IconLink className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="job-url"
                type="url"
                placeholder="https://remotive.com/remote-jobs/…"
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                className="h-11 rounded-xl border-slate-200 pl-9 text-sm"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowPasteMode((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy underline decoration-gold decoration-2 underline-offset-4 hover:text-navy-800"
          >
            <IconFileText className="size-3.5 text-gold-dark" />
            {showPasteMode
              ? "Masquer la saisie manuelle"
              : "Le site bloque la lecture ? Collez le texte de l'offre"}
          </button>

          {showPasteMode && (
            <div>
              <Label
                htmlFor="job-text"
                className="text-xs font-semibold text-navy"
              >
                Texte complet de l&apos;annonce
              </Label>
              <Textarea
                id="job-text"
                placeholder="Collez ici le texte de l'annonce : intitulé, missions, compétences requises…"
                value={jobText}
                onChange={(e) => setJobText(e.target.value)}
                rows={7}
                className="nice-scrollbar mt-1.5 rounded-xl border-slate-200 text-sm"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                {jobText.trim().length} caractères — minimum recommandé : 300
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Profil candidat */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="flex items-center gap-2 font-heading text-base font-bold text-navy">
          <span className="flex size-8 items-center justify-center rounded-lg bg-navy">
            <IconUser className="size-4 text-gold" />
          </span>
          2. Votre profil
        </h3>

        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold text-navy">
              Option A — Importer votre CV PDF actuel
            </p>
            <CvUpload value={cvFile} onChange={onCvFileChange} />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold text-navy">
              Option B — Profil rapide en texte
            </p>
            <Textarea
              placeholder="Ex : Développeur fullstack, 4 ans d'expérience React/Node. Chez Acme (2021-2024) : refonte d'une app SaaS, +30 % de performance. Diplôme Master Informatique 2020. Compétences : TypeScript, React, Node.js, Docker…"
              value={profileText}
              onChange={(e) => onProfileTextChange(e.target.value)}
              rows={8}
              className="nice-scrollbar rounded-xl border-slate-200 text-sm"
            />
            {cvFile && (
              <p className="mt-2 text-[11px] font-medium text-gold-dark">
                CV PDF détecté : il sera prioritaire sur le profil texte.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="text-center sm:text-left">
            <h3 className="flex items-center gap-2 font-heading text-base font-bold text-navy">
              <span className="flex size-8 items-center justify-center rounded-lg bg-navy">
                <IconWand className="size-4 text-gold" />
              </span>
              3. Générez votre dossier
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              CV optimisé + lettre sur mesure + kit entretien + messages
              d&apos;approche — environ 1 à 2 minutes.
            </p>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={loading}
            size="lg"
            className="h-12 w-full shrink-0 rounded-full bg-navy px-8 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(5,25,55,0.5)] hover:bg-navy-800 sm:w-auto"
          >
            {loading ? (
              <IconLoader2 className="mr-2 size-5 animate-spin" />
            ) : (
              <IconSparkles className="mr-2 size-5 text-gold" />
            )}
            {loading ? "Génération en cours…" : "Générer mon dossier"}
          </Button>
        </div>

        {loading && (
          <div className="mt-5 space-y-2 rounded-xl bg-ice p-4">
            {LOADING_STEPS.map((step, i) => (
              <p
                key={step}
                className={`flex items-center gap-2 text-xs transition-colors ${
                  i < loadingStep
                    ? "text-slate-400"
                    : i === loadingStep
                      ? "font-semibold text-navy"
                      : "text-slate-300"
                }`}
              >
                {i < loadingStep ? (
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                ) : i === loadingStep ? (
                  <IconLoader2 className="size-3.5 animate-spin text-gold-dark" />
                ) : (
                  <span className="size-1.5 rounded-full bg-slate-300" />
                )}
                {step}
              </p>
            ))}
          </div>
        )}
      </section>

      {/* Erreur */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <IconAlertCircle className="mt-0.5 size-5 shrink-0 text-red-500" />
          <div>
            <p className="text-sm font-semibold text-red-700">
              La génération n&apos;a pas abouti
            </p>
            <p className="mt-1 text-sm text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Résultats */}
      {result && (
        <section className="rounded-2xl border border-slate-200 bg-ice p-5 shadow-sm sm:p-6">
          <ApplicationResults data={result} />
        </section>
      )}
    </div>
  );
}
