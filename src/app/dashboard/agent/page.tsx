"use client";

/**
 * NexiRole — AGENT DE RECHERCHE EN DIRECT (page /dashboard/agent).
 *
 * Harmonisée sur le modèle EXACT de /dashboard/negociation : la page
 * s'organise autour de DEUX vues fluides —
 *
 *   Vue A — « Scans sauvegardés » (VUE PAR DÉFAUT) :
 *     3 cartes KPI blanches (scans enregistrés, total offres analysées,
 *     meilleur score détecté) + liste des scans enregistrés chargée au
 *     montage via GET /api/agent/scan, avec barre d'actions contextuelle :
 *     Voir les offres (panneau dépliant sous la ligne), Relancer ce scan
 *     (préremplit le formulaire, sans POST automatique), Partager
 *     (meilleure offre copiée « titre — entreprise — url »), Supprimer
 *     (window.confirm + DELETE). Dans le panneau « Voir les offres »,
 *     chaque offre propose : Transformer en dossier (localStorage
 *     "nexirole:dossier-offer" + router.push("/dashboard/dossier")) et
 *     Ajouter au suivi (POST /api/tracker, statut A_POSTULER).
 *
 *   Vue B — Recherche en direct :
 *     bouton retour « Retour à mes scans » + formulaire métier / lieu /
 *     compétences (inchangé), import de CV via /api/parse-cv (glisser-
 *     déposer conservé), lancement POST /api/agent/scan, affichage des
 *     offres notées par l'IA (scores, forces, lacunes) avec, par offre :
 *     Transformer en dossier, Ajouter au suivi et Voir l'offre.
 *     Après un scan enregistré (persisted), la liste est rafraîchie.
 *
 * La gestion des erreurs de quota (403 QUOTA_EXCEEDED / 429 RATE_LIMITED)
 * reste affichée telle quelle dans le bandeau d'erreur de recherche.
 * Icônes : exclusivement @tabler/icons-react. Charte : navy #051937 +
 * or #FFC107.
 * 
 * 
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBookmarkPlus,
  IconBriefcase,
  IconCalendarEvent,
  IconChartBar,
  IconDeviceFloppy,
  IconExternalLink,
  IconEye,
  IconFileText,
  IconLoader2,
  IconMapPin,
  IconPlus,
  IconRadar,
  IconRefresh,
  IconRobot,
  IconShare,
  IconSparkles,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types locaux                                                       */
/* ------------------------------------------------------------------ */

/** Vue courante : historique des scans (défaut) ou recherche en direct. */
type Vue = "liste" | "recherche";

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

/** Réponse du POST /api/agent/scan (contrat étendu, non modifié). */
type ScanResponse = ScanResult & {
  ok?: boolean;
  scanId?: string | null;
  persisted?: boolean;
};

/** Résultats sérialisés d'un scan enregistré (resultsJson). */
interface ScanResultatsJson {
  jobs: AgentJob[];
  totalFound: number;
  totalKept: number;
  aiAvailable: boolean;
  warnings: string[];
}

