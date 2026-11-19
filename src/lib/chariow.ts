// =============================================================
// NEXIROLE — Utilitaires Chariow (webhook + activation de licence)
// Toutes les extractions sont « deep-safe » : aucun payload Chariow,
// quel que soit son format, ne peut faire planter le webhook.
// =============================================================

import { createHash } from "crypto";

export type PayablePlan = "BOOST" | "PRO";

/** Durée de validité de chaque plan payant (en jours). */
export const PLAN_DURATION_DAYS: Record<PayablePlan, number> = {
  BOOST: 30,
  PRO: 90,
};

/** Prix connus de NexiRole (FCFA ou USD, centimes inclus) → plan. */
const PRICE_TO_PLAN: Array<{ amount: number; plan: PayablePlan }> = [
  { amount: 11000, plan: "PRO" },
  { amount: 2490, plan: "PRO" },
  { amount: 24.9, plan: "PRO" },
  { amount: 4500, plan: "BOOST" },
  { amount: 990, plan: "BOOST" },
  { amount: 9.9, plan: "BOOST" },
];

export const EMAIL_KEYS = ["customer_email", "buyer_email", "user_email", "account_email", "email"] as const;
export const LICENSE_KEYS = ["license_key", "licenseKey", "licence_key", "licenceKey", "license", "key"] as const;

const EVENT_ID_KEYS = ["eventId", "event_id", "delivery_id", "deliveryId", "event_uuid", "uuid"] as const;
const EVENT_TYPE_KEYS = ["event_type", "eventType", "type", "event"] as const;
const PLAN_HINT_KEYS = [
  "plan",
  "tier",
  "product_name",
  "productName",
  "product_title",
  "variant_name",
  "variant_title",
  "offer_name",
  "product",
] as const;
const AMOUNT_KEYS = ["amount_paid", "amountPaid", "amount", "price", "total", "value"] as const;

const KNOWN_EVENT_WORDS = ["license", "sale", "refund", "subscription", "order", "payment"];

/**
 * Recherche récursive de la première valeur associée à l'une des clés
 * candidates. Les clés du niveau courant sont testées avant de descendre,
 * ce qui évite de récupérer une clé trop « profonde » par erreur.
 */
export function deepFind(value: unknown, keys: readonly string[], depth = 0): unknown {
  if (value === null || typeof value !== "object" || depth > 8) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepFind(item, keys, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const current = record[key];
    if (current !== undefined && current !== null && current !== "") return current;
  }
  for (const child of Object.values(record)) {
    const found = deepFind(child, keys, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Identifiant d'événement : clé dédiée, sinon « id », sinon empreinte du corps brut (idempotence). */
export function extractEventId(payload: unknown, rawBody: string): string {
  const specific = deepFind(payload, EVENT_ID_KEYS);
  if (typeof specific === "string" && specific.trim().length > 0) return specific.trim().slice(0, 191);
  const generic = deepFind(payload, ["id"]);
  if (typeof generic === "string" && generic.trim().length > 0) return `auto-${generic.trim()}`.slice(0, 191);
  return `hash-${createHash("sha256").update(rawBody).digest("hex")}`.slice(0, 191);
}

/** Type d'événement (license.issued, successful.sale, refund.*, …). */
export function extractEventType(payload: unknown, rawBody: string): string {
  const found = deepFind(payload, EVENT_TYPE_KEYS);
  if (typeof found === "string") {
    const value = found.trim().toLowerCase();
    if (value.length > 0 && KNOWN_EVENT_WORDS.some((word) => value.includes(word))) return value;
  }
  // Repli : première valeur du JSON brut ressemblant à un type d'événement
  const match = rawBody.match(/"((?:license|sale|refund|subscription|order|payment)[a-z0-9_.]*)"/i);
  if (match) return match[1].toLowerCase();
  return "unknown";
}

/** Vrai pour les événements qui retirent une licence (remboursement, révocation…). */
export function isTerminationEvent(eventType: string): boolean {
  const value = eventType.toLowerCase();
  return ["refund", "revoked", "revoke", "expired", "cancel", "chargeback", "failed", "dispute"].some((word) =>
    value.includes(word),
  );
}

/** Détermine le plan (BOOST ou PRO) à partir du produit ou du montant payé. */
export function detectPlan(payload: unknown): PayablePlan | null {
  const hint = deepFind(payload, PLAN_HINT_KEYS);
  if (typeof hint === "string") {
    const value = hint.toLowerCase();
    if (value.includes("boost")) return "BOOST";
    if (/\bpro\b/.test(value)) return "PRO";
  }
  const amountRaw = deepFind(payload, AMOUNT_KEYS);
  if (typeof amountRaw === "number" || typeof amountRaw === "string") {
    const amount = Number(String(amountRaw).replace(",", "."));
    if (!Number.isNaN(amount) && amount > 0) {
      const exact = PRICE_TO_PLAN.find((entry) => Math.abs(amount - entry.amount) < 0.01);
      if (exact) return exact.plan;
      if (amount >= 10000) return "PRO"; // 11 000 FCFA
      if (amount >= 4000) return "BOOST"; // 4 500 FCFA
      if (amount >= 20) return "PRO"; // 24.90 USD
      if (amount >= 8) return "BOOST"; // 9.90 USD
    }
  }
  return null;
}

/** Nettoie et valide un e-mail. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Nettoie et valide une clé de licence. */
export function normalizeLicenseKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return key.length >= 6 && key.length <= 191 ? key : null;
}

/** Comparaison en temps constant (évite les attaques temporelles sur le secret). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}