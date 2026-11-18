import { NextResponse } from "next/server";

/**
 * Rate limiting en mémoire, sans dépendance externe — PARTIE 3.
 *
 * - `rateLimit(key, limit, windowMs)` : compteur brut (utilisé par les Server
 *   Actions d'authentification).
 * - `getClientIp(request)` + `guardRateLimit(...)` : garde prête à l'emploi
 *   pour les routes API (visiteurs anonymes et plans gratuits : 5 requêtes
 *   par heure par IP sur les routes IA, réponse 429 en français).
 *
 * À très fort trafic en production, passer sur Upstash Ratelimit
 * (@upstash/ratelimit + Redis) pour un compteur partagé entre instances.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function sweep() {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { success: true; remaining: number } | { success: false; retryAfterSec: number } {
  const now = Date.now();

  if (buckets.size > 10_000) sweep();

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1 };
  }

  if (bucket.count >= limit) {
    return { success: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { success: true, remaining: limit - bucket.count };
}

/* ------------------------------------------------------------------ */
/*  Garde pour routes API                                              */
/* ------------------------------------------------------------------ */

/** IP réelle du client (Vercel / proxies) ou "anon" en local. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() ?? "anon";
}

const HOUR_MS = 60 * 60 * 1000;

export interface RateLimitOptions {
  /** Identifiant de la route (ex: "search-jobs"). */
  route: string;
  /** Identifiant du client : "anon" ou id utilisateur. */
  clientId: string;
  /** IP réelle de la requête. */
  ip: string;
  /** Requêtes autorisées par heure (défaut : 5). */
  limitPerHour?: number;
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

/**
 * Applique la limite horaire par couple (utilisateur, IP).
 * Retourne une réponse 429 prête à renvoyer en cas de dépassement.
 */
export function guardRateLimit(
  request: Request,
  { route, clientId, ip, limitPerHour = 5 }: RateLimitOptions
): RateLimitResult {
  // Clé : utilisateur connu (anti-contournement par changement d'IP)
  const byUser = rateLimit(`ai:${route}:user:${clientId}`, limitPerHour, HOUR_MS);
  if (!byUser.success) {
    return { ok: false, response: tooManyRequests(byUser.retryAfterSec) };
  }
  // Clé IP : bloque les fermes de requêtes anonymes sur une même IP
  const byIp = rateLimit(`ai:${route}:ip:${ip}`, limitPerHour, HOUR_MS);
  if (!byIp.success) {
    return { ok: false, response: tooManyRequests(byIp.retryAfterSec) };
  }
  return { ok: true };
}

function tooManyRequests(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    {
      error: `Trop de requêtes. Vous atteindrez de nouveau la limite dans ${retryAfterSec < 60 ? `${retryAfterSec} seconde(s)` : `${Math.ceil(retryAfterSec / 60)} minute(s)`}. Les visiteurs non abonnés ont droit à 5 requêtes par heure sur les outils IA.`,
      code: "RATE_LIMITED",
    },
    {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, retryAfterSec)) },
    }
  );
}
