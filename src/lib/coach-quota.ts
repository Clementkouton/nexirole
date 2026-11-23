import { prisma } from "@/lib/prisma";

/**
 * NexiRole — Quota du Coach de Négociation par plan d'abonnement (Chariow).
 *
 * Plans de l'application (identiques à src/lib/license.ts) :
 *   - FREE  « Découverte »  : 2 simulations de Coach par fenêtre de 30 jours
 *   - BOOST « Pass Boost »  : illimité
 *   - PRO   « Carrière Pro »: illimité
 *
 * COMPTEUR — deux modes possibles, choisis AUTOMATIQUEMENT au runtime :
 *
 *   1. Mode dédié (recommandé, migration optionnelle) : la colonne
 *      « coachAnalysesUsed » existe dans la table "users" (ajoutée par
 *      prisma/ajouter-compteur-coach.sql ou par `npx prisma db push` après
 *      avoir ajouté la ligne au schema.prisma). Le Coach a alors SON propre
 *      compteur, indépendant des dossiers IA.
 *
 *   2. Mode partagé (aucune migration requise) : la colonne n'existe pas →
 *      le Coach consomme le compteur existant « generationsUsed » (celui des
 *      dossiers IA). Les limites fonctionnent quand même, mais le quota du
 *      plan Découverte est partagé entre dossiers IA et Coach.
 *
 * La détection se fait par requête SQL brute sur la colonne : le code
 * compile et fonctionne quelle que soit l'état du schéma Prisma, y compris
 * sur Vercel AVANT l'application de la migration optionnelle.
 *
 * Règles reprises à l'identique de src/lib/license.ts :
 *   - auto-rétrogradation d'une licence ACTIVE devenue expirée → plan FREE,
 *   - fenêtre glissante de 30 jours pilotée par usagePeriodStart : au-delà,
 *     les compteurs d'usage sont remis à zéro.
 */

export type PlanCoach = "FREE" | "BOOST" | "PRO";

/**
 * Limites par plan. -1 = illimité.
 * Ajustez librement ces valeurs (ex. FREE: 3, BOOST: 20) — aucun autre
 * changement n'est nécessaire dans l'application.
 */
export const LIMITES_COACH_PAR_PLAN: Record<PlanCoach, number> = {
  FREE: 5,
  BOOST: 30,
  PRO: -1,
};

const LABELS_PLAN: Record<PlanCoach, string> = {
  FREE: "Découverte",
  BOOST: "Pass Boost",
  PRO: "Carrière Pro",
};

/** Fenêtre glissante de 30 jours (même règle que src/lib/license.ts). */
const FENETRE_MS = 30 * 24 * 60 * 60 * 1000;

export interface EtatCoach {
  plan: PlanCoach;
  planLabel: string;
  /** Simulations (ou générations IA en mode partagé) déjà utilisées. */
  used: number;
  /** Limite du plan, -1 = illimité. */
  limit: number;
  unlimited: boolean;
  remaining: number | null;
  reached: boolean;
  /** true si le compteur dédié « coachAnalysesUsed » est disponible. */
  compteurDedie: boolean;
  /** Licence payante ACTIVE et non expirée. */
  isActive: boolean;
  daysRemaining: number | null;
}

/* ------------------------------------------------------------------ */
/*  Détection du compteur dédié (colonne optionnelle)                  */
/* ------------------------------------------------------------------ */

/**
 * null = pas encore testé ; true = colonne disponible ; false = mode partagé.
 * Testé une seule fois par instance de serveur, puis gardé en mémoire.
 */
let colonneDedieDetectee: boolean | null = null;

/** true si l'erreur provient de la colonne manquante (et non d'une panne). */
function colonneAbsente(error: unknown): boolean {
  const message = String((error as { message?: unknown })?.message ?? error);
  return message.includes("coachAnalysesUsed");
}

/**
 * Lit le compteur dédié « coachAnalysesUsed », ou null si la colonne n'existe
 * pas encore (→ mode partagé). Les requêtes sont brutes : aucun champ
 * Prisma typé n'est requis, donc la migration reste 100 % optionnelle.
 */
