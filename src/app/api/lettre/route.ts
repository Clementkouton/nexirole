import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientIp, guardRateLimit } from "@/lib/rate-limit";
import { hasGroqKey } from "@/lib/ai-guard";
import { groqChat, GroqError } from "@/lib/groq";
import { resoudreUtilisateur } from "@/lib/utilisateur-actuel";

/**
 * NexiRole — API LETTRES DE MOTIVATION.
 *
 * GET  /api/lettre : liste des lettres de l'utilisateur connecté.
 * POST /api/lettre : DEUX modes —
 *   1. GÉNÉRATION IA (Groq, moteur src/lib/groq.ts avec chaîne de replis) :
 *      le CV peut être fourni soit en texte collé (`cvText`), soit par un CV
 *      de la bibliothèque (`cvId` → rechargé en base puis converti en texte).
 *      La lettre générée est enregistrée immédiatement en base → 201 { lettre }.
 *   2. IMPORT DIRECT (migration depuis un dossier par offre, ou collage) :
 *      corps avec `content` non vide → enregistrement direct sans appel IA.
 *
 * Identité : résolution tolérante (session.id → session.email → cookie JWT)
 * via src/lib/utilisateur-actuel.ts — plus de 401 injustifié quand la
 * session ne contient pas d'id utilisateur exploitable.
 *
 * Garde-fou anti-abus identique à /api/improve-cv : 20 requêtes/h pour un
 * utilisateur connecté, clé IP en complément, 429 en français.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const inputSchema = z.object({
  position: z.string().max(200).default(""),
  company: z.string().max(200).default(""),
  tone: z
    .enum(["professionnel", "enthousiaste", "direct", "creatif"])
    .default("professionnel"),
  language: z.enum(["fr", "en"]).default("fr"),
  jobOffer: z.string().max(12000).default(""),
  cvText: z.string().max(12000).default(""),
  /* CV sélectionné dans la bibliothèque du créateur (rechargé en base). */
  cvId: z.string().max(64).optional(),
  /* Mode IMPORT DIRECT : contenu déjà rédigé (ex. lettre d'un dossier). */
  content: z.string().max(60000).optional(),
  title: z.string().max(160).optional(),
});

const SYSTEM_PROMPT = `Tu es un rédacteur expert de lettres de motivation, ancien recruteur et coach carrière.

Règles impératives :
- Réponds UNIQUEMENT avec le texte de la lettre, prêt à envoyer. Aucun commentaire, aucune explication, aucun markdown (pas de #, pas d'astérisques, pas de blocs de code).
- Structure attendue : en-tête expéditeur avec placeholders ([Prénom Nom], [Adresse], [Téléphone], [E-mail]), lieu et date, bloc destinataire (entreprise et contact si connus), ligne Objet, salutation, 3 à 4 paragraphes, formule de politesse, signature [Prénom Nom].
- Contenu : relie les expériences du candidat aux besoins précis de l'offre, montre la valeur apportée, évite les généralités vides et la répétition mot à mot du CV. Phrases courtes et concrètes.
- Longueur : 250 à 350 mots environ pour le corps de la lettre.
- Si une information manque, utilise un placeholder court entre crochets, ex. [Nom du responsable].
- Respecte strictement la langue demandée pour TOUTE la lettre.`;

const TONS: Record<string, string> = {
  professionnel: "professionnel et posé",
  enthousiaste: "enthousiaste et dynamique",
  direct: "direct et efficace",
  creatif: "créatif mais crédible",
};

function construirePrompt(p: {
  company: string;
  position: string;
  tone: string;
  language: string;
  jobOffer: string;
  cvText: string;
}): string {
  const langue = p.language === "en" ? "anglais" : "français";
  const lignes = [
    `Rédige une lettre de motivation en ${langue}, ton ${TONS[p.tone] || p.tone}.`,
    p.position ? `Poste visé : ${p.position}.` : "",
    p.company ? `Entreprise : ${p.company}.` : "",
    p.jobOffer ? `--- OFFRE D'EMPLOI ---\n${p.jobOffer}` : "",
    p.cvText ? `--- CV DU CANDIDAT ---\n${p.cvText}` : "",
    "Génère maintenant la lettre complète.",
  ];
  return lignes.filter(Boolean).join("\n\n");
}

/* ------------------------------------------------------------------ */
/*  Aides : conversion d'un CV de la bibliothèque en texte             */
/* ------------------------------------------------------------------ */

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

