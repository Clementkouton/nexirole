"use client";

/**
 * NexiRole — DOSSIERS PAR OFFRE (page /dashboard/dossier).
 *
 * Harmonisée sur le modèle EXACT de /dashboard/negociation : DEUX vues
 * fluides —
 *
 *   Vue A — Tableau de bord & liste des dossiers (par défaut) :
 *     3 cartes statistiques (dossiers sauvegardés, score ATS moyen,
 *     dernière entreprise ciblée) + liste complète des dossiers
 *     enregistrés (GET /api/history?type=applications) avec barre
 *     d'actions : Voir / Éditer / PDF / Partager / Supprimer.
 *
 *   Vue B — Création : conserve TOUT le flux existant (carte « Offre
 *     chargée » depuis localStorage — mécanisme de l'Agent, puis
 *     <DossierPanel /> : upload CV /api/parse-cv, génération POST
 *     /api/dossier, résultat à 4 onglets, exports PDF réels, migration).
 *
 * Modale « Voir » refondue : interface à 4 onglets (Synthèse & Score ATS,
 * CV adapté, Lettre éditable & sauvegardable, Kit d'entretien) + 3 exports
 * PDF RÉELS (@react-pdf/renderer, via src/components/pdf/CvPdfDocument.tsx
 * pour le CV) + boutons de migration 1 clic vers le Créateur de CV,
 * les Lettres de motivation et le Suivi de candidatures.
 *
 * Icônes : exclusivement @tabler/icons-react. Charte : #051937 + #FFC107.
 */

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconBriefcase,
  IconCalendarEvent,
  IconDeviceFloppy,
  IconEdit,
  IconExternalLink,
  IconEye,
  IconFileTypePdf,
  IconFolder,
  IconLoader2,
  IconPlus,
  IconRobot,
  IconShare,
  IconTargetArrow,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import * as PanelModule from "@/components/dashboard/dossier-panel";
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
import { isTemplateId, type TemplateId } from "@/lib/cv-templates";

/* ── Types ───────────────────────────────────────────────────────────── */

/** Enregistrement GeneratedApplication (GET /api/history?type=applications). */
type DossierItem = {
  id: string;
  jobTitle: string;
  companyName: string;
  jobUrl: string | null;
  templateId: string;
  withPhoto: boolean;
  cvJson: unknown;
  coverLetter: string;
  interviewKitJson: unknown;
  candidateJson: unknown;
  initialScore: number | null;
  optimizedScore: number | null;
  createdAt: string;
};

/* ── Panneau existant (import défensif, inchangé) ────────────────────── */

const panelExports = PanelModule as unknown as Record<string, unknown>;
const DossierPanel = (panelExports.DossierPanel ?? panelExports.default) as ComponentType | undefined;

const EVENT_SAUVEGARDE = "nexirole:dossier-sauvegarde";

/* ── Aides réseau & normalisation ────────────────────────────────────── */

async function lireErreur(res: Response, fallback: string): Promise<string> {
  let brut = "";
  try {
    brut = await res.text();
  } catch {
    return fallback;
  }
  try {
    const data = JSON.parse(brut) as { error?: string; diagnostic?: string };
    const base = data.error || fallback;
    return data.diagnostic ? `${base} [Détail : ${data.diagnostic}]` : base;
  } catch {
    return `${fallback} (réponse non JSON — regarde le terminal « npm run dev »)`;
  }
}

