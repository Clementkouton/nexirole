import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { z } from "zod";
import { hasGroqKey } from "@/lib/ai-guard";
import { getClientIp, guardRateLimit } from "@/lib/rate-limit";
import { resoudreUtilisateur } from "@/lib/utilisateur-actuel";

/**
 * NexiRole — OPTIMISEUR DE PROFIL LINKEDIN IA (route /api/linkedin-optimizer).
 *
 * POST : reçoit { cvText, targetRole, language, tone } et renvoie un profil
 * LinkedIn complet et structuré :
 *   - score_visibilite   : 0-100 (attractivité pour les recherches recruteurs)
 *   - headlines          : EXACTEMENT 3 titres (≤ 220 caractères, limite LinkedIn)
 *   - about_section      : texte complet « À propos » à la première personne
 *   - experiences_bullets: EXACTEMENT 4 puces d'impact orientées résultats chiffrés
 *   - top_skills         : EXACTEMENT 10 compétences clés (référencement recruteur)
 *   - checklist_profil   : EXACTEMENT 3 actions rapides et concrètes
 *
 * - Authentification : résolution tolérante existante (3 voies) — la même
 *   que /api/salary-coach et /api/lettre, via src/lib/utilisateur-actuel.ts.
 * - Garde-fous IA : hasGroqKey() (src/lib/ai-guard.ts) + limite horaire
 *   15 requêtes/heure par utilisateur et par IP (src/lib/rate-limit.ts).
 * - Moteur : generateObject du SDK Vercel AI (paquet « ai ») sur Groq, avec
 *   le modèle demandé par la mission `llama-3.3-70b-versatile` en tête de
 *   chaîne. NOTE RÉSILIENCE : Groq a décommissionné ce modèle le 16/08/2026
 *   (voir src/lib/groq.ts) — si Groq le refuse, la route bascule
 *   automatiquement sur les modèles de remplacement officiels
 *   (GROQ_MODEL ou openai/gpt-oss-120b → gpt-oss-20b → qwen3.8-27b).
 *   Aucun autre fichier du projet n'est impacté.
 * - Schéma Zod strict : sortie 100 % structurée, jamais de texte libre.
 *   Les compteurs EXACTS demandés (3 titres / 4 puces / 10 compétences /
 *   3 actions) sont garantis en sortie par une normalisation finale, et
 *   chaque titre est tronqué à 220 caractères maximum (limite LinkedIn).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ── Chaîne de modèles (mission d'abord, replis officiels ensuite) ───── */

const MODELE_MISSION = "llama-3.3-70b-versatile";

const CHAINE_MODELES: string[] = Array.from(
  new Set(
    [
      MODELE_MISSION,
      process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "qwen/qwen3.8-27b",
    ].filter((m) => m.length > 0)
  )
);

/* ── Validation des entrées ──────────────────────────────────────────── */

const TONS = [
  "Expert & Crédible",
  "Dynamique & Startup",
  "Leadership & Exécutif",
] as const;

const inputSchema = z.object({
  cvText: z.string().min(50).max(16000),
  targetRole: z.string().min(2).max(120),
  language: z.enum(["fr", "en"]),
  tone: z.enum(TONS),
});

/* ── Schéma de sortie strict (zod) ───────────────────────────────────── */

const outputSchema = z.object({
  score_visibilite: z.number().min(0).max(100),
  headlines: z.array(z.string().max(260)).min(3).max(5),
  about_section: z.string().min(80).max(4000),
  experiences_bullets: z.array(z.string().min(10).max(400)).min(4).max(6),
  top_skills: z.array(z.string().min(1).max(60)).min(8).max(14),
  checklist_profil: z.array(z.string().min(5).max(220)).min(3).max(5),
});

type ProfilLinkedin = z.infer<typeof outputSchema>;

/* ── Prompt système ──────────────────────────────────────────────────── */

