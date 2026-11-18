/**
 * ============================================================================
 * NexiRole — Moteur IA unifié (Vercel AI SDK + Groq) — v3
 * ============================================================================
 * Corrections de cette version :
 *
 *  1. EXPORTS MANQUANTS RÉTABLIS
 *     `hasGroqKey` et `GROQ_MODEL_ID` sont de nouveau exportés — ils sont
 *     importés par /api/agent/scan/route.ts et /api/dossier/route.ts.
 *     (Corrige : « Export hasGroqKey doesn't exist in target module »,
 *     le bouton rouge « 1 Issue » et le 500 sur POST /api/dossier.)
 *
 *  2. CONTRAT DE SORTIE FIABLE (plus de « JSON non conforme au schéma »)
 *     - Le prompt est automatiquement enrichi avec la structure EXACTE du
 *       schéma Zod (clés de premier niveau + champs imbriqués).
 *     - La sortie du modèle est normalisée avant validation : alias
 *       `nom` → `nom_complet`, `adresse` → `ville`, `location` → `lieu`,
 *       `jobs`/`offres`/`resultats` → `results`, tableau nu enveloppé dans
 *       `{ results: [...] }`, notes textuelles converties en nombres, etc.
 *
 *  3. QUOTAS GROQ MAÎTRISÉS (plus de 502 après 38 s)
 *     - Erreur 429 de type tokens (OTPM / « reduce max_tokens ») → passage
 *       IMMÉDIAT au modèle suivant, sans attente inutile ni re-tentative
 *       sur le même modèle.
 *     - Plafond de `max_tokens` par modèle : qwen ≤ 900 (limite 1000 OTPM),
 *       défaut global ramené de 9000 à 8000.
 *     - Timeout par appel (40 s) + budget global (100 s).
 *
 * Chaîne de modèles : openai/gpt-oss-120b → openai/gpt-oss-20b → qwen/qwen3.8-27b
 * ============================================================================
 */

import { APICallError, generateText } from "ai";
import { groq } from "@ai-sdk/groq";

/* eslint-disable @typescript-eslint/no-explicit-any */

/* ----------------------------------------------------------------------------
 * Configuration des modèles
 * -------------------------------------------------------------------------- */

export interface GroqModelConfig {
  id: string;
  label: string;
  /** Plafond de sortie (tokens) compatible avec le quota gratuit du modèle. */
  maxTokens: number;
}

export const GROQ_MODELS: readonly GroqModelConfig[] = [
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", maxTokens: 8000 },
  { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B", maxTokens: 8000 },
  // Quota gratuit qwen : 1000 tokens de sortie/minute → max_tokens plafonné à 900.
  { id: "qwen/qwen3.8-27b", label: "Qwen 27B", maxTokens: 900 },
];

export const GROQ_MODEL_ID = GROQ_MODELS[0].id;

export const hasGroqKey = Boolean((process.env.GROQ_API_KEY ?? "").trim().length > 0);

const DEFAULT_MAX_TOKENS = 8000;
const DEFAULT_TEMPERATURE = 0.4;
const DEFAULT_ATTEMPTS_PER_MODEL = 2;
const ATTEMPT_TIMEOUT_MS = 40_000;
const TOTAL_BUDGET_MS = 100_000;

/* ----------------------------------------------------------------------------
 * Erreur typée
 * -------------------------------------------------------------------------- */

export type GroqErrorKind = "config" | "rate_limit" | "schema" | "reseau" | "inconnu";

export class GroqError extends Error {
  readonly kind: GroqErrorKind;
  readonly modelId?: string;
  readonly status?: number;

  constructor(
    message: string,
    options: { kind?: GroqErrorKind; modelId?: string; status?: number } = {},
  ) {
    super(message);
    this.name = "GroqError";
    this.kind = options.kind ?? "inconnu";
    this.modelId = options.modelId;
    this.status = options.status;
  }
}

/* ----------------------------------------------------------------------------
 * Types publics
 * -------------------------------------------------------------------------- */

export interface AiSchema<T = any> {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown };
}

export interface GenerateStructuredOptions {
  system?: string;
  prompt: string;
  schema: AiSchema<any>;
  maxTokens?: number;
  temperature?: number;
  attemptsPerModel?: number;
  [key: string]: unknown;
}

