"use client";

import { useEffect, useState } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconDownload,
  IconFileText,
  IconLoader2,
  IconSparkles,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import type { DossierResponse } from "@/lib/types";

const STORAGE_KEY = "nexirole:dossier-offer";
const EVENT_NAME = "nexirole:open-dossier";
const FRESH_MS = 120000; // on ne reprend une offre importée que si elle a moins de 2 min

type ImportedOffer = {
  offerUrl?: string;
  offerTitle?: string;
  offerDescription?: string;
  createdAt?: number;
};

function readStoredOffer(): ImportedOffer | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ImportedOffer;
  } catch {
    return null;
  }
}

type ResultCardProps = {
  title: string;
  filename: string;
  content: string;
  copied: boolean;
  onCopy: () => void;
  onDownload: () => void;
};

function ResultCard({
  title,
  filename,
  content,
  copied,
  onCopy,
  onDownload,
}: ResultCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-heading text-base font-bold text-navy">{title}</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            {copied ? (
              <IconCheck className="h-4 w-4 text-emerald-600" />
            ) : (
              <IconCopy className="h-4 w-4" />
            )}
            {copied ? "Copié" : "Copier"}
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            <IconDownload className="h-4 w-4" />
            {filename}
          </button>
        </div>
      </div>
      <pre className="nice-scrollbar mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
        {content}
      </pre>
    </div>
  );
}