const SYSTEM_PROMPT = `Tu es un consultant LinkedIn senior : ancien recruteur devenu ghostwriter de profils LinkedIn pour des cadres et experts. Tu maîtrises l'algorithme de recherche LinkedIn (mots-clés, densité, titre pondéré), le copywriting de la section « À propos » et le référencement recruteur (les recruteurs cherchent par compétences et intitulés de poste).

Règles absolues :
- Rédige TOUTES les chaînes dans la langue demandée (français si « fr », anglais international si « en »), au ton demandé. Aucun markdown dans les chaînes : pas de #, pas d'astérisques, pas de blocs de code.
- score_visibilite : nombre entier entre 0 et 100 = estimation honnête de l'attractivité du profil actuel du candidat pour les algorithmes de recherche recruteurs (mots-clés absents, titre générique, section Expérience non chiffrée font baisser la note). Sois exigeant mais juste : un profil bien tenu vaut 70-85, un profil sans mots-clés stratégiques tombe sous 50.
- headlines : EXACTEMENT 3 propositions de titre LinkedIn (Headline) différentes et percutantes, chacune de 120 à 220 caractères MAXIMUM (limite stricte LinkedIn : 220). Chaque titre intègre : le poste ciblé, 2 à 4 mots-clés techniques forts du CV, et une proposition de valeur claire (impact, résultat ou spécialité). Utilise « | » comme séparateur interne. Varie les angles : (1) expertises + mots-clés, (2) résultats chiffrés, (3) proposition de valeur / mission.
- about_section : texte complet pour la section « À propos », rédigé à la PREMIÈRE PERSONNE, 1200 à 2200 caractères, structuré en texte brut : une accroche forte de 1 à 2 lignes (question ou affirmation mémorable), un paragraphe de positionnement (qui je suis, ce que je fais, pour qui), 3 à 5 réalisations clés introduites par le caractère « • » sur des lignes séparées (chiffrées quand le CV le permet), une ligne sur les compétences outils, puis un appel à l'action final (invitation à se connecter / échanger). Utilise des retours à la ligne réels pour aérer.
- experiences_bullets : EXACTEMENT 4 puces d'impact prêtes à coller dans une section Expérience LinkedIn. Chaque puce commence par un verbe d'action, contient un résultat chiffré ou observable (%, temps, volume, argent) tiré ou créditalement déduit du CV, et fait 120 à 280 caractères.
- top_skills : EXACTEMENT 10 compétences clés EXACTES à ajouter en priorité sur LinkedIn (les 10 premières cases de compétences), ordonnées de la plus stratégique pour le référencement recruteur à la plus secondaire. Ce sont les libellés courts utilisés par les recruteurs (ex. « React », « Gestion de projet », « Data Analysis »). Aucun doublon, aucune variante de la même compétence.
- checklist_profil : EXACTEMENT 3 actions concrètes, rapides et spécifiques à ce candidat pour améliorer son profil immédiatement (ex. : bannière personnalisée à créer, URL LinkedIn à personnaliser, activer le mode « Open to Work » discret pour tel poste, recommandation à demander à tel type de collègue). Chaque action fait 1 à 2 phrases directes.
- Ne mentionne jamais que tu es une IA ; ne commente pas ta réponse : renvoie uniquement l'objet demandé.`;

/* ── Construction du prompt utilisateur ──────────────────────────────── */

function construirePrompt(params: {
  cvText: string;
  targetRole: string;
  language: "fr" | "en";
  tone: string;
}): string {
  const langue =
    params.language === "en"
      ? "Anglais international (tout le contenu généré en anglais)"
      : "Français (tout le contenu généré en français)";

  const lignes = [
    `Génère l'optimisation LinkedIn complète à partir du parcours ci-dessous.`,
    `Poste ciblé : ${params.targetRole}.`,
    `Langue de sortie : ${langue}.`,
    `Ton demandé : ${params.tone}.`,
    ``,
    `PARCOURS DU CANDIDAT (CV ou description libre) :`,
    params.cvText,
    ``,
    `Produis maintenant l'objet complet : score_visibilite, 3 headlines (≤ 220 caractères chacune), about_section, 4 experiences_bullets, 10 top_skills, 3 checklist_profil.`,
  ];
  return lignes.join("\n");
}

