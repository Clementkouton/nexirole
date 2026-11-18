/**
 * Moteur IA de NexiRole (Groq via le Vercel AI SDK).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CAUSE DU BUG « Moteur IA temporairement saturé » (log du 18/11/2026) :
 * l'ancienne version utilisait `generateObject`, qui envoie le schéma Zod à
 * Groq en `response_format: json_schema` STRICT. Groq refuse tout champ
 * optionnel : il exige que `required` contienne TOUTES les propriétés.
 * Notre schéma déclarait `kit_entretien.score` comme optionnel → erreur 400 :
 *   "invalid JSON schema ... /properties/kit_entretien/required: `required`
 *    is required ... The following properties must be listed in `required`: score"
 * → la route /api/dossier renvoyait 502 → le panneau affichait « saturé ».
 *
 * NOUVELLE STRATÉGIE (immunisée contre ce problème) :
 *   1. `generateText` SANS json_schema côté serveur Groq ;
 *   2. consigne stricte « réponds UNIQUEMENT l'objet JSON » ;
 *   3. extraction robuste du JSON (tolère <think>, ```json, texte parasite) ;
 *   4. validation LOCALE avec le schéma Zod (inchangé, champs optionnels OK) ;
 *   5. relance automatique avec consigne renforcée si non conforme ;
 *   6. repli de modèles si saturation/indisponibilité :
 *      openai/gpt-oss-120b → openai/gpt-oss-20b → qwen/qwen3.8-27b.
 *
 * Le contrat d'appel des routes ne change pas :
 *   const dossier = await generateStructured({ schema, system, prompt });
 *   (le résultat est l'objet validé, avec `.object` disponible en plus,
 *    pour rester compatible avec les deux styles d'usage historiques)
 *
 * Modèles valides en novembre 2026 — source : https://console.groq.com/docs/deprecations
 * (llama-3.3-70b-versatile et llama-3.1-8b-instant sont DÉCOMMISSIONNÉS depuis
 *  le 16/08/2026 : ne jamais les remettre dans la chaîne.)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";
import type { z } from "zod";

/* ------------------------------------------------------------------ */
/* Modèles                                                             */
/* ------------------------------------------------------------------ */

/** Modèle principal (surchargeable via GROQ_MODEL dans .env.local). */
export const GROQ_MODEL_ID: string =
  process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";

/** Alias de compatibilité. */
export const GROQ_MODEL = GROQ_MODEL_ID;

/** Modèles de repli officiels (page dépréciations Groq — novembre 2026). */
export const GROQ_FALLBACK_MODELS: readonly string[] = [
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
];

/** Indique si une clé Groq utilisable est présente dans l'environnement. */
export function hasGroqKey(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

/* ------------------------------------------------------------------ */
/* Extraction JSON robuste                                             */
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
 * Parse du JSON « souple » : tolère les blocs <think> (qwen thinking), les
 * balises markdown et le texte parasite autour de l'objet.
 */
export function parseJsonLoose(raw: string): unknown {
  const cleaned = stripCodeFences(stripThinkingBlocks(raw));
  const candidates = [cleaned, extractBalancedJson(cleaned) ?? ""];

  for (const candidate of candidates) {
    if (!candidate.trim()) continue;
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // essai suivant
    }
  }

  throw new Error(
    `La réponse de l'IA n'est pas un JSON exploitable (${cleaned.slice(0, 120)}...)`,
  );
}

/* ------------------------------------------------------------------ */
/* generateStructured — réponse structurée garantie                    */
/* ------------------------------------------------------------------ */

interface StructuredMessage {
  role: string;
  content: string;
}

interface StructuredOptions<Schema extends z.ZodType> {
  /** Schéma Zod de validation locale (peut contenir des champs optionnels). */
  schema: Schema;
  /** Consigne système (rôle, format attendu...). */
  system?: string;
  /** Prompt utilisateur principal. */
  prompt?: string;
  /** Alternative à `prompt` : liste de messages système/user/assistant. */
  messages?: readonly StructuredMessage[];
  temperature?: number;
  /** Ancien nom (compatibilité) — correspond à maxOutputTokens du SDK. */
  maxTokens?: number;
  /** Nom du paramètre dans le AI SDK v5+. */
  maxOutputTokens?: number;
  /** Force un modèle précis (replis conservés derrière). */
  model?: string;
  /** Acceptés pour compatibilité avec l'ancienne API generateObject. */
  schemaName?: string;
  schemaDescription?: string;
  mode?: string;
  /** Signal d'annulation externe. */
  signal?: AbortSignal;
  abortSignal?: AbortSignal;
}

