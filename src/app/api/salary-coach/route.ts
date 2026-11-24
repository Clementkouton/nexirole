import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateStructured } from "@/lib/ai";
import { hasGroqKey } from "@/lib/ai-guard";
import { getClientIp, guardRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { resoudreUtilisateur } from "@/lib/utilisateur-actuel";
import { etatCoach, consommerCoach, type EtatCoach } from "@/lib/coach-quota";
import { trouverPaysParNom } from "@/lib/countries-currencies";

/**
 * NexiRole — COACH DE NÉGOCIATION SALARIALE IA (route /api/salary-coach).
 *
 * GET : historique complet + statistiques + état du quota du plan :
 *   - coachings : simulations sauvegardées de l'utilisateur (updatedAt desc),
 *   - stats : { total, derniereCible, paysPrincipal },
 *   - quota : mêmes champs qu'avant (plan, used/limit, illimité, carte
 *     d'upgrade) — inchangés pour la bannière existante.
 *
 * POST : génère l'analyse salariale (Groq llama-3.3-70b-versatile, moteur
 *   central de l'app) adaptée AU PAYS ET À LA DEVISE exacts sélectionnés
 *   (197 pays de src/lib/countries-currencies.ts), puis SAUVEGARDE
 *   automatiquement le coaching en base (modèle SalaryNegotiation) et
 *   renvoie l'enregistrement complet avec son id.
 *
 * LIMITES PAR PLAN (src/lib/coach-quota.ts, inchangées) : Découverte 2
 *   simulations / mois, Pass Boost et Carrière Pro illimités. Dépassement :
 *   403 QUOTA_EXCEEDED + upgradeUrl — le même contrat que les autres routes IA.
 *
 * Identité : résolution tolérante (3 voies) via src/lib/utilisateur-actuel.ts.
 * Garde-fous : limite horaire 15 requêtes + clé Groq (ai-guard) — inchangés.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ── Validation des entrées ──────────────────────────────────────────── */

const inputSchema = z.object({
  jobTitle: z.string().min(2).max(120),
  experienceYears: z.coerce.number().min(0).max(50),
  countryName: z.string().min(2).max(100),
  currencyCode: z.string().min(3).max(3).regex(/^[A-Za-z]{3}$/, "Devise invalide."),
  keySkills: z.string().min(2).max(800),
  currentOffer: z.string().max(2000).default(""),
});

/* ── Schéma de sortie strict (zod) — inchangé ────────────────────────── */

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

const SYSTEM_PROMPT = `Tu es « Coach Négociation », négociateur salarial senior formé dans un grand cabinet de recrutement et ancien recruteur. Tu connais les fourchettes réelles des marchés locaux de tous les pays du monde et du remote international.

Règles absolues :
- Réponds UNIQUEMENT en français, en TEXTE BRUT : aucun markdown (pas de #, pas d'astérisques, pas de listes à puces, pas de blocs de code) dans aucune chaîne.
- Les trois fourchettes sont des chaînes formatées selon le pays ET la devise exacts fournis : montants réalistes pour ce pays, ce poste et cette expérience ; fourchette_min < fourchette_cible < fourchette_max.
- Format de chaque montant : « montant symbole-devises période », avec une espace comme séparateur de milliers et la période usuelle du marché indiqué (ex. « 450 000 FCFA / mois » pour un salaire mensuel en zone FCFA, « 45 000 € / an » pour un brut annuel en France, « 85 000 $ / an » aux États-Unis, « 180 000 NGN / mois » au Nigeria). Utilise le symbole de la devise si tu le connais (FCFA, €, $, DH, KSh...), sinon le code ISO.
- Base-toi sur les niveaux de salaire RÉELS du pays indiqué (un développeur au Bénin, en France et au Canada n'ont pas du tout la même fourchette) : adapte les ordres de grandeur, le coût de la vie et les usages locaux.
- Si une offre actuelle est fournie : place les fourchettes par rapport à elle. Si elle est basse pour le marché local, la cible la dépasse et tu l'expliques.
- analyse_marche : 2 à 3 phrases sur la tendance du marché LOCAL pour ce poste (demande, tension du recrutement, effet de l'expérience et des compétences listées, contexte du pays).
- arguments_valeur : EXACTEMENT 3 arguments, concrets et quantifiés, construits à partir des compétences du candidat. Chaque titre fait 8 mots maximum ; chaque explication fait 2 à 3 phrases et contient un impact métier chiffré ou observable (temps gagné, revenus, erreurs évitées...) exprimé dans la devise du pays.
- scripts_reponse.question_entretien : réponse MOT À MOT à « Quelles sont vos prétentions salariales ? », à la première personne, 5 à 8 phrases, ton confiant et poli, qui cite la cible puis la fourchette, et finit par une ouverture sur la valeur globale du poste.
- scripts_reponse.contre_proposition_email : e-mail complet en texte brut, commençant par la ligne « Objet : » suivie d'un objet précis, puis salutation, remerciement pour l'offre, 2 à 3 paragraphes fermes et polis qui citent la fourchette cible et justifient avec les arguments, proposition d'un échange téléphonique, formule de politesse, signature « [Prénom Nom] ».
- scripts_reponse.alternatives_avantages : EXACTEMENT 3 leviers NON financiers à négocier si le fixe est bloqué (par exemple : télétravail, formation certifiante, jours de congé supplémentaires, horaires flexibles, budget équipement, titre de transport, titre du poste). Chaque titre fait 6 mots maximum, chaque description fait 1 à 2 phrases concrètes.`;

/* ── Prompt utilisateur ──────────────────────────────────────────────── */

function construirePrompt(params: {
  jobTitle: string;
  experienceYears: number;
  countryName: string;
  currencyCode: string;
  currencySymbol: string;
  keySkills: string;
  currentOffer: string;
}): string {
  const lignes = [
    `Analyse salariale à produire.`,
    `Poste visé : ${params.jobTitle}.`,
    `Expérience du candidat : ${params.experienceYears} an(s).`,
    `Compétences clés du candidat : ${params.keySkills}.`,
    `Pays du poste : ${params.countryName} — toutes les fourchettes utilisent EXCLUSIVEMENT la devise officielle ${params.currencyCode} (symbole usuel : ${params.currencySymbol}) avec la période usuelle de ce marché, au format exact demandé.`,
    params.currentOffer
      ? `Offre déjà reçue par le candidat : ${params.currentOffer}`
      : `Le candidat n'a pas encore reçu d'offre : base-toi uniquement sur le marché.`,
    `Produis maintenant l'analyse complète au format demandé (fourchettes, analyse de marché, 3 arguments de valeur, scripts de réponse).`,
  ];
  return lignes.filter(Boolean).join("\n");
}

/* ── État du plan : lit les limites, sans jamais bloquer sur une panne ── */

async function lireEtatTolerant(userId: string): Promise<EtatCoach | null> {
  try {
    return await etatCoach(userId);
  } catch (error) {
    console.error("[salary-coach] état du plan indisponible :", error);
    return null;
  }
}

/* ── Table absente ? (l'utilisateur n'a pas encore lancé db push) ─────── */

function estTableAbsente(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  return (
    e?.code === "P2021" ||
    String(e?.message ?? "").includes("salary_negotiations")
  );
}

function reponseTableAbsente(): NextResponse {
  return NextResponse.json(
    {
      error:
        "La sauvegarde des coachings n'est pas encore active : lance « npx prisma db push » (voir LISEZMOI-COACH-V2.md) puis recharge la page.",
    },
    { status: 503 }
  );
}

/* ── Statistiques globales de l'historique ───────────────────────────── */

function quatrechetteCible(resultJson: unknown): string | null {
  if (!resultJson || typeof resultJson !== "object") return null;
  const brut = resultJson as Record<string, unknown>;
  return typeof brut.fourchette_cible === "string" ? brut.fourchette_cible : null;
}

function calculerStats(
  coachings: Array<{ countryName: string; currencyCode: string; resultJson: unknown }>
) {
  const parPays = new Map<string, { currencyCode: string; nombre: number }>();
  for (const coaching of coachings) {
    const precedent = parPays.get(coaching.countryName);
    parPays.set(coaching.countryName, {
      currencyCode: coaching.currencyCode,
      nombre: (precedent?.nombre ?? 0) + 1,
    });
  }

  let paysPrincipal: {
    pays: string;
    drapeau: string | null;
    devise: string;
    nombre: number;
  } | null = null;
  for (const [pays, valeur] of parPays.entries()) {
    if (!paysPrincipal || valeur.nombre > paysPrincipal.nombre) {
      paysPrincipal = {
        pays,
        drapeau: null, // le drapeau est ajouté côté client (liste pays)
        devise: valeur.currencyCode,
        nombre: valeur.nombre,
      };
    }
  }

  return {
    total: coachings.length,
    derniereCible: coachings.length > 0 ? quatrechetteCible(coachings[0].resultJson) : null,
    paysPrincipal,
  };
}

/* ── POST : générer + sauvegarder automatiquement ────────────────────── */

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

  /* 2. Garde-fou horaire anti-abus (même mécanique que /api/lettre) */
  const guard = guardRateLimit(request, {
    route: "salary-coach",
    clientId: userId,
    ip: getClientIp(request),
    limitPerHour: 15,
  });
  if (!guard.ok) return guard.response;

  /* 3. Limite du plan d'abonnement (Découverte : 2/mois, payants : illimité).
        Contrat 403 QUOTA_EXCEEDED + upgradeUrl identique aux autres routes IA. */
  const etat = await lireEtatTolerant(userId);
  if (etat?.reached) {
    const message = etat.compteurDedie
      ? `Vous avez utilisé vos ${etat.limit} simulations offertes du plan ${etat.planLabel} ce mois-ci. Passez au Pass Boost ou Carrière Pro pour des simulations illimitées.`
      : `Vous avez utilisé vos ${etat.limit} générations IA offertes ce mois-ci — le plan ${etat.planLabel} partage ce quota entre les dossiers IA et le Coach Négociation. Passez au Pass Boost ou Carrière Pro pour l'illimité.`;
    return NextResponse.json(
      {
        error: message,
        code: "QUOTA_EXCEEDED",
        reason: "COACH_LIMIT",
        plan: etat.plan,
        planLabel: etat.planLabel,
        used: etat.used,
        limit: etat.limit,
        upgradeUrl: "/pricing",
      },
      { status: 403 }
    );
  }

  /* 4. Clé IA configurée ? */
  if (!hasGroqKey()) {
    return NextResponse.json(
      {
        error:
          "L'IA n'est pas configurée : ajoutez votre clé GROQ_API_KEY (gratuite sur console.groq.com) dans .env.local puis redémarrez le serveur.",
      },
      { status: 503 }
    );
  }

  /* 5. Corps de la requête */
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
          "Paramètres incomplets : vérifie le poste visé, les années d'expérience, le pays sélectionné et les compétences clés.",
      },
      { status: 400 }
    );
  }

  /* 6. Le pays doit exister dans la liste officielle (197 pays) — la devise
        et le symbole sont TOUJOURS pris depuis la liste, jamais du client. */
  const pays = trouverPaysParNom(parsed.data.countryName);
  if (!pays || pays.currencyCode !== parsed.data.currencyCode.toUpperCase()) {
    return NextResponse.json(
      {
        error:
          "Pays ou devise inconnu : sélectionne ton pays dans la liste déroulante « Pays et Devise ».",
      },
      { status: 400 }
    );
  }

  const params = {
    jobTitle: parsed.data.jobTitle.trim(),
    experienceYears: parsed.data.experienceYears,
    countryName: pays.name,
    currencyCode: pays.currencyCode,
    currencySymbol: pays.currencySymbol,
    keySkills: parsed.data.keySkills.trim(),
    currentOffer: parsed.data.currentOffer.trim(),
  };

  /* 7. Génération structurée (generateObject + schéma zod strict) */
  try {
    const analyse = await generateStructured<AnalyseSalariale>({
      schema: outputSchema,
      system: SYSTEM_PROMPT,
      prompt: construirePrompt(params),
      temperature: 0.5,
      maxOutputTokens: 4000,
    });

    /* 8. Sauvegarde automatique du coaching en base */
    let coaching;
    try {
      coaching = await prisma.salaryNegotiation.create({
        data: {
          userId,
          jobTitle: params.jobTitle,
          experienceYears: params.experienceYears,
          countryName: params.countryName,
          currencyCode: params.currencyCode,
          currencySymbol: params.currencySymbol,
          keySkills: params.keySkills,
          currentOffer: params.currentOffer || null,
          resultJson: analyse,
        },
      });
    } catch (error) {
      if (estTableAbsente(error)) return reponseTableAbsente();
      throw error;
    }

    /* 9. Consommation du crédit du plan (après succès, plan Découverte
          uniquement — les plans payants sont illimités). */
    if (etat && etat.plan === "FREE") {
      await consommerCoach(userId, etat.compteurDedie);
    }

    return NextResponse.json({ coaching });
  } catch (error) {
    console.error("[salary-coach:POST]", error);
    if (estTableAbsente(error)) return reponseTableAbsente();
    const message =
      error instanceof Error && error.message.includes("GROQ_API_KEY")
        ? error.message
        : "L'analyse IA n'a pas abouti (service momentanément saturé ?). Réessaie dans quelques instants.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/* ── GET : historique + statistiques + état du quota ─────────────────── */

export async function GET() {
  const { utilisateur } = await resoudreUtilisateur();
  if (!utilisateur) {
    return NextResponse.json(
      { error: "Session expirée — reconnecte-toi." },
      { status: 401 }
    );
  }

  /* Historique (le plus récemment modifié en premier). Une panne de base
     ne casse pas la page : on renvoie une liste vide + le diagnostic. */
  let coachings: Array<Record<string, unknown>> = [];
  try {
    const lignes = await prisma.salaryNegotiation.findMany({
      where: { userId: utilisateur.userId },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    coachings = lignes as unknown as Array<Record<string, unknown>>;
  } catch (error) {
    console.error("[salary-coach:GET]", error);
    if (estTableAbsente(error)) {
      return NextResponse.json({
        indisponible: true,
        raison: "TABLE_ABSENTE",
        coachings: [],
        stats: { total: 0, derniereCible: null, paysPrincipal: null },
      });
    }
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }

  const stats = calculerStats(
    coachings as Array<{ countryName: string; currencyCode: string; resultJson: unknown }>
  );

  /* État du quota (bannière de plan) — indicatif, jamais bloquant. */
  const etat = await lireEtatTolerant(utilisateur.userId);
  const quota = etat
    ? {
        plan: etat.plan,
        planLabel: etat.planLabel,
        used: etat.used,
        limit: etat.limit,
        unlimited: etat.unlimited,
        remaining: etat.remaining,
        reached: etat.reached,
        compteurDedie: etat.compteurDedie,
        isActive: etat.isActive,
        daysRemaining: etat.daysRemaining,
      }
    : null;

  return NextResponse.json({ ...quota, indisponible: quota === null, coachings, stats });
}
