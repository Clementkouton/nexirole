"use client";

/**
 * NexiRole — APERÇU DE DOSSIER PAR OFFRE (composant partagé).
 *
 * Un même outil pour la vue « résultat » du panneau de génération et la
 * modale « Voir » de la page /dashboard/dossier :
 *
 *  1. normaliserDossierComplet() : reconstruit une structure propre
 *     (DonneesDossier) depuis les champs enregistrés en base
 *     (cvJson, coverLetter, interviewKitJson, candidateJson, scores).
 *  2. <DossierOnglets /> : interface à 4 onglets —
 *     Synthèse & Score ATS · CV adapté · Lettre de motivation (éditable) ·
 *     Kit d'entretien & approche.
 *  3. Exports PDF RÉELS via @react-pdf/renderer (fini window.print() et
 *     les .md) : le CV utilise le composant existant
 *     src/components/pdf/CvPdfDocument.tsx (4 templates ATS) ; la lettre et
 *     le kit utilisent des documents dédiés déclarés dans ce fichier.
 *
 * Charte : navy #051937 + or #FFC107. Icônes : @tabler/icons-react.
 */

import { useState } from "react";
import { toast } from "sonner";
import {
  IconAlertTriangle,
  IconBriefcase,
  IconCheck,
  IconCopy,
  IconDeviceFloppy,
  IconEdit,
  IconFileTypePdf,
  IconLoader2,
  IconMail,
  IconBrandLinkedin,
  IconTargetArrow,
  IconX,
} from "@tabler/icons-react";
import type { TemplateId } from "@/lib/cv-templates";

/* ── Types publics ───────────────────────────────────────────────────── */

export interface IdentiteDossier {
  nom_complet: string;
  email?: string;
  telephone?: string;
  ville?: string;
  linkedin?: string;
}

export interface DonneesDossier {
  identite: IdentiteDossier;
  titre: string;
  resume: string;
  experiences: Array<{
    poste: string;
    periode: string;
    entreprise: string;
    lieu: string;
    missions: string[];
  }>;
  formations: Array<{ diplome: string; etablissement: string; periode: string }>;
  competences: string[];
  langues: Array<{ nom: string; niveau: string }>;
  /** Mots-clés de l'offre intégrés dans le CV (points forts / lacunes comblées). */
  motsCles: string[];
  scores: { initial: number | null; optimise: number | null };
  lettre: {
    objet: string;
    salutation: string;
    paragraphes: string[];
    politesse: string;
    /** Texte brut si la lettre n'est pas structurée (anciens dossiers). */
    texteBrut: string;
  };
  kit: {
    questions: Array<{ question: string; reponse: string; astuce: string }>;
    message_linkedin: string;
    message_email: string;
  } | null;
  offre: { titre: string; entreprise: string; lieu: string; url: string };
}

/* ── Aides de normalisation ──────────────────────────────────────────── */

function objetOuNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function chaine(...valeurs: unknown[]): string {
  for (const valeur of valeurs) {
    if (typeof valeur === "string" && valeur.trim() !== "") return valeur.trim();
  }
  return "";
}

function tableau(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      item !== null && typeof item === "object" && !Array.isArray(item)
  );
}

function listeTextes(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .map((item) => item.trim())
    .slice(0, max);
}

