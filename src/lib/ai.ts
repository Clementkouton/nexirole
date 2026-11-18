import { generateObject } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { z } from "zod";

/**
 * Moteur IA de NexiRole.
 *
 * - Moteur principal : Groq `llama-3.3-70b-versatile` via `process.env.GROQ_API_KEY`
 *   (Vercel AI SDK `generateObject` + validation Zod pour du JSON 100 % structuré).
 *   Clé GRATUITE sur https://console.groq.com — à mettre dans `.env.local`.
 * - Moteur de secours (optionnel) : SDK compatible OpenAI disponible uniquement
 *   dans certains environnements préconfigurés. Import dynamique protégé :
 *   si le paquet n'existe pas sur votre machine, il est simplement ignoré.
 */

const GROQ_MODEL_ID = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";

export function hasGroqKey(): boolean {
  return Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.length > 10);
}

function extractJson(raw: string): unknown | null {
  let text = raw.trim();
  // Retire les balises markdown ```json ... ``` éventuelles
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  // Récupère l'objet JSON le plus externe
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

interface StructuredOptions<T> {
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

/** Construit un squelette d'exemple remplissable à partir du schéma Zod sérialisé. */
function skeletonFromSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return "«…»";
  const s = schema as {
    type?: string;
    properties?: Record<string, unknown>;
    items?: unknown;
    description?: string;
    enum?: unknown[];
  };
  if (s.enum && Array.isArray(s.enum) && s.enum.length > 0) {
    return `«${String(s.enum[0])}»`;
  }
  if (s.type === "object" && s.properties) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(s.properties)) {
      out[key] = skeletonFromSchema(child);
    }
    return out;
  }
  if (s.type === "array") {
    return [skeletonFromSchema(s.items)];
  }
  if (s.type === "number" || s.type === "integer") return 0;
  if (s.type === "boolean") return true;
  return s.description
    ? `«${s.description.split(".")[0].slice(0, 80)}»`
    : "«…»";
}

/**
 * Moteur de secours optionnel : chat JSON strict + parse Zod, avec 4 tentatives.
 * Le SDK est importé dynamiquement avec webpackIgnore/turbopackIgnore : il n'est
 * JAMAIS résolu à la compilation — absent de votre machine, il est ignoré.
 */
async function fallbackStructured<T>(opts: StructuredOptions<T>): Promise<T> {
  type OpenAICompatibleClient = {
    chat: {
      completions: {
        create: (args: Record<string, unknown>) => Promise<{
          choices?: Array<{ message?: { content?: string } }>;
        }>;
      };
    };
  };

  let client: OpenAICompatibleClient | null = null;

  try {
    // Une variable empêche TypeScript de résoudre ce paquet optionnel à la compilation.
    const optionalSdkModule = "@ai-sdk/sdk";
    const mod: unknown = await import(optionalSdkModule);
    const factory =
      typeof mod === "function"
        ? mod
        : ((mod as { default?: unknown }).default as unknown) ?? mod;
    const create = (factory as { create?: () => Promise<unknown> }).create;
    if (typeof create !== "function") throw new Error("SDK incompatible");
    client = (await create()) as typeof client;
  } catch {
    client = null;
  }

  if (!client) {
    throw new Error(
      "Aucun moteur IA disponible. Ajoutez votre clé GROQ_API_KEY (gratuite sur console.groq.com) dans le fichier .env.local, puis redémarrez le serveur."
    );
  }

  const zai: OpenAICompatibleClient = client;
  const jsonSchema = z.toJSONSchema(opts.schema, { target: "draft-7" });
  const skeleton = skeletonFromSchema(jsonSchema);

  const messages = [
    {
      role: "system" as const,
      content: [
        opts.system,
        "",
        "RÈGLES DE SORTIE (absolues) :",
        "- Réponds UNIQUEMENT avec un objet JSON valide : aucun texte avant ou après, aucune balise markdown.",
        "- Ne renvoie JAMAIS un schéma JSON, des meta-données (comme \"$schema\") ni la structure vide : remplis chaque champ avec les vraies données calculées.",
        "- La structure exacte attendue est donnée ci-dessous. Les valeurs entre « » sont des indications à remplacer par tes données ; remplace aussi les 0 / true par les vraies valeurs quand pertinent.",
        JSON.stringify(skeleton, null, 1),
        "- Respecte scrupuleusement les clés et leurs niveaux d'imbrication.",
      ].join("\n"),
    },
    { role: "user" as const, content: opts.prompt },
  ];

  let lastError = "réponse vide";

  for (let attempt = 0; attempt < 4; attempt++) {
    // Backoff exponentiel : atténue les réponses 429 du service IA.
    if (attempt > 0) {
      const delayMs = attempt === 1 ? 1500 : attempt === 2 ? 4000 : 8000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    try {
      const completion = await zai.chat.completions.create({
        messages,
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxOutputTokens ?? 6000,
        thinking: { type: "disabled" },
      });
      const content: string =
        completion?.choices?.[0]?.message?.content ?? "";
      if (!content) {
        lastError = "réponse vide du modèle";
        continue;
      }
      const json = extractJson(content);
      if (json === null) {
        lastError = "aucun JSON détecté dans la réponse";
        console.error(
          "[ai-fallback] réponse non exploitable (extrait):",
          content.slice(0, 240)
        );
        continue;
      }
      const parsed = opts.schema.safeParse(json);
      if (parsed.success) return parsed.data;
      lastError = `validation Zod échouée: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`;
      console.error(
        `[ai-fallback] tentative ${attempt + 1} — ${lastError} | extrait réponse:`,
        content.slice(0, 240)
      );
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(`Génération IA impossible (${lastError})`);
}

/**
 * Génère un objet typé strictement conforme au schéma Zod fourni.
 * Utilise Groq/llama-3.3-70b-versatile si GROQ_API_KEY est défini, sinon le moteur de secours.
 */
export async function generateStructured<T>(opts: StructuredOptions<T>): Promise<T> {
  if (hasGroqKey()) {
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY! });
    const result = await generateObject({
      model: groq(GROQ_MODEL_ID),
      schema: opts.schema,
      system: opts.system,
      prompt: opts.prompt,
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxOutputTokens ?? 8000,
    });
    return result.object as T;
  }
  return fallbackStructured(opts);
}
