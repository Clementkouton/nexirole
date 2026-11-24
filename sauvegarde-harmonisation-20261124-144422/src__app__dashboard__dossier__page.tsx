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
 *     d'actions : Voir / Éditer / Télécharger PDF / Partager / Supprimer.
 *
 *   Vue B — Création : conserve TOUT le flux existant (carte « Offre
 *     chargée » depuis localStorage, évanouissement si aucune offre,
 *     <DossierPanel /> avec upload CV /api/parse-cv, génération POST
 *     /api/dossier, aperçu, modèles, PDF).
 *
 * SYNCHRONISATION : après une génération réussie, le panneau émet
 * l'événement « nexirole:dossier-sauvegarde » ; la page relance son GET
 * pour rafraîchir la liste.
 *
 * Aperçu complet (modale plein écran) : le composant DossierPreview est
 * alimenté par les champs cvJson / coverLetter / interviewKitJson /
 * candidateJson normalisés ; si le dossier ne contient pas de CV
 * structuré, rendu inline de secours (lettre, kit, scores).
 * Export PDF : même mécanisme que la page lettres (window.print() sur une
 * « zone-impression » dédiée). Icônes : exclusivement @tabler/icons-react.
 * Charte : navy #051937 + or #FFC107.
 */

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  IconAlertTriangle,
  IconArrowLeft,
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
  IconPrinter,
  IconRobot,
  IconShare,
  IconTargetArrow,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import * as PanelModule from "@/components/dashboard/dossier-panel";
import { DossierPreview } from "@/components/dashboard/dossier-preview";
import { isTemplateId, type TemplateId } from "@/lib/cv-templates";
import {
  offerSignature,
  readDossierOffer,
  saveDossierToHistory,
} from "@/lib/dashboard-client";

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

/**
 * Clone structurel des props attendues par <DossierPreview /> (le type
 * DossierData n'étant pas exporté). Construit depuis cvJson + coverLetter
 * + interviewKitJson + candidateJson.
 */
type DonneesApercu = {
  identite: {
    nom_complet: string;
    email?: string;
    telephone?: string;
    ville?: string;
    linkedin?: string;
  };
  titre: string;
  resume?: string;
  experiences: Array<{
    poste: string;
    periode: string;
    entreprise: string;
    lieu: string;
    missions: string[];
  }>;
  formations: Array<{ diplome: string; periode: string }>;
  competences: string[];
  langues: Array<{ nom: string; niveau: string }>;
  lettre_motivation: {
    paragraphes: string[];
    objet?: string;
    salutation?: string;
    politesse?: string;
  };
  offre?: { entreprise?: string; titre: string; lieu?: string };
  kit_entretien?: {
    questions: Array<{ question: string; reponse_suggeree: string; astuce: string }>;
    conseils: string[];
    score?: number;
    message_linkedin: string;
    message_email: string;
  };
};

type LettreExtraite = {
  objet: string;
  salutation: string;
  paragraphes: string[];
  politesse: string;
};

/* ── Panneau existant (import défensif, inchangé) ────────────────────── */

const panelExports = PanelModule as unknown as Record<string, unknown>;
const DossierPanel = (panelExports.DossierPanel ?? panelExports.default) as ComponentType | undefined;

const EVENT_SAUVEGARDE = "nexirole:dossier-sauvegarde";

/* Impression / export PDF : même mécanisme que la page lettres. */
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

/* ── Aides réseau & normalisation (copie du modèle négociation) ──────── */

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

function extraireObjet(valeur: unknown): Record<string, unknown> | null {
  if (valeur && typeof valeur === "object" && !Array.isArray(valeur)) {
    return valeur as Record<string, unknown>;
  }
  return null;
}

function extraireChaine(...valeurs: unknown[]): string {
  for (const valeur of valeurs) {
    if (typeof valeur === "string" && valeur.trim() !== "") return valeur.trim();
  }
  return "";
}

