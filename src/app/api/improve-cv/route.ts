import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateStructured } from "@/lib/ai";
import { hasGroqKey } from "@/lib/ai-guard";
import { auth } from "@/auth";
import { guardRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Amélioration GLOBALE d'un CV par l'IA :
 * réécrit le résumé professionnel, reformule les réalisations de chaque
 * expérience, suggère des compétences et donne des conseils concrets.
 * N'invente jamais d'entreprise, de date ou de chiffre absent du CV.
 * PARTIE 3 : anti-abus (5 requêtes/h/IP pour les anonymes, 20/h pour les
 * utilisateurs connectés) afin de protéger le quota Groq.
 */

export const maxDuration = 60;

const inputSchema = z.object({
  cv: z.object({
    nom: z.string().max(120).default(""),
    titre: z.string().max(160).default(""),
    resume: z.string().max(3000).default(""),
    experiences: z
      .array(
        z.object({
          index: z.number().int().min(0).max(15),
          poste: z.string().max(160).default(""),
          entreprise: z.string().max(160).default(""),
          periode: z.string().max(80).default(""),
          realisations: z.array(z.string().max(600)).max(8).default([]),
        })
      )
      .max(10)
      .default([]),
    competences: z.array(z.string().max(80)).max(30).default([]),
    langues: z.array(z.string().max(80)).max(12).default([]),
  }),
});

const resultSchema = z.object({
  resume: z.string().min(1),
  titreSuggere: z.string(),
  experiences: z
    .array(
      z.object({
        index: z.number().int().min(0),
        realisations: z.array(z.string()).max(6),
      })
    )
    .max(10),
  competences: z.array(z.string()).max(16),
  conseils: z.array(z.string()).max(5),
});

function clamp(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

export async function POST(request: NextRequest) {
  /* PARTIE 3 — Garde anti-abus sur le quota Groq */
  const session = await auth();
  const ip = getClientIp(request);
  const guard = guardRateLimit(request, {
    route: "improve-cv",
    clientId: session?.user?.id ?? "anon",
    ip,
    limitPerHour: session?.user?.id ? 20 : 5,
  });
  if (!guard.ok) return guard.response;

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
      { error: "Données du CV invalides." },
      { status: 400 }
    );
  }

  const { cv } = parsed.data;

  const hasContent =
    cv.resume.trim().length > 20 ||
    cv.experiences.some((e) => e.poste.trim() && e.realisations.length > 0);

  if (!hasContent) {
    return NextResponse.json(
      {
        error:
          "Le CV est trop vide pour être amélioré : remplissez d'abord votre résumé ou au moins une expérience avec ses réalisations.",
      },
      { status: 400 }
    );
  }

  if (!hasGroqKey()) {
    return NextResponse.json(
      {
        error:
          "L'IA n'est pas configurée : ajoutez votre clé GROQ_API_KEY (gratuite sur console.groq.com) dans .env.local puis redémarrez le serveur.",
      },
      { status: 503 }
    );
  }

  const experiencesBloc = cv.experiences
    .map(
      (exp) =>
        [
          `### index=${exp.index}`,
          `Poste : ${exp.poste || "non précisé"}`,
          `Entreprise : ${exp.entreprise || "non précisée"}`,
          `Période : ${exp.periode || "non précisée"}`,
          `Réalisations actuelles :`,
          exp.realisations.length > 0
            ? exp.realisations.map((r) => `- ${clamp(r, 400)}`).join("\n")
            : "- (aucune)",
        ].join("\n")
    )
    .join("\n\n");

  try {
    const result = await generateStructured({
      schema: resultSchema,
      system: `Tu es un coach carrière senior et expert en rédaction de CV, spécialiste des recruteurs et des logiciels ATS.

Ta mission : améliorer globalement un CV fourni par le candidat, EN FRANÇAIS.

RÈGLES ABSOLUES :
- N'invente JAMAIS une entreprise, un poste, une date, un diplôme ou un chiffre qui n'existe pas déjà dans les données fournies.
- Tu peux reformuler, restructurer et mettre en valeur uniquement ce qui est déjà là ; si une information manque pour un chiffre, écris une formulation qualitative (ex: "réduction significative du temps de chargement").
- "resume" : 3 à 4 phrases percutantes (40 à 70 mots), à la première personne implicite, orientées résultats et poste cible. Si le résumé actuel est vide, rédige-le à partir des expériences et compétences existantes.
- "titreSuggere" : un titre professionnel court et moderne adapté au profil (max 60 caractères) ; reprends le titre actuel amélioré si présent, sinon déduis-le des expériences.
- "experiences" : pour CHAQUE index fourni, réécris "realisations" en 3 à 4 puces maximum commençant par un verbe d'action (Conçu, Piloté, Optimisé, Automatisé…), avec le contexte et l'impact.
- "competences" : 8 à 14 compétences pertinentes : reprends les compétences existantes utiles et complète avec des compétences cohérentes avec le poste et les outils déjà mentionnés (jamais de compétence sans rapport).
- "conseils" : 3 conseils concrets et personnalisés pour renforcer ce CV (une phrase chacun).
- Réponds avec un JSON strictement conforme au schéma.`,
      prompt: [
        `Nom du candidat : ${cv.nom || "(non précisé)"}`,
        `Titre actuel : ${cv.titre || "(vide)"}`,
        `Résumé actuel : ${cv.resume.trim() || "(vide)"}`,
        "",
        "## EXPÉRIENCES (index = position dans le formulaire, à renvoyer à l'identique)",
        experiencesBloc,
        "",
        `## COMPÉTENCES ACTUELLES\n${cv.competences.join(", ") || "(aucune)"}`,
        `## LANGUES\n${cv.langues.join(", ") || "(aucune)"}`,
        "",
        "Améliore ce CV et renvoie le JSON attendu.",
      ].join("\n"),
      temperature: 0.4,
      maxOutputTokens: 4000,
    });

    return NextResponse.json({ result });
  } catch (error) {
    console.error("[improve-cv]", error);
    return NextResponse.json(
      {
        error:
          "L'amélioration IA n'a pas abouti (service momentanément saturé ?). Réessayez dans quelques instants.",
      },
      { status: 502 }
    );
  }
}