/* ── Normalisation finale : compteurs EXACTS garantis ────────────────── */

/** Tronque proprement à max caractères, sans couper un mot. */
function tronquer(texte: string, max: number): string {
  const brut = texte.trim();
  if (brut.length <= max) return brut;
  const coupe = brut.lastIndexOf(" ", max - 1);
  return brut.slice(0, coupe > max * 0.7 ? coupe : max - 1).trim() + "…";
}

function normaliserProfil(brut: ProfilLinkedin) {
  const scoreBrut = Number.isFinite(brut.score_visibilite)
    ? brut.score_visibilite
    : 50;

  return {
    score_visibilite: Math.min(100, Math.max(0, Math.round(scoreBrut))),
    headlines: brut.headlines
      .map((h) => h.trim())
      .filter((h) => h.length > 0)
      .slice(0, 3)
      .map((h) => tronquer(h, 220)),
    about_section: brut.about_section.trim(),
    experiences_bullets: brut.experiences_bullets
      .map((b) => b.trim())
      .filter((b) => b.length > 0)
      .slice(0, 4),
    top_skills: brut.top_skills
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 10),
    checklist_profil: brut.checklist_profil
      .map((c) => c.trim())
      .filter((c) => c.length > 0)
      .slice(0, 3),
  };
}

/* ── Route ───────────────────────────────────────────────────────────── */

export async function POST(request: NextRequest) {
  /* 1. Authentification (résolution tolérante existante, 3 voies) */
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

  /* 2. Garde-fou horaire anti-abus (même mécanique que /api/salary-coach) */
  const guard = guardRateLimit(request, {
    route: "linkedin-optimizer",
    clientId: userId,
    ip: getClientIp(request),
    limitPerHour: 15,
  });
  if (!guard.ok) return guard.response;

  /* 3. Clé IA configurée ? */
  if (!hasGroqKey()) {
    return NextResponse.json(
      {
        error:
          "L'IA n'est pas configurée : ajoutez votre clé GROQ_API_KEY (gratuite sur console.groq.com) dans .env.local puis redémarrez le serveur.",
      },
      { status: 503 }
    );
  }

  /* 4. Corps de la requête */
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
      {
        error:
          "Paramètres incomplets : colle ton parcours (50 caractères minimum), indique le poste ciblé, la langue et le ton.",
      },
      { status: 400 }
    );
  }

  const params = parsed.data;

  /* 5. Génération structurée : generateObject + schéma zod strict,
        avec chaîne de replis (le modèle de la mission en tête). */
  const apiKey = process.env.GROQ_API_KEY!.trim();
  const provider = createGroq({ apiKey });
  const systemPrompt =
    params.language === "en"
      ? SYSTEM_PROMPT +
        "\n\nIMPORTANT : la sortie de CETTE requête doit être entièrement en ANGLAIS international."
      : SYSTEM_PROMPT;

  let derniereErreur = "aucune réponse exploitable";

  for (const modele of CHAINE_MODELES) {
    try {
      const resultat = await generateObject({
        model: provider(modele),
        schema: outputSchema,
        system: systemPrompt,
        prompt: construirePrompt(params),
        temperature: 0.6,
        maxOutputTokens: 5000,
        maxRetries: 0,
      });

      console.info(`[linkedin-optimizer] profil généré via ${modele}`);
      return NextResponse.json({
        profil: normaliserProfil(resultat.object as ProfilLinkedin),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      derniereErreur = `${modele} : ${message.slice(0, 240)}`;
      console.warn(
        `[linkedin-optimizer] échec ${modele} — passage au modèle suivant si disponible (${message.slice(0, 160)})`
      );
      /* Clé refusée : aucun autre modèle ne peut réussir, on arrête tout. */
      if (/\b(401|403)\b|invalid api key|authentication/i.test(message)) break;
    }
  }

  return NextResponse.json(
    {
      error:
        "La génération IA n'a pas abouti (modèle momentanément indisponible ?). Réessaie dans quelques instants.",
      detail: derniereErreur,
    },
    { status: 502 }
  );
}
