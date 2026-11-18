/**
 * Client Groq maison pour NexiRole — couche IA unique partagée par toutes les
 * routes serveur (dossier, agent de recherche, cv-builder, historique).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTEXTE NOVEMBRE 2026 (cause du bug « Moteur IA temporairement saturé ») :
 * Groq a DÉCOMMISSIONNÉ `llama-3.3-70b-versatile` ET `llama-3.1-8b-instant`
 * le 16 août 2026 pour les comptes free et developer. Toute requête vers ces
 * identifiants renvoie une erreur — les chaînes de modèles qui les utilisaient
 * échouaient donc à 100 %.
 * Source officielle : https://console.groq.com/docs/deprecations
 *
 * La chaîne ci-dessous n'utilise que les modèles de remplacement officiels
 * recommandés par Groq :
 *   1. openai/gpt-oss-120b  (production — remplace Llama 3.3 70B)
 *   2. openai/gpt-oss-20b   (production — remplace Llama 3.1 8B, quotas plus larges)
 *   3. qwen/qwen3.8-27b     (successeur de qwen3.6-27b : JSON mode, thinking)
 *
 * Surcharge possible SANS toucher au code : variable GROQ_MODEL dans .env.local
 * (le modèle indiqué reste en tête de chaîne, les replis restent actifs).
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Modèle principal (surchargeable via GROQ_MODEL dans .env.local). */
export const GROQ_MODEL_ID: string =
  process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";

/** Modèles de repli officiels (page dépréciations Groq — novembre 2026). */
export const GROQ_FALLBACK_MODELS: readonly string[] = [
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
];

/**
 * Chaîne complète des modèles à essayer, dédupliquée.
 * Le modèle passé en option (s'il existe) passe en tête de chaîne.
 */
export function getGroqModelChain(preferred?: string): string[] {
  const chain = [preferred?.trim() || GROQ_MODEL_ID, ...GROQ_FALLBACK_MODELS];
  return Array.from(new Set(chain.filter((model) => model.length > 0)));
}

/* ------------------------------------------------------------------ */
/* Erreurs                                                             */
/* ------------------------------------------------------------------ */

export type GroqErrorCode =
  | "GROQ_NO_KEY"
  | "AUTH"
  | "NETWORK"
  | "RATE_LIMIT"
  | "MODEL"
  | "BAD_JSON"
  | "UNKNOWN";

export class GroqError extends Error {
  readonly code: GroqErrorCode;
  readonly status?: number;
  readonly detail?: string;
  readonly retryAfterMs?: number;

  constructor(
    code: GroqErrorCode,
    message: string,
    opts: { status?: number; detail?: string; retryAfterMs?: number } = {},
  ) {
    super(message);
    this.name = "GroqError";
    this.code = code;
    this.status = opts.status;
    this.detail = opts.detail;
    this.retryAfterMs = opts.retryAfterMs;
  }
}

/* ------------------------------------------------------------------ */
/* Messages et options                                                 */
/* ------------------------------------------------------------------ */

export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Tolère les chaînes brutes : groqChat("Bonjour") vaut un message "user". */
export type GroqMessageInput = GroqMessage | string;

function normalizeMessages(inputs: readonly GroqMessageInput[]): GroqMessage[] {
  return inputs.map((input) =>
    typeof input === "string"
      ? { role: "user" as const, content: input }
      : input,
  );
}

export interface GroqChatOptions {
  /** Force un modèle précis (il reste en tête de chaîne, replis conservés). */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Active le mode JSON natif de Groq (response_format: json_object). */
  json?: boolean;
  /** Alias historique de `json`, accepté pour compatibilité. */
  jsonMode?: boolean;
  /** Délai maximum PAR tentative (défaut : 40 s — compatible Vercel Hobby 60 s). */
  timeoutMs?: number;
  /** Nombre de tentatives PAR MODÈLE (défaut : 2). */
  retries?: number;
  /** Signal d'annulation externe, combiné au timeout interne. */
  signal?: AbortSignal;
}

/* ------------------------------------------------------------------ */
/* Utilitaires internes                                                */
/* ------------------------------------------------------------------ */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface GroqApiPayload {
  choices?: Array<{
    message?: { content?: string | null; reasoning?: string | null };
    finish_reason?: string | null;
  }>;
  error?: { message?: string; code?: string; type?: string };
}

/** Lit le délai d'attente conseillé par Groq (en-tête ou message d'erreur). */
function extractRetryAfterMs(
  headers: Headers,
  apiMessage: string,
): number | undefined {
  const headerValue = headers.get("retry-after");
  const parsedHeader = headerValue ? Number.parseFloat(headerValue) : Number.NaN;
  if (Number.isFinite(parsedHeader) && parsedHeader > 0) {
    return Math.min(parsedHeader * 1000, 15000);
  }
  const match = /try again in ([0-9.]+)\s*s/i.exec(apiMessage);
  if (match?.[1]) {
    return Math.min(Number.parseFloat(match[1]) * 1000, 15000);
  }
  return undefined;
}

