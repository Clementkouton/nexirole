// src/lib/groq.ts
// Client Groq auto-adaptatif :
// - détecte automatiquement les modèles disponibles sur le compte (la gamme Groq évolue) ;
// - surcharge possible via GROQ_MODEL dans .env.local ;
// - retry sur quota (429), timeout, erreurs explicites remontées jusqu'à l'UI.

const GROQ_API_BASE = "https://api.groq.com/openai/v1";
const TIMEOUT_MS = 45_000;
const RETRIES_PER_MODEL = 3;
const MODELS_CACHE_MS = 10 * 60 * 1000;
const MAX_MODEL_ATTEMPTS = 4;

// Ordre de préférence : le premier modèle disponible sur le compte est utilisé.
const MODEL_PREFERENCES = [
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-120b",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "qwen/qwen3-32b",
  "moonshotai/kimi-k2-instruct-0905",
  "deepseek-r1-distill-llama-70b",
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
];

// Modèles non conversationnels, exclus de la sélection automatique
const NON_CHAT = /whisper|tts|guard|embed|safety/i;

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ChatArgs = {
  system?: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
};

let modelsCache: { ids: string[]; at: number } | null = null;
let currentModel: string | null = null;
const excludedModels = new Set<string>();

async function listChatModels(apiKey: string): Promise<string[]> {
  if (modelsCache && Date.now() - modelsCache.at < MODELS_CACHE_MS) {
    return modelsCache.ids;
  }

  const res = await fetch(`${GROQ_API_BASE}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new GroqError(
      res.status === 401 ? "GROQ_AUTH" : "GROQ_NETWORK",
      `Impossible de lister les modèles Groq (HTTP ${res.status}).`,
      res.status
    );
  }

  const data = (await res.json()) as { data?: { id?: string }[] };
  const ids = (data.data ?? [])
    .map((m) => m.id ?? "")
    .filter((id) => id.length > 0 && !NON_CHAT.test(id));

  modelsCache = { ids, at: Date.now() };
  return ids;
}

async function resolveModel(apiKey: string): Promise<string> {
  // Surcharge manuelle : GROQ_MODEL dans .env.local
  const override = process.env.GROQ_MODEL?.trim();
  if (override) return override;

  if (currentModel && !excludedModels.has(currentModel)) return currentModel;

  const available = await listChatModels(apiKey);
  const preferred = MODEL_PREFERENCES.filter((m) => !excludedModels.has(m)).find((m) =>
    available.includes(m)
  );
  const model = preferred ?? available.find((m) => !excludedModels.has(m));

  if (!model) {
    throw new GroqError("GROQ_MODEL", "Aucun modèle conversationnel disponible sur ce compte Groq.");
  }

  currentModel = model;
  return model;
}

async function callModel(model: string, args: ChatArgs, apiKey: string): Promise<string> {
  const messages = [
    ...(args.system ? [{ role: "system", content: args.system }] : []),
    { role: "user", content: args.user },
  ];

  for (let attempt = 1; attempt <= RETRIES_PER_MODEL; attempt++) {
    let res: Response;

    try {
      res = await fetch(`${GROQ_API_BASE}/chat/completions`, {
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

      // Modèle supprimé / inexistant / sans accès → le suivant sera tenté
      if (
        res.status === 404 ||
        (res.status === 400 && /decommissioned|not found|does not exist|no longer supported/i.test(raw))
      ) {
        throw new GroqError("GROQ_MODEL", `Modèle indisponible : ${model}.`, res.status);
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

export async function groqChat(args: ChatArgs): Promise<string> {
  if (!isGroqConfigured()) {
    throw new GroqError(
      "GROQ_NO_KEY",
      "GROQ_API_KEY absente — ajoute GROQ_API_KEY=gsk_... dans .env.local (sans guillemets) puis redémarre le serveur."
    );
  }

  const apiKey = process.env.GROQ_API_KEY as string;
  const hasOverride = Boolean(process.env.GROQ_MODEL?.trim());
  const maxAttempts = hasOverride ? 1 : MAX_MODEL_ATTEMPTS;
  const failures: string[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const model = await resolveModel(apiKey);

    try {
      return await callModel(model, args, apiKey);
    } catch (err) {
      if (err instanceof GroqError && err.code === "GROQ_MODEL") {
        // Modèle supprimé ou absent : on l'exclut et on tente le suivant
        excludedModels.add(model);
        currentModel = null;
        modelsCache = null;
        failures.push(`${model} indisponible`);
        continue;
      }
      throw err;
    }
  }

  throw new GroqError("GROQ_UNKNOWN", `Aucun modèle Groq n'a fonctionné. ${failures.join(" | ")}`);
}

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