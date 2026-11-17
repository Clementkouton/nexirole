// src/lib/groq.ts
// Client Groq robuste : chaîne de modèles, retry sur quota, timeout, erreurs explicites.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Chaîne de modèles : on tente dans l'ordre jusqu'à ce qu'un réponde. */
export const GROQ_MODEL_CHAIN = [
  "llama-3.3-70b-versatile", // qualité maximale
  "llama-3.1-8b-instant",    // limites plus larges, réponses rapides
] as const;

export type GroqErrorCode =
  | "GROQ_NO_KEY"
  | "GROQ_AUTH"
  | "GROQ_NETWORK"
  | "GROQ_RATE_LIMIT"
  | "GROQ_MODEL"
  | "GROQ_BAD_JSON"
  | "GROQ_UNKNOWN";

export class GroqError extends Error {
  code: GroqErrorCode;
  status?: number;

  constructor(code: GroqErrorCode, message: string, status?: number) {
    super(message);
    this.name = "GroqError";
    this.code = code;
    this.status = status;
  }
}

export function isGroqConfigured(): boolean {
  const key = process.env.GROQ_API_KEY;
  return Boolean(key && key.trim().startsWith("gsk_"));
}

const TIMEOUT_MS = 45_000;
const RETRIES_PER_MODEL = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ChatArgs = {
  system?: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
};

async function callModel(model: string, args: ChatArgs): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY as string;
  const messages = [
    ...(args.system ? [{ role: "system", content: args.system }] : []),
    { role: "user", content: args.user },
  ];

  for (let attempt = 1; attempt <= RETRIES_PER_MODEL; attempt++) {
    let res: Response;

    try {
      res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: args.temperature ?? 0.4,
          max_tokens: args.maxTokens ?? 2048,
          ...(args.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      if (attempt < RETRIES_PER_MODEL) {
        await sleep(2000 * attempt);
        continue;
      }
      throw new GroqError(
        "GROQ_NETWORK",
        `Impossible de joindre api.groq.com (réseau ou timeout > ${TIMEOUT_MS / 1000}s).`
      );
    }

    if (res.status === 401) {
      throw new GroqError(
        "GROQ_AUTH",
        "Clé API Groq invalide ou révoquée (HTTP 401) — recrée une clé sur console.groq.com.",
        401
      );
    }

    if (res.status === 429) {
      if (attempt < RETRIES_PER_MODEL) {
        await sleep(4000 * attempt);
        continue;
      }
      throw new GroqError(
        "GROQ_RATE_LIMIT",
        "Quota Groq atteint (HTTP 429) après plusieurs tentatives — réessaie dans une minute.",
        429
      );
    }

    if (!res.ok) {
      const raw = await res.text();
      if (res.status === 400 && /decommissioned|not found|does not exist|no longer supported/i.test(raw)) {
        throw new GroqError("GROQ_MODEL", `Modèle indisponible : ${model}.`, 400);
      }
      if (res.status >= 500 && attempt < RETRIES_PER_MODEL) {
        await sleep(2000 * attempt);
        continue;
      }
      throw new GroqError("GROQ_UNKNOWN", `Erreur Groq HTTP ${res.status} : ${raw.slice(0, 200)}`, res.status);
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new GroqError("GROQ_UNKNOWN", "Groq a renvoyé une réponse vide.");
    }
    return content;
  }

  throw new GroqError("GROQ_UNKNOWN", "Appels Groq épuisés.");
}

/** Appel chat simple : renvoie le texte de la réponse. */
export async function groqChat(args: ChatArgs): Promise<string> {
  if (!isGroqConfigured()) {
    throw new GroqError(
      "GROQ_NO_KEY",
      "GROQ_API_KEY absente — ajoute GROQ_API_KEY=gsk_... dans .env.local (sans guillemets) puis redémarre le serveur."
    );
  }

  const failures: string[] = [];

  for (const model of GROQ_MODEL_CHAIN) {
    try {
      return await callModel(model, args);
    } catch (err) {
      if (err instanceof GroqError && (err.code === "GROQ_NO_KEY" || err.code === "GROQ_AUTH")) {
        throw err; // clé en cause : inutile d'essayer les autres modèles
      }
      failures.push(`${model} → ${(err as Error).message}`);
    }
  }

  throw new GroqError("GROQ_UNKNOWN", `Tous les modèles ont échoué. ${failures.join(" | ")}`);
}

/** Appel avec réponse JSON stricte (le prompt doit contenir le mot « JSON »). */
export async function groqJSON<T>(args: ChatArgs): Promise<T> {
  const text = await groqChat({ ...args, jsonMode: true });
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.search(/[{[]/);
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  const candidate = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;

  try {
    return JSON.parse(candidate) as T;
  } catch {
    throw new GroqError("GROQ_BAD_JSON", `JSON invalide reçu de Groq : ${candidate.slice(0, 150)}`);
  }
}

/** Exécute des tâches async par petits lots pour respecter les quotas free tier. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}