/**
 * Convertit le contenu JSON d'un CvDocument (CvBuilderData du créateur de CV)
 * en texte CV lisible, utilisable par l'IA comme « CV DU CANDIDAT ».
 */
function cvDocumentEnTexte(data: unknown): string {
  const d = data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
  const personal = tableau([d.personal])[0] ?? {};
  const lignes: string[] = [];

  const nom = chaine(personal.fullName, personal.nom);
  const titrePro = chaine(personal.title, personal.poste);
  if (nom || titrePro) lignes.push([nom, titrePro].filter(Boolean).join(" — "));

  const contacts = [
    chaine(personal.email) && `E-mail : ${chaine(personal.email)}`,
    chaine(personal.phone, personal.telephone) &&
      `Téléphone : ${chaine(personal.phone, personal.telephone)}`,
    chaine(personal.location, personal.ville) &&
      `Ville : ${chaine(personal.location, personal.ville)}`,
    chaine(personal.linkedin) && `LinkedIn : ${chaine(personal.linkedin)}`,
  ].filter(Boolean) as string[];
  if (contacts.length > 0) lignes.push(contacts.join(" | "));

  const resume = chaine(d.summary, d.resume);
  if (resume) lignes.push(`Profil : ${resume}`);

  const experiences = tableau(d.experiences);
  if (experiences.length > 0) {
    lignes.push("Expériences professionnelles :");
    for (const exp of experiences) {
      const enTete = [
        chaine(exp.role, exp.poste),
        chaine(exp.company, exp.entreprise),
        chaine(exp.period, exp.periode),
        chaine(exp.location, exp.lieu),
      ]
        .filter(Boolean)
        .join(" — ");
      lignes.push(`- ${enTete || "Expérience"}`);
      for (const mission of listeTextes(exp.achievements ?? exp.missions, 6)) {
        lignes.push(`  • ${mission}`);
      }
    }
  }

  const formations = tableau(d.education ?? d.formations);
  if (formations.length > 0) {
    lignes.push("Formation :");
    for (const formation of formations) {
      const ligne = [
        chaine(formation.degree, formation.diplome),
        chaine(formation.school, formation.ecole, formation.etablissement),
        chaine(formation.period, formation.periode),
      ]
        .filter(Boolean)
        .join(" — ");
      lignes.push(`- ${ligne || "Formation"}`);
    }
  }

  const competences = listeTextes(d.skills ?? d.competences, 20);
  if (competences.length > 0) lignes.push(`Compétences : ${competences.join(", ")}`);

  const langues = tableau(d.languages ?? d.langues);
  if (langues.length > 0) {
    const langueLignes = langues
      .map((l) => `${chaine(l.name, l.nom)} (${chaine(l.level, l.niveau) || "niveau non précisé"})`)
      .filter((ligne) => !ligne.startsWith(" ("))
      .join(", ");
    if (langueLignes) lignes.push(`Langues : ${langueLignes}`);
  }

  return lignes.join("\n").slice(0, 12000);
}

