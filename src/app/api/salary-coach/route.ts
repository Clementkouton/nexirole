import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateStructured } from "@/lib/ai";
import { hasGroqKey } from "@/lib/ai-guard";
import { getClientIp, guardRateLimit } from "@/lib/rate-limit";
import { resoudreUtilisateur } from "@/lib/utilisateur-actuel";

/**
 * NexiRole — COACH DE NÉGOCIATION SALARIALE IA (route /api/salary-coach).
 *
 * POST : reçoit { jobTitle, experienceYears, marketRegion, keySkills,
 * currentOffer } et renvoie une analyse complète (fourchettes salariales,
 * arguments de valeur chiffrés, scripts de négociation prêts à l'emploi).
 *
 * - Authentification : résolution tolérante existante (3 voies) — la même
 *   que /api/lettre, via src/lib/utilisateur-actuel.ts.
 * - Garde-fous IA : limite 15 requêtes/heure (rate-limit) + clé Groq
 *   (ai-guard). Aucune écriture en base : le schéma Prisma n'est pas touché.
 * - Moteur : generateObject du SDK Vercel AI via le moteur central de
 *   l'app (src/lib/ai.ts → Groq llama-3.3-70b-versatile) + schéma Zod
 *   strict — sortie 100 % structurée, jamais de texte libre à parser.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ── Zones / devises supportées ──────────────────────────────────────── */

const REGIONS = {
  afrique_ouest_fcfa: {
    devise: "FCFA",
    periode: "par mois",
    consigne:
      "marché d'Afrique de l'Ouest (Abidjan, Dakar, Cotonou, Lomé, Ouagadougou, Bamako) ; montants MENSUELS en FCFA, format exact « 450 000 FCFA / mois » avec espace comme séparateur de milliers",
  },
  france_europe_eur: {
    devise: "EUR",
    periode: "par an",
    consigne:
      "marché France / Europe ; salaire BRUT ANNUEL en euros, format exact « 45 000 € / an »",
  },
  amerique_nord_usd: {
    devise: "USD",
    periode: "par an",
    consigne:
      "marché États-Unis / Canada ; salaire annuel brut en dollars, format exact « 85 000 $ / an »",
  },
  remote_usd: {
    devise: "USD",
    periode: "par an",
    consigne:
      "poste 100 % à distance pour un employeur international qui paie en USD ; format exact « 60 000 $ / an »",
  },
} as const;

type RegionCle = keyof typeof REGIONS;

/* ── Validation des entrées ──────────────────────────────────────────── */

const inputSchema = z.object({
  jobTitle: z.string().min(2).max(120),
  experienceYears: z.coerce.number().min(0).max(50),
  marketRegion: z.enum([
    "afrique_ouest_fcfa",
    "france_europe_eur",
    "amerique_nord_usd",
    "remote_usd",
  ]),
  keySkills: z.string().min(2).max(800),
  currentOffer: z.string().max(2000).default(""),
});

/* ── Schéma de sortie strict (zod) ───────────────────────────────────── */

const argumentValeurSchema = z.object({
  titre: z.string(),
  explication: z.string(),
});

const alternativeAvantageSchema = z.object({
  titre: z.string(),
  description: z.string(),
});

const outputSchema = z.object({
  fourchette_min: z.string(),
  fourchette_cible: z.string(),
  fourchette_max: z.string(),
  analyse_marche: z.string(),
  arguments_valeur: z.array(argumentValeurSchema).length(3),
  scripts_reponse: z.object({
    question_entretien: z.string(),
    contre_proposition_email: z.string(),
    alternatives_avantages: z.array(alternativeAvantageSchema).length(3),
  }),
});

type AnalyseSalariale = z.infer<typeof outputSchema>;

/* ── Prompt système ──────────────────────────────────────────────────── */

