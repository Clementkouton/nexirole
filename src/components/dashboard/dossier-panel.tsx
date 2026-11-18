"use client";

/**
 * Panneau Dossier : import d'offre (manuel ou depuis l'Agent), CV, génération
 * du dossier structuré (CV + lettre + kit), sélection de template + photo,
 * prévisualisation en direct et téléchargements PDF haute qualité.
 * Les événements :
 *  - "nexirole:open-dossier"    : une offre arrive depuis l'Agent de recherche ;
 *  - "nexirole:restore-dossier" : un dossier est restauré depuis l'Historique.
 * Ce panneau est TOUJOURS monté (masqué par CSS par le shell) : ses
 * écouteurs restent vivants quel que soit l'onglet actif.
 */

import { useEffect, useRef, useState } from "react";
import {
  IconAlertCircle,
  IconCheck,
  IconCircleCheck,
  IconCopy,
  IconFileDescription,
  IconFileText,
  IconLoader2,
  IconMessageChatbot,
  IconPhoto,
  IconRefresh,
  IconSparkles,
  IconUpload,
  IconWand,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { cx } from "@/lib/ui-classes";
import type { DossierData, DossierResponse } from "@/lib/types";
import {
  recommendTemplateForJob,
  type TemplateId,
} from "@/lib/cv-templates";
import {
  downloadCvPdf,
  downloadKitPdf,
  downloadLetterPdf,
} from "@/lib/pdf-client";
import { TemplateSelector } from "@/components/dashboard/template-selector";
import { DossierPreview } from "@/components/dashboard/dossier-preview";

const OFFER_STORAGE_KEY = "nexirole:dossier-offer";
const RESTORE_STORAGE_KEY = "nexirole:restore-dossier";
const OPEN_EVENT = "nexirole:open-dossier";
const RESTORE_EVENT = "nexirole:restore-dossier";

interface OfferInput {
  offerTitle: string;
  offerUrl: string;
  offerDescription: string;
}

interface PickedOffer {
  offerTitle: string;
  offerUrl: string;
  offerDescription: string;
  createdAt: number;
}

export function DossierPanel() {
  /* ── Offre ─────────────────────────────────────────────────────── */
  const [offer, setOffer] = useState<OfferInput>({
    offerTitle: "",
    offerUrl: "",
    offerDescription: "",
  });
  const [importBanner, setImportBanner] = useState<string | null>(null);

  /* ── CV ────────────────────────────────────────────────────────── */
  const [cvText, setCvText] = useState("");
  const [cvFileName, setCvFileName] = useState<string | null>(null);
  const [cvLoading, setCvLoading] = useState(false);
  const [mode, setMode] = useState<"pdf" | "texte">("pdf");
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── Génération + résultat ─────────────────────────────────────── */
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DossierData | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  /* ── Template + photo ──────────────────────────────────────────── */
  const [templateId, setTemplateId] = useState<TemplateId>("modern-accent");
  const [photoEnabled, setPhotoEnabled] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"cv" | "letter" | "kit" | null>(null);

  /* ── Écouteurs permanents (panneau toujours monté) ─────────────── */
  useEffect(() => {
    function handleOpen() {
      try {
        const raw = window.localStorage.getItem(OFFER_STORAGE_KEY);
        if (!raw) return;
        const offer = JSON.parse(raw) as PickedOffer;
        setOffer({
          offerTitle: offer.offerTitle ?? "",
          offerUrl: offer.offerUrl ?? "",
          offerDescription: offer.offerDescription ?? "",
        });
        setImportBanner(
          "Offre importée depuis l'Agent — complète avec ton CV puis génère ton dossier."
        );
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        /* stockage corrompu : on ignore */
      }
    }

    function handleRestore() {
      try {
        const raw = window.localStorage.getItem(RESTORE_STORAGE_KEY);
        if (!raw) return;
        const payload = JSON.parse(raw) as { data: DossierData };
        if (!payload?.data) return;
        setResult(payload.data);
        setSavedId(null);
        setImportBanner(null);
        const detected = payload.data.offre?.titre ?? payload.data.titre;
        setTemplateId(recommendTemplateForJob(detected));
        toast.success("Dossier restauré depuis votre historique");
      } catch {
        /* stockage corrompu : on ignore */
      }
    }

    window.addEventListener(OPEN_EVENT, handleOpen);
    window.addEventListener(RESTORE_EVENT, handleRestore);
    // Reprise d'une offre fraîche transmise juste avant le montage
    handleOpen();
    return () => {
      window.removeEventListener(OPEN_EVENT, handleOpen);
      window.removeEventListener(RESTORE_EVENT, handleRestore);
    };
  }, []);

  const cvReady = cvText.trim().length >= 60;
  const canGenerate =
    offer.offerTitle.trim().length > 2 && cvReady && !loading;

  const missing: string[] = [];
  if (offer.offerTitle.trim().length <= 2) missing.push("le titre de l'offre");
  if (!cvReady) missing.push("un CV (PDF ou texte)");

  /* ── Import du CV ──────────────────────────────────────────────── */
  async function handleCvFile(file: File) {
    setCvLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/parse-cv", {
        method: "POST",
        body: formData,
      });
      const json = (await res.json().catch(() => null)) as
        | { text?: string; error?: string }
        | null;
      if (!res.ok || !json?.text) {
        throw new Error(json?.error ?? "Lecture du CV impossible.");
      }
      setCvText(json.text);
      setCvFileName(file.name);
      toast.success("CV analysé avec succès");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lecture du CV impossible.");
    } finally {
      setCvLoading(false);
    }
  }

  /* ── Génération du dossier ─────────────────────────────────────── */
  async function handleGenerate() {
    if (!canGenerate) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dossier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerTitle: offer.offerTitle.trim(),
          offerUrl: offer.offerUrl.trim() || undefined,
          offerDescription: offer.offerDescription.trim() || undefined,
          cvText: cvText.trim(),
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | (DossierResponse & { error?: string })
        | null;
      if (!res.ok || !json?.data) {
        throw new Error(json?.error ?? "La génération n'a pas abouti.");
      }
      setResult(json.data);
      setSavedId(json.id ?? null);
      const detected = json.data.offre?.titre ?? json.data.titre;
      setTemplateId(recommendTemplateForJob(detected));
      if (json.saved) {
        toast.success("Dossier généré et enregistré dans votre historique");
      } else {
        toast.success("Dossier généré");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "La génération n'a pas abouti.");
      toast.error("La génération n'a pas abouti. Réessayez dans quelques instants.");
    } finally {
      setLoading(false);
    }
  }

  /* ── Téléchargements PDF (client pur) ──────────────────────────── */
  async function handleDownload(kind: "cv" | "letter" | "kit") {
    if (!result) return;
    setDownloading(kind);
    try {
      if (kind === "cv") {
        await downloadCvPdf(result, templateId, photoEnabled ? photoUrl : null);
      } else if (kind === "letter") {
        await downloadLetterPdf(result, templateId);
      } else {
        await downloadKitPdf(result, templateId);
      }
      toast.success("PDF téléchargé");
    } catch {
      toast.error("La génération du PDF a échoué. Réessayez.");
    } finally {
      setDownloading(null);
    }
  }

  function copyText(text: string, label: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(`${label} copié`))
      .catch(() => toast.error("Copie impossible"));
  }

  function reset() {
    setResult(null);
    setSavedId(null);
    setError(null);
  }

  /* ════════════════════════ VUE RÉSULTAT ══════════════════════════ */
  if (result) {
    const kit = result.kit_entretien;
    const detected = result.offre?.titre ?? result.titre;

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-navy">
              <IconCircleCheck className="size-5 text-emerald-500" />
              Dossier prêt — {result.identite.nom_complet}
            </h2>
            <p className="text-sm text-slate-500">
              {result.titre}
              {result.offre ? ` — cible : ${result.offre.titre} @ ${result.offre.entreprise}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {savedId && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                <IconCheck className="size-3.5" />
                Enregistré dans l&apos;historique
              </span>
            )}
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy transition hover:bg-slate-50"
            >
              <IconRefresh className="size-4" />
              Nouveau dossier
            </button>
          </div>
        </div>

        <TemplateSelector
          selected={templateId}
          onSelect={setTemplateId}
          photoEnabled={photoEnabled}
          onPhotoToggle={setPhotoEnabled}
          photoUrl={photoUrl}
          onPhotoChange={setPhotoUrl}
          detectedJobTitle={detected}
        />

        <DossierPreview data={result} templateId={templateId} photo={photoEnabled ? photoUrl : null} />

        {/* Téléchargements PDF */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mr-auto flex items-center gap-1.5 text-sm font-bold text-navy">
            <IconFileDescription className="size-4.5 text-gold" />
            Téléchargements PDF haute qualité (A4, texte sélectionnable)
          </p>
          <button
            type="button"
            onClick={() => handleDownload("cv")}
            disabled={downloading !== null}
            className="inline-flex items-center gap-1.5 rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:opacity-60"
          >
            {downloading === "cv" ? <IconLoader2 className="size-4 animate-spin" /> : <IconFileText className="size-4" />}
            CV PDF
          </button>
          <button
            type="button"
            onClick={() => handleDownload("letter")}
            disabled={downloading !== null}
            className="inline-flex items-center gap-1.5 rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:opacity-60"
          >
            {downloading === "letter" ? <IconLoader2 className="size-4 animate-spin" /> : <IconFileText className="size-4" />}
            Lettre PDF
          </button>
          {kit && (
            <button
              type="button"
              onClick={() => handleDownload("kit")}
              disabled={downloading !== null}
              className="inline-flex items-center gap-1.5 rounded-full bg-gold px-4 py-2 text-sm font-bold text-navy transition hover:brightness-105 disabled:opacity-60"
            >
              {downloading === "kit" ? <IconLoader2 className="size-4 animate-spin" /> : <IconSparkles className="size-4" />}
              Kit Entretien PDF
            </button>
          )}
          <button
            type="button"
            onClick={() => copyText(`${result.resume}\n\n${result.competences.join(", ")}`, "Contenu CV")}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy transition hover:bg-slate-50"
          >
            <IconCopy className="size-4" />
            Copier le texte
          </button>
        </div>
      </div>
    );
  }

  /* ════════════════════════ VUE FORMULAIRE ════════════════════════ */
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold text-navy">Générateur de dossier</h2>
        <p className="text-sm text-slate-500">
          Cible une offre, importe ton CV : NexiRole produit un CV, une lettre de
          motivation et un kit d&apos;entretien structurés, exportables en PDF ATS.
        </p>
      </div>

      {importBanner && (
        <div className="flex items-start gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <IconCircleCheck className="mt-0.5 size-4 shrink-0" />
          {importBanner}
        </div>
      )}

      {/* ── Offre ─────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-navy">
          <IconBriefcaseIcon />
          1. L&apos;offre visée
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-navy">Titre de l&apos;offre *</span>
            <input
              value={offer.offerTitle}
              onChange={(e) => setOffer((p) => ({ ...p, offerTitle: e.target.value }))}
              placeholder="ex : Développeur Full Stack — Remote"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy outline-none transition focus:border-navy/40 focus:ring-2 focus:ring-navy/10"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-navy">Lien de l&apos;offre (optionnel)</span>
            <input
              value={offer.offerUrl}
              onChange={(e) => setOffer((p) => ({ ...p, offerUrl: e.target.value }))}
              placeholder="https://…"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy outline-none transition focus:border-navy/40 focus:ring-2 focus:ring-navy/10"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-navy">
              Texte de l&apos;offre (optionnel mais recommandé)
            </span>
            <textarea
              value={offer.offerDescription}
              onChange={(e) => setOffer((p) => ({ ...p, offerDescription: e.target.value }))}
              rows={6}
              placeholder="Collez ici l'annonce complète (missions, compétences demandées…)"
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy outline-none transition focus:border-navy/40 focus:ring-2 focus:ring-navy/10"
            />
          </label>
        </div>
      </section>

      {/* ── CV ────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold text-navy">
            <IconUpload className="size-4.5 text-gold" />
            2. Ton CV
          </h3>
          <div className="flex gap-1.5">
            {(["pdf", "texte"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cx(
                  "rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors",
                  mode === m
                    ? "bg-navy text-white"
                    : "border border-slate-200 bg-white text-navy hover:bg-slate-50"
                )}
              >
                {m === "pdf" ? "Fichier PDF" : "Texte"}
              </button>
            ))}
          </div>
        </div>

        {mode === "pdf" ? (
          <div>
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
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={cvLoading}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm font-semibold text-navy transition hover:border-navy/40 hover:bg-white disabled:opacity-60"
            >
              {cvLoading ? (
                <>
                  <IconLoader2 className="size-6 animate-spin text-navy" />
                  Analyse du CV en cours…
                </>
              ) : (
                <>
                  <IconUpload className="size-6 text-navy" />
                  {cvFileName ? `CV chargé : ${cvFileName}` : "Clique pour importer ton CV (PDF, TXT, MD — 10 Mo max)"}
                </>
              )}
            </button>
          </div>
        ) : (
          <textarea
            value={cvText}
            onChange={(e) => setCvText(e.target.value)}
            rows={8}
            placeholder="Colle ici le texte de ton CV (expériences, formations, compétences…)"
            className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy outline-none transition focus:border-navy/40 focus:ring-2 focus:ring-navy/10"
          />
        )}
        {cvReady && (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <IconCheck className="size-3.5" />
            CV prêt ({cvText.trim().length.toLocaleString("fr-FR")} caractères analysés)
          </p>
        )}
      </section>

      {/* ── Génération ────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
          <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleGenerate}
        disabled={!canGenerate}
        className={cx(
          "flex w-full items-center justify-center gap-2 rounded-full px-4 py-3.5 text-sm font-bold transition",
          canGenerate
            ? "bg-navy text-white hover:bg-navy/90"
            : "cursor-not-allowed bg-slate-200 text-slate-400"
        )}
      >
        {loading ? (
          <>
            <IconLoader2 className="size-5 animate-spin" />
            Génération du dossier en cours (CV + lettre + kit)…
          </>
        ) : (
          <>
            <IconWand className="size-5" />
            Générer CV, lettre et kit d&apos;entretien
          </>
        )}
      </button>
      {!canGenerate && missing.length > 0 && (
        <p className="text-center text-xs text-slate-500">
          Pour générer ton dossier, il manque : {missing.join(" et ")}.
        </p>
      )}
      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400">
        <IconMessageChatbot className="size-3.5" />
        Propulsé par Groq — le dossier est enregistré dans ton historique.
      </p>
    </div>
  );
}

/* Petite icône interne (évite un import supplémentaire) */
function IconBriefcaseIcon() {
  return <IconPhoto className="size-4.5 text-gold" aria-hidden />;
}