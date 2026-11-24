"use client";

/**
 * NexiRole — LETTRES DE MOTIVATION (page /dashboard/lettres).
 *
 * Refonte « Historique & Dossiers » harmonisée sur le modèle EXACT de la
 * page Négociation (/dashboard/negociation) : la page s'organise autour de
 * DEUX vues fluides :
 *
 *   Vue A — Tableau de bord & liste des lettres (par défaut) :
 *     3 cartes statistiques (lettres sauvegardées, dernière entreprise
 *     ciblée, statut du moteur IA) + liste complète des lettres en
 *     base avec barre d'actions par ligne : Voir / Éditer /
 *     Télécharger PDF / Partager / Supprimer.
 *
 *   Vue B — Formulaire de création IA & éditeur :
 *     formulaire (poste, entreprise, ton, langue, offre, CV) → génération
 *     Groq, puis éditeur avec SAUVEGARDE AUTOMATIQUE (1,2 s après la frappe).
 *
 * - Règle d'or conservée : avant Copier / Imprimer / Régénérer / Retour, le
 *   contenu est TOUJOURS sauvegardé en base d'abord — l'export et la base
 *   sont donc toujours identiques.
 * - Export PDF via la fenêtre d'impression du navigateur (zéro dépendance).
 * - Notifications via sonner (Toaster monté dans src/app/layout.tsx).
 *
 * API : GET/POST /api/lettre, GET/PATCH/PUT/DELETE /api/lettre/[id],
 * GET /api/lettre/ia-status (statut moteur IA + base).
 *
 * Utilise la mini-bibliothèque UI maison (@/components/ui) et la charte
 * NexiRole (navy #051937 / or #FFC107) — aucun composant externe.
 * Icônes : exclusivement @tabler/icons-react.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button, Input, Textarea, Label, cx } from "@/components/ui";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBuildingSkyscraper,
  IconCalendarEvent,
  IconCheck,
  IconCopy,
  IconEdit,
  IconEye,
  IconFileDescription,
  IconFiles,
  IconFileTypePdf,
  IconLoader2,
  IconPlus,
  IconPrinter,
  IconRefresh,
  IconShare,
  IconSparkles,
  IconTrash,
  IconX,
} from "@tabler/icons-react";

/* ── Types ───────────────────────────────────────────────────────────── */

