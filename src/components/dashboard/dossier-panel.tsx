"use client";

/**
 * NexiRole — PANNEAU « CV & Lettre par offre » (dossiers par offre).
 *
 * Flux conservé : offre importée depuis l'Agent (localStorage + événement),
 * upload CV via /api/parse-cv, génération POST /api/dossier.
 *
 * Résultat REFONDU :
 *  - interface à 4 onglets <DossierOnglets /> (Synthèse & Score ATS,
 *    CV adapté, Lettre éditable & sauvegardable, Kit d'entretien) ;
 *  - 3 exports PDF RÉELS (@react-pdf/renderer) : CV, Lettre, Kit —
 *    fin des fichiers .md et de window.print() ;
 *  - boutons de migration 1 clic : Créateur de CV
 *    (/dashboard/cv-builder/createur?importDossierId=...), Lettres de
 *    motivation (/dashboard/lettres?fromDossierId=...), Suivi des
 *    candidatures (POST /api/tracker).
 *
 * Sauvegarde : la route POST /api/dossier enregistre le dossier complet en
 * base (GeneratedApplication) ; si l'id manque dans la réponse, repli
 * best-effort sur POST /api/history avec le même payload structuré.
 * Icônes : exclusivement @tabler/icons-react. Charte : #051937 + #FFC107.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCheck,
  IconCopy,
  IconFileText,
  IconLoader2,
  IconSparkles,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import type { DossierResponse } from "@/lib/types";
import {
  BoutonPdf,
  DossierOnglets,
  aCv,
  aKit,
  aLettre,
  exportPdfSecurise,
  normaliserDossierComplet,
  telechargerCvPdf,
  telechargerKitPdf,
  telechargerLettrePdf,
  type DonneesDossier,
} from "@/components/dashboard/dossier-preview";

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

/** Réponse enrichie de POST /api/dossier (dossier structuré complet). */
type DossierReponse = DossierResponse & {
  dossier?: {
    jobTitle: string;
    companyName: string;
    jobUrl: string | null;
    cvJson: unknown;
    coverLetter: string;
    interviewKitJson: unknown;
    candidateJson: unknown;
    initialScore: number | null;
    optimizedScore: number | null;
  };
};

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
  const [result, setResult] = useState<DossierReponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  /* Résultat refondu : données normalisées + id de sauvegarde en base. */
  const [donnees, setDonnees] = useState<DonneesDossier | null>(null);
  const [dossierId, setDossierId] = useState<string | null>(null);
  const [pdfEnCours, setPdfEnCours] = useState<string | null>(null);
  const [envoiSuivi, setEnvoiSuivi] = useState(false);

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
    setDonnees(null);
    setDossierId(null);
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
        | (DossierReponse & { error?: string })
        | null;
      if (!res.ok || !data || data.error) {
        setError(
          data?.error ?? "La génération a échoué. Réessaie dans un instant."
        );
        return;
      }

      /* Sauvegarde en base : normalement faite par POST /api/dossier.
         Repli tolérant : POST /api/history avec le même payload structuré. */
      let id = data.savedId ?? null;
      if (!id && data.dossier) {
        try {
          const repli = await fetch("/api/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data.dossier),
          });
          const repliJson = (await repli.json().catch(() => null)) as {
            item?: { id?: string };
          } | null;
          if (repli.ok && repliJson?.item?.id) id = repliJson.item.id;
        } catch {
          /* best-effort : les boutons de migration resteront masqués */
        }
      }
      setDossierId(id);

      if (id) {
        // Prévient la page Dossier qu'un dossier vient d'être sauvegardé
        // en base : la liste d'historique se rafraîchit aussitôt.
        window.dispatchEvent(new CustomEvent("nexirole:dossier-sauvegarde"));
      }

      /* Données pour l'affichage à onglets. */
      if (data.dossier) {
        const brut: Record<string, unknown> = {
          jobTitle: data.dossier.jobTitle,
          companyName: data.dossier.companyName,
          jobUrl: data.dossier.jobUrl,
          cvJson: data.dossier.cvJson,
          coverLetter: data.dossier.coverLetter,
          interviewKitJson: data.dossier.interviewKitJson,
          candidateJson: data.dossier.candidateJson,
          initialScore: data.dossier.initialScore,
          optimizedScore: data.dossier.optimizedScore,
        };
        setDonnees(normaliserDossierComplet(brut));
      }

      setResult(data);
      toast.success(
        id
          ? "Dossier généré et sauvegardé automatiquement dans ton historique."
          : "Dossier généré."
      );
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

  /* ── Exports PDF réels (@react-pdf/renderer) ───────────────────────── */

  const exportCv = async () => {
    if (!donnees) return;
    setPdfEnCours("cv");
    await exportPdfSecurise(() => telechargerCvPdf(donnees, "modern-accent"));
    setPdfEnCours(null);
  };

  const exportLettre = async () => {
    if (!donnees || !aLettre(donnees)) return;
    setPdfEnCours("lettre");
    await exportPdfSecurise(() => telechargerLettrePdf(donnees));
    setPdfEnCours(null);
  };

  const exportKit = async () => {
    if (!donnees || !aKit(donnees)) return;
    setPdfEnCours("kit");
    await exportPdfSecurise(() => telechargerKitPdf(donnees));
    setPdfEnCours(null);
  };

  /* ── Migration vers les éditeurs & suivi ──────────────────────────── */

  function ouvrirDansCreateur() {
    if (!dossierId) return;
    window.location.assign(`/dashboard/cv-builder/createur?importDossierId=${dossierId}`);
  }

  function ouvrirDansLettres() {
    if (!dossierId) return;
    window.location.assign(`/dashboard/lettres?fromDossierId=${dossierId}`);
  }

  async function envoyerVersSuivi() {
    if (!result) return;
    setEnvoiSuivi(true);
    try {
      const res = await fetch("/api/tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: result.dossier?.jobTitle || offerTitle.trim(),
          companyName: result.dossier?.companyName || "",
          jobUrl: result.dossier?.jobUrl || offerUrl.trim(),
          notes: "Dossier créé avec NexiRole (CV adapté + lettre + kit entretien).",
        }),
      });
      if (!res.ok) {
        toast.error(await lireErreur(res, "Ajout au suivi impossible."));
        return;
      }
      toast.success("Candidature ajoutée à ton Suivi de candidatures.");
    } catch {
      toast.error("Connexion au serveur impossible — ajout non effectué.");
    } finally {
      setEnvoiSuivi(false);
    }
  }

  /* Édition de la lettre dans l'onglet Lettre → PATCH /api/history. */
  async function enregistrerLettre(texte: string) {
    if (!dossierId) throw new Error("dossier non sauvegardé");
    const res = await fetch("/api/history", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: dossierId, coverLetter: texte }),
    });
    if (!res.ok) throw new Error("échec PATCH");
    setDonnees((precedent) =>
      precedent ? { ...precedent, lettre: { ...precedent.lettre, texteBrut: texte, paragraphes: [] } } : precedent
    );
  }

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
              {parsing ? "Lecture du fichier..." : "Clique pour choisir ton CV (PDF, DOCX, TXT)"}
              <input
                type="file"
                accept=".pdf,.txt,.md,.docx"
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
            ? "Génération en cours (CV, lettre, kit, score)..."
            : "Générer le dossier complet"}
        </button>
        {!canGenerate && !loading && missing.length > 0 && (
          <p className="mt-3 text-xs text-slate-400">
            Pour lancer la génération, il manque : {missing.join(" et ")}.
          </p>
        )}
        <p className="mt-2 text-[11px] text-slate-400">
          Compte 20 à 60 secondes : le CV adapté, la lettre, le kit d&apos;entretien et les
          scores ATS sont produits par l&apos;IA puis sauvegardés automatiquement.
        </p>
      </div>

      {/* Résultats — interface à 4 onglets + exports PDF réels + migration */}
      {result && donnees ? (
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

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <p className="flex items-start gap-2">
              <IconCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {dossierId
                  ? "Dossier complet sauvegardé en base — retrouve-le dans ton historique de dossiers."
                  : "Dossier généré — sauvegarde en base momentanément indisponible."}
              </span>
            </p>
          </div>

          {/* 3 exports PDF réels */}
          <div className="flex flex-wrap gap-2">
            <BoutonPdf
              libelle="Télécharger le CV (PDF)"
              onClick={() => void exportCv()}
              enCours={pdfEnCours === "cv"}
              disabled={!aCv(donnees)}
            />
            <BoutonPdf
              libelle="Télécharger la Lettre (PDF)"
              onClick={() => void exportLettre()}
              enCours={pdfEnCours === "lettre"}
              disabled={!aLettre(donnees)}
            />
            <BoutonPdf
              libelle="Télécharger le Kit Entretien (PDF)"
              onClick={() => void exportKit()}
              enCours={pdfEnCours === "kit"}
              disabled={!aKit(donnees)}
            />
          </div>

          {/* 4 onglets : Synthèse / CV / Lettre / Kit */}
          <DossierOnglets donnees={donnees} onEnregistrerLettre={dossierId ? enregistrerLettre : undefined} />

          {/* Migration vers les éditeurs & suivi */}
          {dossierId ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
                Améliorer ce dossier dans les autres outils
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={ouvrirDansCreateur}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#051937] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0b2a5b]"
                >
                  <IconArrowRight size={16} />
                  Ouvrir &amp; Modifier ce CV dans le Créateur de CV
                </button>
                <button
                  type="button"
                  onClick={ouvrirDansLettres}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#051937]/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#051937] transition hover:bg-[#051937]/5"
                >
                  <IconArrowRight size={16} />
                  Ouvrir &amp; Modifier dans Lettres de motivation
                </button>
                <button
                  type="button"
                  onClick={() => void envoyerVersSuivi()}
                  disabled={envoiSuivi}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#FFC107] px-4 py-2.5 text-sm font-bold text-[#051937] shadow-sm transition hover:bg-[#e6ae00] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {envoiSuivi ? (
                    <IconLoader2 size={16} className="animate-spin" />
                  ) : (
                    <IconArrowRight size={16} />
                  )}
                  Envoyer vers Suivi de candidatures
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : result && !donnees ? (
        /* Repli : dossier ancien format sans structure exploitable */
        <div className="space-y-4">
          {typeof result.score === "number" ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-center gap-2 text-amber-800">
                <IconSparkles className="h-5 w-5" />
                <p className="font-heading text-lg font-bold">
                  {result.score}% de compatibilité avec cette offre
                </p>
              </div>
            </div>
          ) : null}
          {[
            { titre: "CV adapté à l'offre", contenu: result.cv, id: "cv" },
            { titre: "Lettre de motivation", contenu: result.lettre, id: "lettre" },
          ].map((bloc) => (
            <div key={bloc.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-heading text-base font-bold text-navy">{bloc.titre}</h3>
                <button
                  type="button"
                  onClick={() => void copyText(bloc.id, bloc.contenu)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  {copied === bloc.id ? (
                    <IconCheck className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <IconCopy className="h-4 w-4" />
                  )}
                  {copied === bloc.id ? "Copié" : "Copier"}
                </button>
              </div>
              <pre className="nice-scrollbar mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
                {bloc.contenu}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* Lecture d'erreur réseau tolérante (JSON ou HTML). */
async function lireErreur(res: Response, fallback: string): Promise<string> {
  let brut = "";
  try {
    brut = await res.text();
  } catch {
    return fallback;
  }
  try {
    const data = JSON.parse(brut) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}