/** Enregistrement AgentScanHistory renvoyé par GET /api/agent/scan. */
interface ScanSauvegarde {
  id: string;
  targetRole: string;
  location: string;
  keywords: string[];
  resultsJson: ScanResultatsJson;
  bestScore: number;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */

/* Contrat conservé avec la page « Dossier & documents » */
const DOSSIER_STORAGE_KEY = "nexirole:dossier-offer";
const DOSSIER_EVENT_NAME = "nexirole:open-dossier";

const ACCEPTED_FORMATS =
  ".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt,.md";

/* ------------------------------------------------------------------ */
/*  Aides réseau & normalisation (copie conforme du modèle)            */
/* ------------------------------------------------------------------ */

function erreurDepuisTexte(brut: string, fallback: string): string {
  try {
    const data = JSON.parse(brut) as { error?: string; diagnostic?: string };
    const base = data.error || fallback;
    return data.diagnostic ? `${base} [Détail : ${data.diagnostic}]` : base;
  } catch {
    return `${fallback} (réponse non JSON — regarde le terminal « npm run dev »)`;
  }
}

async function lireErreur(res: Response, fallback: string): Promise<string> {
  let brut = "";
  try {
    brut = await res.text();
  } catch {
    return fallback;
  }
  return erreurDepuisTexte(brut, fallback);
}

async function lireJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function nombre(valeur: unknown, defaut: number): number {
  return typeof valeur === "number" && Number.isFinite(valeur) ? valeur : defaut;
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

/** Normalise une offre stockée dans resultsJson (tolérant aux trous). */
function normaliserJob(brut: Record<string, unknown>): AgentJob | null {
  const titre = typeof brut.title === "string" ? brut.title : "";
  const entreprise = typeof brut.company === "string" ? brut.company : "";
  const url = typeof brut.url === "string" ? brut.url : "";
  if (!titre.trim() && !url.trim()) return null;
  const chaines = (valeur: unknown): string[] =>
    Array.isArray(valeur)
      ? (valeur as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
  return {
    id: typeof brut.id === "string" ? brut.id : `${titre}|${entreprise}|${url}`,
    title: titre,
    company: entreprise,
    location: typeof brut.location === "string" ? brut.location : "",
    url,
    source: typeof brut.source === "string" ? brut.source : "",
    postedAt: typeof brut.postedAt === "string" ? brut.postedAt : undefined,
    tags: chaines(brut.tags),
    description: typeof brut.description === "string" ? brut.description : "",
    score: Math.round(nombre(brut.score, 0)),
    reason: typeof brut.reason === "string" ? brut.reason : "",
    strengths: chaines(brut.strengths),
    missingSkills: chaines(brut.missingSkills),
    aiScored: brut.aiScored === true,
  };
}

/** Normalise une ligne AgentScanHistory renvoyée par GET /api/agent/scan. */
function normaliserScan(brut: Record<string, unknown>): ScanSauvegarde | null {
  if (typeof brut.id !== "string") return null;
  const resultatsBrut =
    brut.resultsJson && typeof brut.resultsJson === "object"
      ? (brut.resultsJson as Record<string, unknown>)
      : null;
  const jobsBrut: unknown[] =
    resultatsBrut && Array.isArray(resultatsBrut.jobs)
      ? (resultatsBrut.jobs as unknown[])
      : [];
  const jobs: AgentJob[] = [];
  for (const jb of jobsBrut) {
    if (jb && typeof jb === "object") {
      const job = normaliserJob(jb as Record<string, unknown>);
      if (job) jobs.push(job);
    }
  }
  const keywordsBrut: unknown[] = Array.isArray(brut.keywords)
    ? (brut.keywords as unknown[])
    : [];
  const warningsBrut: unknown[] =
    resultatsBrut && Array.isArray(resultatsBrut.warnings)
      ? (resultatsBrut.warnings as unknown[])
      : [];
  return {
    id: brut.id,
    targetRole: typeof brut.targetRole === "string" ? brut.targetRole : "",
    location: typeof brut.location === "string" ? brut.location : "",
    keywords: keywordsBrut.filter(
      (k): k is string => typeof k === "string" && k.trim() !== ""
    ),
    resultsJson: {
      jobs,
      totalFound: nombre(resultatsBrut?.totalFound, jobs.length),
      totalKept: nombre(resultatsBrut?.totalKept, jobs.length),
      aiAvailable: resultatsBrut?.aiAvailable === true,
      warnings: warningsBrut.filter((w): w is string => typeof w === "string"),
    },
    bestScore:
      typeof brut.bestScore === "number" && Number.isFinite(brut.bestScore)
        ? brut.bestScore
        : jobs.length > 0
          ? jobs[0].score
          : 0,
    createdAt: typeof brut.createdAt === "string" ? brut.createdAt : "",
  };
}

/* Styles de score — scan en direct (conservés) et panneau des offres. */

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

/** Badge score du panneau « Voir les offres » : ≥ 80 vert, ≥ 60 doré, sinon gris. */
function classeBadgeScore(score: number): string {
  if (score >= 80) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (score >= 60) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

/** Copie dans le presse-papier, avec repli pour les navigateurs sans Clipboard API. */
async function copierTexte(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    try {
      const zone = document.createElement("textarea");
      zone.value = texte;
      zone.style.position = "fixed";
      zone.style.opacity = "0";
      document.body.appendChild(zone);
      zone.select();
      const reussi = document.execCommand("copy");
      zone.remove();
      return reussi;
    } catch {
      return false;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AgentPage() {
  const router = useRouter();

  /* Vue courante : liste des scans (PAR DÉFAUT) ou recherche en direct. */
  const [vue, setVue] = useState<Vue>("liste");

  /* Historique des scans sauvegardés (GET /api/agent/scan). */
  const [scans, setScans] = useState<ScanSauvegarde[]>([]);
  const [chargementListe, setChargementListe] = useState(true);
  const [erreurListe, setErreurListe] = useState("");

  /* Actions contextuelles sur la liste. */
  const [scanDeplieId, setScanDeplieId] = useState<string | null>(null);
  const [suppressionId, setSuppressionId] = useState<string | null>(null);
  const [suiviEnCours, setSuiviEnCours] = useState<string | null>(null);

  /* Formulaire de recherche (conservé à l'identique). */
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

  /* Recherche en direct */
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [result, setResult] = useState<ScanResponse | null>(null);

  const demarrageFaitRef = useRef(false);

  /* ── Historique : GET /api/agent/scan ────────────────────────────── */

  async function chargerScans() {
    try {
      const res = await fetch("/api/agent/scan");
      if (!res.ok) {
        setErreurListe(
          await lireErreur(res, "Impossible de charger tes scans (erreur " + res.status + ").")
        );
        return;
      }
      const data = await lireJson(res);
      if (!data) {
        setErreurListe("Réponse inattendue du serveur.");
        return;
      }
      setErreurListe("");
      const listeBrute = Array.isArray(data.scans) ? data.scans : [];
      const liste: ScanSauvegarde[] = [];
      for (const brut of listeBrute) {
        if (brut && typeof brut === "object") {
          const scan = normaliserScan(brut as Record<string, unknown>);
          if (scan) liste.push(scan);
        }
      }
      setScans(liste);
    } catch {
      setErreurListe("Connexion au serveur impossible. Vérifie ta connexion et recharge.");
    } finally {
      setChargementListe(false);
    }
  }

  useEffect(() => {
    if (demarrageFaitRef.current) return;
    demarrageFaitRef.current = true;
    void chargerScans();
  }, []);

  /* ── Navigation entre les vues ───────────────────────────────────── */

  function ouvrirNouveauScan() {
    setMetier("");
    setLieu("");
    setCompetences("");
    setCvFileName("");
    setExtracted(null);
    setImportError("");
    setResult(null);
    setSearchError("");
    setVue("recherche");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* Préremplit le formulaire avec les paramètres du scan — l'utilisateur
     relance lui-même la recherche (aucun POST automatique). */
  function relancerScan(scan: ScanSauvegarde) {
    setMetier(scan.targetRole);
    setLieu(scan.location);
    setCompetences(scan.keywords.join(", "));
    setResult(null);
    setSearchError("");
    setImportError("");
    setScanDeplieId(null);
    setVue("recherche");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function retourListe() {
    setVue("liste");
    setResult(null);
    setSearchError("");
    setScanDeplieId(null);
    void chargerScans();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ── Import de CV — PDF, PNG, JPEG, WEBP, DOCX, TXT (conservé) ───── */

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

  /* ── Recherche en direct (POST /api/agent/scan) ──────────────────── */

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
      const brut = await res.text().catch(() => "");
      let data: ScanResponse | null = null;
      try {
        data = brut ? (JSON.parse(brut) as ScanResponse) : null;
      } catch {
        data = null;
      }
      if (!res.ok || !data || data.error) {
        /* 403 QUOTA_EXCEEDED (limite du plan) et 429 RATE_LIMITED : le
           message du serveur est affiché tel quel dans le bandeau. */
        setSearchError(
          erreurDepuisTexte(brut, "Le scan a échoué. Réessayez dans un instant.")
        );
        return;
      }
      setResult(data);
      if (data.persisted) {
        toast.success("Scan terminé — enregistré dans « Scans sauvegardés ».");
        void chargerScans();
      }
    } catch {
      setSearchError("Réseau indisponible : réessayez dans un instant.");
    } finally {
      setLoading(false);
    }
  }

  /* ── Transformer en dossier (pont « Dossier & documents ») ───────── */

  /* Transmet l'offre à la page « Dossier & documents » — même sérialisation
     localStorage "nexirole:dossier-offer" que précédemment ; la route est
     corrigée en /dashboard/dossier (au singulier, route existante). */
  function transformerEnDossier(job: AgentJob) {
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
    router.push("/dashboard/dossier");
  }

  /* ── Ajouter au suivi des candidatures (POST /api/tracker) ───────── */

  async function ajouterAuSuivi(job: AgentJob) {
    setSuiviEnCours(job.id);
    try {
      const res = await fetch("/api/tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: job.title.trim() || "Offre sans titre",
          companyName: job.company.trim() || "Entreprise non précisée",
          jobUrl: job.url,
          status: "A_POSTULER",
        }),
      });
      if (!res.ok) {
        toast.error(
          await lireErreur(res, "L'ajout au suivi a échoué (erreur " + res.status + ").")
        );
        return;
      }
      toast.success("Offre ajoutée à ton suivi de candidatures (statut « À postuler »).");
    } catch {
      toast.error("Réseau indisponible — l'offre n'a pas été ajoutée au suivi.");
    } finally {
      setSuiviEnCours(null);
    }
  }

  /* ── Partager : meilleure offre copiée « titre — entreprise — url » ─ */

  async function partagerScan(scan: ScanSauvegarde) {
    /* Les offres sont triées par score décroissant : la première est la meilleure. */
    const meilleure = scan.resultsJson.jobs[0] ?? null;
    const texte = meilleure
      ? `${meilleure.title} — ${meilleure.company} — ${meilleure.url}`
      : `${scan.targetRole || "Scan de l'agent"} — ${scan.location || "tous les lieux"}`;
    const reussi = await copierTexte(texte);
    if (reussi) {
      toast.success("Copié dans le presse-papier — colle-le où tu veux.");
    } else {
      toast.error("Copie impossible : sélectionne le texte et copie-le manuellement.");
    }
  }

  /* ── Suppression d'un scan (DELETE /api/agent/scan?id=...) ───────── */

  async function supprimerScan(scan: ScanSauvegarde) {
    const confirme = window.confirm(
      `Supprimer définitivement le scan « ${scan.targetRole || "sans métier"} » ? Cette action est irréversible.`
    );
    if (!confirme) return;
    setSuppressionId(scan.id);
    try {
      const res = await fetch(`/api/agent/scan?id=${encodeURIComponent(scan.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error(
          await lireErreur(res, "Suppression impossible (erreur " + res.status + ").")
        );
        return;
      }
      toast.success("Scan supprimé de ton historique.");
      if (scanDeplieId === scan.id) setScanDeplieId(null);
      void chargerScans();
    } catch {
      toast.error("Connexion au serveur impossible — suppression non effectuée.");
    } finally {
      setSuppressionId(null);
    }
  }

  /* ── Valeurs dérivées (KPIs) ─────────────────────────────────────── */

  const totalOffresAnalysees = scans.reduce(
    (somme, scan) => somme + (scan.resultsJson?.totalKept ?? 0),
    0
  );
  const meilleurScore = scans.reduce((max, scan) => Math.max(max, scan.bestScore), 0);

  const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy shadow-sm outline-none transition placeholder:text-slate-400 focus:border-navy/40 focus:ring-2 focus:ring-navy/10";

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* ── En-tête ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#051937] text-[#FFC107]">
            <IconRobot size={24} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#051937]">
              Agent de recherche en direct
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {vue === "liste"
                ? "Ton historique de scans : relis les offres notées par l'IA, relance une recherche ou transforme la meilleure offre en dossier."
                : "Recherche en direct sur Remotive et Arbeitnow : chaque offre est notée par l'IA selon votre profil, puis transformable en dossier complet."}
            </p>
          </div>
        </div>
        {vue === "liste" ? (
          <button
            type="button"
            onClick={ouvrirNouveauScan}
            className="inline-flex items-center gap-2 rounded-xl bg-[#051937] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b2a5b]"
          >
            <IconPlus size={18} />
            Nouveau scan en direct
          </button>
        ) : null}
      </div>

      {/* ══ VUE A : Scans sauvegardés (par défaut) ═════════════════════ */}
      {vue === "liste" ? (
        <div className="space-y-6">
          {erreurListe ? (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>{erreurListe}</span>
            </div>
          ) : null}

          {chargementListe ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
              <IconLoader2 size={18} className="animate-spin" />
              Chargement de tes scans...
            </div>
          ) : (
            <>
              {/* 3 cartes KPI */}
              <section className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <IconDeviceFloppy size={20} className="text-[#051937]" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Scans enregistrés
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold text-[#051937]">{scans.length}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Tous tes scans, reconsultables à tout moment.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <IconBriefcase size={20} className="text-[#051937]" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Total offres analysées
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold text-[#051937]">
                    {totalOffresAnalysees}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Offres notées et conservées par l&apos;agent, tous scans confondus.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <IconChartBar size={20} className="text-[#051937]" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Meilleur score détecté (%)
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold text-[#051937]">
                    {meilleurScore > 0 ? meilleurScore : "—"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Le meilleur matching profil ↔ offre de ton historique.
                  </p>
                </div>
              </section>

              {/* Liste des scans sauvegardés */}
              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-[#051937]">
                  Scans sauvegardés
                  <span className="ml-2 text-sm font-normal text-slate-400">
                    ({scans.length})
                  </span>
                </h2>

                {scans.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
                    <p className="text-sm text-slate-500">
                      Aucun scan pour l&apos;instant. Lance ta première recherche en direct :
                      l&apos;agent interroge Remotive et Arbeitnow, note chaque offre avec
                      l&apos;IA et sauvegarde automatiquement les résultats ici.
                    </p>
                    <button
                      type="button"
                      onClick={ouvrirNouveauScan}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#051937] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b2a5b]"
                    >
                      <IconPlus size={16} />
                      Nouveau scan en direct
                    </button>
                  </div>
                ) : (
                  scans.map((scan) => {
                    const deplie = scanDeplieId === scan.id;
                    const resultats = scan.resultsJson;
                    return (
                      <div key={scan.id} className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate font-semibold text-[#051937]">
                              {scan.targetRole || "Scan par compétences"}
                            </h3>
                            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                              <span className="inline-flex items-center gap-1">
                                <IconMapPin size={13} />
                                {scan.location || "Tous les lieux"}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <IconCalendarEvent size={13} />
                                {formatDate(scan.createdAt)}
                              </span>
                              {scan.keywords.slice(0, 3).map((mot) => (
                                <span
                                  key={mot}
                                  className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                                >
                                  {mot}
                                </span>
                              ))}
                              {scan.keywords.length > 3 ? (
                                <span className="text-[11px] font-semibold text-slate-400">
                                  +{scan.keywords.length - 3}
                                </span>
                              ) : null}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="rounded-lg bg-[#FFC107]/15 px-3 py-1.5 text-sm font-bold text-[#051937]">
                              {scan.bestScore > 0 ? `${scan.bestScore}%` : "—"}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setScanDeplieId(deplie ? null : scan.id)}
                                aria-expanded={deplie}
                                title="Voir les offres de ce scan"
                                aria-label="Voir les offres de ce scan"
                                className={`rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5 ${
                                  deplie ? "bg-[#051937]/5" : ""
                                }`}
                              >
                                <IconEye size={18} />
                              </button>
                              <button
                                type="button"
                                onClick={() => relancerScan(scan)}
                                title="Relancer ce scan (préremplit le formulaire)"
                                aria-label="Relancer ce scan"
                                className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5"
                              >
                                <IconRefresh size={18} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void partagerScan(scan)}
                                title="Copier la meilleure offre (titre — entreprise — lien)"
                                aria-label="Partager la meilleure offre"
                                className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5"
                              >
                                <IconShare size={18} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void supprimerScan(scan)}
                                disabled={suppressionId === scan.id}
                                title="Supprimer définitivement"
                                aria-label="Supprimer définitivement"
                                className="rounded-lg border border-red-200 p-2 text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {suppressionId === scan.id ? (
                                  <IconLoader2 size={18} className="animate-spin" />
                                ) : (
                                  <IconTrash size={18} />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Panneau dépliant « Voir les offres » */}
                        {deplie ? (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <h4 className="text-sm font-semibold text-[#051937]">
                                Offres de ce scan ({resultats.jobs.length})
                                <span className="ml-2 text-xs font-normal text-slate-400">
                                  {resultats.totalKept} retenue
                                  {resultats.totalKept > 1 ? "s" : ""} sur{" "}
                                  {resultats.totalFound} trouvée
                                  {resultats.totalFound > 1 ? "s" : ""}
                                </span>
                              </h4>
                              <button
                                type="button"
                                onClick={() => setScanDeplieId(null)}
                                title="Fermer le détail des offres"
                                aria-label="Fermer le détail des offres"
                                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition-colors hover:bg-[#051937]/5 hover:text-[#051937]"
                              >
                                <IconX size={16} />
                              </button>
                            </div>

                            {resultats.jobs.length === 0 ? (
                              <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-sm text-slate-500">
                                Aucune offre enregistrée pour ce scan.
                              </p>
                            ) : (
                              <div className="space-y-3">
                                {resultats.jobs.map((job) => (
                                  <div
                                    key={job.id}
                                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <h5 className="truncate font-semibold text-[#051937]">
                                          {job.title}
                                        </h5>
                                        <p className="mt-0.5 text-xs text-slate-500">
                                          {job.company}
                                          {job.location ? ` · ${job.location}` : ""}
                                          {job.source ? ` · ${job.source}` : ""}
                                        </p>
                                        {job.aiScored && job.reason ? (
                                          <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                            {job.reason}
                                          </p>
                                        ) : null}
                                      </div>
                                      <span
                                        className={`rounded-lg border px-3 py-1.5 text-sm font-bold ${classeBadgeScore(
                                          job.score
                                        )}`}
                                      >
                                        {job.score}%
                                      </span>
                                    </div>
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                      <a
                                        href={job.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                                      >
                                        Voir l&apos;offre
                                        <IconExternalLink size={14} />
                                      </a>
                                      <button
                                        type="button"
                                        onClick={() => transformerEnDossier(job)}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#051937]/20 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#051937] transition-colors hover:bg-[#051937]/5"
                                      >
                                        <IconSparkles size={14} />
                                        Transformer en dossier
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void ajouterAuSuivi(job)}
                                        disabled={suiviEnCours === job.id}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {suiviEnCours === job.id ? (
                                          <IconLoader2 size={14} className="animate-spin" />
                                        ) : (
                                          <IconBookmarkPlus size={14} />
                                        )}
                                        Ajouter au suivi
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </section>
            </>
          )}
        </div>
      ) : (
        /* ══ VUE B : Recherche en direct ═══════════════════════════════ */
        <div className="space-y-8">
          <button
            type="button"
            onClick={retourListe}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-[#051937]"
          >
            <IconArrowLeft size={16} />
            Retour à mes scans
          </button>

          {/* Formulaire de recherche (conservé intégralement) */}
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

          {/* Erreur de recherche (quota 403 QUOTA_EXCEEDED inclus) */}
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
                          onClick={() => transformerEnDossier(job)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-sm font-bold text-navy transition hover:bg-gold-dark"
                        >
                          <IconSparkles className="size-4" />
                          Transformer en dossier
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
                        <button
                          type="button"
                          onClick={() => void ajouterAuSuivi(job)}
                          disabled={suiviEnCours === job.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {suiviEnCours === job.id ? (
                            <IconLoader2 className="size-4 animate-spin" />
                          ) : (
                            <IconBookmarkPlus className="size-4" />
                          )}
                          Ajouter au suivi
                        </button>
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
      )}
    </div>
  );
}