/** Une tentative d'appel vers un modèle précis. */
async function callGroqOnce(params: {
  apiKey: string;
  model: string;
  messages: GroqMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode: boolean;
  timeoutMs: number;
  externalSignal?: AbortSignal;
}): Promise<{ content: string; finishReason: string | null }> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
  };
  if (typeof params.temperature === "number") {
    body.temperature = params.temperature;
  }
  if (typeof params.maxTokens === "number") {
    body.max_tokens = Math.floor(params.maxTokens);
  }
  if (params.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const timeoutSignal = AbortSignal.timeout(params.timeoutMs);
  const signal =
    params.externalSignal && typeof AbortSignal.any === "function"
      ? AbortSignal.any([timeoutSignal, params.externalSignal])
      : timeoutSignal;

  let response: Response;
  try {
    response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new GroqError(
        "NETWORK",
        `Groq n'a pas répondu en moins de ${Math.round(params.timeoutMs / 1000)} s.`,
        {
          detail: `timeout ${params.timeoutMs} ms (modèle ${params.model})`,
        },
      );
    }
    throw new GroqError(
      "NETWORK",
      "Impossible de joindre l'API Groq (réseau indisponible).",
      {
        detail: error instanceof Error ? error.message : String(error),
      },
    );
  }

  if (response.ok) {
    const data = (await response.json().catch(() => null)) as GroqApiPayload | null;
    const content = data?.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) {
      throw new GroqError("MODEL", "Le modèle a renvoyé une réponse vide.", {
        status: response.status,
        detail: `modèle ${params.model}`,
      });
    }
    return {
      content,
      finishReason: data?.choices?.[0]?.finish_reason ?? null,
    };
  }

  const rawError = await response.text().catch(() => "");
  let apiMessage = rawError.slice(0, 400);
  try {
    const parsed = JSON.parse(rawError) as GroqApiPayload;
    if (parsed?.error?.message) apiMessage = parsed.error.message;
  } catch {
    // réponse non JSON : on garde le texte brut tronqué
  }

  if (response.status === 401 || response.status === 403) {
    throw new GroqError(
      "AUTH",
      "Clé GROQ_API_KEY refusée par Groq (401/403).",
      { status: response.status, detail: apiMessage },
    );
  }

  if (response.status === 429) {
    throw new GroqError("RATE_LIMIT", "Quota Groq atteint (429).", {
      status: 429,
      detail: apiMessage,
      retryAfterMs: extractRetryAfterMs(response.headers, apiMessage),
    });
  }

  if (response.status === 400 || response.status === 404) {
    const modelUnavailable =
      /decommission|deprecat|retired|not found|does not exist|unknown model|invalid model|no longer/i.test(
        apiMessage,
      );
    throw new GroqError(
      "MODEL",
      modelUnavailable
        ? `Modèle indisponible sur Groq : ${params.model}.`
        : "Requête refusée par Groq (400/404).",
      { status: response.status, detail: apiMessage },
    );
  }

  throw new GroqError("UNKNOWN", `Erreur Groq HTTP ${response.status}.`, {
    status: response.status,
    detail: apiMessage,
  });
}

/* ------------------------------------------------------------------ */
/* groqChat — moteur avec chaîne de replis                             */
/* ------------------------------------------------------------------ */