export function DossierPanel() {
  const [offerUrl, setOfferUrl] = useState("");
  const [offerTitle, setOfferTitle] = useState("");
  const [offerDescription, setOfferDescription] = useState("");
  const [imported, setImported] = useState(false);
  const [mode, setMode] = useState<"pdf" | "texte">("pdf");
  const [cvName, setCvName] = useState("");
  const [cvText, setCvText] = useState("");
  const [introText, setIntroText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DossierResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const applyOffer = (offer: ImportedOffer) => {
    if (offer.offerTitle) setOfferTitle(offer.offerTitle);
    if (offer.offerUrl) setOfferUrl(offer.offerUrl);
    if (offer.offerDescription)
      setOfferDescription(offer.offerDescription.slice(0, 6000));
  };

  // 1) Au montage : reprise d'une offre fraîchement importée depuis l'Agent
  //    (filet de sécurité si l'événement a été émis avant le montage du panneau).
  useEffect(() => {
    const offer = readStoredOffer();
    if (!offer) return;
    const fresh =
      typeof offer.createdAt !== "number" ||
      Date.now() - offer.createdAt < FRESH_MS;
    if (!fresh) return;
    applyOffer(offer);
    setImported(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Pendant toute la vie du dashboard (panneau monté, même masqué) :
  //    écoute de l'événement émis par l'Agent Recherche en Direct.
  useEffect(() => {
    const handler = () => {
      const offer = readStoredOffer();
      if (!offer) return;
      applyOffer(offer);
      setImported(true);
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFile = async (file: File) => {
    setError("");
    setParsing(true);
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

  const cvReady =
    mode === "pdf" ? cvText.trim().length >= 80 : introText.trim().length >= 80;
  const canGenerate = offerTitle.trim().length > 2 && cvReady && !loading;

  const missing: string[] = [];
  if (offerTitle.trim().length <= 2) missing.push("le titre de l'offre");
  if (!cvReady)
    missing.push(
      mode === "pdf"
        ? "un CV chargé (PDF lisible)"
        : "le texte de ton CV (80 caractères minimum)"
    );

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/dossier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerUrl: offerUrl.trim(),
          offerTitle: offerTitle.trim(),
          offerDescription: offerDescription.trim(),
          cvText: (mode === "pdf" ? cvText : introText).trim(),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | (DossierResponse & { error?: string })
        | null;
      if (!res.ok || !data || data.error) {
        setError(
          data?.error ?? "La génération a échoué. Réessaie dans un instant."
        );
        return;
      }
      setResult(data);
    } catch {
      setError("Réseau indisponible : réessaie dans un instant.");
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Presse-papiers indisponible dans ce navigateur.");
    }
  };

  const downloadText = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-bold text-navy">
          CV & Lettre par offre
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Colle le lien d'une offre, vérifie le titre et la description, puis génère un
          CV et une lettre de motivation sur mesure.
        </p>
      </div>

      {imported && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <IconCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="flex-1">
            Offre importée depuis l'Agent de recherche — vérifie les champs ci-dessous
            puis lance la génération.
          </p>
          <button
            type="button"
            onClick={() => setImported(false)}
            aria-label="Masquer le message"
            className="rounded p-1 hover:bg-emerald-100"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Étape 1 : l'offre visée */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          1. L'offre visée
        </h3>
        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="offer-url"
              className="text-xs font-semibold text-slate-600"
            >
              Lien de l'offre (optionnel)
            </label>
            <input
              id="offer-url"
              type="url"
              value={offerUrl}
              onChange={(e) => setOfferUrl(e.target.value)}
              placeholder="https://remotive.com/remote-jobs/..."
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/10"
            />
          </div>
          <div>
            <label
              htmlFor="offer-title"
              className="text-xs font-semibold text-slate-600"
            >
              Titre de l'offre (obligatoire)
            </label>
            <input
              id="offer-title"
              type="text"
              value={offerTitle}
              onChange={(e) => setOfferTitle(e.target.value)}
              placeholder="Ex. Senior React Developer — Lemon.io"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/10"
            />
          </div>
          <div>
            <label
              htmlFor="offer-description"
              className="text-xs font-semibold text-slate-600"
            >
              Description de l'offre
            </label>
            <textarea
              id="offer-description"
              rows={6}
              value={offerDescription}
              onChange={(e) => setOfferDescription(e.target.value)}
              placeholder="Colle ici le texte complet de l'offre (missions, profil recherché, compétences)..."
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/10"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              {offerDescription.length} caractères — plus l'offre est détaillée, plus
              le dossier est pertinent.
            </p>
          </div>
        </div>
      </section>

      {/* Étape 2 : la base CV */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            2. Ta base CV
          </h3>
          <div className="flex rounded-xl border border-slate-200 p-1">
            <button
              type="button"
              onClick={() => setMode("pdf")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                mode === "pdf"
                  ? "bg-navy text-white"
                  : "text-slate-500 hover:text-navy"
              }`}
            >
              Fichier PDF
            </button>
            <button
              type="button"
              onClick={() => setMode("texte")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                mode === "texte"
                  ? "bg-navy text-white"
                  : "text-slate-500 hover:text-navy"
              }`}
            >
              Texte collé
            </button>
          </div>
        </div>

        {mode === "pdf" ? (
          <div className="mt-4">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-6 text-sm font-semibold text-slate-500 transition hover:border-navy hover:text-navy">
              <IconUpload className="h-5 w-5" />
              {parsing ? "Lecture du fichier..." : "Clique pour choisir ton CV (PDF)"}
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
                  }}
                  aria-label="Retirer le CV"
                  className="rounded p-1 hover:bg-emerald-100"
                >
                  <IconX className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4">
            <textarea
              rows={8}
              value={introText}
              onChange={(e) => setIntroText(e.target.value)}
              placeholder="Colle ici le texte de ton CV (expériences, compétences, formation)..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/10"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              {introText.trim().length} / 80 caractères minimum
            </p>
          </div>
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

      {/* Génération */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canGenerate}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy px-5 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {loading ? (
            <IconLoader2 className="h-5 w-5 animate-spin" />
          ) : (
            <IconSparkles className="h-5 w-5 text-gold" />
          )}
          {loading
            ? "Génération en cours (CV, lettre, score)..."
            : "Générer CV et lettre"}
        </button>
        {!canGenerate && !loading && missing.length > 0 && (
          <p className="mt-3 text-xs text-slate-400">
            Pour lancer la génération, il manque : {missing.join(" et ")}.
          </p>
        )}
        <p className="mt-2 text-[11px] text-slate-400">
          Compte 20 à 60 secondes : le CV, la lettre et le score de compatibilité sont
          produits par l'IA.
        </p>
      </div>

      {/* Résultats */}
      {result && (
        <div className="space-y-4">
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

          {typeof result.score === "number" && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-center gap-2 text-amber-800">
                <IconSparkles className="h-5 w-5" />
                <p className="font-heading text-lg font-bold">
                  {result.score}% de compatibilité avec cette offre
                </p>
              </div>
              {result.conseils?.length ? (
                <ul className="mt-3 space-y-2 text-sm text-amber-900">
                  {result.conseils.map((conseil, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="font-bold">•</span>
                      <span>{conseil}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}

          <ResultCard
            title="CV adapté à l'offre"
            filename="CV_NexiRole.md"
            content={result.cv}
            copied={copied === "cv"}
            onCopy={() => void copyText("cv", result.cv)}
            onDownload={() => downloadText("CV_NexiRole.md", result.cv)}
          />
          <ResultCard
            title="Lettre de motivation"
            filename="Lettre_NexiRole.md"
            content={result.lettre}
            copied={copied === "lettre"}
            onCopy={() => void copyText("lettre", result.lettre)}
            onDownload={() => downloadText("Lettre_NexiRole.md", result.lettre)}
          />
        </div>
      )}
    </div>
  );
}