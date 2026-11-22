// ===========================================================================
// NexiRole - Route de diagnostic TEMPORAIRE (LECTURE SEULE) - 2026-11-22
// ---------------------------------------------------------------------------
// But: expliquer pourquoi le CV public ne s'affiche plus en entier.
// Compare les donnees brutes de la base (PublicResume.cvData) avec la sortie
// du pipeline normalizeCv (normalizeCvBase + enrichCv) et detecte:
//   - les champs perdus entre les donnees brutes et le CV normalise
//   - les chaines "[object Object]" (bug Langues deja rencontre)
//   - l'import manquant de enrichCv dans cv-normalize.ts
// Cette route ne fait AUCUNE ecriture: uniquement des SELECT (lecture) et
// des fonctions pures. Le client Prisma est le singleton @/lib/prisma.
// Desactivee automatiquement en production (NODE_ENV=production).
// Suppression apres diagnostic:
//   Remove-Item -Recurse -Force "src\app\api\diagnostic-cv"
// ===========================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeCv, normalizeCvBase, extractTheme } from "@/lib/cv-normalize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Dict = Record<string, unknown>;
type ArrayRef = { key: string; length: number };
type PrismaLike = typeof prisma;

const NO_STORE: Record<string, string> = { "Cache-Control": "no-store" };

// ------------------------- utilitaires generaux ----------------------------