export async function groqChat(
  messagesInput: GroqMessageInput | readonly GroqMessageInput[],
  options: GroqChatOptions = {},
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim() ?? "";
  if (!apiKey) {
    throw new GroqError(
      "GROQ_NO_KEY",
      "La clé GROQ_API_KEY est absente. Ajoute-la dans .env.local puis redémarre le serveur.",
    );
  }

  const rawInputs = Array.isArray(messagesInput)
    ? messagesInput
    : [messagesInput];
  const messages = normalizeMessages(rawInputs);
  if (messages.length === 0) {
    throw new GroqError("UNKNOWN", "Aucun message fourni à groqChat().");
  }

  const chain = getGroqModelChain(options.model);
  const timeoutMs = options.timeoutMs ?? 40_000;
  const attemptsPerModel = Math.max(1, options.retries ?? 2);
  const wantJson = options.json ?? options.jsonMode ?? false;

  let lastError: GroqError | null = null;

  for (const model of chain) {
    let jsonMode = wantJson;

    for (let attempt = 1; attempt <= attemptsPerModel; attempt += 1) {
      try {
        const result = await callGroqOnce({
          apiKey,
          model,
          messages,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          jsonMode,
          timeoutMs,
          externalSignal: options.signal,
        });
        console.info(
          `[groq] réponse via ${model}${attempt > 1 ? ` (tentative ${attempt})` : ""}`,
        );
        return result.content;
      } catch (error) {
        const groqError =
          error instanceof GroqError
            ? error
            : new GroqError(
                "UNKNOWN",
                error instanceof Error ? error.message : String(error),
              );
        lastError = groqError;
        console.warn(
          `[groq] ${model} — tentative ${attempt}/${attemptsPerModel} — ${groqError.code}${groqError.detail ? ` : ${groqError.detail.slice(0, 220)}` : ""}`,
        );

        // Clé invalide : aucun modèle de la chaîne ne peut réussir, on arrête tout.
        if (groqError.code === "AUTH") throw groqError;

        // Mode JSON refusé par ce modèle : retente une fois SANS response_format
        // (même modèle, même numéro de tentative grâce au -1 ci-dessous).
        if (
          jsonMode &&
          groqError.code === "MODEL" &&
          /response_format|json_object|json mode/i.test(groqError.detail ?? "")
        ) {
          jsonMode = false;
          attempt -= 1;
          continue;
        }

        // Modèle décommissionné/inconnu : inutile d'insister, modèle suivant.
        if (groqError.code === "MODEL") break;

        // Quota atteint : on respecte le Retry-After de Groq si raisonnable.
        if (groqError.code === "RATE_LIMIT" && attempt < attemptsPerModel) {
          const waitMs = groqError.retryAfterMs ?? 3000 * attempt;
          if (waitMs <= 12000) {
            await sleep(waitMs + 250);
            continue;
          }
          break; // attente trop longue : modèle suivant
        }

        // Réseau / erreur serveur Groq : courte pause puis nouvelle tentative.
        if (
          (groqError.code === "NETWORK" || groqError.code === "UNKNOWN") &&
          attempt < attemptsPerModel
        ) {
          await sleep(1200 * attempt);
          continue;
        }

        break;
      }
    }
  }

  throw (
    lastError ??
    new GroqError("UNKNOWN", "Aucun modèle Groq n'a pu répondre.", {
      detail: `chaîne essayée : ${chain.join(", ")}`,
    })
  );
}

/* ------------------------------------------------------------------ */
/* Analyse JSON robuste                                                */
/* ------------------------------------------------------------------ */

function stripThinkingBlocks(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "");
}

function stripCodeFences(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  return (fenced?.[1] ?? text).trim();
}

/** Extrait le premier objet ou tableau JSON équilibré d'un texte. */
function extractBalancedJson(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start < 0) return null;
  const opener = text.charAt(start);
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === opener) depth += 1;
    else if (char === closer) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Parse du JSON « souple » : tolère les blocs <think>, les balises markdown
 * et le texte parasite autour de l'objet.
 */
export function parseJsonLoose<T = unknown>(raw: string): T {
  const cleaned = stripCodeFences(stripThinkingBlocks(raw));
  const candidates = [cleaned, extractBalancedJson(cleaned) ?? ""];

  for (const candidate of candidates) {
    if (!candidate.trim()) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // essai suivant
    }
  }

  throw new GroqError(
    "BAD_JSON",
    "La réponse de l'IA n'est pas un JSON exploitable.",
    { detail: cleaned.slice(0, 300) },
  );
}

/* ------------------------------------------------------------------ */
/* groqJSON — réponse structurée garantie                              */
/* ------------------------------------------------------------------ */

export async function groqJSON<T = unknown>(
  messagesInput: GroqMessageInput | readonly GroqMessageInput[],
  options: GroqChatOptions = {},
): Promise<T> {
  const rawInputs = Array.isArray(messagesInput)
    ? messagesInput
    : [messagesInput];
  const messages = normalizeMessages(rawInputs);
  const baseOptions: GroqChatOptions = {
    temperature: options.temperature ?? 0.35,
    maxTokens: options.maxTokens ?? 3500,
    timeoutMs: options.timeoutMs,
    model: options.model,
    retries: options.retries,
    signal: options.signal,
  };

  try {
    const raw = await groqChat(messages, { ...baseOptions, json: true });
    return parseJsonLoose<T>(raw);
  } catch (error) {
    // On ne retente QUE les réponses JSON invalides : les erreurs réseau,
    // quota et modèle ont déjà été gérées (avec replis) par groqChat.
    if (!(error instanceof GroqError) || error.code !== "BAD_JSON") {
      throw error;
    }

    console.warn(
      "[groq] JSON invalide — nouvelle tentative avec consigne renforcée.",
    );
    const retryMessages: GroqMessageInput[] = [
      ...messages,
      {
        role: "user",
        content:
          "Ta réponse précédente n'était pas du JSON valide. Réponds à nouveau en renvoyant UNIQUEMENT l'objet JSON demandé, sans texte avant ou après, sans balises markdown, sans bloc <think>.",
      },
    ];
    const raw = await groqChat(retryMessages, {
      ...baseOptions,
      json: true,
      maxTokens: Math.min((baseOptions.maxTokens ?? 3500) + 1200, 8000),
    });
    return parseJsonLoose<T>(raw);
  }
}

/* ------------------------------------------------------------------ */
/* mapWithConcurrency — lots parallèles bornés (agent de recherche)    */
/* ------------------------------------------------------------------ */

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const lanes = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index] as T, index);
      }
    },
  );

  await Promise.all(lanes);
  return results;
}