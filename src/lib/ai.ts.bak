/* ============================================================================
   NexiRole — Moteur IA unifié (src/lib/ai.ts)
   CORRECTIF « moteur IA temporairement saturé » — remplace l'intégralité du fichier.

   Ce qui change :
   1. La structure attendue par ton schéma (Zod) est maintenant INJECTÉE dans le
      prompt (squelette JSON généré automatiquement) : les modèles renvoient
      enfin les BONNES clés (results, identite.nom_complet, ville, lieu...).
   2. Plafond de tokens de sortie PAR MODÈLE : qwen/qwen3.8-27b (free tier,
      plafond 1000 tokens/min) est automatiquement ignoré si la sortie demandée
      dépasse son plafond — plus de 429 « Request too large ».
   3. maxRetries: 0 sur le SDK (avant : retries SDK × boucle maison = 18 appels,
      d'où les 91 s du scan) + budget temps global de 55 s.
   4. Parseur JSON durci : blocs <think>, code fences, texte autour, et
      RÉPARATION des réponses tronquées (accolades fermées automatiquement).
   5. Réparation tolérante : clés manquantes comblées par alias connus
      (nom → nom_complet, jobs → results...) ou valeurs par défaut.
   6. Chaîne de modèles : openai/gpt-oss-120b → openai/gpt-oss-20b → qwen/qwen3.8-27b.
      NE PAS définir GROQ_MODEL vers un ancien nom (llama-3.3-70b-versatile est
      décommissionné depuis le 16/08/2026).
   ============================================================================ */

import { generateText } from "ai";
import { createGroq } from "@ai-sdk/groq";

/* ---------------------------------------------------------------------------
   Constantes et chaîne de modèles
--------------------------------------------------------------------------- */

export const GROQ_MODEL_ID: string = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";

export const GROQ_FALLBACK_MODELS: readonly string[] = [
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
];

/** Plafond fiable de tokens de SORTIE par modèle (free tier Groq). */
export const MODEL_OUTPUT_TOKEN_CAPS: Record<string, number> = {
  "openai/gpt-oss-120b": 8000,
  "openai/gpt-oss-20b": 6000,
  "qwen/qwen3.8-27b": 900, // OTPM free tier = 1000 : au-delà, rejet immédiat
};

/**
 * Sous ce plafond de sortie, un modèle ne peut pas produire un dossier/CV
 * exploitable : il est écarté de la chaîne plutôt que de provoquer un 429
 * « Request too large » (cas qwen/qwen3.8-27b, OTPM free tier = 1000).
 * Les autres modèles sont simplement CLAMPÉS à leur cap (ex. 9000 demandé
 * → 8000 pour gpt-oss-120b), jamais écartés.
 */
const MIN_VIABLE_OUTPUT_TOKENS = 1200;

export function getGroqModelChain(preferred?: string): string[] {
  const preferredModel = preferred?.trim();
  const primary = preferredModel || process.env.GROQ_MODEL?.trim() || GROQ_MODEL_ID;
  const chain: string[] = [];
  // GROQ_MODEL_ID reste dans la chaîne même si un modèle preferred (potentiellement
  // mort, codé en dur dans une route) est fourni : jamais de chaîne sans repli valable.
  for (const model of [primary, GROQ_MODEL_ID, ...GROQ_FALLBACK_MODELS]) {
    if (model && !chain.includes(model)) chain.push(model);
  }
  return chain;
}

/* ---------------------------------------------------------------------------
   Erreurs typées
--------------------------------------------------------------------------- */

export type GroqErrorCode =
  | "GROQ_NO_KEY"
  | "AUTH"
  | "RATE_LIMIT"
  | "MODEL"
  | "NETWORK"
  | "BAD_JSON"
  | "SCHEMA"
  | "BUDGET"
  | "UNKNOWN";

export class GroqError extends Error {
  readonly code: GroqErrorCode;
  readonly detail?: string;

  constructor(code: GroqErrorCode, message: string, detail?: string) {
    super(message);
    this.name = "GroqError";
    this.code = code;
    this.detail = detail;
  }
}

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms));

/* ---------------------------------------------------------------------------
   Utilitaires JSON tolérants
--------------------------------------------------------------------------- */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stripThinkingBlocks(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .replace(/<reasoning>[\s\S]*$/i, "");
}