type Lettre = {
  id: string;
  title: string;
  company: string;
  position: string;
  tone: string;
  language: string;
  jobOffer: string;
  cvText: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

/** Élément de GET /api/lettre (SANS content). */
type LettreListItem = Pick<
  Lettre,
  "id" | "title" | "company" | "position" | "tone" | "language" | "createdAt" | "updatedAt"
>;

/** Réponse de GET /api/lettre/ia-status. */
type StatutIaDb = {
  ia: { pret: boolean; provider: string; model: string };
  db: { ok: boolean; message: string };
};

type Etat = "propre" | "sale" | "sauvegarde";

type NouveauFormulaire = {
  company: string;
  position: string;
  tone: string;
  language: string;
  jobOffer: string;
  cvText: string;
};

const TONS: Array<{ value: string; label: string }> = [
  { value: "professionnel", label: "Professionnel et posé" },
  { value: "enthousiaste", label: "Enthousiaste et dynamique" },
  { value: "direct", label: "Direct et efficace" },
  { value: "creatif", label: "Créatif mais crédible" },
];

const LANGUES: Array<{ value: string; label: string }> = [
  { value: "fr", label: "Français" },
  { value: "en", label: "Anglais" },
];

const CSS_IMPRESSION = `
@media print {
  body * { visibility: hidden !important; }
  .zone-impression, .zone-impression * { visibility: visible !important; }
  .zone-impression {
    display: block !important;
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    padding: 32px;
    background: #ffffff;
    color: #000000;
  }
}
`;

/* ── Aides réseau & formatage (copie du modèle négociation) ──────────── */

/**
 * Lit le corps d'une réponse d'erreur SANS planter, que le serveur renvoie
 * du JSON ({ error, diagnostic }) ou du HTML (erreur de compilation dev).
 */
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

/** Copie robuste dans le presse-papier (fallback navigateurs anciens). */
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

/* ── Page ────────────────────────────────────────────────────────────── */

export default function LettresPage() {
  /* Vue courante : tableau de bord (liste, par défaut) ou création IA. */
  const [vue, setVue] = useState<"liste" | "creation">("liste");

  /* Données : liste en base + statut IA. */
  const [lettres, setLettres] = useState<LettreListItem[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreurListe, setErreurListe] = useState("");
  const [statut, setStatut] = useState<StatutIaDb | null>(null);
  const [statutEnCours, setStatutEnCours] = useState(true);

  /* Formulaire (création IA). */
  const [form, setForm] = useState<NouveauFormulaire>({
    company: "",
    position: "",
    tone: "professionnel",
    language: "fr",
    jobOffer: "",
    cvText: "",
  });

  /* Éditeur (lettre ouverte, sauvegarde automatique). */
  const [lettre, setLettre] = useState<Lettre | null>(null);
  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState("");
  const [etat, setEtat] = useState<Etat>("propre");
  const [derniereSauvegarde, setDerniereSauvegarde] = useState("");
  const [generation, setGeneration] = useState(false);
  const [erreur, setErreur] = useState("");
  const [copie, setCopie] = useState(false);

  /* Actions sur les lettres de la liste. */
  const [lectureId, setLectureId] = useState<string | null>(null);
  const [editionId, setEditionId] = useState<string | null>(null);
  const [lettreLue, setLettreLue] = useState<Lettre | null>(null);
  const [pdfId, setPdfId] = useState<string | null>(null);
  const [partageId, setPartageId] = useState<string | null>(null);
  const [suppressionId, setSuppressionId] = useState<string | null>(null);
  const [contenuImpression, setContenuImpression] = useState("");

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contenuRef = useRef("");
  const titreRef = useRef("");
  const lettreIdRef = useRef<string | null>(null);
  const etatRef = useRef<Etat>("propre");
  // StrictMode (dev) monte le composant 2 fois : ce garde évite 2 appels API.
  const demarrageFaitRef = useRef(false);

  function majEtat(v: Etat) {
    etatRef.current = v;
    setEtat(v);
  }

  /* ── Éditeur : sauvegarde automatique (PATCH /api/lettre/[id]) ────── */

  const sauvegarder = useCallback(async () => {
    const id = lettreIdRef.current;
    if (!id) return;
    majEtat("sauvegarde");
    try {
      const res = await fetch("/api/lettre/" + id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titreRef.current, content: contenuRef.current }),
      });
      if (!res.ok) throw new Error("echec sauvegarde");
      majEtat("propre");
      setDerniereSauvegarde(new Date().toLocaleTimeString("fr-FR"));
    } catch {
      majEtat("sale");
    }
  }, []);

  function programmerSauvegarde() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void sauvegarder();
    }, 1200);
  }

  function handleContenu(v: string) {
    setContenu(v);
    contenuRef.current = v;
    majEtat("sale");
    programmerSauvegarde();
  }

  function handleTitre(v: string) {
    setTitre(v);
    titreRef.current = v;
    majEtat("sale");
    programmerSauvegarde();
  }

  /** Règle d'or : on sauvegarde en base AVANT toute action. */
  async function avantExport() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (etatRef.current !== "propre") {
      await sauvegarder();
    }
  }

  /* ── Chargement de la liste + statut IA (GET /api/lettre) ────────── */

  async function chargerLettres() {
    setChargement(true);
    try {
      const res = await fetch("/api/lettre");
      if (!res.ok) {
        setErreurListe(
          await lireErreur(
            res,
            res.status === 401
              ? "Session expirée — déconnecte-toi, reconnecte-toi, puis recharge la page."
              : "Chargement impossible (erreur " + res.status + ")."
          )
        );
        return;
      }
      const data = (await res.json()) as { lettres?: LettreListItem[] };
      setLettres(data.lettres || []);
      setErreurListe("");
    } catch {
      setErreurListe("Chargement impossible (réseau).");
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    if (demarrageFaitRef.current) return;
    demarrageFaitRef.current = true;
    void chargerLettres();
    void (async () => {
      try {
        const r = await fetch("/api/lettre/ia-status");
        if (r.ok) setStatut((await r.json()) as StatutIaDb);
      } catch {
        // statut indisponible : non bloquant
      } finally {
        setStatutEnCours(false);
      }
    })();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Fermeture de la modale de lecture avec la touche Échap. */
  useEffect(() => {
    if (!lettreLue) return;
    function surEchap(event: KeyboardEvent) {
      if (event.key === "Escape") setLettreLue(null);
    }
    document.addEventListener("keydown", surEchap);
    return () => document.removeEventListener("keydown", surEchap);
  }, [lettreLue]);

  /* ── Navigation entre les vues ────────────────────────────────────── */

  function reinitialiserEditeur() {
    setLettre(null);
    lettreIdRef.current = null;
    setTitre("");
    titreRef.current = "";
    setContenu("");
    contenuRef.current = "";
    majEtat("propre");
    setDerniereSauvegarde("");
  }

  function chargerDansEditeur(l: Lettre) {
    setLettre(l);
    lettreIdRef.current = l.id;
    setTitre(l.title);
    titreRef.current = l.title;
    setContenu(l.content);
    contenuRef.current = l.content;
    majEtat("propre");
    setDerniereSauvegarde("");
  }

  /** Bouton « + Nouvelle lettre de motivation » : bascule vers la création. */
  function ouvrirNouvelleLettre() {
    setForm({
      company: "",
      position: "",
      tone: "professionnel",
      language: "fr",
      jobOffer: "",
      cvText: "",
    });
    reinitialiserEditeur();
    setErreur("");
    setVue("creation");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Bouton « ← Retour à mes lettres » : règle d'or + rafraîchissement. */
  async function retourListe() {
    await avantExport();
    reinitialiserEditeur();
    setErreur("");
    setVue("liste");
    await chargerLettres();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ── Actions sur une lettre (barre d'actions de la liste) ─────────── */

  /** Voir : GET /api/lettre/[id] puis modale de lecture. */
  async function voirLettre(id: string) {
    setLectureId(id);
    try {
      const res = await fetch("/api/lettre/" + id);
      if (!res.ok) {
        toast.error(await lireErreur(res, "Lettre introuvable."));
        return;
      }
      const data = (await res.json()) as { lettre?: Lettre };
      if (!data.lettre) {
        toast.error("Réponse inattendue du serveur.");
        return;
      }
      setLettreLue(data.lettre);
    } catch {
      toast.error("Ouverture impossible — vérifie ta connexion.");
    } finally {
      setLectureId(null);
    }
  }

  /** Éditer : charge la lettre dans l'éditeur (vue création). */
  async function ouvrirEdition(id: string) {
    setEditionId(id);
    setErreur("");
    try {
      const res = await fetch("/api/lettre/" + id);
      if (!res.ok) {
        toast.error(await lireErreur(res, "Lettre introuvable."));
        return;
      }
      const data = (await res.json()) as { lettre?: Lettre };
      if (!data.lettre) {
        toast.error("Réponse inattendue du serveur.");
        return;
      }
      chargerDansEditeur(data.lettre);
      setVue("creation");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast.error("Ouverture impossible — vérifie ta connexion.");
    } finally {
      setEditionId(null);
    }
  }

  /** Télécharger PDF : GET /api/lettre/[id] puis fenêtre d'impression. */
  async function telechargerPdfDepuisListe(id: string) {
    setPdfId(id);
    try {
      const res = await fetch("/api/lettre/" + id);
      if (!res.ok) {
        toast.error(await lireErreur(res, "Lettre introuvable."));
        return;
      }
      const data = (await res.json()) as { lettre?: Lettre };
      if (!data.lettre) {
        toast.error("Réponse inattendue du serveur.");
        return;
      }
      setContenuImpression(data.lettre.content);
      // Laisse le navigateur peindre la zone d'impression avant window.print().
      await new Promise((resolve) => window.setTimeout(resolve, 80));
      window.print();
      toast.success("Fenêtre d'impression ouverte — choisis « Enregistrer au format PDF ».");
    } catch {
      toast.error("Téléchargement impossible — vérifie ta connexion.");
    } finally {
      setPdfId(null);
    }
  }

  /** Partager : copie le contenu complet dans le presse-papier + toast. */
  async function partagerLettre(id: string) {
    setPartageId(id);
    try {
      const res = await fetch("/api/lettre/" + id);
      if (!res.ok) {
        toast.error(await lireErreur(res, "Lettre introuvable."));
        return;
      }
      const data = (await res.json()) as { lettre?: Lettre };
      if (!data.lettre) {
        toast.error("Réponse inattendue du serveur.");
        return;
      }
      const reussi = await copierTexte(data.lettre.content);
      if (reussi) {
        toast.success("Contenu de la lettre copié — colle-le dans un e-mail ou WhatsApp.");
      } else {
        toast.error("Copie impossible : ouvre la lettre et copie le texte manuellement.");
      }
    } catch {
      toast.error("Partage impossible — vérifie ta connexion.");
    } finally {
      setPartageId(null);
    }
  }

  /** Supprimer : window.confirm puis DELETE /api/lettre/[id]. */
  async function supprimerLettre(id: string, titreLettre: string, depuisEditeur = false) {
    const confirme = window.confirm(
      `Supprimer définitivement la lettre « ${titreLettre} » ? Cette action est irréversible.`
    );
    if (!confirme) return;
    setSuppressionId(id);
    try {
      const res = await fetch("/api/lettre/" + id, { method: "DELETE" });
      if (!res.ok) {
        toast.error(
          await lireErreur(res, "Suppression impossible (erreur " + res.status + ").")
        );
        return;
      }
      toast.success("Lettre supprimée de ton historique.");
      if (depuisEditeur || lettreIdRef.current === id) {
        reinitialiserEditeur();
        if (depuisEditeur) setVue("liste");
      }
      await chargerLettres();
    } catch {
      toast.error("Connexion au serveur impossible — suppression non effectuée.");
    } finally {
      setSuppressionId(null);
    }
  }

  /* ── Génération IA (POST /api/lettre) ─────────────────────────────── */

  async function generer() {
    setErreur("");
    setGeneration(true);
    try {
      const res = await fetch("/api/lettre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        setErreur(await lireErreur(res, "Génération impossible."));
        return;
      }
      const data = (await res.json()) as { lettre?: Lettre };
      if (!data.lettre) {
        setErreur("Réponse inattendue du serveur.");
        return;
      }
      /* La route POST sauvegarde déjà la lettre en base : on l'ouvre
         directement dans l'éditeur, et on rafraîchit la liste. */
      chargerDansEditeur(data.lettre);
      toast.success("Lettre générée et sauvegardée automatiquement dans ton historique.");
      void chargerLettres();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setErreur("Génération impossible (réseau).");
    } finally {
      setGeneration(false);
    }
  }

  /** Régénérer : nouvelle génération IA (POST) puis mise à jour de l'éditeur. */
  async function regenerer() {
    if (!lettre) return;
    if (
      !window.confirm(
        "Remplacer le contenu actuel par une nouvelle génération IA ? Une nouvelle lettre sera aussi ajoutée à ton historique."
      )
    ) {
      return;
    }
    setErreur("");
    setGeneration(true);
    try {
      const res = await fetch("/api/lettre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: lettre.company,
          position: lettre.position,
          tone: lettre.tone,
          language: lettre.language,
          jobOffer: lettre.jobOffer,
          cvText: lettre.cvText,
        }),
      });
      if (!res.ok) {
        setErreur(await lireErreur(res, "Génération impossible."));
        return;
      }
      const data = (await res.json()) as { lettre?: Lettre };
      if (!data.lettre) {
        setErreur("Réponse inattendue du serveur.");
        return;
      }
      const nouveau = data.lettre.content;
      setContenu(nouveau);
      contenuRef.current = nouveau;
      majEtat("sale");
      programmerSauvegarde();
      void chargerLettres();
      toast.success("Nouvelle version générée — la lettre ouverte est mise à jour.");
    } catch {
      setErreur("Génération impossible (réseau).");
    } finally {
      setGeneration(false);
    }
  }

  /* ── Actions de l'éditeur (règle d'or : sauvegarde avant export) ──── */

  async function copierEditeur() {
    await avantExport();
    const reussi = await copierTexte(contenuRef.current);
    if (reussi) {
      setCopie(true);
      window.setTimeout(() => setCopie(false), 2000);
    } else {
      toast.error("Copie impossible dans ce navigateur.");
    }
  }

  async function imprimer() {
    await avantExport();
    setContenuImpression(contenuRef.current);
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    window.print();
  }

  /* ── Valeurs dérivées ──────────────────────────────────────────────── */

  const texteEtat =
    etat === "sale"
      ? "Modifications non enregistrées…"
      : etat === "sauvegarde"
        ? "Enregistrement…"
        : derniereSauvegarde
          ? "Enregistré à " + derniereSauvegarde
          : "Enregistré";

  const titrePage = vue === "liste"
    ? "Mes lettres de motivation"
    : lettre
      ? "Modifier ma lettre"
      : "Nouvelle lettre de motivation";

  const sousTitrePage = vue === "liste"
    ? "Ton historique complet : relis, édite, télécharge et partage tes lettres de motivation."
    : lettre
      ? "Ajuste le titre et le contenu : tout est sauvegardé automatiquement en base."
      : "Renseigne l'offre et ton CV : l'IA rédige une lettre prête à envoyer.";

  /* La liste est triée par updatedAt desc : la 1re ligne est la plus récente. */
  const plusRecente = lettres[0] ?? null;
  const derniereEntreprise = plusRecente?.company?.trim() ? plusRecente.company : "—";

  /** Copie le contenu de la modale de lecture dans le presse-papier. */
  async function copierLettreLue() {
    const reussi = await copierTexte(lettreLue?.content ?? "");
    if (reussi) {
      toast.success("Contenu de la lettre copié dans le presse-papier.");
    } else {
      toast.error("Copie impossible : sélectionne le texte et copie-le manuellement.");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <style>{CSS_IMPRESSION}</style>

      {/* Zone d'impression : visible uniquement à l'impression / export PDF */}
      <div className="zone-impression hidden">
        <pre className="whitespace-pre-wrap font-serif text-[13pt] leading-relaxed">
          {contenuImpression}
        </pre>
      </div>

      {/* ── En-tête ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#051937] text-[#FFC107]">
            <IconFileDescription size={24} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#051937]">{titrePage}</h1>
            <p className="mt-1 text-sm text-slate-500">{sousTitrePage}</p>
          </div>
        </div>
        {vue === "liste" ? (
          <button
            type="button"
            onClick={ouvrirNouvelleLettre}
            className="inline-flex items-center gap-2 rounded-xl bg-[#051937] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b2a5b]"
          >
            <IconPlus size={18} />
            Nouvelle lettre de motivation
          </button>
        ) : null}
      </div>

      {/* ══ VUE A : Tableau de bord & liste des lettres ════════════════ */}
      {vue === "liste" ? (
        <div className="space-y-6">
          {erreurListe ? (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>{erreurListe}</span>
            </div>
          ) : null}

          {chargement ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
              <IconLoader2 size={18} className="animate-spin" />
              Chargement de tes lettres...
            </div>
          ) : (
            <>
              {/* 3 cartes statistiques (KPIs) */}
              <section className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <IconFiles size={20} className="text-[#051937]" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Lettres sauvegardées
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold text-[#051937]">{lettres.length}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Toutes tes lettres, relissables à tout moment.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <IconBuildingSkyscraper size={20} className="text-[#051937]" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Dernière entreprise ciblée
                    </span>
                  </div>
                  <p className="mt-3 text-xl font-bold text-[#051937]">{derniereEntreprise}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {plusRecente
                      ? `Lettre « ${plusRecente.title} » mise à jour le ${formatDate(plusRecente.updatedAt)}.`
                      : "Crée ta première lettre pour cibler une entreprise."}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <IconSparkles size={20} className="text-[#051937]" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Statut IA
                    </span>
                  </div>
                  <p className="mt-3">
                    {statut?.ia.pret ? (
                      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700">
                        <span aria-hidden className="size-2 rounded-full bg-emerald-500" />
                        {statut.ia.provider} · {statut.ia.model}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-500">
                        <span aria-hidden className="size-2 rounded-full bg-slate-400" />
                        {statut === null && statutEnCours ? "Vérification..." : "IA indisponible"}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {statut && !statut.db.ok
                      ? "Base à initialiser — lance « npx prisma db push »."
                      : statut && !statut.ia.pret
                        ? "Ajoute GROQ_API_KEY dans .env.local puis redémarre."
                        : "Moteur IA utilisé pour rédiger tes lettres."}
                  </p>
                </div>
              </section>

              {/* Liste des lettres enregistrées */}
              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-[#051937]">
                  Mes lettres
                  {lettres.length > 0 ? (
                    <span className="ml-2 text-sm font-normal text-slate-400">
                      ({lettres.length})
                    </span>
                  ) : null}
                </h2>

                {lettres.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
                    <p className="text-sm text-slate-500">
                      Aucune lettre pour l&apos;instant. Génère ta première lettre de motivation :
                      colle l&apos;offre d&apos;emploi et ton CV, l&apos;IA rédige une lettre prête
                      à envoyer — sauvegardée automatiquement ici.
                    </p>
                    <button
                      type="button"
                      onClick={ouvrirNouvelleLettre}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#051937] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b2a5b]"
                    >
                      <IconPlus size={16} />
                      Nouvelle lettre de motivation
                    </button>
                  </div>
                ) : (
                  lettres.map((l) => (
                    <div
                      key={l.id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold text-[#051937]">{l.title}</h3>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span className="truncate">{l.position || "Poste non précisé"}</span>
                          <span className="inline-flex items-center gap-1">
                            <IconCalendarEvent size={13} />
                            {formatDate(l.updatedAt)}
                          </span>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-lg bg-[#FFC107]/15 px-3 py-1.5 text-sm font-bold text-[#051937]">
                          {l.company || "—"}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void voirLettre(l.id)}
                            disabled={lectureId === l.id}
                            title="Voir le contenu complet"
                            aria-label="Voir le contenu complet"
                            className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {lectureId === l.id ? (
                              <IconLoader2 size={18} className="animate-spin" />
                            ) : (
                              <IconEye size={18} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => void ouvrirEdition(l.id)}
                            disabled={editionId === l.id}
                            title="Éditer dans l'éditeur"
                            aria-label="Éditer dans l'éditeur"
                            className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {editionId === l.id ? (
                              <IconLoader2 size={18} className="animate-spin" />
                            ) : (
                              <IconEdit size={18} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => void telechargerPdfDepuisListe(l.id)}
                            disabled={pdfId === l.id}
                            title="Télécharger en PDF (fenêtre d'impression)"
                            aria-label="Télécharger en PDF"
                            className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {pdfId === l.id ? (
                              <IconLoader2 size={18} className="animate-spin" />
                            ) : (
                              <IconFileTypePdf size={18} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => void partagerLettre(l.id)}
                            disabled={partageId === l.id}
                            title="Copier le contenu de la lettre (partager)"
                            aria-label="Copier le contenu de la lettre"
                            className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {partageId === l.id ? (
                              <IconLoader2 size={18} className="animate-spin" />
                            ) : (
                              <IconShare size={18} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => void supprimerLettre(l.id, l.title)}
                            disabled={suppressionId === l.id}
                            title="Supprimer définitivement"
                            aria-label="Supprimer définitivement"
                            className="rounded-lg border border-red-200 p-2 text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {suppressionId === l.id ? (
                              <IconLoader2 size={18} className="animate-spin" />
                            ) : (
                              <IconTrash size={18} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </section>
            </>
          )}
        </div>
      ) : (
        /* ══ VUE B : Formulaire de création IA & éditeur ════════════════ */
        <div className="space-y-6">
          <button
            type="button"
            onClick={() => void retourListe()}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-[#051937]"
          >
            <IconArrowLeft size={16} />
            Retour à mes lettres
          </button>

          {erreur ? (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>{erreur}</span>
            </div>
          ) : null}

          {!lettre ? (
            /* ── Formulaire IA ───────────────────────────────────────── */
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="poste">Poste visé</Label>
                    <Input
                      id="poste"
                      value={form.position}
                      onChange={(e) => setForm({ ...form, position: e.target.value })}
                      placeholder="Ex. Développeur Full-Stack"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="entreprise">Entreprise</Label>
                    <Input
                      id="entreprise"
                      value={form.company}
                      onChange={(e) => setForm({ ...form, company: e.target.value })}
                      placeholder="Ex. NexiRole SAS"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ton">Ton</Label>
                    <select
                      id="ton"
                      value={form.tone}
                      onChange={(e) => setForm({ ...form, tone: e.target.value })}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#051937] shadow-sm outline-none transition-colors focus:border-[#051937]/40 focus:ring-2 focus:ring-[#051937]/10"
                    >
                      {TONS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="langue">Langue</Label>
                    <select
                      id="langue"
                      value={form.language}
                      onChange={(e) => setForm({ ...form, language: e.target.value })}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#051937] shadow-sm outline-none transition-colors focus:border-[#051937]/40 focus:ring-2 focus:ring-[#051937]/10"
                    >
                      {LANGUES.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="offre">Offre d&apos;emploi (colle le texte de l&apos;annonce)</Label>
                    <Textarea
                      id="offre"
                      rows={6}
                      value={form.jobOffer}
                      onChange={(e) => setForm({ ...form, jobOffer: e.target.value })}
                      placeholder="Colle ici le texte complet de l'annonce…"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cv">Texte de ton CV (copie-le depuis le Créateur de CV)</Label>
                    <Textarea
                      id="cv"
                      rows={6}
                      value={form.cvText}
                      onChange={(e) => setForm({ ...form, cvText: e.target.value })}
                      placeholder="Colle ici le contenu de ton CV…"
                    />
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <Button variant="outline" onClick={() => void retourListe()} disabled={generation}>
                    <IconArrowLeft size={16} /> Annuler
                  </Button>
                  <Button
                    onClick={() => void generer()}
                    disabled={generation || (!form.jobOffer.trim() && !form.cvText.trim())}
                  >
                    {generation ? (
                      <IconLoader2 size={16} className="animate-spin" />
                    ) : (
                      <IconSparkles size={16} />
                    )}
                    {generation
                      ? "Génération en cours (10 à 30 s)…"
                      : "Générer avec l'IA"}
                  </Button>
                </div>
              </div>

              <p className="text-xs text-slate-500">
                Astuce : plus l&apos;offre et le CV sont détaillés, plus la lettre est précise et
                convaincante. La lettre générée est sauvegardée automatiquement dans ton
                historique.
              </p>
            </div>
          ) : (
            /* ── Éditeur avec sauvegarde automatique ─────────────────── */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                  <span
                    className={cx(
                      "size-2 rounded-full",
                      etat === "propre"
                        ? "bg-emerald-500"
                        : etat === "sauvegarde"
                          ? "animate-pulse bg-[#FFC107]"
                          : "bg-red-500"
                    )}
                  />
                  {texteEtat}
                  {etat === "propre" ? (
                    <IconCheck size={14} className="text-emerald-600" />
                  ) : null}
                </span>
              </div>

              <Input
                value={titre}
                onChange={(e) => handleTitre(e.target.value)}
                placeholder="Titre de la lettre"
                className="text-base font-semibold"
              />

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void copierEditeur()}>
                  {copie ? (
                    <IconCheck size={16} className="text-emerald-600" />
                  ) : (
                    <IconCopy size={16} />
                  )}
                  {copie ? "Copié" : "Copier"}
                </Button>
                <Button onClick={() => void imprimer()}>
                  <IconPrinter size={16} /> Imprimer / PDF
                </Button>
                <Button variant="outline" onClick={() => void regenerer()} disabled={generation}>
                  {generation ? (
                    <IconLoader2 size={16} className="animate-spin" />
                  ) : (
                    <IconRefresh size={16} />
                  )}
                  Régénérer
                </Button>
                <Button
                  variant="outline"
                  className="border-red-200 text-red-700"
                  onClick={() => void supprimerLettre(lettre.id, lettre.title, true)}
                  disabled={suppressionId === lettre.id}
                >
                  {suppressionId === lettre.id ? (
                    <IconLoader2 size={16} className="animate-spin" />
                  ) : (
                    <IconTrash size={16} />
                  )}
                  Supprimer
                </Button>
              </div>

              <p className="text-xs text-slate-500">
                Astuce : l&apos;export PDF utilise la fenêtre d&apos;impression du navigateur —
                choisis « Enregistrer au format PDF ». Le contenu est toujours sauvegardé en base
                avant l&apos;export.
              </p>

              <Textarea
                value={contenu}
                onChange={(e) => handleContenu(e.target.value)}
                rows={22}
                className="min-h-[520px] font-serif text-[15px] leading-relaxed"
              />
            </div>
          )}
        </div>
      )}

      {/* ── Modale de lecture d'une lettre ──────────────────────────── */}
      {lettreLue ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Fermer la lecture"
            onClick={() => setLettreLue(null)}
            className="absolute inset-0 cursor-default bg-[#051937]/60"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Lecture de la lettre : ${lettreLue.title}`}
            className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold text-[#051937]">
                  {lettreLue.title}
                </h3>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  {lettreLue.position ? <span>{lettreLue.position}</span> : null}
                  {lettreLue.company ? <span>{lettreLue.company}</span> : null}
                  <span>Mise à jour le {formatDate(lettreLue.updatedAt)}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLettreLue(null)}
                title="Fermer"
                aria-label="Fermer"
                className="rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-[#051937]"
              >
                <IconX size={16} />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 font-serif text-sm leading-relaxed text-[#051937]">
                {lettreLue.content}
              </pre>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 p-4">
              <button
                type="button"
                onClick={() => void copierLettreLue()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-[#051937] transition-colors hover:bg-slate-50"
              >
                <IconCopy size={14} />
                Copier le texte
              </button>
              <button
                type="button"
                onClick={() => setLettreLue(null)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#051937] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0b2a5b]"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
