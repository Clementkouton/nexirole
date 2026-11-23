import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientIp, guardRateLimit } from "@/lib/rate-limit";
import { hasGroqKey } from "@/lib/ai-guard";
import { genererLettre } from "@/lib/ai-lettre";
import { resoudreUtilisateur } from "@/lib/utilisateur-actuel";

/**
 * NexiRole — API LETTRES DE MOTIVATION.
 *
 * GET  /api/lettre : liste des lettres de l'utilisateur connecté.
 * POST /api/lettre : génère une lettre avec l'IA (Groq, même moteur que le
 *                    CV) puis l'enregistre immédiatement en base.
 *
 * Identité : résolution tolérante (session.id → session.email → cookie JWT)
 * via src/lib/utilisateur-actuel.ts — plus de 401 injustifié quand la
 * session ne contient pas d'id utilisateur exploitable.
 *
 * Même garde-fou anti-abus que /api/improve-cv (PARTIE 3) : 20 requêtes/h
 * pour un utilisateur connecté, clé IP en complément, 429 en français.
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
  if (!params.jobOffer.trim() && !params.cvText.trim()) {
    return NextResponse.json(
      {
        error:
          "Ajoute au moins l'offre d'emploi ou le texte de ton CV pour orienter la lettre.",
      },
      { status: 400 }
    );
  }

  try {
    const contenu = await genererLettre({
      system: SYSTEM_PROMPT,
      prompt: construirePrompt(params),
      temperature: 0.75,
      maxOutputTokens: 2000,
    });

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
        cvText: params.cvText,
        content: contenu,
      },
    });

    return NextResponse.json({ lettre }, { status: 201 });
  } catch (error) {
    console.error("[lettre:POST]", error);
    const message =
      error instanceof Error && error.message.includes("GROQ_API_KEY")
        ? error.message
        : "La génération IA n'a pas abouti (service momentanément saturé ?). Réessayez dans quelques instants.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
