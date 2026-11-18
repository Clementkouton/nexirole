import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  dossierRequestSchema,
  dossierSchema,
  extractKeywordsSchema,
} from "@/lib/schemas";
import { generateStructured, hasGroqKey, GROQ_MODEL_ID } from "@/lib/ai";
import type { DossierData } from "@/lib/types";
import { extractKeywordsLocally } from "@/lib/dossier-fallback";

export const runtime = "nodejs";
export const maxDuration = 120;

const DOSSIER_SYSTEM_PROMPT = `Tu es NexiRole, cabinet de recrutement et rédacteur de dossiers de candidature d'exception.

À partir du CV du candidat et de l'offre d'emploi cible, tu produis un dossier COMPLET et structuré :
- "identite" : coordonnées EXTRAITES du CV — ne JAMAIS inventer une information absente (chaîne vide si absente).
- "titre" : titre professionnel aligné sur l'intitulé exact de l'offre.
- "resume" : 3 à 4 phrases percutantes intégrant les mots-clés majeurs de l'annonce.
- "experiences" : les expériences RÉELLES du CV, reformulées avec les mots-clés de l'offre (missions : 3 à 5 réalisations orientées résultats, sans inventer de fausses expériences ni de chiffres imaginaires).
- "formations" : celles du CV, reformulées si utile.
- "competences" : 10 à 14 compétences triées par pertinence pour l'offre.
- "langues" : celles du CV (niveau précis). Tableau vide si aucune.
- "lettre_motivation" : objet court, salutation, 3 à 4 paragraphes persuadifs (accroche liée à l'offre, adéquation du profil, valeur apportée à l'entreprise avec une preuve concrète du CV, conclusion engageante), formule de politesse professionnelle.
- "kit_entretien" : score de compatibilité 0-100 honnête, 3 à 5 conseils d'adaptation concrets, un message d'approche LinkedIn (600 caractères max) et un message email (600 caractères max) adressés au recruteur, 3 questions d'entretien probables avec réponse suggérée structurée (méthode STAR quand pertinent) et astuce.

TON : professionnel, positif, précis. RÉPONDS ENTIÈREMENT EN FRANÇAIS. N'invente JAMAIS d'expérience, de diplôme, de chiffre ou de contact absent du CV.`;

function clamp(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête JSON invalide." },
      { status: 400 }
    );
  }

  const parsed = dossierRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paramètres de génération invalides." },
      { status: 400 }
    );
  }

  const { offerTitle, offerUrl, offerDescription, cvText } = parsed.data;
  const candidateText = cvText.trim();

  if (candidateText.length < 60) {
    return NextResponse.json(
      {
        error:
          "Importez d'abord votre CV (PDF lisible ou texte) pour activer la génération.",
        code: "NO_CANDIDATE_CONTENT",
      },
      { status: 400 }
    );
  }

  if (!hasGroqKey()) {
    return NextResponse.json(
      {
        error:
          "Aucune clé GROQ_API_KEY configurée. Ajoutez-la dans .env.local ou sur Vercel puis redéployez.",
        code: "GROQ_NO_KEY",
      },
      { status: 503 }
    );
  }

  /* Session pour l'historique ----------------------------------------- */
  const session = await auth();
  const userId = session?.user?.id ?? null;

  /* Mots-clés du CV (pour enrichir le prompt sans coût supplémentaire) -- */
  let keywordsHint = "";
  try {
    const extracted = await generateStructured({
      schema: extractKeywordsSchema,
      system:
        "Déduis du CV : 1) titre_poste = titre de poste principal ; 2) mots_cles = les 3 compétences techniques les plus fortes. Rien d'autre.",
      prompt: clamp(candidateText, 6000),
      temperature: 0.2,
      maxOutputTokens: 400,
    });
    keywordsHint = `Métier détecté : ${extracted.titre_poste}. Compétences fortes : ${extracted.mots_cles.join(", ")}.`;
  } catch {
    const local = extractKeywordsLocally(candidateText);
    keywordsHint = `Métier probable : ${local.titre}. Compétences probables : ${local.motsCles.join(", ")}.`;
  }

  /* Génération du dossier structuré ------------------------------------ */
  let data: DossierData;
  try {
    data = (await generateStructured({
      schema: dossierSchema,
      system: DOSSIER_SYSTEM_PROMPT,
      prompt: [
        "## OFFRE D'EMPLOI CIBLE",
        offerTitle ? `Intitulé : ${offerTitle}` : "Aucune offre précise — produire un CV générique de qualité et un kit d'entretien générique (score 70 environ).",
        offerUrl ? `Lien : ${offerUrl}` : "",
        offerDescription ? `Contenu de l'offre :\n${clamp(offerDescription, 6000)}` : "",
        "",
        "## CV DU CANDIDAT",
        clamp(candidateText, 7000),
        "",
        keywordsHint,
        "",
        "Produis maintenant le dossier complet (identite, titre, resume, experiences, formations, competences, langues, lettre_motivation, kit_entretien" +
          (offerTitle ? ", offre" : "") +
          ") en respectant EXACTEMENT la structure demandée.",
      ]
        .filter(Boolean)
        .join("\n"),
      temperature: 0.4,
      maxOutputTokens: 8000,
    })) as DossierData;
  } catch (error) {
    console.error("[dossier] génération IA échouée :", error);
    return NextResponse.json(
      {
        error:
          "La génération n'a pas abouti : le moteur IA est momentanément saturé. Réessayez dans quelques instants.",
        code: "AI_UNAVAILABLE",
      },
      { status: 502 }
    );
  }

  /* Sauvegarde de l'historique (non bloquante) -------------------------- */
  let saved = false;
  let id: string | undefined;
  if (userId) {
    try {
      const created = await prisma.generatedDossier.create({
        data: {
          userId,
          offreTitre: (offerTitle?.trim() || data.titre || "CV générique").slice(0, 180),
          offreUrl: offerUrl?.trim() || null,
          offreEntreprise: data.offre?.entreprise ?? null,
          templateId: "modern-accent",
          data: JSON.parse(JSON.stringify(data)) as never,
        },
      });
      saved = true;
      id = created.id;
    } catch (error) {
      console.error("[dossier] sauvegarde de l'historique échouée :", error);
    }
  }

  return NextResponse.json({
    data,
    id,
    saved,
    engine: `groq/${GROQ_MODEL_ID}`,
  });
}