function normaliserDossier(brut: Record<string, unknown>): DossierItem | null {
  if (typeof brut.id !== "string") return null;
  return {
    id: brut.id,
    jobTitle: typeof brut.jobTitle === "string" ? brut.jobTitle : "Dossier sans titre",
    companyName: typeof brut.companyName === "string" ? brut.companyName : "",
    jobUrl: typeof brut.jobUrl === "string" ? brut.jobUrl : null,
    templateId: typeof brut.templateId === "string" ? brut.templateId : "modern-accent",
    withPhoto: brut.withPhoto === true,
    cvJson: brut.cvJson ?? null,
    coverLetter: typeof brut.coverLetter === "string" ? brut.coverLetter : "",
    interviewKitJson: brut.interviewKitJson ?? null,
    candidateJson: brut.candidateJson ?? null,
    initialScore: typeof brut.initialScore === "number" ? brut.initialScore : null,
    optimizedScore: typeof brut.optimizedScore === "number" ? brut.optimizedScore : null,
    createdAt: typeof brut.createdAt === "string" ? brut.createdAt : "",
  };
}

/** Données complètes de la modale, calculées depuis un item de la liste. */
function donneesDuDossier(item: DossierItem): DonneesDossier | null {
  return normaliserDossierComplet({
    jobTitle: item.jobTitle,
    companyName: item.companyName,
    jobUrl: item.jobUrl,
    cvJson: item.cvJson,
    coverLetter: item.coverLetter,
    interviewKitJson: item.interviewKitJson,
    candidateJson: item.candidateJson,
    initialScore: item.initialScore,
    optimizedScore: item.optimizedScore,
  });
}

