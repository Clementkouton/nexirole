/* =====================================================================
   NexiRole - Client IA universel (auto-detection du provider existant)

   Ce fichier est utilise UNIQUEMENT cote serveur (routes API).
   Il detecte automatiquement la cle IA deja presente dans ton .env,
   donc aucune nouvelle configuration n'est necessaire si ton
   generateur de CV utilise deja l'un des providers supportes.

   Ordre de detection :
   GROQ -> OPENAI -> MISTRAL -> DEEPSEEK -> GEMINI -> ANTHROPIC
   -> OPENROUTER -> TOGETHER

   Variables d'environnement optionnelles :
   - AI_PROVIDER  : force un provider (groq, openai, mistral, deepseek,
                    gemini, anthropic, openrouter, together)
   - AI_MODEL     : force un modele pour tous les providers
   - <PREFIX>_MODEL : force un modele pour un provider precis
                    (ex. GROQ_MODEL=llama-3.1-8b-instant)
   - AI_API_KEY + AI_BASE_URL : provider generique compatible OpenAI
   ===================================================================== */

export type AiInfo = { provider: string; model: string };
export type AiResult = AiInfo & { text: string };

export type GenOpts = {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
};

type Detected = AiInfo & {
  kind: "openai" | "gemini" | "anthropic";
  url: string;
  key: string;
};

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

const PROVIDERS: Array<{
  id: string;
  envKeys: string[];
  kind: "openai" | "gemini" | "anthropic";
  url: () => string;
  defaultModel: string;
}> = [
  {
    id: "groq",
    envKeys: ["GROQ_API_KEY"],
    kind: "openai",
    url: () => "https://api.groq.com/openai/v1/chat/completions",
    defaultModel: "llama-3.3-70b-versatile",
  },
  {
    id: "openai",
    envKeys: ["OPENAI_API_KEY"],
    kind: "openai",
    url: () => "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4o-mini",
  },
  {
    id: "mistral",
    envKeys: ["MISTRAL_API_KEY"],
    kind: "openai",
    url: () => "https://api.mistral.ai/v1/chat/completions",
    defaultModel: "mistral-small-latest",
  },
  {
    id: "deepseek",
    envKeys: ["DEEPSEEK_API_KEY"],
    kind: "openai",
    url: () => "https://api.deepseek.com/chat/completions",
    defaultModel: "deepseek-chat",
  },
  {
    id: "gemini",
    envKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
    kind: "gemini",
    url: () => "https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
    defaultModel: "gemini-2.0-flash",
  },
  {
    id: "anthropic",
    envKeys: ["ANTHROPIC_API_KEY"],
    kind: "anthropic",
    url: () => "https://api.anthropic.com/v1/messages",
    defaultModel: "claude-3-5-haiku-latest",
  },
  {
    id: "openrouter",
    envKeys: ["OPENROUTER_API_KEY"],
    kind: "openai",
    url: () => "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "openai/gpt-4o-mini",
  },
  {
    id: "together",
    envKeys: ["TOGETHER_API_KEY"],
    kind: "openai",
    url: () => "https://api.together.xyz/v1/chat/completions",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  },
];

function modelFor(id: string, def: string): string {
  return env(id.toUpperCase() + "_MODEL") || env("AI_MODEL") || def;
}

/** Renvoie le provider detecte (sans jamais exposer la cle). */
export function getAiStatus(): AiInfo | null {
  const d = detectAi();
  return d ? { provider: d.provider, model: d.model } : null;
}

function detectAi(): Detected | null {
  const forced = (env("AI_PROVIDER") || "").toLowerCase();

  for (const p of PROVIDERS) {
    if (forced && p.id !== forced) continue;
    const key = p.envKeys.map(env).find((v) => Boolean(v));
    if (!key) continue;

    const model = modelFor(p.id, p.defaultModel);
    let url = p.url();
    if (p.kind === "gemini") url = url.replace("{MODEL}", encodeURIComponent(model));
    const base = env("AI_BASE_URL");
    if (base && p.kind === "openai") url = base.replace(/\/+$/, "") + "/chat/completions";

    return { provider: p.id, model, kind: p.kind, url, key };
  }

  const genericKey = env("AI_API_KEY");
  const genericBase = env("AI_BASE_URL");
  if (genericKey && genericBase) {
    return {
      provider: "custom",
      model: env("AI_MODEL") || "gpt-4o-mini",
      kind: "openai",
      url: genericBase.replace(/\/+$/, "") + "/chat/completions",
      key: genericKey,
    };
  }

  return null;
}

async function echecHttp(res: Response, body: string): Promise<never> {
  throw new Error("Reponse IA en erreur (HTTP " + res.status + ") : " + body.slice(0, 300));
}

async function appelOpenAiCompatible(ai: Detected, opts: GenOpts, signal: AbortSignal): Promise<string> {
  const res = await fetch(ai.url, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + ai.key },
    body: JSON.stringify({
      model: ai.model,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 1500,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
  });
  const raw = await res.text();
  if (!res.ok) await echecHttp(res, raw);
  const data = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
}

async function appelGemini(ai: Detected, opts: GenOpts, signal: AbortSignal): Promise<string> {
  const res = await fetch(ai.url, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts: [{ text: opts.user }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.7,
        maxOutputTokens: opts.maxTokens ?? 1500,
      },
    }),
  });
  const raw = await res.text();
  if (!res.ok) await echecHttp(res, raw);
  const data = JSON.parse(raw) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  return parts.map((p) => p.text || "").join("");
}

async function appelAnthropic(ai: Detected, opts: GenOpts, signal: AbortSignal): Promise<string> {
  const res = await fetch(ai.url, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ai.key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ai.model,
      max_tokens: opts.maxTokens ?? 1500,
      temperature: opts.temperature ?? 0.7,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  const raw = await res.text();
  if (!res.ok) await echecHttp(res, raw);
  const data = JSON.parse(raw) as { content?: Array<{ type?: string; text?: string }> };
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("");
}

function nettoyer(texte: string): string {
  let s = texte.trim();
  s = s.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
  return s;
}

/** Appel IA principal : renvoie le texte genere + infos provider/model. */
export async function generateText(opts: GenOpts): Promise<AiResult> {
  const ai = detectAi();
  if (!ai) {
    throw new Error(
      "Aucune cle IA detectee dans les variables d'environnement. " +
        "Ajoute dans .env la meme cle que celle deja utilisee par ton generateur de CV " +
        "(ex. GROQ_API_KEY ou OPENAI_API_KEY), puis redemarre le serveur."
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    let texte = "";
    if (ai.kind === "openai") texte = await appelOpenAiCompatible(ai, opts, controller.signal);
    else if (ai.kind === "gemini") texte = await appelGemini(ai, opts, controller.signal);
    else texte = await appelAnthropic(ai, opts, controller.signal);

    if (!texte.trim()) throw new Error("La reponse de l'IA est vide. Reessaie dans quelques instants.");
    return { text: nettoyer(texte), provider: ai.provider, model: ai.model };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("L'IA a mis trop de temps a repondre (90 s). Reessaie.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