const SYSTEM_PROMPT = `Tu es « Coach Négociation », négociateur salarial senior formé dans un grand cabinet de recrutement et ancien recruteur. Tu connais les fourchettes réelles des marchés locaux et du remote international.

Règles absolues :
- Réponds UNIQUEMENT en français, en TEXTE BRUT : aucun markdown (pas de #, pas d'astérisques, pas de listes à puces, pas de blocs de code) dans aucune chaîne.
- Les trois fourchettes sont des chaînes formatées selon la zone géographique fournie (montants réalistes pour le poste, la zone et l'expérience) : fourchette_min < fourchette_cible < fourchette_max.
- fourchette_min : minimum acceptable en dessous duquel il faut refuser. fourchette_cible : montant idéal à demander. fourchette_max : plafond atteignable pour un profil confirmé négocié habilement.
- Si une offre actuelle est fournie : place les fourchettes par rapport à elle. Si elle est basse pour le marché, la cible la dépasse et tu l'expliques.
- analyse_marche : 2 à 3 phrases sur la tendance du marché pour ce poste et cette zone (demande, tension du recrutement, effet de l'expérience et des compétences listées).
- arguments_valeur : EXACTEMENT 3 arguments, concrets et quantifiés, construits à partir des compétences du candidat. Chaque titre fait 8 mots maximum ; chaque explication fait 2 à 3 phrases et contient un impact métier chiffré ou observable (temps gagné, revenus, erreurs évitées...).
- scripts_reponse.question_entretien : réponse MOT À MOT à « Quelles sont vos prétentions salariales ? », à la première personne, 5 à 8 phrases, ton confiant et poli, qui cite la cible puis la fourchette, et finit par une ouverture sur la valeur globale du poste.
- scripts_reponse.contre_proposition_email : e-mail complet en texte brut, commençant par la ligne « Objet : » suivie d'un objet précis, puis salutation, remerciement pour l'offre, 2 à 3 paragraphes fermes et polis qui citent la fourchette cible et justifient avec les arguments, proposition d'un échange téléphonique, formule de politesse, signature « [Prénom Nom] ».
- scripts_reponse.alternatives_avantages : EXACTEMENT 3 leviers NON financiers à négocier si le fixe est bloqué (par exemple : télétravail, formation certifiante, jours de congé supplémentaires, horaires flexibles, budget équipement, titre de transport, titre du poste). Chaque titre fait 6 mots maximum, chaque description fait 1 à 2 phrases concrètes.`;

/* ── Route ───────────────────────────────────────────────────────────── */

function construirePrompt(params: {
  jobTitle: string;
  experienceYears: number;
  marketRegion: RegionCle;
  keySkills: string;
  currentOffer: string;
}): string {
  const region = REGIONS[params.marketRegion];
  const lignes = [
    `Analyse salariale à produire.`,
    `Poste visé : ${params.jobTitle}.`,
    `Expérience du candidat : ${params.experienceYears} an(s).`,
    `Compétences clés du candidat : ${params.keySkills}.`,
    `Zone géographique : ${region.consigne} — toutes les fourchettes sont exprimées ${region.periode} en ${region.devise} avec le format demandé.`,
    params.currentOffer
      ? `Offre déjà reçue par le candidat : ${params.currentOffer}`
      : `Le candidat n'a pas encore reçu d'offre : base-toi uniquement sur le marché.`,
    `Produis maintenant l'analyse complète au format demandé (fourchettes, analyse de marché, 3 arguments de valeur, scripts de réponse).`,
  ];
  return lignes.filter(Boolean).join("\n");
}

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

  /* 2. Garde-fou anti-abus (même mécanique que /api/lettre) */
  const guard = guardRateLimit(request, {
    route: "salary-coach",
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
          "Paramètres incomplets : vérifie le poste visé, les années d'expérience, la zone et les compétences clés.",
      },
      { status: 400 }
    );
  }

  const params = parsed.data;

  /* 5. Génération structurée (generateObject + schéma zod strict) */
  try {
    const analyse = await generateStructured<AnalyseSalariale>({
      schema: outputSchema,
      system: SYSTEM_PROMPT,
      prompt: construirePrompt(params),
      temperature: 0.5,
      maxOutputTokens: 4000,
    });

    return NextResponse.json({ analyse });
  } catch (error) {
    console.error("[salary-coach:POST]", error);
    const message =
      error instanceof Error && error.message.includes("GROQ_API_KEY")
        ? error.message
        : "L'analyse IA n'a pas abouti (service momentanément saturé ?). Réessaie dans quelques instants.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