export type GenerateStructuredResult<T> = T & {
  data: T;
  text: string;
  modelId: string;
  attempts: number;
};

/* ----------------------------------------------------------------------------
 * Analyse JSON tolérante (fences markdown, texte autour, virgules traînantes)
 * -------------------------------------------------------------------------- */

function tryParse(source: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(source) as unknown };
  } catch {
    return { ok: false };
  }
}

function extractBalanced(text: string, open: "{" | "[", close: "}" | "]"): string | null {
  const start = text.indexOf(open);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseJsonLoose(raw: string): unknown {
  if (!raw) return undefined;
  const text = raw.trim();

  const direct = tryParse(text);
  if (direct.ok) return direct.value;

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    const inner = tryParse(fence[1].trim());
    if (inner.ok) return inner.value;
  }

  for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
    const candidate = extractBalanced(text, open, close);
    if (!candidate) continue;
    const parsed = tryParse(candidate);
    if (parsed.ok) return parsed.value;
    const cleaned = tryParse(candidate.replace(/,\s*([}\]])/g, "$1"));
    if (cleaned.ok) return cleaned.value;
  }
  return undefined;
}

/* ----------------------------------------------------------------------------
 * Normalisation sortie modèle → schéma Zod
 * (l'objet d'origine est conservé : Zod ignore les clés en trop par défaut)
 * -------------------------------------------------------------------------- */

const ALIAS_TABLE: Readonly<Record<string, readonly string[]>> = {
  // Identité (dossier)
  nom_complet: ["nom", "name", "full_name", "fullName", "nomComplet"],
  ville: ["adresse", "address", "city", "localisation", "location"],
  email: ["mail", "courriel", "e_mail", "emailAddress"],
  telephone: ["tel", "phone", "mobile", "portable", "numero", "numero_de_telephone"],
  linkedin: ["linkedin_url", "url_linkedin", "linkedinUrl", "profile_url"],
  portfolio: ["portfolio_url", "site_web", "website", "url_portfolio", "url"],
  resume: ["summary", "profil", "presentation", "accroche", "about", "resume_professionnel"],
  // Expériences
  poste: ["titre", "title", "role", "job_title", "intitule", "intitule_poste"],
  entreprise: ["company", "societe", "employer", "organisation", "organization"],
  lieu: ["location", "localisation", "city", "ville", "adresse", "address", "place"],
  date_debut: ["startDate", "start_date", "debut", "from", "dateDebut"],
  date_fin: ["endDate", "end_date", "fin", "to", "dateFin"],
  description: ["contenu", "content", "details", "missions", "responsabilites", "realisations"],
  // Formations
  diplome: ["degree", "formation", "titre_formation", "certification", "intitule_formation"],
  etablissement: ["school", "institution", "universite", "ecole"],
  // Scan & mots-clés
  results: [
    "jobs", "offres", "offers", "annonces", "postes", "resultats", "matches",
    "items", "opportunites", "recommendations", "recommandations", "data", "list",
  ],
  keywords: ["mots_cles", "motscles", "skills", "terms", "keyword_list", "keywords_extraits"],
  titre: ["title", "poste", "job_title", "name", "intitule"],
  competences: ["skills", "technical_skills", "hard_skills", "tags", "technologies"],
  score: ["match_score", "matching_score", "compatibilite", "note", "pertinence", "matchScore"],
  raisons: ["reasons", "justification", "arguments", "points_forts", "pourquoi", "explications"],
  langues: ["languages", "spoken_languages"],
  projets: ["projects", "portfolio_projects"],
  certifications: ["certs", "certificates", "licences"],
};

const NUMERIC_KEYS: readonly string[] = [
  "score", "match_score", "matching_score", "compatibilite", "note", "pertinence",
];

