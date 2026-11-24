"use client";

/**
 * NexiRole — LETTRES DE MOTIVATION (page /dashboard/lettres).
 *
 * Harmonisée sur le modèle EXACT de la page Négociation (/dashboard/negociation) :
 * la page s'organise autour de DEUX vues fluides —
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
 * NOUVEAUTÉS DE CETTE VERSION :
 *  - 3 méthodes pour fournir le CV dans le formulaire :
 *      Option A — Sélectionner un CV sauvegardé (bibliothèque /api/cv,
 *                 le texte du CV est chargé en 1 clic dans le champ) ;
 *      Option B — Importer un fichier CV (PDF / DOCX / TXT) via
 *                 /api/parse-cv (extraction instantanée dans le champ) ;
 *      Option C — Texte libre (le champ reste modifiable à tout moment).
 *  - Téléchargement PDF RÉEL « Lettre_NexiRole.pdf » (@react-pdf/renderer)
 *    depuis l'éditeur, la modale de lecture et la liste — fin de
 *    window.print().
 *  - Bouton « Éditer & Sauvegarder » (PATCH /api/lettre/[id]).
 *  - Migration depuis un dossier : /dashboard/lettres?fromDossierId=<id>
 *    importe la lettre du dossier dans l'éditeur (POST /api/lettre en mode
 *    direct) pour la retravailler avec différents tons.
 *
 * Règle d'or conservée : avant Copier / PDF / Régénérer / Retour, le
 * contenu est TOUJOURS sauvegardé en base d'abord.
 * Notifications via sonner (Toaster monté dans src/app/layout.tsx).
 * Icônes : exclusivement @tabler/icons-react. Charte : #051937 / #FFC107.
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
  IconDeviceFloppy,
  IconEdit,
  IconEye,
  IconFileDescription,
  IconFileText,
  IconFiles,
  IconFileTypePdf,
  IconLibrary,
  IconLoader2,
  IconPlus,
  IconRefresh,
  IconShare,
  IconSparkles,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { exportPdfSecurise, telechargerLettreTextePdf } from "@/components/dashboard/dossier-preview";

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

/** Réponse de GET /api/lettre/ia-status (contrat { ready, model } + compat). */
type StatutIa = {
  ready?: boolean;
  model?: string;
  provider?: string;
  ia?: { pret: boolean; provider: string; model: string };
  db?: { ok: boolean; message: string };
};

/** CV de la bibliothèque (GET /api/cv). */
type CvBibliotheque = { id: string; name: string; updatedAt?: string };

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

/* ── Aides réseau & formatage ────────────────────────────────────────── */

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

/* ── Conversion d'un CV (bibliothèque ou dossier) en texte lisible ───── */

function ch(...valeurs: unknown[]): string {
  for (const valeur of valeurs) {
    if (typeof valeur === "string" && valeur.trim() !== "") return valeur.trim();
  }
  return "";
}

function tab(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      item !== null && typeof item === "object" && !Array.isArray(item)
  );
}

function strList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .map((item) => item.trim())
    .slice(0, max);
}

/** CvBuilderData (créateur) OU cvJson optimisé (dossier) → texte CV lisible. */
function cvEnTexte(data: unknown): string {
  const d = data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
  const personal = tab([d.personal])[0] ?? {};
  const identite = tab([d.identite])[0] ?? {};
  const lignes: string[] = [];

  const nom = ch(personal.fullName, personal.nom, identite.nom_complet);
  const titrePro = ch(personal.title, identite.titre, d.title, d.titre);
  if (nom || titrePro) lignes.push([nom, titrePro].filter(Boolean).join(" — "));

  const contacts = [
    ch(personal.email, identite.email) && `E-mail : ${ch(personal.email, identite.email)}`,
    ch(personal.phone, personal.telephone, identite.telephone) &&
      `Téléphone : ${ch(personal.phone, personal.telephone, identite.telephone)}`,
    ch(personal.location, personal.ville, identite.ville) &&
      `Ville : ${ch(personal.location, personal.ville, identite.ville)}`,
    ch(personal.linkedin, identite.linkedin) &&
      `LinkedIn : ${ch(personal.linkedin, identite.linkedin)}`,
  ].filter(Boolean) as string[];
  if (contacts.length > 0) lignes.push(contacts.join(" | "));

  const resume = ch(d.summary, d.resume);
  if (resume) lignes.push(`Profil : ${resume}`);

  const experiences = tab(d.experiences);
  if (experiences.length > 0) {
    lignes.push("Expériences professionnelles :");
    for (const exp of experiences) {
      const enTete = [
        ch(exp.role, exp.poste),
        ch(exp.company, exp.entreprise),
        ch(exp.period, exp.periode),
        ch(exp.location, exp.lieu),
      ]
        .filter(Boolean)
        .join(" — ");
      lignes.push(`- ${enTete || "Expérience"}`);
      for (const mission of strList(exp.achievements ?? exp.missions, 6)) {
        lignes.push(`  • ${mission}`);
      }
    }
  }

  const formations = tab(d.education ?? d.formations);
  if (formations.length > 0) {
    lignes.push("Formation :");
    for (const formation of formations) {
      const ligne = [
        ch(formation.degree, formation.diplome),
        ch(formation.school, formation.ecole, formation.etablissement),
        ch(formation.period, formation.periode),
      ]
        .filter(Boolean)
        .join(" — ");
      lignes.push(`- ${ligne || "Formation"}`);
    }
  }

  const competences = strList(d.skills ?? d.competences, 20);
  if (competences.length > 0) lignes.push(`Compétences : ${competences.join(", ")}`);

  const langues = tab(d.languages ?? d.langues);
  if (langues.length > 0) {
    const langueLignes = langues
      .map((l) => `${ch(l.name, l.nom)} (${ch(l.level, l.niveau) || "niveau non précisé"})`)
      .filter((ligne) => !ligne.startsWith(" ("))
      .join(", ");
    if (langueLignes) lignes.push(`Langues : ${langueLignes}`);
  }

  return lignes.join("\n").slice(0, 12000);
}