function extraireTableau(valeur: unknown): unknown[] {
  return Array.isArray(valeur) ? valeur : [];
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

/** Lettre : JSON.parse si possible (sujet / salutation / paragraphes), sinon texte brut. */
function extraireLettre(coverLetter: string): LettreExtraite {
  const vide: LettreExtraite = { objet: "", salutation: "", paragraphes: [], politesse: "" };
  const texte = coverLetter.trim();
  if (!texte) return vide;
  try {
    const parse: unknown = JSON.parse(texte);
    const objet = extraireObjet(parse);
    if (!objet) return vide;
    const paragraphes = extraireTableau(objet.paragraphs ?? objet.paragraphes).filter(
      (paragraphe): paragraphe is string =>
        typeof paragraphe === "string" && paragraphe.trim() !== ""
    );
    return {
      objet: extraireChaine(objet.subject, objet.objet),
      salutation: extraireChaine(objet.greeting, objet.salutation),
      paragraphes,
      politesse: extraireChaine(objet.closing, objet.politesse),
    };
  } catch {
    return { objet: "", salutation: "", paragraphes: [texte], politesse: "" };
  }
}

/**
 * Reconstruit les données attendues par <DossierPreview /> depuis les
 * champs stockés. Retourne null si le CV n'est pas structuré (entrées
 * anciennes de l'historique) → rendu inline de secours.
 */
function construireDonneesApercu(item: DossierItem): DonneesApercu | null {
  const cv = extraireObjet(item.cvJson);
  if (!cv) return null;

  const experiences = extraireTableau(cv.experiences).map((brut) => {
    const e = extraireObjet(brut) ?? {};
    return {
      poste: extraireChaine(e.role, e.poste),
      periode: extraireChaine(e.period, e.periode),
      entreprise: extraireChaine(e.company, e.entreprise),
      lieu: extraireChaine(e.location, e.lieu),
      missions: extraireTableau(e.achievements ?? e.missions).filter(
        (mission): mission is string => typeof mission === "string"
      ),
    };
  });

  const formations = extraireTableau(cv.education ?? cv.formations).map((brut) => {
    const f = extraireObjet(brut) ?? {};
    const diplome = extraireChaine(f.degree, f.diplome);
    const ecole = extraireChaine(f.school, f.ecole);
    return {
      diplome: ecole ? `${diplome} — ${ecole}` : diplome,
      periode: extraireChaine(f.period, f.periode),
    };
  });

  const competences = extraireTableau(cv.skills ?? cv.competences).filter(
    (competence): competence is string => typeof competence === "string"
  );

  const langues = extraireTableau(cv.languages ?? cv.langues).map((brut) => {
    const l = extraireObjet(brut) ?? {};
    return { nom: extraireChaine(l.name, l.nom), niveau: extraireChaine(l.level, l.niveau) };
  });

  const resume = extraireChaine(cv.summary, cv.resume);
  const aDuContenu =
    experiences.length > 0 ||
    formations.length > 0 ||
    competences.length > 0 ||
    langues.length > 0 ||
    resume !== "";
  if (!aDuContenu) return null;

  const candidat = extraireObjet(item.candidateJson) ?? {};
  const lettre = extraireLettre(item.coverLetter);
  const kit = extraireObjet(item.interviewKitJson);
  const score = scoreDossier(item);

  const questions = kit
    ? extraireTableau(kit.questions).map((brut) => {
        const q = extraireObjet(brut) ?? {};
        return {
          question: extraireChaine(q.question),
          reponse_suggeree: extraireChaine(q.suggestedAnswer, q.reponse_suggeree),
          astuce: extraireChaine(q.tip, q.astuce),
        };
      })
    : [];

  const messageLinkedin = kit
    ? extraireChaine(kit.outreachLinkedin, kit.message_linkedin)
    : "";
  const messageEmail = kit ? extraireChaine(kit.outreachEmail, kit.message_email) : "";

  const entreprise = item.companyName && item.companyName !== "Non précisée" ? item.companyName : undefined;

  return {
    identite: {
      nom_complet:
        extraireChaine(candidat.fullName, candidat.nom_complet) || "Candidat NexiRole",
      email: extraireChaine(candidat.email) || undefined,
      telephone: extraireChaine(candidat.phone, candidat.telephone) || undefined,
      ville: extraireChaine(candidat.location, candidat.ville) || undefined,
      linkedin: extraireChaine(candidat.linkedin) || undefined,
    },
    titre: extraireChaine(cv.title, cv.titre) || item.jobTitle,
    resume: resume || undefined,
    experiences,
    formations,
    competences,
    langues,
    lettre_motivation: {
      paragraphes: lettre.paragraphes,
      objet: lettre.objet || undefined,
      salutation: lettre.salutation || undefined,
      politesse: lettre.politesse || undefined,
    },
    offre: { entreprise, titre: item.jobTitle || "Offre ciblée" },
    kit_entretien:
      kit && (questions.length > 0 || messageLinkedin !== "" || messageEmail !== "")
        ? {
            questions,
            conseils: [],
            score: score ?? undefined,
            message_linkedin: messageLinkedin,
            message_email: messageEmail,
          }
        : undefined,
  };
}

/* ── Aides offre importée (conservées de la page actuelle) ───────────── */

function titreOffre(offer: Record<string, unknown> | null): string {
  if (!offer) return "";
  const brut = offer.titre ?? offer.title ?? offer.poste;
  return typeof brut === "string" ? brut : "";
}

function entrepriseOffre(offer: Record<string, unknown> | null): string {
  if (!offer) return "";
  const brut = offer.entreprise ?? offer.company ?? offer.societe;
  return typeof brut === "string" ? brut : "";
}

/* ── Aperçu inline de secours (dossier sans CV structuré) ────────────── */

function ApercuBrut({ item }: { item: DossierItem }) {
  const cvBrut =
    item.cvJson === null || item.cvJson === undefined
      ? ""
      : typeof item.cvJson === "string"
        ? item.cvJson
        : JSON.stringify(item.cvJson, null, 2);
  const cvInteressant = cvBrut !== "" && cvBrut !== "{}";
  const lettre = extraireLettre(item.coverLetter);
  const kit = extraireObjet(item.interviewKitJson);
  const questions = kit ? extraireTableau(kit.questions) : [];
  const score = scoreDossier(item);

  return (
    <div className="space-y-4">
      {cvInteressant ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-[#051937]">CV enregistré (format brut)</h3>
          <pre className="nice-scrollbar mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
            {cvBrut}
          </pre>
        </div>
      ) : null}

      {lettre.paragraphes.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-[#051937]">Lettre de motivation</h3>
          {lettre.objet ? (
            <p className="mt-2 text-sm font-bold text-[#051937]">Objet : {lettre.objet}</p>
          ) : null}
          {lettre.salutation ? (
            <p className="mt-2 text-sm text-slate-700">{lettre.salutation}</p>
          ) : null}
          <div className="mt-2 space-y-2">
            {lettre.paragraphes.map((paragraphe, i) => (
              <p key={i} className="text-sm leading-relaxed text-slate-700">
                {paragraphe}
              </p>
            ))}
          </div>
          {lettre.politesse ? (
            <p className="mt-3 text-sm text-slate-700">{lettre.politesse}</p>
          ) : null}
        </div>
      ) : null}

      {questions.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-[#051937]">Kit d&apos;entretien</h3>
          <div className="mt-3 space-y-3">
            {questions.map((brut, i) => {
              const q = extraireObjet(brut) ?? {};
              return (
                <div key={i} className="rounded-xl border border-slate-200 p-3">
                  <p className="text-sm font-bold text-[#051937]">
                    Q{i + 1}. {extraireChaine(q.question) || "Question"}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-700">
                    {extraireChaine(q.suggestedAnswer, q.reponse_suggeree)}
                  </p>
                  <p className="mt-1 text-xs italic text-slate-500">
                    Astuce : {extraireChaine(q.tip, q.astuce)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {score !== null ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          Score de compatibilité : {score}%
        </div>
      ) : null}

      {!cvInteressant && lettre.paragraphes.length === 0 && questions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-sm text-slate-500">
          Ce dossier ne contient pas de documents exploitables (entrée ancienne de
          l&apos;historique).
        </div>
      ) : null}
    </div>
  );
}

/* ── Zone d'impression : visible uniquement à l'impression / export PDF ─ */

function ZoneImpression({ item }: { item: DossierItem }) {
  const donnees = construireDonneesApercu(item);
  const lettre = extraireLettre(item.coverLetter);
  const kit = extraireObjet(item.interviewKitJson);
  const candidat = extraireObjet(item.candidateJson) ?? {};
  const nom = extraireChaine(candidat.fullName, candidat.nom_complet) || "Candidat";
  const questions = kit
    ? extraireTableau(kit.questions).map((brut) => {
        const q = extraireObjet(brut) ?? {};
        return {
          question: extraireChaine(q.question),
          reponse: extraireChaine(q.suggestedAnswer, q.reponse_suggeree),
          astuce: extraireChaine(q.tip, q.astuce),
        };
      })
    : [];
  const scoreInitial = item.initialScore === null ? "non calculé" : `${item.initialScore}%`;
  const scoreOptimise = item.optimizedScore === null ? "non calculé" : `${item.optimizedScore}%`;

  return (
    <div className="zone-impression hidden">
      <p className="font-serif text-[14pt] font-bold">{nom}</p>
      <p className="font-serif text-[11pt]">
        Dossier : {item.jobTitle} — {item.companyName || "Entreprise non précisée"}
      </p>
      {item.jobUrl ? <p className="font-serif text-[9pt]">{item.jobUrl}</p> : null}

      {donnees && donnees.resume ? (
        <>
          <p className="mt-3 font-serif text-[11pt] font-bold">Profil</p>
          <p className="font-serif text-[10pt] leading-relaxed">{donnees.resume}</p>
        </>
      ) : null}

      {donnees && donnees.experiences.length > 0 ? (
        <>
          <p className="mt-3 font-serif text-[11pt] font-bold">Expérience professionnelle</p>
          {donnees.experiences.map((exp, i) => (
            <div key={i} className="mt-1.5">
              <p className="font-serif text-[10pt] font-bold">
                {exp.poste}
                {exp.periode ? ` — ${exp.periode}` : ""}
              </p>
              <p className="font-serif text-[10pt]">
                {exp.entreprise}
                {exp.lieu ? ` (${exp.lieu})` : ""}
              </p>
              <ul className="ml-4">
                {exp.missions.map((mission, j) => (
                  <li key={j} className="font-serif text-[10pt] leading-snug">
                    • {mission}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      ) : null}

      {donnees && donnees.formations.length > 0 ? (
        <>
          <p className="mt-3 font-serif text-[11pt] font-bold">Formation</p>
          {donnees.formations.map((formation, i) => (
            <p key={i} className="font-serif text-[10pt]">
              {formation.diplome}
              {formation.periode ? ` — ${formation.periode}` : ""}
            </p>
          ))}
        </>
      ) : null}

      {donnees && donnees.competences.length > 0 ? (
        <>
          <p className="mt-3 font-serif text-[11pt] font-bold">Compétences</p>
          <p className="font-serif text-[10pt]">{donnees.competences.join(" · ")}</p>
        </>
      ) : null}

      {donnees && donnees.langues.length > 0 ? (
        <>
          <p className="mt-3 font-serif text-[11pt] font-bold">Langues</p>
          <p className="font-serif text-[10pt]">
            {donnees.langues.map((langue) => `${langue.nom} — ${langue.niveau}`).join(" · ")}
          </p>
        </>
      ) : null}

      {lettre.paragraphes.length > 0 ? (
        <>
          <p className="mt-4 font-serif text-[11pt] font-bold">Lettre de motivation</p>
          {lettre.objet ? (
            <p className="font-serif text-[10pt] font-bold">Objet : {lettre.objet}</p>
          ) : null}
          {lettre.salutation ? <p className="font-serif text-[10pt]">{lettre.salutation}</p> : null}
          {lettre.paragraphes.map((paragraphe, i) => (
            <p key={i} className="font-serif text-[10pt] leading-relaxed">
              {paragraphe}
            </p>
          ))}
          {lettre.politesse ? <p className="font-serif text-[10pt]">{lettre.politesse}</p> : null}
        </>
      ) : null}

      {questions.length > 0 ? (
        <>
          <p className="mt-4 font-serif text-[11pt] font-bold">Kit d&apos;entretien</p>
          {questions.map((question, i) => (
            <div key={i} className="mt-1.5">
              <p className="font-serif text-[10pt] font-bold">
                Q{i + 1}. {question.question}
              </p>
              <p className="font-serif text-[10pt] leading-snug">{question.reponse}</p>
              {question.astuce ? (
                <p className="font-serif text-[9pt] italic">Astuce : {question.astuce}</p>
              ) : null}
            </div>
          ))}
        </>
      ) : null}

      <p className="mt-4 font-serif text-[9pt]">
        Scores de compatibilité : initial {scoreInitial} · optimisé {scoreOptimise} — préparé avec
        NexiRole.
      </p>
    </div>
  );
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

  /* Aperçu complet (modale plein écran). */
  const [apercuId, setApercuId] = useState<string | null>(null);

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
    const current = readDossierOffer();
    if (!current) return;
    setOffer(current as Record<string, unknown>);
    // Ouvre le panneau existant avec l'offre chargée depuis l'Agent
    window.dispatchEvent(new CustomEvent("nexirole:open-dossier", { detail: current }));
    // FIX historique : enregistre le dossier (miroir local + POST serveur best-effort)
    const signature = offerSignature(current);
    if (savedRef.current !== signature) {
      savedRef.current = signature;
      void saveDossierToHistory(current);
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

  function telechargerPdf(item: DossierItem) {
    setApercuId(item.id);
    // Laisse le temps à la modale + zone d'impression de se monter.
    window.setTimeout(() => window.print(), 300);
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

  const dossierApercu = apercuId ? dossiers.find((d) => d.id === apercuId) ?? null : null;
  const donneesApercu = dossierApercu ? construireDonneesApercu(dossierApercu) : null;
  const templateIdApercu: TemplateId =
    dossierApercu && isTemplateId(dossierApercu.templateId)
      ? dossierApercu.templateId
      : "modern-accent";

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <style>{CSS_IMPRESSION}</style>

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
                ? "Ton historique complet : relis, édite, imprime et partage les dossiers générés par l'IA."
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
                              title="Voir l'aperçu complet (CV, lettre, kit)"
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
                              onClick={() => telechargerPdf(dossier)}
                              title="Télécharger le dossier en PDF"
                              aria-label="Télécharger le dossier en PDF"
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
                « Générer le dossier ».
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
                de ce fichier (commande de localisation fournie à l&apos;étape 0 du protocole).
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Modale : aperçu complet du dossier ──────────────────────── */}
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#051937]/20 px-4 py-2 text-sm font-semibold text-[#051937] transition-colors hover:bg-[#051937]/5"
                >
                  <IconPrinter size={16} />
                  Imprimer / PDF
                </button>
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
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Score initial
                </p>
                <p className="mt-1 text-xl font-extrabold text-[#051937]">
                  {dossierApercu.initialScore === null ? "—" : `${dossierApercu.initialScore}%`}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Score optimisé
                </p>
                <p className="mt-1 text-xl font-extrabold text-[#051937]">
                  {dossierApercu.optimizedScore === null
                    ? "—"
                    : `${dossierApercu.optimizedScore}%`}
                </p>
              </div>
            </div>

            {donneesApercu ? (
              <DossierPreview data={donneesApercu} templateId={templateIdApercu} photo={null} />
            ) : (
              <ApercuBrut item={dossierApercu} />
            )}
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

      {/* ── Zone d'impression (montée avec l'aperçu, invisible à l'écran) ─ */}
      {dossierApercu ? <ZoneImpression item={dossierApercu} /> : null}
    </div>
  );
}