export function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```$/);
  if (fenced && typeof fenced[1] === "string") return fenced[1].trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```[a-zA-Z0-9_-]*\s*\n?/, "")
      .replace(/```$/, "")
      .trim();
  }
  return trimmed;
}

function findPayloadStart(raw: string): number {
  const obj = raw.indexOf("{");
  const arr = raw.indexOf("[");
  if (obj === -1 && arr === -1) return -1;
  if (obj === -1) return arr;
  if (arr === -1) return obj;
  return Math.min(obj, arr);
}

/** Isole le premier objet/tableau équilibré ; truncated=true si la fin manque. */
export function extractJsonPayload(raw: string): { fragment: string; truncated: boolean } | null {
  const cleaned = stripCodeFences(stripThinkingBlocks(raw));
  const start = findPayloadStart(cleaned);
  if (start === -1) return null;

  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned.charAt(i);
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack.length === 0) return { fragment: cleaned.slice(start, i + 1), truncated: false };
    }
  }
  return { fragment: cleaned.slice(start), truncated: true };
}

function lastStructuralCutIndex(s: string): number | null {
  let inString = false;
  let escaped = false;
  let last = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "," || ch === "{" || ch === "[" || ch === ":") last = i;
  }
  return last >= 0 ? last + 1 : null;
}

function closeOpenBraces(fragment: string): string {
  let out = fragment.trimEnd();
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (const ch of out) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  if (out.endsWith(",")) out = out.slice(0, -1).trimEnd();
  if (inString) out += '"';
  if (out.endsWith(":")) out += " null";
  for (const closer of [...stack].reverse()) out += closer;
  return out;
}

/** Répare un JSON tronqué en coupant au dernier séparateur sûr puis en fermant. */
export function repairTruncatedJson(fragment: string): string | null {
  let candidate = fragment.trimStart();
  for (let round = 0; round < 64; round++) {
    const attempt = closeOpenBraces(candidate);
    try {
      JSON.parse(attempt);
      return attempt;
    } catch {
      /* on continue en coupant plus court */
    }
    const cut = lastStructuralCutIndex(candidate);
    if (cut === null || cut < 1) return null;
    candidate = candidate.slice(0, cut).trimEnd();
    if (candidate.endsWith(",")) candidate = candidate.slice(0, -1).trimEnd();
    if (candidate.length < 2) return null;
  }
  return null;
}

export interface ParsedJsonDetailed<T = unknown> {
  value: T;
  truncated: boolean;
}

export function parseJsonLooseDetailed<T = unknown>(raw: string): ParsedJsonDetailed<T> {
  const payload = extractJsonPayload(raw);
  if (!payload) {
    throw new GroqError("BAD_JSON", "Aucun objet JSON détecté dans la réponse du modèle.", raw.slice(0, 300));
  }

  let candidate = payload.fragment;
  if (payload.truncated) {
    const repaired = repairTruncatedJson(candidate);
    if (repaired) candidate = repaired;
  }

  try {
    return { value: JSON.parse(candidate) as T, truncated: payload.truncated };
  } catch {
    const forced = repairTruncatedJson(candidate);
    if (forced) {
      try {
        return { value: JSON.parse(forced) as T, truncated: true };
      } catch {
        /* tombe sur l'erreur ci-dessous */
      }
    }
    throw new GroqError("BAD_JSON", "La réponse du modèle n'est pas un JSON exploitable.", raw.slice(0, 300));
  }
}

export function parseJsonLoose<T = unknown>(raw: string): T {
  return parseJsonLooseDetailed<T>(raw).value;
}

/* ---------------------------------------------------------------------------
   Lecture du schéma (Zod v3 / v4 / duck-typing) → squelette JSON d'exemple
--------------------------------------------------------------------------- */

function zodDef(node: unknown): Record<string, unknown> {
  if (!isPlainObject(node)) return {};
  const def = (node as { _def?: unknown })._def ?? (node as { def?: unknown }).def;
  return isPlainObject(def) ? def : {};
}

function unwrapZodLike(node: unknown, depth = 0): unknown {
  if (!isPlainObject(node) || depth > 12) return node;

  try {
    if (typeof (node as { unwrap?: unknown }).unwrap === "function") {
      const inner = (node as { unwrap: () => unknown }).unwrap();
      if (isPlainObject(inner)) return unwrapZodLike(inner, depth + 1);
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof (node as { removeDefault?: unknown }).removeDefault === "function") {
      return unwrapZodLike((node as { removeDefault: () => unknown }).removeDefault(), depth + 1);
    }
  } catch {
    /* ignore */
  }

  const def = zodDef(node);
  if (isPlainObject(def.innerType)) return unwrapZodLike(def.innerType, depth + 1);
  if (isPlainObject(def.schema)) return unwrapZodLike(def.schema, depth + 1); // ZodEffects v3
  if (isPlainObject(def.out)) return unwrapZodLike(def.out, depth + 1); // ZodPipe v4 (sortie)
  if (isPlainObject(def.in)) return unwrapZodLike(def.in, depth + 1);
  if (typeof def.getter === "function") {
    try {
      return unwrapZodLike((def.getter as () => unknown)(), depth + 1);
    } catch {
      /* ignore */
    }
  }
  return node;
}

/** Génère un exemple JSON (placeholders typés) décrivant la structure attendue. */
export function zodToSkeleton(node: unknown, depth = 0): unknown {
  if (depth > 10) return "...";
  const core = unwrapZodLike(node);
  if (!isPlainObject(core)) return "<valeur>";
  const def = zodDef(core);
  const typeName = String(def.typeName ?? def.type ?? "").toLowerCase();

  const shapeRaw = (core as { shape?: unknown }).shape;
  const shape = typeof shapeRaw === "function" ? (shapeRaw as () => unknown)() : shapeRaw;
  if (isPlainObject(shape)) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(shape)) out[key] = zodToSkeleton(child, depth + 1);
    return out;
  }

  // ZodRecord : keyType/valueType AVANT element (Record expose aussi .element en v3)
  if (def.keyType !== undefined && def.valueType !== undefined) {
    return { "<clé>": zodToSkeleton(def.valueType, depth + 1) };
  }

  const element = (core as { element?: unknown }).element ?? def.element;
  if (element !== undefined) return [zodToSkeleton(element, depth + 1)];

  if (typeName.includes("enum")) {
    const options = (core as { options?: unknown }).options ?? def.values;
    if (Array.isArray(options) && options.length > 0) return options[0] ?? "<choix>";
    return "<choix>";
  }
  if (typeName.includes("literal")) return def.value ?? (core as { value?: unknown }).value ?? "<valeur>";
  if (typeName.includes("tuple")) {
    const items = (core as { items?: unknown }).items ?? def.items;
    if (Array.isArray(items)) return items.map((item) => zodToSkeleton(item, depth + 1));
    return [];
  }
  if (typeName.includes("union") || typeName.includes("intersection")) {
    const options = def.options ?? (core as { options?: unknown }).options;
    if (Array.isArray(options) && options.length > 0) return zodToSkeleton(options[0], depth + 1);
    return "<valeur>";
  }
  if (typeName.includes("number") || typeName.includes("bigint")) return 0;
  if (typeName.includes("boolean")) return true;
  if (typeName.includes("date")) return "AAAA-MM-JJ";
  if (typeName.includes("null") || typeName.includes("undefined") || typeName.includes("void")) return null;
  if (typeName.includes("string")) return "<texte>";
  return "<valeur>";
}

function safeSkeleton(schema: unknown): unknown {
  try {
    const skeleton = zodToSkeleton(schema);
    return isPlainObject(skeleton) || Array.isArray(skeleton) ? skeleton : undefined;
  } catch {
    return undefined;
  }
}

function schemaShape(schema: unknown): Record<string, unknown> | null {
  const core = unwrapZodLike(schema);
  if (!isPlainObject(core)) return null;
  const shapeRaw = (core as { shape?: unknown }).shape;
  const shape = typeof shapeRaw === "function" ? (shapeRaw as () => unknown)() : shapeRaw;
  return isPlainObject(shape) ? shape : null;
}

function schemaElement(schema: unknown): unknown {
  const core = unwrapZodLike(schema);
  if (!isPlainObject(core)) return undefined;
  return (core as { element?: unknown }).element ?? zodDef(core).element;
}

type SchemaKind = "string" | "number" | "boolean" | "array" | "object" | "enum" | "literal" | "date" | "any";

function typeOfSchema(node: unknown): SchemaKind {
  const core = unwrapZodLike(node);
  if (!isPlainObject(core)) return "any";
  const def = zodDef(core);
  const t = String(def.typeName ?? def.type ?? "").toLowerCase();

  const shapeRaw = (core as { shape?: unknown }).shape;
  const shape = typeof shapeRaw === "function" ? (shapeRaw as () => unknown)() : shapeRaw;
  if (isPlainObject(shape)) return "object";
  // ZodRecord : keyType/valueType AVANT element (Record expose aussi .element en v3)
  if (def.keyType !== undefined && def.valueType !== undefined) return "object";
  if ((core as { element?: unknown }).element !== undefined || def.element !== undefined) return "array";
  if (t.includes("enum")) return "enum";
  if (t.includes("literal")) return "literal";
  if (t.includes("date")) return "date";
  if (t.includes("number") || t.includes("bigint")) return "number";
  if (t.includes("boolean")) return "boolean";
  if (t.includes("string")) return "string";
  if (t.includes("union")) {
    const options = def.options ?? (core as { options?: unknown }).options;
    if (Array.isArray(options) && options.length > 0) return typeOfSchema(options[0]);
  }
  return "any";
}

/* ---------------------------------------------------------------------------
   Validation (duck-typed : fonctionne avec Zod v3/v4 ou tout .safeParse)
--------------------------------------------------------------------------- */

export function formatZodIssues(error: unknown, maxIssues = 8): string {
  const issues = (error as { issues?: Array<{ path?: ReadonlyArray<unknown>; message?: string }> } | undefined)?.issues;
  if (!Array.isArray(issues) || issues.length === 0) {
    return error instanceof Error ? error.message : "structure inattendue";
  }
  const parts = issues
    .slice(0, maxIssues)
    .map((issue) => `${(issue.path ?? []).map(String).join(".") || "(racine)"}: ${issue.message ?? "invalide"}`);
  if (issues.length > maxIssues) parts.push(`… (+${issues.length - maxIssues} autres)`);
  return parts.join(" ; ");
}

interface SchemaCheckOk {
  ok: true;
  value: unknown;
}
interface SchemaCheckKo {
  ok: false;
  issues: string;
  issueCount: number;
}
type SchemaCheck = SchemaCheckOk | SchemaCheckKo;

export function validateWithSchema(schema: unknown, data: unknown): SchemaCheck {
  if (schema === undefined || schema === null) return { ok: true, value: data };
  const safeParse = (schema as { safeParse?: unknown }).safeParse;
  if (typeof safeParse !== "function") return { ok: true, value: data };

  let result: { success?: boolean; data?: unknown; error?: unknown };
  try {
    result = (safeParse as (value: unknown) => { success?: boolean; data?: unknown; error?: unknown }).call(schema, data);
  } catch (err) {
    return {
      ok: false,
      issues: `validation impossible : ${err instanceof Error ? err.message : "erreur inconnue"}`,
      issueCount: 1,
    };
  }

  if (result && result.success === true) return { ok: true, value: result.data };

  const err = result?.error;
  const rawIssues = (err as { issues?: unknown[] } | undefined)?.issues;
  return {
    ok: false,
    issues: formatZodIssues(err),
    issueCount: Array.isArray(rawIssues) && rawIssues.length > 0 ? rawIssues.length : 1,
  };
}

/** Si le modèle a renvoyé un tableau brut alors que le schéma attend { clé: [...] }. */
export function tryWrapArrayForSchema(data: unknown, schema: unknown): { key: string; value: unknown } | null {
  if (!Array.isArray(data)) return null;
  const shape = schemaShape(schema);
  if (!shape) return null;
  const keys = Object.keys(shape);
  if (keys.length !== 1) return null;
  const only = keys[0];
  if (!only) return null;
  if (typeOfSchema(shape[only]) !== "array") return null;
  return { key: only, value: { [only]: data } };
}

/* ---------------------------------------------------------------------------
   Réparation tolérante : alias de clés + valeurs par défaut
--------------------------------------------------------------------------- */

const FIELD_ALIASES: Record<string, readonly string[]> = {
  nomcomplet: ["nom", "prenom", "fullname", "name"],
  nom: ["nomcomplet", "lastname", "familyname"],
  prenom: ["firstname", "givenname"],
  ville: ["adresse", "city", "localisation", "location", "commune", "pays"],
  lieu: ["adresse", "location", "ville", "city", "commune"],
  adresse: ["ville", "city", "location", "localisation"],
  titre: ["poste", "role", "position", "jobtitle", "intitule", "metier"],
  poste: ["titre", "role", "position", "jobtitle", "metier"],
  entreprise: ["societe", "company", "employeur", "employer", "organisation"],
  societe: ["entreprise", "company", "employeur"],
  resume: ["profil", "summary", "presentation", "objectif", "about"],
  profil: ["resume", "summary", "presentation", "about"],
  competences: ["skills", "stack", "technologies", "tech"],
  skills: ["competences", "stack", "technologies"],
  langues: ["languages", "language"],
  languages: ["langues"],
  email: ["mail", "courriel"],
  telephone: ["tel", "phone", "mobile", "portable"],
  lettermotivation: ["lettre", "motivation", "coverletter"],
  formations: ["formation", "education", "etudes", "studies"],
  experiences: ["experience", "emplois", "jobs", "work"],
  results: ["jobs", "offres", "annonces", "matches", "items", "list", "postings"],
};

function normKey(key: string): string {
  return key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isValueCompatible(value: unknown, kind: SchemaKind): boolean {
  switch (kind) {
    case "string":
    case "enum":
    case "date":
      return typeof value === "string" && value.trim().length > 0;
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value) && value.length > 0;
    case "object":
      return isPlainObject(value);
    case "literal":
      return value !== undefined && value !== null && value !== "";
    default:
      return value !== undefined && value !== null;
  }
}

function trySteal(
  data: Record<string, unknown>,
  targetKey: string,
  targetSchema: unknown
): { value: unknown; from: string } | null {
  const kind = typeOfSchema(targetSchema);
  const targetNorm = normKey(targetKey);
  const aliases = FIELD_ALIASES[targetNorm] ?? [];
  const candidates = Object.keys(data).filter((k) => data[k] !== undefined && data[k] !== null);

  // Passe 1 : égalité normée ou alias explicite
  for (const cand of candidates) {
    const cn = normKey(cand);
    if (cn === targetNorm || aliases.includes(cn)) {
      const value = data[cand];
      if (value !== undefined && isValueCompatible(value, kind)) return { value, from: cand };
    }
  }
  // Passe 2 : inclusion (le nom de la cible contient la clé fournie, ≥ 3 caractères)
  for (const cand of candidates) {
    const cn = normKey(cand);
    if (cn.length >= 3 && targetNorm.length >= 3 && targetNorm.includes(cn)) {
      const value = data[cand];
      if (value !== undefined && isValueCompatible(value, kind)) return { value, from: cand };
    }
  }
  return null;
}

export interface FillResult {
  value: unknown;
  filled: string[];
}

/**
 * Comble les clés manquantes d'une réponse : alias connus (nom → nom_complet,
 * jobs → results…), sinon valeur par défaut du bon type.
 * Les tableaux d'objets de premier niveau ne sont JAMAIS inventés ([] vide
 * ferait croire à une réponse IA vide — on préfère laisser échouer et retenter).
 */
export function fillFromSchema(data: unknown, schema: unknown): FillResult {
  const filled: string[] = [];
  const used = new Set<string>();

  const fillObject = (input: unknown, schemaNode: unknown, path: string, level: number): unknown => {
    const shape = schemaShape(schemaNode);
    if (!shape) return input;
    const base: Record<string, unknown> = isPlainObject(input) ? { ...(input as Record<string, unknown>) } : {};
    const shapeKeys = new Set(Object.keys(shape));

    for (const [key, childSchema] of Object.entries(shape)) {
      const childPath = path ? `${path}.${key}` : key;

      if (base[key] !== undefined) {
        base[key] = mergeExisting(base[key], childSchema, childPath, level);
        continue;
      }

      const stolen = trySteal(base, key, childSchema);
      if (stolen) {
        base[key] = stolen.value;
        used.add(stolen.from);
        if (!shapeKeys.has(stolen.from)) delete base[stolen.from];
        filled.push(`${childPath} ← ${stolen.from}`);
        continue;
      }

      const kind = typeOfSchema(childSchema);
      if (kind === "array") {
        const element = schemaElement(childSchema);
        if (level <= 1 && isPlainObject(unwrapZodLike(element))) continue; // n'invente pas un tableau racine
        base[key] = [];
        filled.push(`${childPath} = []`);
        continue;
      }
      if (kind === "object") {
        base[key] = fillObject({}, childSchema, childPath, level + 1);
        filled.push(`${childPath} = {}`);
        continue;
      }
      if (kind === "enum") {
        const core = unwrapZodLike(childSchema);
        const options = (core as { options?: unknown }).options ?? zodDef(core).values;
        base[key] = Array.isArray(options) && options.length > 0 ? options[0] : "";
        filled.push(`${childPath} = défaut`);
        continue;
      }
      if (kind === "literal") {
        const core = unwrapZodLike(childSchema);
        base[key] = zodDef(core).value ?? (core as { value?: unknown }).value ?? "";
        filled.push(`${childPath} = défaut`);
        continue;
      }
      if (kind === "number") {
        base[key] = 0;
        filled.push(`${childPath} = 0`);
        continue;
      }
      if (kind === "boolean") {
        base[key] = false;
        filled.push(`${childPath} = false`);
        continue;
      }
      base[key] = "";
      filled.push(`${childPath} = ""`);
    }
    return base;
  };

  const mergeExisting = (current: unknown, childSchema: unknown, path: string, level: number): unknown => {
    const kind = typeOfSchema(childSchema);
    if (kind === "object" && isPlainObject(current)) {
      return fillObject(current, childSchema, path, level + 1);
    }
    if (kind === "array" && Array.isArray(current)) {
      const element = schemaElement(childSchema);
      if (isPlainObject(unwrapZodLike(element))) {
        return current.map((item) => (isPlainObject(item) ? fillObject(item, element, path, level + 1) : item));
      }
      return current;
    }
    return current;
  };

  return { value: fillObject(data, schema, "", 1), filled };
}

/* ---------------------------------------------------------------------------
   Prompts de format
--------------------------------------------------------------------------- */

function buildFormatBlock(skeleton: unknown): string {
  if (skeleton === undefined || skeleton === null) {
    return "IMPORTANT : réponds UNIQUEMENT avec un objet JSON valide — aucun texte avant ou après, aucun bloc de code markdown.";
  }
  return [
    "IMPORTANT — FORMAT DE SORTIE OBLIGATOIRE :",
    "Réponds UNIQUEMENT avec un objet JSON valide : aucun texte avant ou après, aucun bloc de code markdown, aucun commentaire.",
    "La structure EXACTE attendue est la suivante (les placeholders indiquent le type attendu) :",
    JSON.stringify(skeleton, null, 2),
    "Règles impératives :",
    '- Respecte EXACTEMENT les noms de clés (casse, accents, underscores) : ne renomme jamais une clé et n\'en invente pas d\'autres.',
    '- "<texte>" signifie une chaîne de caractères ; 0 un nombre ; true un booléen ; [...] un tableau ; {...} un objet ; "AAAA-MM-JJ" une date ISO.',
    '- Ne supprime AUCUNE clé : si l\'information manque, mets "" (chaîne vide) ou [] (tableau vide) plutôt que d\'omettre la clé.',
    "- Interdit : virgule finale, texte hors du JSON, explications.",
  ].join("\n");
}

function buildRetryPrompt(basePrompt: string, lastMessage: string, skeleton: unknown): string {
  const truncated = lastMessage.toLowerCase().includes("tronqu");
  const lines = [
    basePrompt.trimEnd(),
    "",
    `⚠️ TA RÉPONSE PRÉCÉDENTE A ÉTÉ REJETÉE. Cause exacte : ${truncated ? "réponse TRONQUÉE — trop longue" : lastMessage}.`,
    truncated
      ? "Recommence en étant NETTEMENT PLUS CONCIS : raccourcis chaque texte et résume les descriptions, mais garde TOUTES les clés demandées."
      : "Renvoie UNIQUEMENT l'objet JSON complet corrigé, sans texte avant ni après, en respectant EXACTEMENT les clés et types attendus.",
  ];
  if (skeleton !== undefined) lines.push("Rappel de la structure EXACTE attendue :", JSON.stringify(skeleton, null, 2));
  return lines.join("\n");
}

/* ---------------------------------------------------------------------------
   Erreurs provider (SDK Vercel AI) → codes internes
--------------------------------------------------------------------------- */

function readNumberProp(source: unknown, key: string): number | undefined {
  if (!isPlainObject(source)) return undefined;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStatusCode(err: unknown, guard = 0): number | undefined {
  const direct = readNumberProp(err, "statusCode") ?? readNumberProp(err, "status");
  if (direct !== undefined) return direct;
  if (guard > 3 || !isPlainObject(err)) return undefined;
  const errors = (err as { errors?: unknown }).errors;
  if (Array.isArray(errors)) {
    for (const sub of errors.slice(-2)) {
      const found = readStatusCode(sub, guard + 1);
      if (found !== undefined) return found;
    }
  }
  const cause = (err as { cause?: unknown }).cause;
  if (cause) {
    const found = readStatusCode(cause, guard + 1);
    if (found !== undefined) return found;
  }
  const lastError = (err as { lastError?: unknown }).lastError;
  if (lastError) return readStatusCode(lastError, guard + 1);
  return undefined;
}

function parseDurationSeconds(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (/^[0-9.]+$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : undefined;
  }
  let total = 0;
  let matched = false;
  const regex = /([0-9.]+)\s*(ms|s|m|h)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(trimmed)) !== null) {
    const rawNum = match[1];
    const unit = match[2];
    if (rawNum === undefined || unit === undefined) continue;
    const num = Number(rawNum);
    if (!Number.isFinite(num)) continue;
    matched = true;
    if (unit === "ms") total += num / 1000;
    else if (unit === "s") total += num;
    else if (unit === "m") total += num * 60;
    else total += num * 3600;
  }
  return matched && total > 0 ? total : undefined;
}

function readHeaders(err: unknown): Record<string, unknown> | null {
  const queue: unknown[] = [err];
  let guard = 0;
  while (queue.length > 0 && guard < 12) {
    guard += 1;
    const current = queue.shift();
    if (!isPlainObject(current)) continue;
    const headers = (current as { responseHeaders?: unknown }).responseHeaders;
    if (isPlainObject(headers)) return headers as Record<string, unknown>;
    const nested = (current as { errors?: unknown }).errors;
    if (Array.isArray(nested)) queue.push(...nested.slice(0, 4));
    const cause = (current as { cause?: unknown }).cause;
    if (cause) queue.push(cause);
    const lastError = (current as { lastError?: unknown }).lastError;
    if (lastError) queue.push(lastError);
  }
  return null;
}

function extractRetryAfterMs(err: unknown, message: string): number | undefined {
  const headers = readHeaders(err);
  if (headers) {
    const retryAfter = headers["retry-after"] ?? headers["Retry-After"];
    const seconds = parseDurationSeconds(retryAfter);
    if (seconds !== undefined) return Math.min(seconds * 1000, 15_000);
    const reset = headers["x-ratelimit-reset-tokens"] ?? headers["x-ratelimit-reset-requests"];
    const resetSeconds = parseDurationSeconds(reset);
    if (resetSeconds !== undefined) return Math.min(resetSeconds * 1000, 15_000);
  }
  const m = message.match(/try again in ([0-9.]+)\s*(ms|s|seconds?)/i);
  if (m && m[1] !== undefined && m[2] !== undefined) {
    const value = Number(m[1]);
    if (Number.isFinite(value)) {
      return Math.min(m[2].toLowerCase().startsWith("ms") ? value : value * 1000, 15_000);
    }
  }
  return undefined;
}

interface MappedProviderError {
  code: GroqErrorCode;
  message: string;
  retryAfterMs?: number;
}

function mapProviderError(err: unknown): MappedProviderError {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const lower = rawMessage.toLowerCase();
  const status = readStatusCode(err);
  const retryAfterMs = extractRetryAfterMs(err, rawMessage);

  if (status === 401 || status === 403 || lower.includes("api key") || lower.includes("unauthorized") || lower.includes("forbidden")) {
    return {
      code: "AUTH",
      message: "Clé refusée par Groq — génère une nouvelle clé sur console.groq.com/keys et remplace GROQ_API_KEY dans .env.local.",
      retryAfterMs,
    };
  }
  if (status === 429 || lower.includes("rate limit") || lower.includes("too large") || lower.includes("otpm") || lower.includes("tpm") || lower.includes("quota")) {
    return { code: "RATE_LIMIT", message: rawMessage, retryAfterMs };
  }
  if (status === 404 || /decommission|deprecat|retired|not found|unknown model|does not exist|no longer|unsupported model/i.test(rawMessage)) {
    return { code: "MODEL", message: "Modèle indisponible ou décommissionné — passage au modèle suivant.", retryAfterMs };
  }
  if (status === 408 || lower.includes("timeout") || lower.includes("timed out") || lower.includes("aborted") || lower.includes("abort")) {
    return { code: "NETWORK", message: "Délai dépassé ou appel interrompu.", retryAfterMs };
  }
  return { code: "UNKNOWN", message: rawMessage, retryAfterMs };
}

/* ---------------------------------------------------------------------------
   Types publics
--------------------------------------------------------------------------- */

export interface GenerateStructuredOptions {
  system?: string;
  prompt?: string;
  schema?: unknown;
  messages?: Array<{ role?: string; content?: unknown }>;
  model?: string;
  modelId?: string;
  preferredModel?: string;
  temperature?: number;
  maxTokens?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  /** Budget temps global de l'appel (défaut 55 000 ms — compatible Vercel Hobby). */
  budgetMs?: number;
  attemptsPerModel?: number;
  retries?: number;
  [key: string]: unknown;
}

export interface StructuredResult<T = unknown> {
  /** JSON final sérialisé (toujours parsable). */
  text: string;
  /** Réponse brute du modèle. */
  raw: string;
  /** Objet validé par le schéma. */
  object: T;
  /** Alias de object. */
  data: T;
  model: string;
  attempts: number;
  /** true si des champs ont été comblés par alias/valeurs par défaut. */
  repaired: boolean;
  missingFields: string[];
  [key: string]: unknown;
}

function buildResult<T>(
  text: string,
  raw: string,
  value: T,
  model: string,
  attempts: number,
  repaired: boolean,
  missingFields: string[],
  wrappedKey?: string
): StructuredResult<T> {
  const meta: StructuredResult<T> = {
    text,
    raw,
    object: value,
    data: value,
    model,
    attempts,
    repaired,
    missingFields,
    ...(wrappedKey ? { wrappedKey } : {}),
  };
  if (isPlainObject(value)) {
    // Le contenu est étalé au premier niveau : `const { results } = résultat`,
    // `const { identite } = résultat` ou `const { text } = résultat` marchent tous.
    return { ...(value as Record<string, unknown>), ...meta } as StructuredResult<T>;
  }
  return meta;
}

/* ---------------------------------------------------------------------------
   Normalisation des arguments (accepte plusieurs formes d'appel)
--------------------------------------------------------------------------- */

function normalizeArgs(arg1: unknown, arg2: unknown, arg3: unknown): GenerateStructuredOptions {
  if (typeof arg1 === "string") {
    if (typeof arg2 === "string") return { system: arg1, prompt: arg2, schema: arg3 };
    return { prompt: arg1 };
  }
  if (isPlainObject(arg1)) {
    const merged: GenerateStructuredOptions = { ...(arg1 as GenerateStructuredOptions) };
    if (arg2 !== undefined && merged.schema === undefined) merged.schema = arg2;
    if (arg3 !== undefined && merged.schema === undefined) merged.schema = arg3;
    if (!merged.prompt && Array.isArray(merged.messages)) {
      const parts: string[] = [];
      for (const message of merged.messages) {
        if (message && typeof message.content === "string") {
          parts.push(`${typeof message.role === "string" ? message.role : "user"}: ${message.content}`);
        }
      }
      if (parts.length > 0) merged.prompt = parts.join("\n\n");
    }
    return merged;
  }
  return {};
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/* ---------------------------------------------------------------------------
   generateStructured — génération structurée avec chaîne de modèles
--------------------------------------------------------------------------- */

export async function generateStructured<T = unknown>(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: unknown
): Promise<StructuredResult<T>> {
  const opts = normalizeArgs(arg1, arg2, arg3);
  const schema: unknown = opts.schema;
  const prompt = typeof opts.prompt === "string" ? opts.prompt : "";
  const system = typeof opts.system === "string" ? opts.system.trim() : "";

  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new GroqError(
      "GROQ_NO_KEY",
      "Clé IA absente : ajoute GROQ_API_KEY=gsk_... dans .env.local puis redémarre le serveur (npm run dev)."
    );
  }

  const chain = getGroqModelChain(firstString(opts.model, opts.modelId, opts.preferredModel));
  const budgetMs = numberOr(opts.budgetMs, 55_000);
  const deadline = Date.now() + budgetMs;
  const attemptsPerModel = Math.max(1, opts.attemptsPerModel ?? (opts.retries !== undefined ? opts.retries + 1 : 2));
  const timeoutMsDefault = numberOr(opts.timeoutMs, 40_000);
  const wantedTokens = numberOr(opts.maxTokens ?? opts.maxOutputTokens, 6000);
  const temperature = numberOr(opts.temperature, 0.4);

  const skeleton = schema ? safeSkeleton(schema) : undefined;
  const formatBlock = buildFormatBlock(skeleton);
  const systemFull = [system, formatBlock].filter(Boolean).join("\n\n") || undefined;

  console.info(
    `[ai] chaîne de modèles : ${chain.join(" → ")} — budget ${Math.round(budgetMs / 1000)}s, ${attemptsPerModel} tentative(s)/modèle`
  );

  const provider = createGroq({ apiKey });

  let lastCode: GroqErrorCode = "UNKNOWN";
  let lastMessage = "aucune réponse exploitable";
  let bestAttempt: { value: unknown; raw: string; model: string } | null = null;
  let truncatedFallback: { value: unknown; raw: string; model: string } | null = null;

  const fail = (): never => {
    throw new GroqError(
      lastCode,
      `La génération IA a échoué après vérification de ${chain.length} modèle(s) (${chain.join(" → ")}). Dernière cause : ${lastMessage}`
    );
  };

  for (const model of chain) {
    const cap = MODEL_OUTPUT_TOKEN_CAPS[model] ?? 8000;
    if (wantedTokens > MIN_VIABLE_OUTPUT_TOKENS && cap < MIN_VIABLE_OUTPUT_TOKENS) {
      console.warn(
        `[ai] ${model} — ignoré : ce modèle ne peut produire que ${cap} tokens de sortie (plafond free tier), insuffisant pour ${wantedTokens} tokens demandés.`
      );
      continue;
    }
    const outputTokens = Math.min(wantedTokens, cap);
    let rateLimitWaits = 0;

    for (let attempt = 1; attempt <= attemptsPerModel; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 5_000) {
        lastCode = "BUDGET";
        lastMessage = `budget temps global dépassé (${Math.round(budgetMs / 1000)}s)`;
        console.warn(`[ai] ${lastMessage} — arrêt de la chaîne.`);
        fail();
      }
      const timeoutMs = Math.max(3_000, Math.min(timeoutMsDefault, remaining - 1_000));
      const currentPrompt =
        attempt === 1 ? prompt : buildRetryPrompt(prompt, lastMessage, skeleton);

      console.info(
        `[ai] ${model} — tentative ${attempt}/${attemptsPerModel} — max_tokens ${outputTokens}, timeout ${Math.round(timeoutMs / 1000)}s`
      );

      let text = "";
      let finishReason = "unknown";
      let totalTokens: number | undefined;

      try {
        const callSettings: Record<string, unknown> = {
          model: provider(model),
          system: systemFull,
          prompt: currentPrompt,
          temperature,
          maxTokens: outputTokens,
          maxOutputTokens: outputTokens,
          abortSignal:
            typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
              ? AbortSignal.timeout(timeoutMs)
              : undefined,
          maxRetries: 0,
        };
        const response = await generateText(callSettings as unknown as Parameters<typeof generateText>[0]);
        if (typeof response.text === "string") text = response.text;
        if (typeof response.finishReason === "string") finishReason = response.finishReason;
        const usage = (response as { usage?: { totalTokens?: number } }).usage;
        totalTokens = usage?.totalTokens;
      } catch (err) {
        const mapped = mapProviderError(err);
        lastCode = mapped.code;
        lastMessage = `${model} : ${mapped.message}`;
        console.warn(
          `[ai] ${model} — tentative ${attempt}/${attemptsPerModel} — échec (${mapped.code}) : ${mapped.message.slice(0, 240)}`
        );
        if (mapped.code === "AUTH") fail();
        if (mapped.code === "RATE_LIMIT") {
          const wait = mapped.retryAfterMs;
          if (wait !== undefined && wait <= 12_000 && rateLimitWaits < 2) {
            rateLimitWaits += 1;
            console.info(`[ai] ${model} — attente ${Math.round(wait / 100) / 10}s puis nouvelle tentative`);
            await sleep(wait + 250);
            attempt -= 1;
            continue;
          }
          break; // modèle suivant
        }
        if (mapped.code === "MODEL") break; // modèle suivant
        if (attempt < attemptsPerModel) {
          await sleep(1_200 * attempt);
          continue;
        }
        break; // modèle suivant
      }

      console.info(
        `[ai] réponse reçue via ${model} (${finishReason}${typeof totalTokens === "number" ? `, ${totalTokens} tokens` : ""})`
      );

      if (!text.trim()) {
        lastCode = "UNKNOWN";
        lastMessage = `${model} : réponse vide`;
        console.warn(`[ai] ${model} — tentative ${attempt}/${attemptsPerModel} — réponse vide`);
        continue;
      }

      let parsed: unknown;
      let parseTruncated = false;
      try {
        const detailed = parseJsonLooseDetailed<unknown>(text);
        parsed = detailed.value;
        parseTruncated = detailed.truncated;
      } catch (err) {
        lastCode = "BAD_JSON";
        lastMessage =
          finishReason === "length"
            ? `${model} : réponse TRONQUÉE (finish_reason=length) et JSON irrécupérable`
            : `${model} : ${err instanceof Error ? err.message : "JSON illisible"}`;
        console.warn(`[ai] ${model} — tentative ${attempt}/${attemptsPerModel} — échec : ${lastMessage}`);
        continue;
      }

      const isTruncatedResponse = parseTruncated && finishReason === "length";

      if (!schema) {
        if (isTruncatedResponse) {
          console.warn("[ai] ⚠️ réponse tronquée (finish_reason=length) acceptée : le contenu peut être incomplet.");
        }
        return buildResult<T>(JSON.stringify(parsed, null, 2), text, parsed as T, model, attempt, false, [], undefined);
      }

      let candidateValue = parsed;
      let wrappedKey: string | undefined;
      const wrapped = tryWrapArrayForSchema(candidateValue, schema);
      if (wrapped) {
        console.info(`[ai] réponse enveloppée sous la clé "${wrapped.key}" (le modèle avait renvoyé un tableau brut)`);
        candidateValue = wrapped.value;
        wrappedKey = wrapped.key;
      }

      const strict = validateWithSchema(schema, candidateValue);
      if (strict.ok) {
        if (isTruncatedResponse && attempt < attemptsPerModel) {
          truncatedFallback = { value: candidateValue, raw: text, model };
          lastCode = "BAD_JSON";
          lastMessage = `${model} : réponse TRONQUÉE (finish_reason=length) — JSON récupéré mais probablement incomplet`;
          console.warn(`[ai] ${model} — tentative ${attempt}/${attemptsPerModel} — ${lastMessage} → nouvelle tentative plus concise`);
          continue;
        }
        if (isTruncatedResponse) {
          console.warn("[ai] ⚠️ réponse tronquée acceptée en dernier recours : le contenu peut être incomplet.");
        }
        return buildResult<T>(JSON.stringify(candidateValue, null, 2), text, candidateValue as T, model, attempt, false, [], wrappedKey);
      }

      if (isPlainObject(candidateValue)) {
        const patched = fillFromSchema(candidateValue, schema);
        if (patched.filled.length > 0) {
          const recheck = validateWithSchema(schema, patched.value);
          if (recheck.ok) {
            // Alias seuls (vraies données déplacées) → accepté immédiatement.
            // Valeurs par défaut (""/0/[]) → on préfère une nouvelle tentative pour
            // obtenir de vraies valeurs ; la version comblée reste en filet.
            const needsDefaults = patched.filled.some((entry) => entry.includes(" = "));
            if (needsDefaults && attempt < attemptsPerModel) {
              bestAttempt = { value: patched.value, raw: text, model };
              lastCode = "SCHEMA";
              lastMessage = `${model} : JSON non conforme au schéma — ${strict.issues}`;
              console.warn(
                `[ai] ${model} — champs manquants comblés par défaut (${patched.filled.join(", ")}) → nouvelle tentative pour de vraies valeurs`
              );
              continue;
            }
            console.warn(
              `[ai] ${model} — schéma complété via alias${needsDefaults ? "/valeurs par défaut" : ""} : ${patched.filled.join(", ")}`
            );
            return buildResult<T>(
              JSON.stringify(patched.value, null, 2),
              text,
              patched.value as T,
              model,
              attempt,
              true,
              patched.filled,
              wrappedKey
            );
          }
        }
      }

      if (!bestAttempt) bestAttempt = { value: candidateValue, raw: text, model };
      lastCode = "SCHEMA";
      lastMessage = `${model} : JSON non conforme au schéma — ${strict.issues}`;
      console.warn(
        `[ai] ${model} — tentative ${attempt}/${attemptsPerModel} — JSON non conforme au schéma : ${strict.issues.slice(0, 320)}`
      );
    }
  }

  if (bestAttempt) {
    const patched = fillFromSchema(bestAttempt.value, schema);
    const recheck = validateWithSchema(schema, patched.value);
    if (recheck.ok) {
      console.warn(
        `[ai] dernier recours — schéma complété depuis la meilleure réponse (${bestAttempt.model}) : ${patched.filled.join(", ")}`
      );
      return buildResult<T>(
        JSON.stringify(patched.value, null, 2),
        bestAttempt.raw,
        patched.value as T,
        bestAttempt.model,
        attemptsPerModel,
        true,
        patched.filled,
        undefined
      );
    }
  }

  if (truncatedFallback) {
    const recheck = validateWithSchema(schema, truncatedFallback.value);
    if (recheck.ok) {
      console.warn(
        `[ai] dernier recours — réponse tronquée acceptée (${truncatedFallback.model}) : le contenu peut être incomplet.`
      );
      return buildResult<T>(
        JSON.stringify(truncatedFallback.value, null, 2),
        truncatedFallback.raw,
        truncatedFallback.value as T,
        truncatedFallback.model,
        attemptsPerModel,
        false,
        [],
        undefined
      );
    }
  }

  throw new GroqError(
    lastCode,
    `La génération IA a échoué après vérification de ${chain.length} modèle(s) (${chain.join(" → ")}). Dernière cause : ${lastMessage}`
  );
}