/** Lettre d'un dossier (JSON {subject, greeting, paragraphs, closing} ou brut) → texte. */
function lettreDossierEnTexte(coverLetter: unknown): string {
  if (typeof coverLetter !== "string") return "";
  const texte = coverLetter.trim();
  if (!texte) return "";
  try {
    const parse: unknown = JSON.parse(texte);
    if (!parse || typeof parse !== "object" || Array.isArray(parse)) return texte;
    const o = parse as Record<string, unknown>;
    const lignes: string[] = [];
    const objet = ch(o.subject, o.objet);
    if (objet) lignes.push(`Objet : ${objet}`, "");
    if (ch(o.greeting, o.salutation)) lignes.push(ch(o.greeting, o.salutation), "");
    for (const p of strList(o.paragraphs ?? o.paragraphes, 8)) lignes.push(p, "");
    if (ch(o.closing, o.politesse)) lignes.push(ch(o.closing, o.politesse));
    return lignes.length > 0 ? lignes.join("\n").trim() : texte;
  } catch {
    return texte;
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
  const [statut, setStatut] = useState<StatutIa | null>(null);
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

  /* Options A & B : CV sauvegardé (bibliothèque) et fichier importé. */
  const [cvs, setCvs] = useState<CvBibliotheque[]>([]);
  const [cvChoisi, setCvChoisi] = useState("");
  const [cvChargement, setCvChargement] = useState(false);
  const [fichierNom, setFichierNom] = useState("");
  const [importEnCours, setImportEnCours] = useState(false);
  const [sourceCv, setSourceCv] = useState<"libre" | "bibliotheque" | "fichier">("libre");

  /* Éditeur (lettre ouverte, sauvegarde automatique). */
  const [lettre, setLettre] = useState<Lettre | null>(null);
  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState("");
  const [etat, setEtat] = useState<Etat>("propre");
  const [derniereSauvegarde, setDerniereSauvegarde] = useState("");
  const [generation, setGeneration] = useState(false);
  const [erreur, setErreur] = useState("");
  const [copie, setCopie] = useState(false);
  const [pdfEnCours, setPdfEnCours] = useState(false);

  /* Actions sur les lettres de la liste. */
  const [lectureId, setLectureId] = useState<string | null>(null);
  const [editionId, setEditionId] = useState<string | null>(null);
  const [lettreLue, setLettreLue] = useState<Lettre | null>(null);
  const [pdfId, setPdfId] = useState<string | null>(null);
  const [partageId, setPartageId] = useState<string | null>(null);
  const [suppressionId, setSuppressionId] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contenuRef = useRef("");
  const titreRef = useRef("");
  const lettreIdRef = useRef<string | null>(null);
  const etatRef = useRef<Etat>("propre");
  // StrictMode (dev) monte le composant 2 fois : ce garde évite 2 appels API.
  const demarrageFaitRef = useRef(false);
  const importDossierFaitRef = useRef(false);

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

  /* ── Chargement de la liste + statut IA + migration dossier ──────── */

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
        if (r.ok) setStatut((await r.json()) as StatutIa);
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

  /* Migration depuis un dossier : /dashboard/lettres?fromDossierId=<id>. */
  useEffect(() => {
    if (importDossierFaitRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const dossierId = params.get("fromDossierId") || params.get("importDossierId");
    if (!dossierId) return;
    importDossierFaitRef.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/history?type=applications", { cache: "no-store" });
        if (!res.ok) {
          toast.error("Impossible de retrouver le dossier — ouvre-le depuis l'historique.");
          return;
        }
        const data = (await res.json().catch(() => null)) as { items?: unknown[] } | null;
        const itemBrut = Array.isArray(data?.items)
          ? data!.items.find(
              (item) =>
                item && typeof item === "object" && (item as Record<string, unknown>).id === dossierId
            )
          : undefined;
        if (!itemBrut) {
          toast.error("Dossier introuvable dans ton historique.");
          return;
        }
        const dossier = itemBrut as Record<string, unknown>;
        const contenuDossier = lettreDossierEnTexte(dossier.coverLetter);
        if (contenuDossier.length < 20) {
          toast.error("Ce dossier ne contient pas de lettre exploitable.");
          return;
        }
        const jobTitle = ch(dossier.jobTitle);
        const companyName = ch(dossier.companyName);
        const jobUrl = ch(dossier.jobUrl);
        const cvTexte = cvEnTexte(dossier.cvJson);

        /* Enregistre la lettre du dossier comme une lettre autonome
           (POST /api/lettre — mode import direct, sans appel IA). */
        const resPost = await fetch("/api/lettre", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: contenuDossier,
            title: ("Lettre — " + jobTitle + (companyName ? " — " + companyName : "")).slice(0, 120),
            company: companyName,
            position: jobTitle,
            tone: "professionnel",
            language: "fr",
            jobOffer: (jobTitle + (companyName ? " — " + companyName : "") + (jobUrl ? "\n" + jobUrl : "")).slice(0, 12000),
            cvText: cvTexte,
          }),
        });
        if (!resPost.ok) {
          toast.error(await lireErreur(resPost, "Import de la lettre impossible."));
          return;
        }
        const post = (await resPost.json()) as { lettre?: Lettre };
        if (post.lettre) {
          chargerDansEditeur(post.lettre);
          setVue("creation");
          toast.success(
            "Lettre importée depuis le dossier — change le ton puis clique « Régénérer » pour la retravailler."
          );
          void chargerLettres();
        }
      } catch {
        toast.error("Import impossible — vérifie ta connexion.");
      } finally {
        // Nettoie l'URL pour éviter une ré-importation au rechargement.
        const url = new URL(window.location.href);
        url.searchParams.delete("fromDossierId");
        url.searchParams.delete("importDossierId");
        window.history.replaceState(null, "", url.toString());
      }
    })();
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

  /* ── Options A & B : CV de la bibliothèque / fichier importé ──────── */

  /** Liste des CV sauvegardés (chargée quand on ouvre la vue création). */
  async function chargerBibliothequeCv() {
    try {
      const res = await fetch("/api/cv", { cache: "no-store" });
      if (!res.ok) {
        setCvs([]);
        return;
      }
      const data = (await res.json().catch(() => null)) as { cvs?: CvBibliotheque[] } | null;
      setCvs(Array.isArray(data?.cvs) ? data!.cvs : []);
    } catch {
      setCvs([]);
    }
  }

  /** Option A : sélection d'un CV sauvegardé → remplit le champ en 1 clic. */
  async function chargerCvBibliotheque(id: string) {
    setCvChoisi(id);
    if (!id) {
      setSourceCv("libre");
      return;
    }
    setCvChargement(true);
    try {
      const res = await fetch(`/api/cv/${id}`, { cache: "no-store" });
      if (!res.ok) {
        toast.error("Impossible de charger ce CV — réessaie.");
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | { cv?: { data?: unknown } | null }
        | null;
      if (data?.cv?.data) {
        const texte = cvEnTexte(data.cv.data);
        if (texte.length > 40) {
          setForm((precedent) => ({ ...precedent, cvText: texte }));
          setSourceCv("bibliotheque");
          toast.success("CV chargé depuis ta bibliothèque — le champ reste modifiable.");
        } else {
          toast.error("Ce CV est encore trop vide — complète-le dans le studio de CV.");
        }
      }
    } catch {
      toast.error("Réseau indisponible : réessaie dans un instant.");
    } finally {
      setCvChargement(false);
    }
  }

  /** Option B : import de fichier (PDF / DOCX / TXT) → texte extrait. */
  async function importerFichierCv(file: File) {
    setImportEnCours(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/parse-cv", { method: "POST", body: formData });
      const data = (await res.json().catch(() => null)) as
        | { text?: string; name?: string; error?: string }
        | null;
      if (!res.ok || !data?.text) {
        toast.error(data?.error ?? "Impossible de lire ce fichier.");
        return;
      }
      setForm((precedent) => ({ ...precedent, cvText: data.text! }));
      setFichierNom(data.name ?? file.name);
      setSourceCv("fichier");
      toast.success("CV importé : le texte extrait remplit le champ (modifiable).");
    } catch {
      toast.error("Réseau indisponible : réessaie dans un instant.");
    } finally {
      setImportEnCours(false);
    }
  }

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
    setCvChoisi("");
    setFichierNom("");
    setSourceCv("libre");
    reinitialiserEditeur();
    setErreur("");
    setVue("creation");
    void chargerBibliothequeCv();
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

  /* ── Exports PDF réels (Lettre_NexiRole.pdf) ──────────────────────── */

  async function telechargerPdf(lettreCible: Lettre) {
    setPdfEnCours(true);
    await exportPdfSecurise(() =>
      telechargerLettreTextePdf({
        contenu: lettreCible.content,
        entreprise: lettreCible.company || undefined,
        poste: lettreCible.position || undefined,
        nomFichier: "Lettre_NexiRole",
      })
    );
    setPdfEnCours(false);
  }

  /** Télécharger PDF depuis la liste : GET /api/lettre/[id] puis export réel. */
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
      await telechargerPdf(data.lettre);
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

  /** Changement de ton dans l'éditeur : PATCH immédiat (utilisé par Régénérer). */
  async function changerTon(tone: string) {
    if (!lettre) return;
    setLettre({ ...lettre, tone });
    try {
      await fetch("/api/lettre/" + lettre.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone }),
      });
    } catch {
      /* non bloquant : le ton sera renvoyé à la prochaine sauvegarde */
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

  /** Bouton « Éditer & Sauvegarder » : enregistre immédiatement (PATCH). */
  async function editerEtSauvegarder() {
    await avantExport();
    await sauvegarder();
    toast.success("Lettre enregistrée dans ton historique.");
  }

  /** Export PDF réel de la lettre ouverte (sauvegarde d'abord — règle d'or). */
  async function telechargerPdfEditeur() {
    await avantExport();
    await telechargerPdf({
      id: lettre?.id ?? "",
      title: titreRef.current,
      company: lettre?.company ?? "",
      position: lettre?.position ?? "",
      tone: lettre?.tone ?? "professionnel",
      language: lettre?.language ?? "fr",
      jobOffer: lettre?.jobOffer ?? "",
      cvText: lettre?.cvText ?? "",
      content: contenuRef.current,
      createdAt: lettre?.createdAt ?? "",
      updatedAt: lettre?.updatedAt ?? "",
    });
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

  const iaPret = statut?.ready ?? statut?.ia?.pret ?? false;
  const iaModel = statut?.model ?? statut?.ia?.model ?? "groq";

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
                      Statut IA (Groq · Llama 3.3)
                    </span>
                  </div>
                  <p className="mt-3">
                    {iaPret ? (
                      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700">
                        <span aria-hidden className="size-2 rounded-full bg-emerald-500" />
                        groq · {iaModel}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-500">
                        <span aria-hidden className="size-2 rounded-full bg-slate-400" />
                        {statut === null && statutEnCours ? "Vérification..." : "IA indisponible"}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {statut && statut.db && !statut.db.ok
                      ? "Base à initialiser — lance « npx prisma db push »."
                      : !iaPret && statut !== null
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
                            title="Télécharger Lettre_NexiRole.pdf"
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

                  {/* ── Le CV : 3 méthodes (A, B, C) ─────────────────────── */}
                  <div className="space-y-2">
                    <Label>Ton CV — 3 méthodes possibles</Label>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Option A : CV sauvegardé (bibliothèque) */}
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <IconLibrary size={16} className="text-[#051937]" />
                        <span className="text-xs font-semibold text-slate-600">
                          A — CV sauvegardé :
                        </span>
                        <select
                          aria-label="Sélectionner un CV sauvegardé"
                          value={cvChoisi}
                          onChange={(e) => void chargerCvBibliotheque(e.target.value)}
                          disabled={cvChargement || cvs.length === 0}
                          className="max-w-[210px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-[#051937] outline-none focus:border-[#051937]/40 disabled:opacity-60"
                        >
                          <option value="">
                            {cvs.length === 0 ? "Aucun CV en bibliothèque" : "— Choisir un CV —"}
                          </option>
                          {cvs.map((cv) => (
                            <option key={cv.id} value={cv.id}>
                              {cv.name}
                            </option>
                          ))}
                        </select>
                        {cvChargement ? (
                          <IconLoader2 size={14} className="animate-spin text-slate-400" />
                        ) : null}
                      </span>

                      {/* Option B : import de fichier */}
                      <label
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#051937]/40 hover:text-[#051937]"
                        title="PDF, DOCX ou TXT — le texte est extrait instantanément"
                      >
                        {importEnCours ? (
                          <IconLoader2 size={16} className="animate-spin text-[#051937]" />
                        ) : (
                          <IconUpload size={16} className="text-[#051937]" />
                        )}
                        B — Importer un fichier (PDF / DOCX / TXT)
                        <input
                          type="file"
                          accept=".pdf,.docx,.txt,.md"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void importerFichierCv(file);
                            e.target.value = "";
                          }}
                        />
                      </label>

                      {/* Indicateur de source */}
                      {sourceCv === "bibliotheque" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                          <IconCheck size={14} /> CV chargé depuis la bibliothèque
                        </span>
                      ) : sourceCv === "fichier" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                          <IconFileText size={14} /> Fichier importé : {fichierNom}
                        </span>
                      ) : null}
                    </div>

                    {/* Option C : texte libre (toujours modifiable) */}
                    <Textarea
                      id="cv"
                      rows={6}
                      value={form.cvText}
                      onChange={(e) => {
                        setForm({ ...form, cvText: e.target.value });
                        if (sourceCv !== "libre") setSourceCv("libre");
                      }}
                      placeholder="C — Texte libre : colle ou modifie ici le contenu de ton CV (rempli automatiquement par les options A et B)…"
                    />
                    <p className="text-[11px] text-slate-400">
                      {form.cvText.trim().length} caractères — le champ reste modifiable à tout
                      moment, quelle que soit la méthode utilisée.
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <Button variant="outline" onClick={() => void retourListe()} disabled={generation}>
                    <IconArrowLeft size={16} /> Annuler
                  </Button>
                  <Button
                    onClick={() => void generer()}
                    disabled={generation || (!form.jobOffer.trim() && form.cvText.trim().length < 40)}
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

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => void editerEtSauvegarder()}
                  disabled={etat === "sauvegarde"}
                  className="bg-[#051937] text-white hover:bg-[#0b2a5b]"
                >
                  {etat === "sauvegarde" ? (
                    <IconLoader2 size={16} className="animate-spin" />
                  ) : (
                    <IconDeviceFloppy size={16} />
                  )}
                  Éditer &amp; Sauvegarder
                </Button>
                <Button onClick={() => void telechargerPdfEditeur()} disabled={pdfEnCours}>
                  {pdfEnCours ? (
                    <IconLoader2 size={16} className="animate-spin" />
                  ) : (
                    <IconFileTypePdf size={16} />
                  )}
                  {pdfEnCours ? "Génération du PDF…" : "Télécharger Lettre_NexiRole.pdf"}
                </Button>
                <Button variant="outline" onClick={() => void copierEditeur()}>
                  {copie ? (
                    <IconCheck size={16} className="text-emerald-600" />
                  ) : (
                    <IconCopy size={16} />
                  )}
                  {copie ? "Copié" : "Copier"}
                </Button>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
                  <span className="text-xs font-semibold text-slate-500">Ton :</span>
                  <select
                    aria-label="Ton de la lettre"
                    value={lettre.tone}
                    onChange={(e) => void changerTon(e.target.value)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-[#051937] outline-none focus:border-[#051937]/40"
                  >
                    {TONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </span>
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
                Astuce : « Télécharger » produit un vrai fichier PDF (Lettre_NexiRole.pdf) sans
                passer par la fenêtre d&apos;impression. Change le ton puis clique « Régénérer »
                pour retravailler la lettre. Le contenu est toujours sauvegardé en base avant
                l&apos;export.
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
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 p-4">
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
                onClick={() => {
                  setLettreLue(null);
                  void telechargerPdf(lettreLue);
                }}
                disabled={pdfEnCours}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-[#051937] transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pdfEnCours ? (
                  <IconLoader2 size={14} className="animate-spin" />
                ) : (
                  <IconFileTypePdf size={14} />
                )}
                Télécharger PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = lettreLue.id;
                  setLettreLue(null);
                  void ouvrirEdition(id);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#051937] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0b2a5b]"
              >
                <IconEdit size={14} />
                Éditer &amp; Sauvegarder
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