const JSON_GUARD =
  "RÈGLES DE SORTIE (obligatoires) : réponds UNIQUEMENT avec l'objet JSON valide demandé. " +
  "Aucun texte avant ou après, aucune balise markdown, aucun bloc <think>, aucune explication.";

const JSON_REMINDER =
  "IMPORTANT : ta réponse précédente n'était pas un JSON exploitable ou ne respectait pas le format demandé. " +
  "Renvoie cette fois UNIQUEMENT l'objet JSON complet, sans aucun autre texte.";

function buildPromptParts(
  systemBase: string,
  optsPrompt: string | undefined,
  optsMessages: readonly StructuredMessage[] | undefined,
): { system: string; prompt: string } {
  let system = [systemBase.trim(), JSON_GUARD]
    .filter((part) => part.length > 0)
    .join("\n\n");

  let prompt = optsPrompt?.trim() ?? "";

  if (!prompt && optsMessages?.length) {
    const sysFromMessages = optsMessages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    if (sysFromMessages.trim()) {
      system = [sysFromMessages.trim(), systemBase.trim(), JSON_GUARD]
        .filter((part) => part.length > 0)
        .join("\n\n");
    }
    prompt = optsMessages
      .filter((m) => m.role !== "system")
      .map((m) =>
        m.role === "user" ? m.content : `[réponse précédente] ${m.content}`,
      )
      .join("\n\n")
      .trim();
  }

  if (!prompt) prompt = "Renvoie l'objet JSON demandé.";
  return { system, prompt };
}

function withTimeout(
  external: AbortSignal | undefined,
  ms: number,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(ms);
  if (external && typeof AbortSignal.any === "function") {
    return AbortSignal.any([timeoutSignal, external]);
  }
  return timeoutSignal;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TIMEOUT_MS = 55_000; // compatible Vercel Hobby (60 s max par fonction)

export async function generateStructured<Schema extends z.ZodType>(
  opts: StructuredOptions<Schema>,
): Promise<z.infer<Schema> & { object: z.infer<Schema> }> {
  if (!hasGroqKey()) {
    throw new Error(
      "GROQ_API_KEY absente : ajoute-la dans .env.local puis redémarre le serveur.",
    );
  }

  const { system, prompt } = buildPromptParts(
    opts.system ?? "",
    opts.prompt,
    opts.messages,
  );

  const chain = Array.from(
    new Set(
      [opts.model?.trim() || GROQ_MODEL_ID, ...GROQ_FALLBACK_MODELS].filter(
        (m) => m.length > 0,
      ),
    ),
  );

  const temperature = opts.temperature ?? 0.4;
  const baseTokens =
    opts.maxOutputTokens ?? opts.maxTokens ?? 8000;
  const externalSignal = opts.abortSignal ?? opts.signal;

  const groq = createGroq({ apiKey: process.env.GROQ_API_KEY ?? "" });

  let lastError: Error | null = null;

  for (const modelId of chain) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const currentPrompt =
        attempt === 1 ? prompt : `${prompt}\n\n${JSON_REMINDER}`;

      try {
        const { text } = await generateText({
          model: groq(modelId),
          system,
          prompt: currentPrompt,
          temperature,
          maxOutputTokens: Math.min(baseTokens + (attempt > 1 ? 1000 : 0), 12000),
          abortSignal: withTimeout(externalSignal, TIMEOUT_MS),
          maxRetries: 1,
        });

        const json = parseJsonLoose(text);
        const validated = opts.schema.safeParse(json);

        if (!validated.success) {
          const issues = validated.error.issues
            .map(
              (issue) =>
                `${issue.path.join(".") || "(racine)"}: ${issue.message}`,
            )
            .join(" ; ")
            .slice(0, 300);
          console.warn(
            `[ai] ${modelId} — tentative ${attempt}/2 — JSON non conforme au schéma : ${issues}`,
          );
          lastError = new Error(
            `La réponse de l'IA ne respecte pas le format attendu (${issues}).`,
          );
          continue; // relance avec consigne renforcée
        }

        console.info(
          `[ai] réponse structurée via ${modelId}${attempt > 1 ? ` (tentative ${attempt})` : ""}`,
        );
        const data = validated.data as z.infer<Schema>;
        return {
          ...(data as Record<string, unknown>),
          object: data,
        } as z.infer<Schema> & { object: z.infer<Schema> };
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error(String(error));
        const status = (error as { statusCode?: number }).statusCode;
        console.warn(
          `[ai] ${modelId} — tentative ${attempt}/2 — échec${status ? ` (HTTP ${status})` : ""} : ${lastError.message.slice(0, 220)}`,
        );
        await sleep(1000 * attempt);
      }
    }
  }

  throw (
    lastError ??
    new Error(
      `Aucun modèle IA n'a pu répondre (chaîne essayée : ${chain.join(", ")}).`,
    )
  );
}