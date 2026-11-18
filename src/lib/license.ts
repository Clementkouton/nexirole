import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Gestion des licences NexiRole (Chariow) — PARTIE 1 & PARTIE 3.
 *
 * Plans :
 *  - FREE  : 3 recherches en direct / mois, 2 dossiers / mois
 *  - BOOST : 30 jours, recherches et dossiers illimités
 *  - PRO   : 90 jours, tout illimité + IA prioritaire
 *
 * Ce module centralise :
 *  - l'état frais de la licence (auto-rétrogradation si expirée, reset 30 j),
 *  - le contrôle de quota avant chaque appel IA (403 QUOTA_EXCEEDED),
 *  - l'activation / la révocation (routes manuelle + webhook Chariow).
 */

export type PlanId = "FREE" | "BOOST" | "PRO";

export interface PlanLimits {
  /** -1 = illimité */
  searches: number;
  generations: number;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  FREE: { searches: 3, generations: 2 },
  BOOST: { searches: -1, generations: -1 },
  PRO: { searches: -1, generations: -1 },
};

export const PLAN_DURATION_DAYS: Record<PlanId, number> = {
  FREE: 0,
  BOOST: 30,
  PRO: 90,
};

export const PLAN_LABELS: Record<PlanId, string> = {
  FREE: "Découverte",
  BOOST: "Pass Boost",
  PRO: "Carrière Pro",
};

const ROLLING_WINDOW_DAYS = 30;

/* ------------------------------------------------------------------ */
/*  Détection du plan depuis les produits Chariow                      */
/* ------------------------------------------------------------------ */

/**
 * Déduit le plan à partir du nom / identifiant de produit Chariow.
 * Surcharge possible via .env.local :
 *   CHARIOW_PRODUCT_BOOST_ID=prd_xxx
 *   CHARIOW_PRODUCT_PRO_ID=prd_xxx
 */
export function planFromChariowProduct(
  productId?: string | null,
  productName?: string | null
): PlanId | null {
  const proId = process.env.CHARIOW_PRODUCT_PRO_ID?.trim().toLowerCase();
  const boostId = process.env.CHARIOW_PRODUCT_BOOST_ID?.trim().toLowerCase();

  if (productId && proId && productId.trim().toLowerCase() === proId) return "PRO";
  if (productId && boostId && productId.trim().toLowerCase() === boostId) return "BOOST";

  const haystack = `${productName ?? ""} ${productId ?? ""}`.toLowerCase();
  if (/\bpro\b|carrière pro|carriere pro/.test(haystack)) return "PRO";
  if (/boost|pass boost/.test(haystack)) return "BOOST";
  return null;
}

/* ------------------------------------------------------------------ */
/*  État frais de la licence                                           */
/* ------------------------------------------------------------------ */

