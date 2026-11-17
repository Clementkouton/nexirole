// Rate limiting en mémoire, sans dépendance externe.
// Suffisant pour démarrer. À fort trafic en production, passer sur
// Upstash Ratelimit (@upstash/ratelimit + Redis) pour un compteur
// partagé entre toutes les instances serverless.

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