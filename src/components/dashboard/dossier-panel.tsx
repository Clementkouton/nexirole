"use client";

// src/components/dashboard/dossier-panel.tsx
import { useEffect, useState, type ReactNode } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconFileText,
  IconLoader2,
  IconMail,
  IconSparkles,
  IconUpload,
} from "@tabler/icons-react";
import type { DossierResponse } from "@/lib/types";

function ResultCard({
  title,
  icon,
  content,
  filename,
}: {
  title: string;
  icon: ReactNode;
  content: string;
  filename: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible : le téléchargement reste disponible
    }
  };

  const download = () => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-bold text-navy">
          {icon}
          {title}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:border-slate-300 hover:text-navy"
          >
            {copied ? <IconCheck className="size-3.5 text-emerald-600" /> : <IconCopy className="size-3.5" />}
            {copied ? "Copié" : "Copier"}
          </button>
          <button
            type="button"
            onClick={download}
            className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-navy/90"
          >
            <IconDownload className="size-3.5" />
            Télécharger
          </button>
        </div>
      </div>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap px-5 py-4 font-sans text-sm leading-relaxed text-slate-700">
        {content}
      </pre>
    </div>
  );
}

export function DossierPanel() {
  const [offerUrl, setOfferUrl] = useState("");
  const [offerTitle, setOfferTitle] = useState("");
  const [offerDescription, setOfferDescription] = useState("");
  const [mode, setMode] = useState<"pdf" | "texte">("pdf");
  const [cvName, setCvName] = useState<string | null>(null);
  const [cvText, setCvText] = useState("");
  const [introText, setIntroText] = useState("");
  const [cvLoading, setCvLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<DossierResponse | null>(null);

  // Pré-remplissage depuis le panneau « Agent Recherche en Direct »
  useEffect(() => {
    const handler = () => {
      try {
        const raw = window.localStorage.getItem("nexirole:dossier-offer");
        if (!raw) return;
        const offer = JSON.parse(raw) as {
          offerUrl?: string;
          offerTitle?: string;
          offerDescription?: string;
        };
        if (offer.offerTitle) setOfferTitle(offer.offerTitle);
        if (offer.offerUrl) setOfferUrl(offer.offerUrl);
        if (offer.offerDescription) setOfferDescription(offer.offerDescription.slice(0, 6000));
      } catch {
        // Données de pré-remplissage invalides : on ignore
      }
    };
window.addEventListener("nexirole:open-dossier", handler);
handler();
return () => window.removeEventListener("nexirole:open-dossier", handler);
  }, []);

  const handleFile = async (file: File) => {
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
  };

  const canGenerate =
    offerTitle.trim().length > 2 &&
    (mode === "pdf" ? cvText.length > 80 : introText.trim().length > 40);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setWarnings([]);
    try {
      const res = await fetch("/api/dossier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerUrl,
          offerTitle,
          offerDescription,
          cvText: mode === "pdf" ? cvText : introText,
        }),
      });
      const data = (await res.json()) as DossierResponse & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "La génération n'a pas abouti. Réessaie dans un instant.");
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

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold text-navy">CV &amp; Lettre par Lien d&apos;offre</h2>
        <p className="mt-1 text-sm text-slate-500">
          Colle le lien d&apos;une offre : NexiRole génère ton CV optimisé et ta lettre de motivation sur mesure.
        </p>
      </div>

      {/* Étape 1 : l'offre visée */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-bold text-navy">1. L&apos;offre visée</h3>
        <div className="mt-3 space-y-3">
          <input
            value={offerUrl}
            onChange={(e) => setOfferUrl(e.target.value)}
            placeholder="Lien de l'offre ( Welcometothejungle, LinkedIn, site entreprise…)"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-navy focus:outline-none"
          />
          <input
            value={offerTitle}
            onChange={(e) => setOfferTitle(e.target.value)}
            placeholder="Titre de l'offre (ex. Ingénieur Réseaux et Sécurité (H/F) — Nomios)"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-navy focus:outline-none"
          />
          <textarea
            value={offerDescription}
            onChange={(e) => setOfferDescription(e.target.value)}
            rows={5}
            placeholder="Texte de l'annonce (recommandé — certains sites bloquent la lecture automatique)"
            className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-navy focus:outline-none"
          />
          {offerUrl && (
            <a
              href={offerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-navy"
            >
              <IconExternalLink className="size-3.5" />
              Ouvrir l&apos;annonce
            </a>
          )}
        </div>
      </section>

      {/* Étape 2 : le profil */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-bold text-navy">2. Votre profil</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("pdf")}
            className={`rounded-xl border-2 px-4 py-3 text-left text-sm font-bold transition-colors ${
              mode === "pdf" ? "border-navy bg-slate-50 text-navy" : "border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
          >
            Option A — CV au format PDF
          </button>
          <button
            type="button"
            onClick={() => setMode("texte")}
            className={`rounded-xl border-2 px-4 py-3 text-left text-sm font-bold transition-colors ${
              mode === "texte" ? "border-navy bg-slate-50 text-navy" : "border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
          >
            Option B — Présentation en texte
          </button>
        </div>

        {mode === "pdf" ? (
          <div className="mt-3">
            {cvName ? (
              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
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
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition-colors hover:border-navy hover:bg-slate-100">
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
          </div>
        ) : (
          <textarea
            value={introText}
            onChange={(e) => setIntroText(e.target.value)}
            rows={6}
            placeholder="Décris ton parcours : formations, expériences, compétences clés, outils maîtrisés…"
            className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-navy focus:outline-none"
          />
        )}
      </section>

      {/* Étape 3 : génération */}
      <button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={loading || !canGenerate}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? <IconLoader2 className="size-5 animate-spin" /> : <IconSparkles className="size-5 text-gold" />}
        {loading ? "Génération en cours (1 à 2 minutes)…" : "Générer mon dossier"}
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
        <section className="space-y-4">
          {result.score !== null && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded-full bg-navy px-4 py-1.5 text-sm font-extrabold text-gold">
                  {result.score}% de compatibilité
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700">
                  <IconSparkles className="size-3.5" />
                  Estimation IA
                </span>
              </div>
              {result.conseils.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-sm text-amber-900">
                  {result.conseils.map((c) => (
                    <li key={c} className="flex items-start gap-2">
                      <IconCheck className="mt-0.5 size-3.5 shrink-0" />
                      {c}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <ResultCard title="CV optimisé" icon={<IconFileText className="size-4" />} content={result.cv} filename="CV_NexiRole.md" />
          <ResultCard title="Lettre de motivation" icon={<IconMail className="size-4" />} content={result.lettre} filename="Lettre_NexiRole.md" />
        </section>
      )}
    </div>
  );
}