function isDict(v: unknown): v is Dict {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function msg(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return String(e);
}

function qident(name: string): string {
  return '"' + name.replace(/"/g, "") + '"';
}

function safeIdent(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function singular(k: string): string {
  return k.toLowerCase().replace(/ies$/, "y").replace(/s$/, "");
}

function stringifySafe(v: unknown, maxLen: number): string {
  let s: string;
  try {
    s = JSON.stringify(v, (_k, val: unknown) => (typeof val === "bigint" ? String(val) : val));
  } catch (e) {
    return '"[non serialisable: ' + msg(e) + ']"';
  }
  if (s.length > maxLen) return s.slice(0, maxLen) + "...[tronque]";
  return s;
}

// ------------------ nettoyage avant serialisation JSON ---------------------

function sanitize(v: unknown, depth?: number): unknown {
  const d = depth ?? 0;
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null && typeof (v as Dict).toJSON === "function") return v;
  if (v instanceof Uint8Array) return "<" + v.length + " octets>";
  if (Array.isArray(v)) return d >= 8 ? ["..."] : v.map((x) => sanitize(x, d + 1));
  if (isDict(v)) {
    if (d >= 8) return { profondeurMax: true };
    const out: Dict = {};
    for (const [k, val] of Object.entries(v)) out[k] = sanitize(val, d + 1);
    return out;
  }
  return v;
}

// ----------------------- resume structurel ---------------------------------

function summarize(v: unknown, depth?: number): unknown {
  const d = depth ?? 0;
  if (typeof v === "string") {
    return {
      type: "string",
      longueur: v.length,
      apercu: v.length > 140 ? v.slice(0, 140) + "..." : v,
      objectObject: v.indexOf("[object Object]") !== -1,
    };
  }
  if (typeof v === "number" || typeof v === "boolean" || v === null || v === undefined) {
    return { type: v === null ? "null" : v === undefined ? "undefined" : typeof v, valeur: v };
  }
  if (Array.isArray(v)) {
    return { type: "array", longueur: v.length, elements: v.slice(0, 3).map((x) => summarize(x, d + 1)) };
  }
  if (isDict(v)) {
    if (d >= 5) return { type: "object", cles: Object.keys(v).length };
    const out: Dict = { type: "object" };
    for (const [k, val] of Object.entries(v)) out[k] = summarize(val, d + 1);
    return out;
  }
  return { type: typeof v };
}

// ------------- analyse: ecarts entre deux resumes structurels --------------

function collectArrays(v: unknown, path: string, out: ArrayRef[]): void {
  if (!isDict(v)) return;
  if (String(v.type) === "array" && typeof v.longueur === "number") {
    if (path.indexOf("[") === -1) out.push({ key: path || "(racine)", length: v.longueur });
    const elements = v.elements;
    if (Array.isArray(elements)) elements.forEach((it, i) => collectArrays(it, path + "[" + i + "]", out));
    return;
  }
  for (const [k, val] of Object.entries(v)) collectArrays(val, path ? path + "." + k : k, out);
}

function compareSummaries(rawSide: unknown, normalizedSide: unknown, issues: string[], notes: string[]): void {
  if (!isDict(rawSide) || !isDict(normalizedSide)) return;
  const rawArrays: ArrayRef[] = [];
  collectArrays(rawSide, "", rawArrays);
  const normArrays: ArrayRef[] = [];
  collectArrays(normalizedSide, "", normArrays);
  const usedRaw = new Set<string>();
  for (const w of normArrays) {
    let fuzzy = false;
    let match = rawArrays.find((r) => !usedRaw.has(r.key) && (r.key === w.key || singular(r.key) === singular(w.key)));
    if (!match) {
      fuzzy = true;
      match = rawArrays.find((r) => !usedRaw.has(r.key) && (r.key.indexOf(w.key) !== -1 || w.key.indexOf(r.key) !== -1));
    }
    if (!match) {
      notes.push("Champ normalise '" + w.key + "' (" + w.length + " element(s)) sans equivalent brut detecte.");
      continue;
    }
    usedRaw.add(match.key);
    const tag = fuzzy ? " (correspondance approximative)" : "";
    if (w.length < match.length) {
      issues.push("PERTE" + tag + ": '" + w.key + "' = " + w.length + " element(s) apres normalisation contre " + match.length + " en brut ('" + match.key + "').");
    } else if (w.length > match.length) {
      notes.push("'" + w.key + "': " + w.length + " element(s) apres normalisation contre " + match.length + " en brut" + tag + " (elements derives/ajoutes).");
    }
  }
}

// --------------------- detection "[object Object]" --------------------------

function collectObjectObject(v: unknown, path: string, out: string[]): void {
  if (typeof v === "string") {
    if (v.indexOf("[object Object]") !== -1) out.push(path || "(racine)");
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => collectObjectObject(x, path + "[" + i + "]", out));
    return;
  }
  if (isDict(v)) {
    for (const [k, val] of Object.entries(v)) collectObjectObject(val, path ? path + "." + k : k, out);
  }
}

// -------------------------- collecte du rapport -----------------------------

async function collect(db: PrismaLike, slug: string, report: Dict, issues: string[], notes: string[]): Promise<void> {
  let rowRaw: Dict | null = null;
  let tableLabel = "";

  // --- voie rapide: delegate prisma.publicResume (modele du schema) ---
  const delegates = db as unknown as Dict;
  const publicResumeDelegate = delegates.publicResume;
  if (isDict(publicResumeDelegate) && typeof publicResumeDelegate.findUnique === "function") {
    try {
      const findUnique = publicResumeDelegate.findUnique as (args: { where: { slug: string } }) => Promise<unknown>;
      const found = await findUnique({ where: { slug: slug } });
      if (isDict(found)) {
        rowRaw = found;
        tableLabel = "PublicResume (via prisma.publicResume.findUnique)";
        report.voieUtilisee = "delegate publicResume";
      }
    } catch (e) {
      notes.push("prisma.publicResume.findUnique a echoue: " + msg(e) + " -> passage en recherche generique.");
    }
  }

  // --- voie generique: introspection information_schema (SELECT) ---
  if (!rowRaw) {
    const colRows = (await db.$queryRawUnsafe(
      "SELECT table_schema, table_name, column_name, data_type FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')"
    )) as unknown as Dict[];

    type TableInfo = { schema: string; name: string; columns: { name: string; type: string }[] };
    const tables = new Map<string, TableInfo>();
    for (const r of colRows) {
      if (!isDict(r)) continue;
      const schema = String(r.table_schema ?? "");
      const tname = String(r.table_name ?? "");
      const cname = String(r.column_name ?? "");
      const dtype = String(r.data_type ?? "");
      if (!schema || !tname || !cname) continue;
      const key = schema + "." + tname;
      let t = tables.get(key);
      if (!t) {
        t = { schema: schema, name: tname, columns: [] };
        tables.set(key, t);
      }
      t.columns.push({ name: cname, type: dtype });
    }
    report.tablesTotal = tables.size;

    type Candidate = { key: string; schema: string; name: string; slugCol: string; priority: number };
    const candidates: Candidate[] = [];
    for (const [key, t] of tables) {
      const slugCol = t.columns.find((c) => c.name.toLowerCase() === "slug" || c.name.toLowerCase().endsWith("slug"));
      if (!slugCol) continue;
      candidates.push({ key: key, schema: t.schema, name: t.name, slugCol: slugCol.name, priority: /cv|profile|public/i.test(t.name) ? 0 : 1 });
    }
    candidates.sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
    report.tablesAvecSlug = candidates.map((c) => c.key);

    const recherche: Dict[] = [];
    for (const c of candidates.slice(0, 6)) {
      if (!safeIdent(c.schema) || !safeIdent(c.name) || !safeIdent(c.slugCol)) {
        recherche.push({ table: c.key, statut: "ignoree (identifiant SQL non standard)" });
        continue;
      }
      const t = tables.get(c.key);
      if (!t) continue;
      const colList = t.columns.filter((col) => safeIdent(col.name)).map((col) => qident(col.name)).join(", ");
      if (!colList) {
        recherche.push({ table: c.key, statut: "ignoree (aucune colonne exploitable)" });
        continue;
      }
      const sql = "SELECT " + colList + " FROM " + qident(c.schema) + "." + qident(c.name) + " WHERE " + qident(c.slugCol) + " = $1 LIMIT 2";
      try {
        const rows = (await db.$queryRawUnsafe(sql, slug)) as unknown as Dict[];
        recherche.push({ table: c.key, lignes: rows.length });
        if (rows.length > 0 && !rowRaw) {
          rowRaw = rows[0];
          tableLabel = c.key + " (via SELECT generique)";
          report.voieUtilisee = "SELECT generique";
        }
      } catch (e) {
        recherche.push({ table: c.key, erreur: msg(e) });
      }
    }
    report.recherche = recherche;
  }

  if (!rowRaw) {
    issues.push("Aucune ligne trouvee pour le slug '" + slug + "'.");
    return;
  }

  // --- identification de la colonne de donnees du CV ---
  const rowClean = sanitize(rowRaw) as Dict;
  report.table = tableLabel;
  report.ligne = summarize(rowClean);
  const objectCols = Object.keys(rowClean).filter((k) => isDict(rowClean[k]) || Array.isArray(rowClean[k]));
  let dataCol: string | null = null;
  if (objectCols.indexOf("cvData") !== -1) {
    dataCol = "cvData";
  } else {
    const preferred = objectCols.find((k) => /cv|data|content|payload|profil/i.test(k));
    dataCol = preferred || (objectCols.length === 1 ? objectCols[0] : null);
  }
  let dataVal: unknown = rowClean;
  if (dataCol) {
    dataVal = rowClean[dataCol];
    report.colonneDonnees = dataCol;
  } else {
    notes.push("Aucune colonne objet detectee dans la ligne: la ligne entiere est passee au pipeline.");
  }
  report.donneesBrutes = summarize(dataVal);
  report.donneesBrutesJson = stringifySafe(dataVal, 30000);

  // --- test du pipeline normalizeCv (normalizeCvBase + enrichCv) ---
  const pipeline: Dict = {};
  let baseObj: unknown = null;
  let wrapperObj: unknown = null;
  try {
    baseObj = normalizeCvBase(dataVal);
    pipeline.base = summarize(baseObj);
    pipeline.baseJson = stringifySafe(baseObj, 20000);
  } catch (e) {
    pipeline.baseErreur = msg(e);
    issues.push("normalizeCvBase a echoue: " + msg(e));
  }
  try {
    wrapperObj = normalizeCv(dataVal);
    pipeline.wrapper = summarize(wrapperObj);
    pipeline.wrapperJson = stringifySafe(wrapperObj, 20000);
  } catch (e) {
    const m = msg(e);
    pipeline.wrapperErreur = m;
    if (m.indexOf("enrichCv") !== -1) {
      issues.push("IMPORT MANQUANT: 'enrichCv is not defined' -> l'import de @/lib/cv-enrich manque dans src/lib/cv-normalize.ts (l'installateur l'ajoute automatiquement a l'etape 1).");
    } else {
      issues.push("normalizeCv (wrapper enrichi) a echoue: " + m);
    }
  }
  try {
    let templateColumn: string | null = null;
    for (const [k, val] of Object.entries(rowClean)) {
      if (typeof val === "string" && /template/i.test(k)) {
        templateColumn = val;
        break;
      }
    }
    pipeline.theme = extractTheme(dataVal, templateColumn);
  } catch (e) {
    pipeline.themeErreur = msg(e);
  }
  report.pipeline = pipeline;

  // --- ecarts base -> wrapper (effet de enrichCv) et brut -> base ---
  compareSummaries(pipeline.base, pipeline.wrapper, issues, notes);
  const ecartsBrut: string[] = [];
  compareSummaries(report.donneesBrutes, pipeline.base, ecartsBrut, []);
  if (ecartsBrut.length > 0) notes.push("Ecart brut -> normalizeCvBase: " + ecartsBrut.join(" | "));

  // --- detection de "[object Object]" ---
  const ooBrut: string[] = [];
  collectObjectObject(dataVal, "", ooBrut);
  if (ooBrut.length > 0) notes.push("[object Object] present dans les DONNEES BRUTES aux chemins: " + ooBrut.slice(0, 8).join(", "));
  const ooBase: string[] = [];
  collectObjectObject(baseObj, "", ooBase);
  if (ooBase.length > 0) notes.push("[object Object] deja present apres normalizeCvBase aux chemins: " + ooBase.slice(0, 8).join(", "));
  const ooWrapper: string[] = [];
  collectObjectObject(wrapperObj, "", ooWrapper);
  if (ooWrapper.length > 0) issues.push("[object Object] present dans le CV NORMALISE aux chemins: " + ooWrapper.slice(0, 8).join(", ") + " -> cause probable de l'affichage casse.");
}

// --------------------------------- GET --------------------------------------

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, erreur: "Route de diagnostic desactivee en production." }, { status: 404, headers: NO_STORE });
  }
  const url = new URL(request.url);
  const slug = (url.searchParams.get("slug") || "").trim();
  if (!slug || slug.length > 80 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug)) {
    return NextResponse.json({ ok: false, erreur: "Parametre slug invalide. Exemple: ?slug=kouton-clement" }, { status: 400, headers: NO_STORE });
  }

  const report: Dict = { ok: false, date: new Date().toISOString(), slug: slug, lectureSeule: true };
  const issues: string[] = [];
  const notes: string[] = [];

  const MAX_ESSAIS = 2;
  let termine = false;
  for (let essai = 1; essai <= MAX_ESSAIS && !termine; essai++) {
    try {
      issues.length = 0;
      notes.length = 0;
      await collect(prisma, slug, report, issues, notes);
      termine = true;
      delete report.erreurDb;
    } catch (e) {
      report.erreurDb = msg(e);
      if (essai < MAX_ESSAIS) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
  if (!termine) {
    notes.push("Echec apres " + MAX_ESSAIS + " tentatives. " + String(report.erreurDb || ""));
  }
  report.ok = termine;
  report.issues = issues;
  report.notes = notes;

  return NextResponse.json(report, { status: termine ? 200 : 500, headers: NO_STORE });
}