export interface LicenseState {
  plan: PlanId;
  licenseStatus: string;
  licenseKey: string | null;
  expiresAt: string | null;
  searchesUsed: number;
  generationsUsed: number;
  limits: PlanLimits;
  /** true si la licence est ACTIVE et non expirée */
  isActive: boolean;
  /** jours restants si licence payante active */
  daysRemaining: number | null;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Lit l'utilisateur et applique les règles automatiques :
 *  1. licence ACTIVE mais expirée          → plan FREE + status EXPIRED
 *  2. fenêtre de 30 jours dépassée (FREE)  → compteurs remis à zéro
 */
export async function getFreshLicenseState(userId: string): Promise<LicenseState> {
  let user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      licenseKey: true,
      licenseStatus: true,
      expiresAt: true,
      searchesUsed: true,
      generationsUsed: true,
      usagePeriodStart: true,
    },
  });

  if (!user) {
    return {
      plan: "FREE",
      licenseStatus: "INACTIVE",
      licenseKey: null,
      expiresAt: null,
      searchesUsed: 0,
      generationsUsed: 0,
      limits: PLAN_LIMITS.FREE,
      isActive: false,
      daysRemaining: null,
    };
  }

  const now = new Date();
  const patch: Record<string, unknown> = {};

  // 1. Auto-rétrogradation : licence expirée
  if (
    user.licenseStatus === "ACTIVE" &&
    user.expiresAt &&
    user.expiresAt.getTime() < now.getTime()
  ) {
    patch.plan = "FREE";
    patch.licenseStatus = "EXPIRED";
    patch.expiresAt = null;
    user = { ...user, plan: "FREE", licenseStatus: "EXPIRED", expiresAt: null };
  }

  // 2. Fenêtre glissante de 30 jours (utile surtout pour le plan FREE)
  const periodStart = user.usagePeriodStart ?? new Date(0);
  if (now.getTime() - periodStart.getTime() > ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
    patch.searchesUsed = 0;
    patch.generationsUsed = 0;
    patch.usagePeriodStart = now;
    user = { ...user, searchesUsed: 0, generationsUsed: 0, usagePeriodStart: now };
  }

  if (Object.keys(patch).length > 0) {
    await prisma.user.update({ where: { id: userId }, data: patch });
  }

  const plan = (["FREE", "BOOST", "PRO"] as PlanId[]).includes(user.plan as PlanId)
    ? (user.plan as PlanId)
    : "FREE";
  const isActive = user.licenseStatus === "ACTIVE" && plan !== "FREE";
  const daysRemaining =
    isActive && user.expiresAt
      ? Math.max(0, Math.ceil((user.expiresAt.getTime() - now.getTime()) / 86_400_000))
      : null;

  return {
    plan,
    licenseStatus: user.licenseStatus,
    licenseKey: user.licenseKey,
    expiresAt: user.expiresAt ? user.expiresAt.toISOString() : null,
    searchesUsed: user.searchesUsed,
    generationsUsed: user.generationsUsed,
    limits: PLAN_LIMITS[plan],
    isActive,
    daysRemaining,
  };
}

/* ------------------------------------------------------------------ */
/*  Quotas — contrôle avant chaque appel IA (PARTIE 3)                 */
/* ------------------------------------------------------------------ */

export type UsageKind = "search" | "generation";

export interface QuotaCheck {
  ok: boolean;
  state: LicenseState;
  reason?: "SEARCH_LIMIT" | "GENERATION_LIMIT";
  message?: string;
}

/** Limite du plan atteinte ? (les compteurs ne bloquent que le plan FREE) */
function isLimitReached(state: LicenseState, kind: UsageKind): boolean {
  if (state.plan !== "FREE") return false;
  if (kind === "search") {
    return state.limits.searches >= 0 && state.searchesUsed >= state.limits.searches;
  }
  return (
    state.limits.generations >= 0 &&
    state.generationsUsed >= state.limits.generations
  );
}

/** Incrémente le compteur correspondant (jamais bloquant). */
export async function consumeUsage(userId: string, kind: UsageKind): Promise<void> {
  try {
    if (kind === "search") {
      await prisma.user.update({
        where: { id: userId },
        data: { searchesUsed: { increment: 1 } },
      });
    } else {
      await prisma.user.update({
        where: { id: userId },
        data: { generationsUsed: { increment: 1 } },
      });
    }
  } catch (error) {
    console.error("[license] compteur d'usage non incrémenté :", error);
  }
}

/** Vérifie le quota du plan (sans consommer). */
export async function checkQuota(
  userId: string,
  kind: UsageKind
): Promise<QuotaCheck> {
  const state = await getFreshLicenseState(userId);
  if (isLimitReached(state, kind)) {
    return {
      ok: false,
      state,
      reason: kind === "search" ? "SEARCH_LIMIT" : "GENERATION_LIMIT",
      message:
        kind === "search"
          ? `Limite du plan Découverte atteinte (${state.limits.searches} recherches par mois). Passez au Pass Boost ou Carrière Pro pour des recherches illimitées.`
          : `Limite du plan Découverte atteinte (${state.limits.generations} dossiers par mois). Passez au Pass Boost ou Carrière Pro pour générer sans limite.`,
    };
  }
  return { ok: true, state };
}