function normalizeDeep(value: unknown, depth = 0): unknown {
  if (depth > 8) return value;
  if (Array.isArray(value)) return value.map((item) => normalizeDeep(item, depth + 1));
  if (!value || typeof value !== "object" || value instanceof Date) return value;

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = { ...source };

  // 1) Alias → clé canonique (sans supprimer l'alias d'origine)
  for (const [canonical, aliases] of Object.entries(ALIAS_TABLE)) {
    if (canonical in result) continue;
    for (const alias of aliases) {
      if (alias !== canonical && alias in result) {
        result[canonical] = source[alias];
        break;
      }
    }
  }

  // 2) Notes textuelles ("82", "82,5") → nombres
  for (const key of Object.keys(result)) {
    if (NUMERIC_KEYS.includes(key) && typeof result[key] === "string") {
      const numeric = Number(String(result[key]).replace(",", "."));
      if (Number.isFinite(numeric)) result[key] = numeric;
    }
  }

  // 3) Champs d'observation : jamais absent (sinon le schéma échoue)
  for (const key of ["lieu", "ville"]) {
    if (result[key] === undefined || result[key] === null) result[key] = "";
  }

  // 4) Normalisation récursive des valeurs imbriquées
  for (const [key, val] of Object.entries(result)) {
    if (val && typeof val === "object") result[key] = normalizeDeep(val, depth + 1);
  }
  return result;
}

function buildCandidates(parsed: unknown): unknown[] {
  const normalized = normalizeDeep(parsed);
  const candidates: unknown[] = [normalized];
  if (parsed !== normalized) candidates.push(parsed);

  // Le modèle a répondu un tableau nu alors que le schéma attend un objet
  // conteneur (ex. { results: [...] }) → on enveloppe.
  if (Array.isArray(normalized)) {
    for (const key of ["results", "jobs", "keywords", "items", "offres", "data"]) {
      candidates.push({ [key]: normalized });
    }
  }
  return candidates;
}

/* ----------------------------------------------------------------------------
 * Introspection du schéma Zod → « contrat de sortie » injecté dans le prompt
 * -------------------------------------------------------------------------- */

function unwrapSchemaNode(node: any): any {
  let current = node;
  for (let i = 0; i < 5 && current && typeof current === "object"; i += 1) {
    if (current.shape || current.element) return current;
    const next =
      (typeof current.unwrap === "function" ? current.unwrap() : undefined) ??
      current._def?.innerType ??
      current._def?.schema ??
      current.def?.innerType ??
      current.in;
    if (!next || next === current) return current;
    current = next;
  }
  return current;
}

function zodTypeName(node: any): string {
  const raw =
    node?._def?.typeName ??
    node?._zod?.def?.type ??
    node?.constructor?.name ??
    "inconnu";
  return String(raw).replace(/^Zod/, "").toLowerCase();
}

function describeShape(node: any, depth: number): string {
  const unwrapped = unwrapSchemaNode(node);
  if (!unwrapped || typeof unwrapped !== "object") return "?";

  if (unwrapped.shape && typeof unwrapped.shape === "object") {
    const entries = Object.entries(unwrapped.shape);
    if (depth >= 4) return `objet{${entries.length} champs}`;
    return `{ ${entries.map(([k, v]) => `${k}: ${describeShape(v, depth + 1)}`).join(", ")} }`;
  }

  if (unwrapped.element) {
    return `tableau de ${describeShape(unwrapped.element, depth + 1)}`;
  }
  return zodTypeName(unwrapped);
}

function topLevelKeys(schema: any): string[] {
  const unwrapped = unwrapSchemaNode(schema);
  if (unwrapped?.shape && typeof unwrapped.shape === "object") {
    return Object.keys(unwrapped.shape);
  }
  return [];
}