function nombre(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

/** Lettre : JSON structuré ({subject, greeting, paragraphs, closing}) ou texte brut. */
function lireLettre(coverLetter: unknown): DonneesDossier["lettre"] {
  const vide = { objet: "", salutation: "", paragraphes: [], politesse: "", texteBrut: "" };
  if (typeof coverLetter !== "string") return vide;
  const texte = coverLetter.trim();
  if (!texte) return vide;
  try {
    const parse: unknown = JSON.parse(texte);
    const objet = objetOuNull(parse);
    if (!objet) return { ...vide, texteBrut: texte };
    const paragraphes = listeTextes(objet.paragraphs ?? objet.paragraphes, 8);
    const resultat = {
      objet: chaine(objet.subject, objet.objet),
      salutation: chaine(objet.greeting, objet.salutation),
      paragraphes,
      politesse: chaine(objet.closing, objet.politesse),
      texteBrut: "",
    };
    if (resultat.paragraphes.length > 0 || resultat.objet) return resultat;
    return { ...vide, texteBrut: texte };
  } catch {
    return { objet: "", salutation: "", paragraphes: [], politesse: "", texteBrut: texte };
  }
}

/**
 * Reconstruit <DonneesDossier> depuis un enregistrement GeneratedApplication
 * (GET /api/history?type=applications) ou depuis l'objet `dossier` renvoyé
 * par POST /api/dossier. Retourne null si le dossier est totalement vide.
 */
export function normaliserDossierComplet(
  brut: Record<string, unknown>
): DonneesDossier | null {
  const cv = objetOuNull(brut.cvJson);
  const candidat = objetOuNull(brut.candidateJson) ?? {};
  const kit = objetOuNull(brut.interviewKitJson);
  const lettre = lireLettre(brut.coverLetter);

  const experiences = tableau(cv?.experiences).map((e) => ({
    poste: chaine(e.role, e.poste),
    periode: chaine(e.period, e.periode),
    entreprise: chaine(e.company, e.entreprise),
    lieu: chaine(e.location, e.lieu),
    missions: listeTextes(e.achievements ?? e.missions, 8),
  }));

  const formations = tableau(cv?.education ?? cv?.formations).map((f) => ({
    diplome: chaine(f.degree, f.diplome),
    etablissement: chaine(f.school, f.ecole, f.etablissement),
    periode: chaine(f.period, f.periode),
  }));

  const competences = listeTextes(cv?.skills ?? cv?.competences, 24);
  const langues = tableau(cv?.languages ?? cv?.langues).map((l) => ({
    nom: chaine(l.name, l.nom),
    niveau: chaine(l.level, l.niveau),
  }));
  const motsCles = listeTextes(cv?.keywordsMatched ?? cv?.motsCles, 16);
  const resume = chaine(cv?.summary, cv?.resume);

  const identite: IdentiteDossier = {
    nom_complet: chaine(candidat.fullName, candidat.nom_complet) || "Candidat NexiRole",
    email: chaine(candidat.email) || undefined,
    telephone: chaine(candidat.phone, candidat.telephone) || undefined,
    ville: chaine(candidat.location, candidat.ville) || undefined,
    linkedin: chaine(candidat.linkedin) || undefined,
  };

  const questions = kit
    ? tableau(kit.questions).map((q) => ({
        question: chaine(q.question),
        reponse: chaine(q.suggestedAnswer, q.reponse_suggeree, q.reponse),
        astuce: chaine(q.tip, q.astuce),
      }))
    : [];
  const messageLinkedin = kit ? chaine(kit.outreachLinkedin, kit.message_linkedin) : "";
  const messageEmail = kit ? chaine(kit.outreachEmail, kit.message_email) : "";
  const kitPropre =
    questions.length > 0 || messageLinkedin || messageEmail
      ? { questions, message_linkedin: messageLinkedin, message_email: messageEmail }
      : null;

  const aContenu =
    experiences.length > 0 ||
    formations.length > 0 ||
    competences.length > 0 ||
    langues.length > 0 ||
    resume !== "" ||
    motsCles.length > 0;

  if (!aContenu && !kitPropre && !lettre.paragraphes.length && !lettre.texteBrut) {
    return null;
  }

  return {
    identite,
    titre: chaine(cv?.title, cv?.titre) || chaine(brut.jobTitle) || "CV adapté",
    resume,
    experiences,
    formations,
    competences,
    langues,
    motsCles,
    scores: { initial: nombre(brut.initialScore), optimise: nombre(brut.optimizedScore) },
    lettre,
    kit: kitPropre,
    offre: {
      titre: chaine(brut.jobTitle) || "Offre ciblée",
      entreprise: chaine(brut.companyName),
      lieu: "",
      url: chaine(brut.jobUrl),
    },
  };
}

export function aCv(donnees: DonneesDossier): boolean {
  return (
    donnees.experiences.length > 0 ||
    donnees.formations.length > 0 ||
    donnees.competences.length > 0 ||
    donnees.resume !== ""
  );
}

export function aLettre(donnees: DonneesDossier): boolean {
  return donnees.lettre.paragraphes.length > 0 || donnees.lettre.texteBrut !== "";
}

export function aKit(donnees: DonneesDossier): boolean {
  return donnees.kit !== null;
}

/** Lettre structurée → texte prêt à copier / envoyer. */
export function lettreEnTexte(donnees: DonneesDossier): string {
  if (donnees.lettre.texteBrut) return donnees.lettre.texteBrut;
  const lignes: string[] = [];
  if (donnees.lettre.objet) lignes.push(`Objet : ${donnees.lettre.objet}`, "");
  if (donnees.lettre.salutation) lignes.push(donnees.lettre.salutation, "");
  for (const paragraphe of donnees.lettre.paragraphes) {
    lignes.push(paragraphe, "");
  }
  if (donnees.lettre.politesse) lignes.push(donnees.lettre.politesse, "");
  lignes.push(donnees.identite.nom_complet);
  return lignes.join("\n").trim();
}

/* ── Téléchargement PDF (réels, @react-pdf/renderer) ─────────────────── */

function nomFichier(base: string): string {
  const nettoye = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return nettoye.length > 0 ? nettoye : "document";
}

function declencherTelechargement(blob: Blob, nom: string): void {
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = `${nom}.pdf`;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(url);
}

/** Structure exacte attendue par src/components/pdf/CvPdfDocument.tsx. */
function versDonneesPdf(donnees: DonneesDossier) {
  return {
    identite: {
      nom_complet: donnees.identite.nom_complet || "Candidat",
      email: donnees.identite.email ?? "",
      telephone: donnees.identite.telephone ?? "",
      ville: donnees.identite.ville ?? "",
      linkedin: donnees.identite.linkedin ?? "",
    },
    titre: donnees.titre || "CV",
    resume: donnees.resume,
    experiences: donnees.experiences.map((e) => ({
      poste: e.poste,
      periode: e.periode,
      entreprise: e.entreprise,
      lieu: e.lieu,
      missions: e.missions,
    })),
    formations: donnees.formations.map((f) => ({
      diplome: f.diplome,
      periode: f.periode,
      etablissement: f.etablissement,
    })),
    competences: donnees.competences,
    langues: donnees.langues.map((l) => ({ nom: l.nom, niveau: l.niveau })),
  };
}

/** « Télécharger le CV (PDF) » — composant existant + template ATS au choix. */
export async function telechargerCvPdf(
  donnees: DonneesDossier,
  templateId: TemplateId = "modern-accent",
  photo?: string | null
): Promise<void> {
  const [{ pdf }, { CvPdfDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/pdf/CvPdfDocument"),
  ]);
  const blob = await pdf(
    <CvPdfDocument data={versDonneesPdf(donnees)} templateId={templateId} photo={photo ?? null} />
  ).toBlob();
  declencherTelechargement(
    blob,
    nomFichier(`CV_NexiRole_${donnees.offre.entreprise || donnees.identite.nom_complet}`)
  );
}

/** Découpe un texte libre en blocs (paragraphes séparés par une ligne vide). */
function blocsDepuisTexte(texte: string): string[] {
  return texte
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((bloc) => bloc.replace(/\n/g, " ").trim())
    .filter((bloc) => bloc !== "");
}

const STYLES_COURRIER = {
  page: {
    paddingTop: 46,
    paddingHorizontal: 52,
    paddingBottom: 40,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    color: "#1e293b",
    lineHeight: 1.55,
  } as const,
  enTete: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 } as const,
  blocCandidat: { maxWidth: "60%" } as const,
  nom: { fontSize: 15, fontWeight: "bold" as const, color: "#051937", marginBottom: 4 },
  contact: { fontSize: 8.5, color: "#475569", marginBottom: 1.5 },
  blocDestinataire: { maxWidth: "38%", fontSize: 9.5, color: "#334155", textAlign: "right" } as const,
  entreprise: { fontSize: 11, fontWeight: "bold" as const, color: "#051937" },
  regle: { height: 3, backgroundColor: "#051937", marginBottom: 22 },
  meta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 } as const,
  petit: { fontSize: 9.5, color: "#475569" },
  objet: { fontSize: 10.5, fontWeight: "bold" as const, color: "#051937", marginBottom: 14 },
  salutation: { marginBottom: 10, color: "#1e293b" },
  paragraphe: { marginBottom: 9, textAlign: "justify", color: "#334155" },
  politesse: { marginTop: 4, marginBottom: 22, textAlign: "justify", color: "#334155" },
  signature: { fontSize: 10.5, fontWeight: "bold" as const, color: "#051937" },
  pied: {
    position: "absolute",
    bottom: 18,
    left: 52,
    right: 52,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.8,
    borderTopColor: "#cbd5e1",
    paddingTop: 6,
  } as const,
  piedTexte: { fontSize: 7.5, color: "#94a3b8" },
};