/* ------------------------------------------------------------------ */
/*  Activation / révocation                                            */
/* ------------------------------------------------------------------ */

export interface ActivationResult {
  plan: PlanId;
  licenseStatus: string;
  expiresAt: Date;
}

/** Active (ou prolonge) la licence d'un utilisateur existant. */
export async function activateUserLicense(
  userId: string,
  plan: PlanId,
  licenseKey: string | null,
  expiresAt?: Date | null
): Promise<ActivationResult> {
  const finalExpiry =
    expiresAt ?? addDays(new Date(), PLAN_DURATION_DAYS[plan] || 0);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      plan,
      licenseKey: licenseKey ?? undefined,
      licenseStatus: "ACTIVE",
      expiresAt: finalExpiry,
      searchesUsed: 0,
      generationsUsed: 0,
      usagePeriodStart: new Date(),
    },
    select: { plan: true, licenseStatus: true, expiresAt: true },
  });

  return {
    plan: (updated.plan as PlanId) ?? plan,
    licenseStatus: updated.licenseStatus,
    expiresAt: updated.expiresAt ?? finalExpiry,
  };
}

/** Pré-activation : crée l'entrée utilisateur liée à l'email acheteur. */
export async function upsertPreActivatedUser(
  email: string,
  plan: PlanId,
  licenseKey: string | null,
  expiresAt?: Date | null,
  name?: string | null
): Promise<{ userId: string; created: boolean }> {
  const finalExpiry =
    expiresAt ?? addDays(new Date(), PLAN_DURATION_DAYS[plan] || 0);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        plan,
        licenseKey: licenseKey ?? existing.licenseKey,
        licenseStatus: "ACTIVE",
        expiresAt: finalExpiry,
        searchesUsed: 0,
        generationsUsed: 0,
        usagePeriodStart: new Date(),
      },
    });
    return { userId: existing.id, created: false };
  }

  // Compte pré-activé : l'utilisateur s'inscrit juste après avec cet email
  // (registerAction « adopte » le compte et définit son mot de passe).
  const created = await prisma.user.create({
    data: {
      email,
      name: name ?? null,
      passwordHash: null,
      plan,
      licenseKey,
      licenseStatus: "ACTIVE",
      expiresAt: finalExpiry,
      usagePeriodStart: new Date(),
    },
    select: { id: true },
  });
  return { userId: created.id, created: true };
}

/** Rétrograde un compte (remboursement / révocation / expiration Chariow). */
export async function revokeUserLicenseByEmail(
  email: string,
  reason: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return false;
  await prisma.user.update({
    where: { id: user.id },
    data: { plan: "FREE", licenseStatus: reason, expiresAt: null },
  });
  return true;
}

/* ------------------------------------------------------------------ */
/*  Client API Chariow (validation manuelle de clé)                    */
/* ------------------------------------------------------------------ */

export interface ChariowLicenseCheck {
  valid: boolean;
  expired: boolean;
  plan: PlanId | null;
  customerEmail: string | null;
  expiresAt: Date | null;
  source: "api" | "local";
}

interface ChariowApiLicense {
  key?: string;
  status?: string;
  is_active?: boolean;
  is_expired?: boolean;
  can_activate?: boolean;
  expires_at?: string | null;
  product?: { id?: string; name?: string } | null;
  customer?: { email?: string | null } | null;
}

/**
 * Valide une clé auprès de l'API Chariow (https://api.chariow.com/v1).
 * Si l'API est indisponible ou la clé non configurée, retombe sur le journal
 * local ChariowEvent (rempli par le webhook) : la clé doit alors correspondre
 * à un achat réel enregistré.
 */