function buildShapeReminder(schema: AiSchema<any>): string | null {
  try {
    const keys = topLevelKeys(schema);
    if (keys.length === 0) return null;
    const structure = describeShape(schema, 0);
    return [
      "CONTRAT DE SORTIE OBLIGATOIRE :",
      "- Réponds avec UN SEUL objet JSON valide, sans texte d'introduction et sans balise de code.",
      `- Clés de premier niveau obligatoires : ${keys.map((k) => `"${k}"`).join(", ")}.`,
      `- Structure détaillée attendue : ${structure}`,
      '- Respecte EXACTEMENT ces noms de champs ; n\'invente aucun autre nom ; si une information manque, mets une chaîne vide "".',
    ].join("\n");
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------------------
 * Classification des erreurs API
 * -------------------------------------------------------------------------- */

function unwrapLast(error: unknown): unknown {
  let current = error;
  for (let depth = 0; depth < 5; depth += 1) {
    const next = (current as { lastError?: unknown })?.lastError;
    if (!next || typeof next !== "object") return current;
    current = next;
  }
  return current;
}

function apiHaystack(error: unknown): string {
  if (!error || typeof error !== "object") return String(error ?? "").toLowerCase();
  const source = error as {
    message?: string;
    responseBody?: unknown;
    data?: unknown;
    headers?: unknown;
  };
  const parts: string[] = [];
  if (typeof source.message === "string") parts.push(source.message);
  for (const field of [source.responseBody, source.data, source.headers]) {
    if (field == null) continue;
    if (typeof field === "string") {
      parts.push(field);
    } else {
      try {
        parts.push(JSON.stringify(field));
      } catch {
        /* ignore */
      }
    }
  }
  return parts.join(" | ").toLowerCase();
}

function isTokenLimitError(haystack: string): boolean {
  return (
    haystack.includes("otpm") ||
    haystack.includes("reduce max_tokens") ||
    haystack.includes("reduce the amount of tokens") ||
    haystack.includes("tokens per minute") ||
    haystack.includes('"type":"tokens"') ||
    haystack.includes("output token limit")
  );
}

function truncate(value: string, max = 180): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return truncate(error.message, 200);
  try {
    return truncate(JSON.stringify(error), 200);
  } catch {
    return String(error);
  }
}

function describeZodError(error: unknown): string {
  const issues = (error as { issues?: unknown })?.issues;
  if (Array.isArray(issues)) {
    return issues
      .slice(0, 4)
      .map((issue) => {
        const item = issue as { path?: Array<string | number | symbol>; message?: string };
        const path = Array.isArray(item.path) ? item.path.map(String).join(".") : "";
        return path ? `${path}: ${item.message ?? "invalide"}` : item.message ?? "invalide";
      })
      .join(" ; ");
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

/* ----------------------------------------------------------------------------
 * Appel bas niveau (compatible AI SDK v4 `maxTokens` et v5 `maxOutputTokens`)
 * -------------------------------------------------------------------------- */

async function callGroq(
  modelId: string,
  system: string,
  prompt: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const callOptions = {
    model: groq(modelId),
    system,
    prompt,
    maxOutputTokens: maxTokens,
    maxTokens,
    temperature,
    abortSignal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = (await generateText(callOptions as any)) as { text?: string };
  return typeof response?.text === "string" ? response.text : "";
}

/* ----------------------------------------------------------------------------
 * generateStructured — essais en cascade : modèle → tentative → normalisation
 * -------------------------------------------------------------------------- */

export async function generateStructured<T = any>(
  options: GenerateStructuredOptions,
): Promise<GenerateStructuredResult<T>> {
  const { prompt, schema } = options;
  const temperature =
    typeof options.temperature === "number" ? options.temperature : DEFAULT_TEMPERATURE;
  const attemptsPerModel =
    typeof options.attemptsPerModel === "number"
      ? Math.max(1, Math.min(3, options.attemptsPerModel))
      : DEFAULT_ATTEMPTS_PER_MODEL;
  const requestedMaxTokens =
    typeof options.maxTokens === "number" && options.maxTokens > 0
      ? options.maxTokens
      : DEFAULT_MAX_TOKENS;
  const system = typeof options.system === "string" ? options.system : "";

  if (!hasGroqKey) {
    throw new GroqError(
      "GROQ_API_KEY absente ou vide dans .env.local — le moteur IA ne peut pas démarrer.",
      { kind: "config" },
    );
  }

  const shapeReminder = buildShapeReminder(schema);
  const basePrompt = shapeReminder ? `${prompt}\n\n${shapeReminder}` : prompt;
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  let lastProblem = "aucune sortie exploitable";
  let lastKind: GroqErrorKind = "inconnu";
  let lastModelId: string | undefined;
  let attemptsTotal = 0;

  modelLoop: for (const model of GROQ_MODELS) {
    // Plafond par modèle (qwen ≤ 900 pour respecter sa limite de 1000 OTPM).
    const maxTokens = Math.max(200, Math.min(requestedMaxTokens, model.maxTokens));

    for (let attempt = 1; attempt <= attemptsPerModel; attempt += 1) {
      if (Date.now() >= deadline) {
        lastProblem = "délai global dépassé avant la fin des tentatives";
        lastKind = "reseau";
        break modelLoop;
      }
      attemptsTotal += 1;
      const currentPrompt =
        attempt === 1
          ? basePrompt
          : `${basePrompt}\n\nRAPPEL CRITIQUE : ta sortie précédente ne respectait pas le contrat de sortie. Réponds UNIQUEMENT avec l'objet JSON demandé, en respectant EXACTEMENT les noms de champs indiqués.`;

      try {
        const text = await callGroq(model.id, system, currentPrompt, maxTokens, temperature);
        const parsed = parseJsonLoose(text);

        if (parsed === undefined) {
          lastProblem = `sortie non JSON : ${truncate(text)}`;
          lastKind = "schema";
          lastModelId = model.id;
          console.warn(
            `[ai] ${model.id} — tentative ${attempt}/${attemptsPerModel} — JSON introuvable dans la sortie`,
          );
          continue;
        }

        for (const candidate of buildCandidates(parsed)) {
          const check = schema.safeParse(candidate);
          if (check.success) {
            const data = check.data as T;
            console.log(
              `[ai] réponse structurée via ${model.id} (tentative ${attempt}/${attemptsPerModel}, ${attemptsTotal} appel(s))`,
            );
            const spread =
              data && typeof data === "object" && !Array.isArray(data)
                ? (data as Record<string, unknown>)
                : {};
            return {
              ...spread,
              data,
              text,
              modelId: model.id,
              attempts: attemptsTotal,
            } as GenerateStructuredResult<T>;
          }
          lastProblem = `schéma non respecté : ${describeZodError(check.error)}`;
          lastKind = "schema";
          lastModelId = model.id;
        }
        console.warn(`[ai] ${model.id} — tentative ${attempt}/${attemptsPerModel} — ${lastProblem}`);
      } catch (rawError) {
        const root = unwrapLast(rawError);
        const status =
          typeof (root as { statusCode?: unknown })?.statusCode === "number"
            ? (root as { statusCode: number }).statusCode
            : undefined;
        const hay = apiHaystack(root);
        lastModelId = model.id;

        const isApiError =
          root instanceof APICallError ||
          (typeof status === "number" && status >= 400);

        if (!isApiError) {
          lastKind = "reseau";
          lastProblem = `erreur réseau ou délai dépassé : ${errorMessage(root)}`;
          console.warn(
            `[ai] ${model.id} — tentative ${attempt}/${attemptsPerModel} — ${lastProblem}`,
          );
          break; // modèle suivant
        }

        if (
          status === 401 ||
          status === 403 ||
          hay.includes("invalid api key") ||
          hay.includes("unauthorized")
        ) {
          throw new GroqError(
            "Clé Groq invalide ou révoquée (401/403). Vérifie GROQ_API_KEY dans .env.local puis redémarre le serveur.",
            { kind: "config", modelId: model.id, status },
          );
        }

        if (status === 429 || hay.includes("rate limit") || hay.includes("rate_limit")) {
          lastKind = "rate_limit";
          lastProblem = isTokenLimitError(hay)
            ? `limite de tokens Groq (OTPM) atteinte sur ${model.id} — passage au modèle suivant`
            : `limite de débit Groq (429) sur ${model.id} — passage au modèle suivant`;
          console.warn(`[ai] ${lastProblem}`);
          break; // modèle suivant IMMÉDIATEMENT — aucune attente inutile
        }

        lastKind = "reseau";
        lastProblem = `erreur API Groq (status ${status ?? "?"}) : ${errorMessage(root)}`;
        console.warn(
          `[ai] ${model.id} — tentative ${attempt}/${attemptsPerModel} — ${lastProblem}`,
        );
        break; // modèle suivant
      }
    }
  }

  console.error(
    `[ai] generateStructured en échec après ${attemptsTotal} appel(s) — ${lastProblem}`,
  );
  throw new GroqError(`Génération impossible : ${lastProblem}.`, {
    kind: lastKind,
    modelId: lastModelId,
  });
}