interface OptionsLettrePdf {
  /** Texte structuré ou brut de la lettre. */
  contenu: string;
  candidat?: { nom?: string; email?: string; telephone?: string; ville?: string };
  entreprise?: string;
  poste?: string;
  nomFichier?: string;
}

/**
 * Lettre de motivation → vrai PDF (Lettre_NexiRole.pdf).
 * Utilisé par la page /dashboard/lettres ET par l'onglet lettre des dossiers.
 */
export async function telechargerLettreTextePdf(options: OptionsLettrePdf): Promise<void> {
  const { Document, Page, Text, View, pdf } = await import("@react-pdf/renderer");
  const blocs = blocsDepuisTexte(options.contenu);
  /* La 1re ligne « Objet : ... » devient l'objet officiel du courrier. */
  let objet = "";
  const corps: string[] = [];
  for (const bloc of blocs) {
    if (!objet && /^objet\s*:/i.test(bloc)) {
      objet = bloc.replace(/^objet\s*:\s*/i, "").slice(0, 200);
      continue;
    }
    corps.push(bloc);
  }

  const Doc = () => (
    <Document
      title={`Lettre de motivation — ${options.candidat?.nom || "Candidat"}`}
      author={options.candidat?.nom || "Candidat"}
      creator="NexiRole"
    >
      <Page size="A4" style={STYLES_COURRIER.page}>
        <View style={STYLES_COURRIER.enTete}>
          <View style={STYLES_COURRIER.blocCandidat}>
            <Text style={STYLES_COURRIER.nom}>{options.candidat?.nom || "Candidat"}</Text>
            {options.candidat?.email ? (
              <Text style={STYLES_COURRIER.contact}>{options.candidat.email}</Text>
            ) : null}
            {options.candidat?.telephone ? (
              <Text style={STYLES_COURRIER.contact}>{options.candidat.telephone}</Text>
            ) : null}
            {options.candidat?.ville ? (
              <Text style={STYLES_COURRIER.contact}>{options.candidat.ville}</Text>
            ) : null}
          </View>
          <View style={STYLES_COURRIER.blocDestinataire}>
            {options.entreprise ? (
              <Text style={STYLES_COURRIER.entreprise}>{options.entreprise}</Text>
            ) : null}
            <Text>À l&apos;attention du service recrutement</Text>
          </View>
        </View>

        <View style={STYLES_COURRIER.regle} />

        <View style={STYLES_COURRIER.meta}>
          <Text style={STYLES_COURRIER.petit}>{options.candidat?.ville || "France"}</Text>
          <Text style={STYLES_COURRIER.petit}>
            Le {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </Text>
        </View>

        <Text style={STYLES_COURRIER.objet}>
          Objet : {objet || (options.poste ? `Candidature au poste de ${options.poste}` : "Candidature")}
        </Text>

        {corps.map((bloc, i) => (
          <Text key={i} style={i === 0 ? STYLES_COURRIER.salutation : STYLES_COURRIER.paragraphe}>
            {bloc}
          </Text>
        ))}

        <Text style={STYLES_COURRIER.signature}>{options.candidat?.nom || "Candidat"}</Text>

        <View style={STYLES_COURRIER.pied} fixed>
          <Text style={STYLES_COURRIER.piedTexte}>
            {options.candidat?.nom || "Candidat"}
            {options.poste ? ` — Candidature : ${options.poste}` : ""}
          </Text>
          <Text style={STYLES_COURRIER.piedTexte}>Rédigée avec NexiRole</Text>
        </View>
      </Page>
    </Document>
  );

  const blob = await pdf(<Doc />).toBlob();
  declencherTelechargement(blob, nomFichier(options.nomFichier || "Lettre_NexiRole"));
}

/** Onglet lettre des dossiers : lettre structurée → PDF courrier. */
export async function telechargerLettrePdf(donnees: DonneesDossier): Promise<void> {
  await telechargerLettreTextePdf({
    contenu: lettreEnTexte(donnees),
    candidat: {
      nom: donnees.identite.nom_complet,
      email: donnees.identite.email,
      telephone: donnees.identite.telephone,
      ville: donnees.identite.ville,
    },
    entreprise: donnees.offre.entreprise,
    poste: donnees.offre.titre,
    nomFichier: `Lettre_NexiRole_${donnees.offre.entreprise || donnees.identite.nom_complet}`,
  });
}

const STYLES_KIT = {
  page: {
    paddingTop: 44,
    paddingHorizontal: 48,
    paddingBottom: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1e293b",
  } as const,
  bandeau: { backgroundColor: "#051937", padding: 16, marginBottom: 18 } as const,
  bandeauTitre: { fontSize: 15, fontWeight: "bold" as const, color: "#FFC107" },
  bandeauSousTitre: { fontSize: 9.5, color: "#ffffff", marginTop: 4 },
  section: { fontSize: 12, fontWeight: "bold" as const, color: "#051937", marginTop: 14, marginBottom: 8 },
  boite: {
    borderWidth: 0.8,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
  } as const,
  label: { fontSize: 8.5, fontWeight: "bold" as const, color: "#475569", marginBottom: 4 },
  texte: { fontSize: 9.5, lineHeight: 1.5, color: "#334155" },
  question: { fontSize: 10.5, fontWeight: "bold" as const, color: "#051937" },
  astuce: { fontSize: 8.5, fontStyle: "italic" as const, color: "#7c6a00", marginTop: 4 },
  pied: {
    position: "absolute",
    bottom: 18,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.8,
    borderTopColor: "#cbd5e1",
    paddingTop: 6,
  } as const,
  piedTexte: { fontSize: 7.5, color: "#94a3b8" },
};

/** « Télécharger le Kit Entretien (PDF) » — questions/réponses + approches. */
export async function telechargerKitPdf(donnees: DonneesDossier): Promise<void> {
  const kit = donnees.kit;
  if (!kit) return;
  const { Document, Page, Text, View, pdf } = await import("@react-pdf/renderer");

  const Doc = () => (
    <Document
      title={`Kit d'entretien — ${donnees.offre.titre}`}
      author={donnees.identite.nom_complet}
      creator="NexiRole"
    >
      <Page size="A4" style={STYLES_KIT.page}>
        <View style={STYLES_KIT.bandeau}>
          <Text style={STYLES_KIT.bandeauTitre}>Kit d&apos;entretien &amp; approche</Text>
          <Text style={STYLES_KIT.bandeauSousTitre}>
            {donnees.offre.titre}
            {donnees.offre.entreprise ? ` — ${donnees.offre.entreprise}` : ""}
          </Text>
        </View>

        {kit.message_linkedin ? (
          <>
            <Text style={STYLES_KIT.section}>Message d&apos;approche LinkedIn</Text>
            <View style={STYLES_KIT.boite}>
              <Text style={STYLES_KIT.label}>À envoyer au recruteur</Text>
              <Text style={STYLES_KIT.texte}>{kit.message_linkedin}</Text>
            </View>
          </>
        ) : null}

        {kit.message_email ? (
          <>
            <Text style={STYLES_KIT.section}>Message d&apos;approche e-mail</Text>
            <View style={STYLES_KIT.boite}>
              <Text style={STYLES_KIT.label}>Objet : Opportunité {donnees.offre.titre}</Text>
              <Text style={STYLES_KIT.texte}>{kit.message_email}</Text>
            </View>
          </>
        ) : null}

        {kit.questions.length > 0 ? (
          <>
            <Text style={STYLES_KIT.section}>Questions probables &amp; réponses suggérées</Text>
            {kit.questions.map((q, i) => (
              <View key={i} style={STYLES_KIT.boite}>
                <Text style={STYLES_KIT.question}>
                  Q{i + 1}. {q.question}
                </Text>
                {q.reponse ? (
                  <>
                    <Text style={[STYLES_KIT.label, { marginTop: 6 }]}>Réponse suggérée</Text>
                    <Text style={STYLES_KIT.texte}>{q.reponse}</Text>
                  </>
                ) : null}
                {q.astuce ? <Text style={STYLES_KIT.astuce}>Astuce : {q.astuce}</Text> : null}
              </View>
            ))}
          </>
        ) : null}

        <View style={STYLES_KIT.pied} fixed>
          <Text style={STYLES_KIT.piedTexte}>
            {donnees.identite.nom_complet} — {donnees.offre.titre}
          </Text>
          <Text style={STYLES_KIT.piedTexte}>Préparé avec NexiRole</Text>
        </View>
      </Page>
    </Document>
  );

  const blob = await pdf(<Doc />).toBlob();
  declencherTelechargement(blob, nomFichier(`Kit_Entretien_NexiRole_${donnees.offre.entreprise}`));
}

/* ── Interface à 4 onglets ───────────────────────────────────────────── */

type OngletId = "synthese" | "cv" | "lettre" | "kit";

const ONGLETS: Array<{ id: OngletId; libelle: string }> = [
  { id: "synthese", libelle: "Synthèse & Score ATS" },
  { id: "cv", libelle: "CV adapté à l'offre" },
  { id: "lettre", libelle: "Lettre de motivation" },
  { id: "kit", libelle: "Kit d'entretien & approche" },
];

function BlocScore({
  libelle,
  valeur,
  accent,
}: {
  libelle: string;
  valeur: number | null;
  accent: "navy" | "gold";
}) {
  const couleurBarre = accent === "navy" ? "bg-[#051937]" : "bg-[#FFC107]";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{libelle}</p>
      <p className="mt-2 text-3xl font-extrabold text-[#051937]">
        {valeur === null ? "—" : `${valeur}%`}
      </p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${couleurBarre}`}
          style={{ width: `${Math.min(100, Math.max(0, valeur ?? 0))}%` }}
        />
      </div>
    </div>
  );
}

export interface DossierOngletsProps {
  donnees: DonneesDossier;
  /** Présent → l'onglet Lettre devient éditable et sauvegardable en base. */
  onEnregistrerLettre?: (texte: string) => Promise<void>;
  /** Onglet affiché au montage (défaut : synthèse). */
  ongletInitial?: OngletId;
}

export function DossierOnglets({ donnees, onEnregistrerLettre, ongletInitial }: DossierOngletsProps) {
  const [onglet, setOnglet] = useState<OngletId>(ongletInitial ?? "synthese");
  const [editionLettre, setEditionLettre] = useState(false);
  const [texteLettre, setTexteLettre] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);
  const [copie, setCopie] = useState<string | null>(null);

  async function copier(id: string, texte: string) {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(id);
      window.setTimeout(() => setCopie(null), 2000);
    } catch {
      toast.error("Copie impossible dans ce navigateur.");
    }
  }

  async function enregistrerLettre() {
    if (!onEnregistrerLettre) return;
    setEnregistrement(true);
    try {
      await onEnregistrerLettre(texteLettre);
      setEditionLettre(false);
      toast.success("Lettre mise à jour et sauvegardée en base.");
    } catch {
      toast.error("La sauvegarde de la lettre a échoué.");
    } finally {
      setEnregistrement(false);
    }
  }

  const ongletsDisponibles = ONGLETS.filter((o) => {
    if (o.id === "kit") return aKit(donnees);
    if (o.id === "lettre") return aLettre(donnees);
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Navigation des onglets */}
      <div className="flex flex-wrap gap-2">
        {ongletsDisponibles.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setOnglet(o.id)}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
              onglet === o.id
                ? "bg-[#051937] text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {o.libelle}
          </button>
        ))}
      </div>

      {/* Onglet 1 : Synthèse & Score ATS */}
      {onglet === "synthese" ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <BlocScore libelle="Score initial (CV d'origine)" valeur={donnees.scores.initial} accent="navy" />
            <BlocScore libelle="Score optimisé (CV adapté)" valeur={donnees.scores.optimise} accent="gold" />
          </div>

          {donnees.resume ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="text-sm font-bold uppercase tracking-wide text-slate-400">
                Résumé adapté à l&apos;offre
              </h4>
              <p className="mt-3 text-sm leading-relaxed text-slate-700">{donnees.resume}</p>
            </div>
          ) : null}

          {donnees.motsCles.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="text-sm font-bold uppercase tracking-wide text-slate-400">
                Points forts — mots-clés de l&apos;offre intégrés au CV
              </h4>
              <div className="mt-3 flex flex-wrap gap-2">
                {donnees.motsCles.map((mot, i) => (
                  <span
                    key={i}
                    className="rounded-lg bg-[#FFC107]/15 px-3 py-1.5 text-xs font-semibold text-[#051937]"
                  >
                    <IconCheck size={13} className="mr-1 inline text-[#B78900]" />
                    {mot}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {donnees.kit && donnees.kit.questions.some((q) => q.astuce) ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <h4 className="text-sm font-bold uppercase tracking-wide text-amber-700">
                Conseils pour réussir
              </h4>
              <ul className="mt-3 space-y-2 text-sm text-amber-900">
                {donnees.kit.questions
                  .filter((q) => q.astuce)
                  .map((q, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="font-bold">•</span>
                      <span>{q.astuce}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Onglet 2 : CV adapté à l'offre */}
      {onglet === "cv" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-lg font-extrabold text-[#051937]">{donnees.identite.nom_complet}</p>
            <p className="mt-0.5 text-sm font-semibold text-[#B78900]">{donnees.titre}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              {donnees.identite.email ? <span>{donnees.identite.email}</span> : null}
              {donnees.identite.telephone ? <span>{donnees.identite.telephone}</span> : null}
              {donnees.identite.ville ? <span>{donnees.identite.ville}</span> : null}
              {donnees.identite.linkedin ? <span>{donnees.identite.linkedin}</span> : null}
            </div>
          </div>

          {donnees.resume ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="text-sm font-bold uppercase tracking-wide text-slate-400">Résumé</h4>
              <p className="mt-3 text-sm leading-relaxed text-slate-700">{donnees.resume}</p>
            </div>
          ) : null}

          {donnees.competences.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="text-sm font-bold uppercase tracking-wide text-slate-400">Compétences</h4>
              <div className="mt-3 flex flex-wrap gap-2">
                {donnees.competences.map((competence, i) => (
                  <span
                    key={i}
                    className="rounded-lg border border-[#051937]/15 bg-[#051937]/5 px-3 py-1.5 text-xs font-semibold text-[#051937]"
                  >
                    {competence}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {donnees.experiences.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="text-sm font-bold uppercase tracking-wide text-slate-400">
                Expériences professionnelles
              </h4>
              <div className="mt-3 space-y-4">
                {donnees.experiences.map((exp, i) => (
                  <div key={i} className="border-l-2 border-[#FFC107] pl-4">
                    <p className="text-sm font-bold text-[#051937]">
                      {exp.poste || "Poste"}
                      {exp.entreprise ? ` — ${exp.entreprise}` : ""}
                    </p>
                    <p className="text-xs text-slate-500">
                      {[exp.periode, exp.lieu].filter(Boolean).join(" · ")}
                    </p>
                    {exp.missions.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {exp.missions.map((mission, j) => (
                          <li key={j} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                            <span className="text-[#B78900]">•</span>
                            <span>{mission}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {donnees.formations.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="text-sm font-bold uppercase tracking-wide text-slate-400">Formations</h4>
              <ul className="mt-3 space-y-2">
                {donnees.formations.map((formation, i) => (
                  <li key={i} className="text-sm text-slate-700">
                    <span className="font-semibold text-[#051937]">{formation.diplome}</span>
                    {formation.etablissement ? ` — ${formation.etablissement}` : ""}
                    {formation.periode ? ` (${formation.periode})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {donnees.langues.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="text-sm font-bold uppercase tracking-wide text-slate-400">Langues</h4>
              <p className="mt-3 text-sm text-slate-700">
                {donnees.langues.map((l) => `${l.nom}${l.niveau ? ` (${l.niveau})` : ""}`).join(" · ")}
              </p>
            </div>
          ) : null}

          {!aCv(donnees) ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-sm text-slate-500">
              Ce dossier ne contient pas de CV structuré exploitable.
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Onglet 3 : Lettre de motivation (éditable si onEnregistrerLettre) */}
      {onglet === "lettre" ? (
        <div className="space-y-3">
          {editionLettre ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-bold uppercase tracking-wide text-slate-400">
                  Modifier la lettre
                </h4>
                <button
                  type="button"
                  onClick={() => setEditionLettre(false)}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
                  aria-label="Annuler la modification"
                >
                  <IconX size={16} />
                </button>
              </div>
              <textarea
                value={texteLettre}
                onChange={(e) => setTexteLettre(e.target.value)}
                rows={14}
                className="mt-3 w-full rounded-xl border border-slate-200 p-4 font-serif text-sm leading-relaxed text-slate-700 outline-none focus:border-[#051937] focus:ring-2 focus:ring-[#051937]/10"
              />
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => void enregistrerLettre()}
                  disabled={enregistrement || texteLettre.trim().length < 20}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#051937] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0b2a5b] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {enregistrement ? (
                    <IconLoader2 size={16} className="animate-spin" />
                  ) : (
                    <IconDeviceFloppy size={16} />
                  )}
                  Enregistrer la lettre
                </button>
              </div>
            </div>
          ) : (
            <div className="relative rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <div className="absolute right-4 top-4 flex gap-1">
                {onEnregistrerLettre ? (
                  <button
                    type="button"
                    onClick={() => {
                      setTexteLettre(lettreEnTexte(donnees));
                      setEditionLettre(true);
                    }}
                    title="Éditer la lettre puis sauvegarder en base"
                    aria-label="Éditer la lettre"
                    className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5"
                  >
                    <IconEdit size={16} />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void copier("lettre", lettreEnTexte(donnees))}
                  title="Copier le texte de la lettre"
                  aria-label="Copier la lettre"
                  className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5"
                >
                  {copie === "lettre" ? (
                    <IconCheck size={16} className="text-emerald-600" />
                  ) : (
                    <IconCopy size={16} />
                  )}
                </button>
              </div>

              {donnees.lettre.objet ? (
                <p className="text-sm font-bold text-[#051937]">Objet : {donnees.lettre.objet}</p>
              ) : null}
              {donnees.lettre.salutation ? (
                <p className="mt-3 text-sm text-slate-700">{donnees.lettre.salutation}</p>
              ) : null}
              <div className="mt-3 space-y-3">
                {donnees.lettre.paragraphes.map((paragraphe, i) => (
                  <p key={i} className="text-sm leading-relaxed text-slate-700">
                    {paragraphe}
                  </p>
                ))}
                {donnees.lettre.texteBrut
                  ? donnees.lettre.texteBrut.split(/\n\s*\n/).map((bloc, i) => (
                      <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                        {bloc}
                      </p>
                    ))
                  : null}
              </div>
              {donnees.lettre.politesse ? (
                <p className="mt-4 text-sm text-slate-700">{donnees.lettre.politesse}</p>
              ) : null}
              <p className="mt-6 border-t border-slate-100 pt-4 text-sm font-bold text-[#051937]">
                {donnees.identite.nom_complet}
              </p>
            </div>
          )}

          {!aLettre(donnees) ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-sm text-slate-500">
              Ce dossier ne contient pas de lettre de motivation exploitable.
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Onglet 4 : Kit d'entretien & approche */}
      {onglet === "kit" && donnees.kit ? (
        <div className="space-y-4">
          {donnees.kit.message_linkedin ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h4 className="flex items-center gap-2 text-sm font-bold text-[#051937]">
                  <IconBrandLinkedin size={18} className="text-[#0A66C2]" />
                  Message court LinkedIn (recruteur)
                </h4>
                <button
                  type="button"
                  onClick={() => void copier("linkedin", donnees.kit!.message_linkedin)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  {copie === "linkedin" ? (
                    <IconCheck size={14} className="text-emerald-600" />
                  ) : (
                    <IconCopy size={14} />
                  )}
                  Copier
                </button>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {donnees.kit.message_linkedin}
              </p>
            </div>
          ) : null}

          {donnees.kit.message_email ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h4 className="flex items-center gap-2 text-sm font-bold text-[#051937]">
                  <IconMail size={18} className="text-[#B78900]" />
                  Message court e-mail (recruteur)
                </h4>
                <button
                  type="button"
                  onClick={() => void copier("email", donnees.kit!.message_email)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  {copie === "email" ? (
                    <IconCheck size={14} className="text-emerald-600" />
                  ) : (
                    <IconCopy size={14} />
                  )}
                  Copier
                </button>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {donnees.kit.message_email}
              </p>
            </div>
          ) : null}

          {donnees.kit.questions.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="flex items-center gap-2 text-sm font-bold text-[#051937]">
                <IconTargetArrow size={18} className="text-[#B78900]" />
                Questions probables et réponses suggérées
              </h4>
              <div className="mt-4 space-y-3">
                {donnees.kit.questions.map((q, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 p-4">
                    <p className="text-sm font-bold text-[#051937]">
                      Q{i + 1}. {q.question}
                    </p>
                    {q.reponse ? (
                      <p className="mt-2 text-sm leading-relaxed text-slate-700">{q.reponse}</p>
                    ) : null}
                    {q.astuce ? (
                      <p className="mt-2 text-xs italic text-amber-700">Astuce : {q.astuce}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {onglet === "kit" && !aKit(donnees) ? (
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0 text-slate-400" />
          <span>Ce dossier ne contient pas de kit d&apos;entretien exploitable.</span>
        </div>
      ) : null}

      {/* Rappel de l'offre ciblée */}
      {donnees.offre.url ? (
        <a
          href={donnees.offre.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#051937] underline decoration-[#FFC107] decoration-2 underline-offset-4"
        >
          <IconBriefcase size={14} />
          Revoir l&apos;offre d&apos;origine
        </a>
      ) : null}
    </div>
  );
}

/** Bouton d'export PDF réutilisable (utilisé par la page et le panneau). */
export function BoutonPdf({
  libelle,
  onClick,
  enCours,
  disabled,
}: {
  libelle: string;
  onClick: () => void;
  enCours: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={enCours || disabled}
      className="inline-flex items-center gap-2 rounded-xl border border-[#051937]/20 bg-white px-4 py-2 text-sm font-semibold text-[#051937] transition-colors hover:bg-[#051937]/5 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {enCours ? (
        <IconLoader2 size={16} className="animate-spin" />
      ) : (
        <IconFileTypePdf size={16} />
      )}
      {libelle}
    </button>
  );
}

/** Génère le PDF avec gestion d'erreur centralisée (toast en français). */
export async function exportPdfSecurise(action: () => Promise<void>): Promise<void> {
  try {
    await action();
    toast.success("PDF téléchargé — regarde ton dossier de téléchargements.");
  } catch (error) {
    console.error("[export PDF]", error);
    toast.error("La génération du PDF a échoué. Réessaie dans un instant.");
  }
}