async function lireCompteurDedie(userId: string): Promise<number | null> {
  if (colonneDedieDetectee === false) return null;
  try {
    const lignes = await prisma.$queryRaw<Array<{ utilise: number }>>`
      SELECT "coachAnalysesUsed" AS utilise FROM "users" WHERE "id" = ${userId} LIMIT 1
    `;
    colonneDedieDetectee = true;
    return lignes[0]?.utilise ?? 0;
  } catch (error) {
    if (colonneAbsente(error)) {
      colonneDedieDetectee = false;
      return null;
    }
    throw error; // vraie panne de base : remontée à l'appelant
  }
}

/** Incrémente le compteur dédié (ignore silencieusement une panne). */
async function incrementerCompteurDedie(userId: string): Promise<void> {
  await prisma.$executeRaw`UPDATE "users" SET "coachAnalysesUsed" = "coachAnalysesUsed" + 1 WHERE "id" = ${userId}`;
}

/* ------------------------------------------------------------------ */
/*  État du plan pour le Coach                                         */
/* ------------------------------------------------------------------ */

/**
 * Lit l'utilisateur et applique les mêmes règles automatiques que
 * src/lib/license.ts : auto-rétrogradation si licence expirée, remise à
 * zéro des compteurs au-delà de la fenêtre de 30 jours.
 */
export async function etatCoach(userId: string): Promise<EtatCoach> {
  let user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      licenseStatus: true,
      expiresAt: true,
      generationsUsed: true,
      usagePeriodStart: true,
    },
  });
  if (!user) throw new Error("UTILISATEUR_INTROUVABLE");

  const compteurDedieAvant = await lireCompteurDedie(userId);

  const maintenant = Date.now();
  const maintenantDate = new Date();

  // 1. Auto-rétrogradation : licence ACTIVE mais expirée → plan FREE
  if (
    user.licenseStatus === "ACTIVE" &&
    user.expiresAt &&
    user.expiresAt.getTime() < maintenant
  ) {
    await prisma.user.update({
      where: { id: userId },
      data: { plan: "FREE", licenseStatus: "EXPIRED", expiresAt: null },
    });
    user = { ...user, plan: "FREE", licenseStatus: "EXPIRED", expiresAt: null };
  }

  // 2. Fenêtre glissante de 30 jours : compteurs remis à zéro
  const debutFenetre = user.usagePeriodStart?.getTime() ?? 0;
  let compteurPartage = user.generationsUsed;
  let compteurDedie = compteurDedieAvant;
  if (maintenant - debutFenetre > FENETRE_MS) {
    await prisma.user.update({
      where: { id: userId },
      data: { searchesUsed: 0, generationsUsed: 0, usagePeriodStart: maintenantDate },
    });
    compteurPartage = 0;
    if (colonneDedieDetectee === true) {
      await prisma.$executeRaw`UPDATE "users" SET "coachAnalysesUsed" = 0 WHERE "id" = ${userId}`;
      compteurDedie = 0;
    }
  }

  const brutPlan: string = user.plan;
  const plan: PlanCoach =
    brutPlan === "BOOST" || brutPlan === "PRO" ? (brutPlan as PlanCoach) : "FREE";

  const limite = LIMITES_COACH_PAR_PLAN[plan];
  const used =
    colonneDedieDetectee === true ? (compteurDedie ?? 0) : compteurPartage;
  const unlimited = limite < 0;

  const isActive = user.licenseStatus === "ACTIVE" && plan !== "FREE";
  const daysRemaining =
    isActive && user.expiresAt
      ? Math.max(0, Math.ceil((user.expiresAt.getTime() - maintenant) / 86_400_000))
      : null;

  return {
    plan,
    planLabel: LABELS_PLAN[plan],
    used,
    limit: limite,
    unlimited,
    remaining: unlimited ? null : Math.max(0, limite - used),
    reached: !unlimited && used >= limite,
    compteurDedie: colonneDedieDetectee === true,
    isActive,
    daysRemaining,
  };
}

/* ------------------------------------------------------------------ */
/*  Consommation (après génération réussie, plan limité uniquement)     */
/* ------------------------------------------------------------------ */

/**
 * Incrémente le compteur correspondant. Ne bloque jamais : une panne de
 * comptage ne doit pas faire échouer une génération déjà produite.
 */
export async function consommerCoach(userId: string, dedie: boolean): Promise<void> {
  try {
    if (dedie) {
      await incrementerCompteurDedie(userId);
    } else {
      await prisma.user.update({
        where: { id: userId },
        data: { generationsUsed: { increment: 1 } },
      });
    }
  } catch (error) {
    console.error("[coach-quota] compteur d'usage non incrémenté :", error);
  }
}