/** Score affiché : score optimisé s'il existe, sinon score initial. */
function scoreDossier(item: DossierItem): number | null {
  if (typeof item.optimizedScore === "number") return item.optimizedScore;
  if (typeof item.initialScore === "number") return item.initialScore;
  return null;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ── Aides offre importée depuis l'Agent (mécanisme localStorage existant) ── */

const CLE_OFFRE = "nexirole:dossier-offer";

function lireOffre(): Record<string, unknown> | null {
  try {
    const brut = window.localStorage.getItem(CLE_OFFRE);
    if (!brut) return null;
    const parsed: unknown = JSON.parse(brut);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function signatureOffre(offer: Record<string, unknown> | null): string {
  if (!offer) return "";
  const titre = typeof offer.offerTitle === "string" ? offer.offerTitle : "";
  const description = typeof offer.offerDescription === "string" ? offer.offerDescription : "";
  const url = typeof offer.offerUrl === "string" ? offer.offerUrl : "";
  return `${titre}::${url}::${description.slice(0, 200)}`;
}

function titreOffre(offer: Record<string, unknown> | null): string {
  if (!offer) return "";
  const brut = offer.offerTitle ?? offer.titre ?? offer.title ?? offer.poste;
  return typeof brut === "string" ? brut : "";
}

function entrepriseOffre(offer: Record<string, unknown> | null): string {
  if (!offer) return "";
  const brut = offer.entreprise ?? offer.company ?? offer.societe;
  return typeof brut === "string" ? brut : "";
}

/* ── Page ────────────────────────────────────────────────────────────── */

export default function DossierPage() {
  /* Vue courante : liste des dossiers (défaut) ou création. */
  const [vue, setVue] = useState<"liste" | "creation">("liste");

  /* Offre importée depuis l'Agent (flux existant conservé). */
  const [offer, setOffer] = useState<Record<string, unknown> | null>(null);
  const savedRef = useRef("");

  /* Liste des dossiers (GET /api/history?type=applications). */
  const [dossiers, setDossiers] = useState<DossierItem[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  /* Aperçu complet (modale plein écran à 4 onglets). */
  const [apercuId, setApercuId] = useState<string | null>(null);
  const [pdfEnCours, setPdfEnCours] = useState<string | null>(null);
  const [envoiSuivi, setEnvoiSuivi] = useState(false);

  /* Édition légère (modale). */
  const [edition, setEdition] = useState<{
    id: string;
    jobTitle: string;
    companyName: string;
    jobUrl: string;
  } | null>(null);
  const [enregistrementEdition, setEnregistrementEdition] = useState(false);
  const [erreurEdition, setErreurEdition] = useState("");

  /* Suppression. */
  const [suppressionId, setSuppressionId] = useState<string | null>(null);

  /* ── Chargement de la liste ─────────────────────────────────────────── */

  async function chargerDossiers() {
    try {
      const res = await fetch("/api/history?type=applications", { cache: "no-store" });
      if (!res.ok) {
        setErreur(
          await lireErreur(res, "Impossible de charger tes dossiers (erreur " + res.status + ").")
        );
        return;
      }
      const data = (await res.json().catch(() => null)) as { items?: unknown[] } | null;
      if (!data || !Array.isArray(data.items)) {
        setErreur("Réponse inattendue du serveur.");
        return;
      }
      setErreur("");
      const liste: DossierItem[] = [];
      for (const brut of data.items) {
        if (brut && typeof brut === "object") {
          const dossier = normaliserDossier(brut as Record<string, unknown>);
          if (dossier) liste.push(dossier);
        }
      }
      setDossiers(liste);
    } catch {
      setErreur("Connexion au serveur impossible. Vérifie ta connexion et recharge.");
    } finally {
      setChargement(false);
    }
  }

  const demarrageFaitRef = useRef(false);
  useEffect(() => {
    if (demarrageFaitRef.current) return;
    demarrageFaitRef.current = true;
    void chargerDossiers();
  }, []);

  /* Un dossier vient d'être généré par le panneau → rafraîchit la liste. */
  useEffect(() => {
    const handler = () => {
      void chargerDossiers();
    };
    window.addEventListener(EVENT_SAUVEGARDE, handler);
    return () => window.removeEventListener(EVENT_SAUVEGARDE, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Reprise de l'offre chargée depuis l'Agent (flux existant conservé). */
  useEffect(() => {
    const current = lireOffre();
    if (!current) return;
    setOffer(current);
    // Ouvre le panneau existant avec l'offre chargée depuis l'Agent
    window.dispatchEvent(new CustomEvent("nexirole:open-dossier", { detail: current }));
    // Enregistre l'offre en historique (miroir best-effort, POST /api/history).
    const signature = signatureOffre(current);
    if (savedRef.current !== signature) {
      savedRef.current = signature;
      const titre = titreOffre(current);
      if (titre) {
        void (async () => {
          try {
            await fetch("/api/history", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jobTitle: titre,
                companyName: entrepriseOffre(current),
                jobUrl: typeof current.offerUrl === "string" ? current.offerUrl : "",
              }),
            });
          } catch {
            /* best-effort : non bloquant */
          }
        })();
      }
    }
  }, []);

  /* Échap ferme les modales. */
  useEffect(() => {
    if (!apercuId && !edition) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setApercuId(null);
        setEdition(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apercuId, edition]);

  /* ── Navigation entre les vues ─────────────────────────────────────── */

  function ouvrirCreation() {
    setVue("creation");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function retourListe() {
    setVue("liste");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ── Actions sur les dossiers ──────────────────────────────────────── */

  /* Exports PDF réels (fin de window.print()). */
  const dossierApercu = apercuId ? dossiers.find((d) => d.id === apercuId) ?? null : null;
  const donneesApercu = dossierApercu ? donneesDuDossier(dossierApercu) : null;
  const templateIdApercu: TemplateId =
    dossierApercu && isTemplateId(dossierApercu.templateId)
      ? dossierApercu.templateId
      : "modern-accent";

  function exporterCv() {
    if (!donneesApercu) return;
    setPdfEnCours("cv");
    void exportPdfSecurise(() => telechargerCvPdf(donneesApercu, templateIdApercu)).finally(
      () => setPdfEnCours(null)
    );
  }

  function exporterLettre() {
    if (!donneesApercu || !aLettre(donneesApercu)) return;
    setPdfEnCours("lettre");
    void exportPdfSecurise(() => telechargerLettrePdf(donneesApercu)).finally(() =>
      setPdfEnCours(null)
    );
  }

  function exporterKit() {
    if (!donneesApercu || !aKit(donneesApercu)) return;
    setPdfEnCours("kit");
    void exportPdfSecurise(() => telechargerKitPdf(donneesApercu)).finally(() =>
      setPdfEnCours(null)
    );
  }

  /* Édition de la lettre directement dans la modale (PATCH /api/history). */
  async function enregistrerLettreApercu(texte: string) {
    if (!dossierApercu) throw new Error("dossier introuvable");
    const res = await fetch("/api/history", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: dossierApercu.id, coverLetter: texte }),
    });
    if (!res.ok) throw new Error("échec PATCH");
    setDossiers((precedent) =>
      precedent.map((dossier) =>
        dossier.id === dossierApercu.id ? { ...dossier, coverLetter: texte } : dossier
      )
    );
  }

  /* Migration 1 clic vers les éditeurs & le suivi. */
  function ouvrirDansCreateur(id: string) {
    window.location.assign(`/dashboard/cv-builder/createur?importDossierId=${id}`);
  }

  function ouvrirDansLettres(id: string) {
    window.location.assign(`/dashboard/lettres?fromDossierId=${id}`);
  }

  async function envoyerVersSuivi(item: DossierItem) {
    setEnvoiSuivi(true);
    try {
      const res = await fetch("/api/tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: item.jobTitle,
          companyName: item.companyName,
          jobUrl: item.jobUrl ?? "",
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

  async function partager(item: DossierItem) {
    const resume = [
      `Dossier NexiRole : ${item.jobTitle}`,
      `Entreprise : ${item.companyName || "Non précisée"}`,
      item.jobUrl ? `Offre : ${item.jobUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(resume);
      toast.success("Résumé copié dans le presse-papiers — prêt à envoyer.");
    } catch {
      toast.error("Copie impossible : sélectionne le texte et copie-le manuellement.");
    }
  }

  async function supprimer(item: DossierItem) {
    const confirme = window.confirm(
      `Supprimer définitivement le dossier « ${item.jobTitle} » ? Cette action est irréversible.`
    );
    if (!confirme) return;
    setSuppressionId(item.id);
    try {
      const res = await fetch(`/api/history?id=${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error(await lireErreur(res, "Suppression impossible (erreur " + res.status + ")."));
        return;
      }
      setDossiers((precedent) => precedent.filter((dossier) => dossier.id !== item.id));
      if (apercuId === item.id) setApercuId(null);
      toast.success("Dossier supprimé de ton historique.");
    } catch {
      toast.error("Connexion au serveur impossible — suppression non effectuée.");
    } finally {
      setSuppressionId(null);
    }
  }

  function ouvrirEdition(item: DossierItem) {
    setErreurEdition("");
    setEdition({
      id: item.id,
      jobTitle: item.jobTitle,
      companyName: item.companyName,
      jobUrl: item.jobUrl ?? "",
    });
  }

  async function enregistrerEdition() {
    if (!edition) return;
    const titre = edition.jobTitle.trim();
    if (titre.length < 3) {
      setErreurEdition("L'intitulé du poste doit contenir au moins 3 caractères.");
      return;
    }
    setEnregistrementEdition(true);
    setErreurEdition("");
    try {
      const res = await fetch("/api/history", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: edition.id,
          jobTitle: titre,
          companyName: edition.companyName.trim(),
          jobUrl: edition.jobUrl.trim(),
        }),
      });
      if (!res.ok) {
        setErreurEdition(await lireErreur(res, "La mise à jour a échoué (erreur " + res.status + ")."));
        return;
      }
      toast.success("Dossier mis à jour.");
      setEdition(null);
      void chargerDossiers();
    } catch {
      setErreurEdition("Connexion au serveur impossible — modifications non enregistrées.");
    } finally {
      setEnregistrementEdition(false);
    }
  }

  /* ── Valeurs dérivées ──────────────────────────────────────────────── */

  const scoreMoyen = useMemo(() => {
    const valeurs = dossiers
      .map((dossier) => scoreDossier(dossier))
      .filter((valeur): valeur is number => typeof valeur === "number");
    if (valeurs.length === 0) return null;
    return Math.round(valeurs.reduce((total, valeur) => total + valeur, 0) / valeurs.length);
  }, [dossiers]);

  const derniereEntreprise = dossiers.length > 0 ? dossiers[0].companyName : "";

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* ── En-tête ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#051937] text-[#FFC107]">
            <IconFolder size={24} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#051937]">
              {vue === "liste" ? "Mes dossiers par offre" : "Nouveau dossier par offre"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {vue === "liste"
                ? "Ton historique complet : relis, édite, exporte en PDF et partage les dossiers générés par l'IA."
                : "CV, lettre de motivation et kit d'entretien générés par l'IA pour une offre ciblée."}
            </p>
          </div>
        </div>
        {vue === "liste" ? (
          <button
            type="button"
            onClick={ouvrirCreation}
            className="inline-flex items-center gap-2 rounded-xl bg-[#051937] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b2a5b]"
          >
            <IconPlus size={18} />
            Nouveau dossier par offre
          </button>
        ) : null}
      </div>

      {/* ══ VUE A : Tableau de bord & liste des dossiers ═══════════════ */}
      {vue === "liste" ? (
        <div className="space-y-6">
          {erreur ? (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>{erreur}</span>
            </div>
          ) : null}

          {chargement ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
              <IconLoader2 size={18} className="animate-spin" />
              Chargement de ton historique...
            </div>
          ) : (
            <>
              {/* 3 cartes statistiques (KPIs) */}
              <section className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <IconFolder size={20} className="text-[#051937]" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Dossiers sauvegardés
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold text-[#051937]">{dossiers.length}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Chaque dossier généré est enregistré ici automatiquement.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <IconTargetArrow size={20} className="text-[#051937]" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Score ATS moyen (%)
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold text-[#051937]">
                    {scoreMoyen === null ? "—" : scoreMoyen}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Moyenne de tes scores de compatibilité (optimisé si disponible).
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <IconBriefcase size={20} className="text-[#051937]" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Dernière entreprise ciblée
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold text-[#051937]">
                    {derniereEntreprise || "—"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    L&apos;entreprise de ton dossier le plus récent.
                  </p>
                </div>
              </section>

              {/* Liste des dossiers sauvegardés */}
              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-[#051937]">
                  Dossiers sauvegardés
                  {dossiers.length > 0 ? (
                    <span className="ml-2 text-sm font-normal text-slate-400">
                      ({dossiers.length})
                    </span>
                  ) : null}
                </h2>

                {dossiers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
                    <p className="text-sm text-slate-500">
                      Aucun dossier pour l&apos;instant. Lance une génération : le CV adapté à
                      l&apos;offre, la lettre de motivation et le kit d&apos;entretien sont
                      sauvegardés automatiquement ici.
                    </p>
                    <button
                      type="button"
                      onClick={ouvrirCreation}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#051937] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b2a5b]"
                    >
                      <IconPlus size={16} />
                      Nouveau dossier par offre
                    </button>
                  </div>
                ) : (
                  dossiers.map((dossier) => {
                    const score = scoreDossier(dossier);
                    return (
                      <div
                        key={dossier.id}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                      >
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-semibold text-[#051937]">
                            {dossier.jobTitle}
                          </h3>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1.5">
                              <IconBriefcase size={13} />
                              {dossier.companyName || "Entreprise non précisée"}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <IconCalendarEvent size={13} />
                              {formatDate(dossier.createdAt)}
                            </span>
                            {dossier.jobUrl ? (
                              <a
                                href={dossier.jobUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 font-semibold text-[#051937] underline decoration-[#FFC107] decoration-2 underline-offset-4 transition-colors hover:text-[#0b2a5b]"
                              >
                                <IconExternalLink size={13} />
                                Voir l&apos;offre
                              </a>
                            ) : null}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-lg bg-[#FFC107]/15 px-3 py-1.5 text-sm font-bold text-[#051937]">
                            {score !== null ? `${score}%` : "—"}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setApercuId(dossier.id)}
                              title="Voir l'aperçu complet et exporter les PDF"
                              aria-label="Voir l'aperçu complet"
                              className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5"
                            >
                              <IconEye size={18} />
                            </button>
                            <button
                              type="button"
                              onClick={() => ouvrirEdition(dossier)}
                              title="Éditer le poste et l'entreprise"
                              aria-label="Éditer le dossier"
                              className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5"
                            >
                              <IconEdit size={18} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setApercuId(dossier.id)}
                              title="Aperçu + 3 exports PDF (CV, lettre, kit)"
                              aria-label="Exports PDF du dossier"
                              className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5"
                            >
                              <IconFileTypePdf size={18} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void partager(dossier)}
                              title="Copier un résumé prêt à envoyer (WhatsApp / e-mail)"
                              aria-label="Partager le dossier"
                              className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5"
                            >
                              <IconShare size={18} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void supprimer(dossier)}
                              disabled={suppressionId === dossier.id}
                              title="Supprimer définitivement"
                              aria-label="Supprimer le dossier"
                              className="rounded-lg border border-red-200 p-2 text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {suppressionId === dossier.id ? (
                                <IconLoader2 size={18} className="animate-spin" />
                              ) : (
                                <IconTrash size={18} />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </section>
            </>
          )}
        </div>
      ) : (
        /* ══ VUE B : Création — flux existant conservé ══════════════════ */
        <div className="space-y-8">
          <button
            type="button"
            onClick={retourListe}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-[#051937]"
          >
            <IconArrowLeft size={16} />
            Retour à mes dossiers
          </button>

          {offer ? (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFC107]/25 text-[#7A5C00]">
                <IconFolder size={18} stroke={1.8} />
              </span>
              <p className="min-w-0 text-sm font-semibold text-[#051937]">
                Offre chargée : <span className="font-extrabold">{titreOffre(offer) || "sans titre"}</span>
                {entrepriseOffre(offer) ? ` — ${entrepriseOffre(offer)}` : ""}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
              <IconRobot size={36} stroke={1.5} className="mx-auto text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-500">
                Aucune offre chargée — lance d&apos;abord l&apos;Agent de recherche puis clique
                « Générer le dossier », ou saisis directement l&apos;offre ci-dessous.
              </p>
              <Link
                href="/dashboard/agent"
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#051937] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#0A2A5C]"
              >
                Aller à l&apos;Agent de recherche
              </Link>
            </div>
          )}

          {DossierPanel ? (
            <DossierPanel />
          ) : (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
              <p className="text-sm font-semibold text-amber-800">
                Le composant DossierPanel est introuvable — ajuste le chemin d&apos;import en haut
                de ce fichier.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Modale : aperçu complet du dossier (4 onglets + PDF + migration) ── */}
      {dossierApercu ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-[#051937]/70 p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Aperçu du dossier"
        >
          <div className="mx-auto max-w-4xl space-y-4 pb-8">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-[#051937]">
                  {dossierApercu.jobTitle}
                </h2>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {dossierApercu.companyName || "Entreprise non précisée"} · généré le{" "}
                  {formatDate(dossierApercu.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setApercuId(null)}
                title="Fermer l'aperçu"
                aria-label="Fermer l'aperçu"
                className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5"
              >
                <IconX size={18} />
              </button>
            </div>

            {/* 3 exports PDF réels */}
            {donneesApercu ? (
              <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <BoutonPdf
                  libelle="Télécharger le CV (PDF)"
                  onClick={exporterCv}
                  enCours={pdfEnCours === "cv"}
                  disabled={!aCv(donneesApercu)}
                />
                <BoutonPdf
                  libelle="Télécharger la Lettre (PDF)"
                  onClick={exporterLettre}
                  enCours={pdfEnCours === "lettre"}
                  disabled={!aLettre(donneesApercu)}
                />
                <BoutonPdf
                  libelle="Télécharger le Kit Entretien (PDF)"
                  onClick={exporterKit}
                  enCours={pdfEnCours === "kit"}
                  disabled={!aKit(donneesApercu)}
                />
              </div>
            ) : null}

            {donneesApercu ? (
              <DossierOnglets
                donnees={donneesApercu}
                onEnregistrerLettre={enregistrerLettreApercu}
              />
            ) : (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-800">
                <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
                <span>
                  Ce dossier ne contient pas de documents exploitables (entrée ancienne de
                  l&apos;historique) — régénère-le pour obtenir le CV adapté, la lettre et le
                  kit d&apos;entretien.
                </span>
              </div>
            )}

            {/* Migration 1 clic vers les éditeurs & le suivi */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Améliorer ce dossier dans les autres outils
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => ouvrirDansCreateur(dossierApercu.id)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#051937] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0b2a5b]"
                >
                  <IconArrowRight size={16} />
                  Ouvrir &amp; Modifier ce CV dans le Créateur de CV
                </button>
                <button
                  type="button"
                  onClick={() => ouvrirDansLettres(dossierApercu.id)}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#051937]/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#051937] transition hover:bg-[#051937]/5"
                >
                  <IconArrowRight size={16} />
                  Ouvrir &amp; Modifier dans Lettres de motivation
                </button>
                <button
                  type="button"
                  onClick={() => void envoyerVersSuivi(dossierApercu)}
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
          </div>
        </div>
      ) : null}

      {/* ── Modale : édition légère ─────────────────────────────────── */}
      {edition ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#051937]/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Modifier le dossier"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-[#051937]">Modifier le dossier</h2>
              <button
                type="button"
                onClick={() => setEdition(null)}
                title="Fermer"
                aria-label="Fermer"
                className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5"
              >
                <IconX size={18} />
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Ces informations apparaissent dans ton historique de dossiers.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="edition-jobtitle" className="text-xs font-semibold text-slate-600">
                  Intitulé du poste
                </label>
                <input
                  id="edition-jobtitle"
                  type="text"
                  value={edition.jobTitle}
                  onChange={(e) => setEdition({ ...edition, jobTitle: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#051937] focus:ring-2 focus:ring-[#051937]/10"
                />
              </div>
              <div>
                <label htmlFor="edition-company" className="text-xs font-semibold text-slate-600">
                  Entreprise
                </label>
                <input
                  id="edition-company"
                  type="text"
                  value={edition.companyName}
                  onChange={(e) => setEdition({ ...edition, companyName: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#051937] focus:ring-2 focus:ring-[#051937]/10"
                />
              </div>
              <div>
                <label htmlFor="edition-joburl" className="text-xs font-semibold text-slate-600">
                  Lien de l&apos;offre (optionnel)
                </label>
                <input
                  id="edition-joburl"
                  type="url"
                  value={edition.jobUrl}
                  onChange={(e) => setEdition({ ...edition, jobUrl: e.target.value })}
                  placeholder="https://remotive.com/remote-jobs/..."
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#051937] focus:ring-2 focus:ring-[#051937]/10"
                />
              </div>
            </div>
            {erreurEdition ? (
              <p className="mt-3 text-sm text-red-600">{erreurEdition}</p>
            ) : null}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEdition(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void enregistrerEdition()}
                disabled={enregistrementEdition || edition.jobTitle.trim().length < 3}
                className="inline-flex items-center gap-2 rounded-xl bg-[#051937] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b2a5b] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {enregistrementEdition ? (
                  <IconLoader2 size={16} className="animate-spin" />
                ) : (
                  <IconDeviceFloppy size={16} />
                )}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
