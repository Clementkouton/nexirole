// src/lib/http.ts
// Fetch JSON résilient : timeout correct, retry avec backoff, User-Agent explicite.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchJsonWithRetry<T>(
  url: string,
  options: { retries?: number; timeoutMs?: number } = {}
): Promise<T> {
  const { retries = 2, timeoutMs = 20_000 } = options;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "NexiRole/1.0 (+https://nexirole.vercel.app)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });

      if (res.status === 429 || res.status >= 500) {
        if (attempt <= retries) {
          await sleep(3000 * attempt);
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      return (await res.json()) as T;
    } catch (err) {
      const isHttp4xx = err instanceof Error && /^HTTP 4/.test(err.message) && !/^HTTP 429/.test(err.message);
      if (attempt <= retries && !isHttp4xx) {
        await sleep(3000 * attempt);
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Impossible de joindre ${new URL(url).host} après plusieurs tentatives.`);
}