/** Recharge un CV de la bibliothèque (CvDocument) et le convertit en texte. */
async function texteDepuisBibliotheque(
  cvId: string,
  userId: string
): Promise<string | null> {
  try {
    const cv = await prisma.cvDocument.findFirst({
      where: { id: cvId, userId },
      select: { data: true, name: true },
    });
    if (!cv) return null;
    const texte = cvDocumentEnTexte(cv.data);
    return texte.length >= 40 ? texte : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  GET : liste des lettres                                            */
/* ------------------------------------------------------------------ */

export async function GET() {
  try {
    const { utilisateur, diagnostic } = await resoudreUtilisateur();
    if (!utilisateur) {
      return NextResponse.json(
        {
          error:
            "Session expirée — déconnecte-toi puis reconnecte-toi, et recharge la page.",
          diagnostic,
        },
        { status: 401 }
      );
    }

    const lettres = await prisma.coverLetter.findMany({
      where: { userId: utilisateur.userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        company: true,
        position: true,
        tone: true,
        language: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ lettres });
  } catch (error) {
    console.error("[lettre:GET]", error);
    return NextResponse.json(
      {
        error:
          "Base de données inaccessible. Si le modèle CoverLetter est absent, lance : npx prisma db push",
      },
      { status: 500 }
    );
  }
}

/* ------------------------------------------------------------------ */
/*  POST : génération IA ou import direct                              */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  /* Identité tolérante (3 voies) puis garde anti-abus identique à /api/improve-cv */
  const { utilisateur, diagnostic } = await resoudreUtilisateur();
  if (!utilisateur) {
    return NextResponse.json(
      {
        error:
          "Session expirée — déconnecte-toi puis reconnecte-toi, et recharge la page.",
        diagnostic,
      },
      { status: 401 }
    );
  }
  const userId = utilisateur.userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête JSON invalide." },
      { status: 400 }
    );
  }

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paramètres de la lettre invalides." },
      { status: 400 }
    );
  }

  const params = parsed.data;

  /* ── Mode 1 : IMPORT DIRECT (une lettre déjà rédigée, ex. d'un dossier) ── */
  const contenuImporte = params.content?.trim() ?? "";
  if (contenuImporte.length >= 20) {
    try {
      const titreBase =
        params.title?.trim() ||
        (params.position && params.company
          ? `${params.position} — ${params.company}`
          : params.position || params.company || "");
      const title = (
        titreBase || `Lettre du ${new Date().toLocaleDateString("fr-FR")}`
      ).slice(0, 120);

      const lettre = await prisma.coverLetter.create({
        data: {
          userId,
          title,
          company: params.company,
          position: params.position,
          tone: params.tone,
          language: params.language,
          jobOffer: params.jobOffer,
          cvText: params.cvText,
          content: contenuImporte,
        },
      });
      return NextResponse.json({ lettre, importe: true }, { status: 201 });
    } catch (error) {
      console.error("[lettre:POST:import]", error);
      return NextResponse.json(
        { error: "Enregistrement de la lettre impossible (base indisponible ?)." },
        { status: 500 }
      );
    }
  }

  /* ── Mode 2 : GÉNÉRATION IA ───────────────────────────────────────────── */

  const ip = getClientIp(request);
  const guard = guardRateLimit(request, {
    route: "lettre-ia",
    clientId: userId,
    ip,
    limitPerHour: 20,
  });
  if (!guard.ok) return guard.response;

  if (!hasGroqKey()) {
    return NextResponse.json(
      {
        error:
          "L'IA n'est pas configurée : ajoutez votre clé GROQ_API_KEY (gratuite sur console.groq.com) dans .env.local puis redémarrez le serveur.",
      },
      { status: 503 }
    );
  }

  /* CV : texte collé (cvText) OU CV de la bibliothèque (cvId). */
  let cvText = params.cvText.trim();
  if (cvText.length < 40 && params.cvId) {
    const texteBiblio = await texteDepuisBibliotheque(params.cvId, userId);
    if (texteBiblio) {
      cvText = texteBiblio;
    } else {
      return NextResponse.json(
        {
          error:
            "Le CV sélectionné est introuvable ou trop vide — choisis un autre CV dans la bibliothèque ou colle ton texte.",
        },
        { status: 400 }
      );
    }
  }

  if (!params.jobOffer.trim() && cvText.length < 40) {
    return NextResponse.json(
      {
        error:
          "Ajoute au moins l'offre d'emploi ou le texte de ton CV pour orienter la lettre.",
      },
      { status: 400 }
    );
  }

  try {
    /* Moteur : client Groq officiel de l'application (src/lib/groq.ts) —
       chaîne de modèles avec replis automatiques, gérer par groqChat(). */
    const contenu = await groqChat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: construirePrompt({ ...params, cvText }),
        },
      ],
      { temperature: 0.75, maxTokens: 2000, timeoutMs: 45_000 }
    );

    const titreBase =
      params.position && params.company
        ? `${params.position} — ${params.company}`
        : params.position || params.company || "";
    const title = (
      titreBase || `Lettre du ${new Date().toLocaleDateString("fr-FR")}`
    ).slice(0, 120);

    const lettre = await prisma.coverLetter.create({
      data: {
        userId,
        title,
        company: params.company,
        position: params.position,
        tone: params.tone,
        language: params.language,
        jobOffer: params.jobOffer,
        cvText,
        content: contenu,
      },
    });

    return NextResponse.json({ lettre }, { status: 201 });
  } catch (error) {
    console.error("[lettre:POST]", error);
    const message =
      error instanceof GroqError
        ? error.message
        : error instanceof Error && error.message.includes("GROQ_API_KEY")
          ? error.message
          : "La génération IA n'a pas abouti (service momentanément saturé ?). Réessayez dans quelques instants.";
    const status = error instanceof GroqError && error.code === "GROQ_NO_KEY" ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