export async function validateLicenseKey(
  licenseKey: string,
  email: string
): Promise<ChariowLicenseCheck> {
  const apiKey = process.env.CHARIOW_API_KEY?.trim();
  const baseUrl = process.env.CHARIOW_API_BASE?.trim() || "https://api.chariow.com/v1";

  if (apiKey) {
    try {
      const res = await fetch(`${baseUrl}/licenses/${encodeURIComponent(licenseKey)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: ChariowApiLicense } & ChariowApiLicense;
        const license = json.data ?? json;
        const isActive =
          typeof license.is_active === "boolean" ? license.is_active : license.status === "active";
        const isExpired =
          typeof license.is_expired === "boolean"
            ? license.is_expired
            : license.expires_at
              ? new Date(license.expires_at).getTime() < Date.now()
              : false;
        const plan = planFromChariowProduct(license.product?.id, license.product?.name);
        const customerEmail = license.customer?.email ?? null;
        // Si l'API renvoie l'email client, il doit correspondre au compte.
        const emailOk =
          !customerEmail || customerEmail.trim().toLowerCase() === email.trim().toLowerCase();
        return {
          valid: Boolean(isActive) && !isExpired && emailOk,
          expired: Boolean(isExpired),
          plan,
          customerEmail,
          expiresAt: license.expires_at ? new Date(license.expires_at) : null,
          source: "api",
        };
      }
      console.warn(`[license] API Chariow ${res.status} pour la clé fournie — repli local.`);
    } catch (error) {
      console.warn("[license] API Chariow injoignable — repli local :", error);
    }
  }

  // Repli local : un achat déjà passé par le webhook ?
  try {
    const event = await prisma.chariowEvent.findFirst({
      where: {
        licenseKey,
        eventType: { in: ["license.issued", "license.activated", "successful.sale"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!event) {
      return { valid: false, expired: false, plan: null, customerEmail: null, expiresAt: null, source: "local" };
    }
    const payload = event.payload as Record<string, unknown> | null;
    const license = (payload?.license ?? {}) as { expires_at?: string | null };
    return {
      valid: true,
      expired: license.expires_at ? new Date(license.expires_at).getTime() < Date.now() : false,
      plan: planFromChariowEvent(event),
      customerEmail: event.customerEmail,
      expiresAt: license.expires_at ? new Date(license.expires_at) : null,
      source: "local",
    };
  } catch (error) {
    console.error("[license] repli local injoignable (base de données ?) :", error);
    return { valid: false, expired: false, plan: null, customerEmail: null, expiresAt: null, source: "local" };
  }
}

/** Plan d'un événement journalisé (payload Chariow brut). */
export function planFromChariowEvent(event: {
  payload: unknown;
}): PlanId | null {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const product = (payload.product ?? {}) as { id?: string; name?: string };
  return planFromChariowProduct(product.id, product.name);
}

/**
 * PARTIE 1 — Applique la licence achetée AVANT l'inscription.
 * Si un webhook Chariow (« licence émise / activée » ou « vente réussie »)
 * a enregistré un achat pour cet email, le plan est activé automatiquement
 * à la création du compte (sans clé à saisir).
 */
export async function applyPendingLicense(email: string): Promise<void> {
  try {
    const event = await prisma.chariowEvent.findFirst({
      where: {
        customerEmail: email.trim().toLowerCase(),
        eventType: { in: ["license.issued", "license.activated", "successful.sale"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!event) return;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, licenseStatus: true },
    });
    if (!user || user.licenseStatus === "ACTIVE") return;

    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const license = (payload.license ?? {}) as {
      key?: string;
      expires_at?: string | null;
    };
    const plan = planFromChariowEvent(event) ?? "BOOST";
    await activateUserLicense(
      user.id,
      plan,
      license.key ?? null,
      license.expires_at ? new Date(license.expires_at) : null
    );
    console.info(`[license] licence en attente ${plan} appliquée à ${email}.`);
  } catch (error) {
    console.error("[license] application de la licence en attente échouée :", error);
  }
}
