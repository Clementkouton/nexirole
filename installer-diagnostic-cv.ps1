# =============================================================================
# NexiRole - Installation du diagnostic du CV public (2026-11-22)
# =============================================================================
# Ce script (aucune ecriture en base, aucun fichier ecrase sans sauvegarde):
#   1) Verifie/ajoute l'import enrichCv dans src\lib\cv-normalize.ts (idempotent)
#   2) Cree la route temporaire src\app\api\diagnostic-cv\route.ts
#      (LECTURE SEULE: uniquement des SELECT; desactivee en production)
#   3) Remplace diagnostic-cv-data.cjs par le client HTTP du diagnostic
# =============================================================================

$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
Set-Location $root
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

function Write-Utf8NoBom {
  param([string]$Path, [string]$Content)
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

Write-Host "=== NexiRole - installation du diagnostic du CV public ==="
Write-Host "Dossier: $root"
Write-Host ""

# --- ETAPE 1: import enrichCv dans cv-normalize.ts ---------------------------
$cnPath = Join-Path $root "src\lib\cv-normalize.ts"
if (-not (Test-Path $cnPath)) {
  Write-Host "[ERREUR] fichier introuvable: $cnPath" -ForegroundColor Red
  exit 1
}
if (-not (Test-Path (Join-Path $root "src\lib\cv-enrich.ts"))) {
  Write-Host "[ATTENTION] src\lib\cv-enrich.ts introuvable: l'import enrichCv echouera"
}
$cnText = [System.IO.File]::ReadAllText($cnPath)
if ($cnText -match 'from "@/lib/cv-enrich"') {
  Write-Host "[OK] etape 1: l'import cv-enrich est deja present dans cv-normalize.ts (rien a faire)"
} else {
  Copy-Item $cnPath ($cnPath + ".bak-importdiag-" + $stamp)
  $cnNew = 'import { enrichCv } from "@/lib/cv-enrich";' + "`r`n" + $cnText
  Write-Utf8NoBom -Path $cnPath -Content $cnNew
  Write-Host "[OK] etape 1: import enrichCv ajoute en tete de cv-normalize.ts (sauvegarde .bak-importdiag-$stamp)"
}

# --- ETAPE 2: route de diagnostic (lecture seule) ----------------------------
if (-not (Test-Path (Join-Path $root "src\generated\prisma"))) {
  Write-Host "[ATTENTION] src\generated\prisma introuvable: lancez 'npx prisma generate' avant de tester"
}
$routeDir = Join-Path $root "src\app\api\diagnostic-cv"
$routePath = Join-Path $routeDir "route.ts"
New-Item -ItemType Directory -Force -Path $routeDir | Out-Null
if (Test-Path $routePath) {
  Copy-Item $routePath ($routePath + ".bak-" + $stamp)
  Write-Host "[INFO] etape 2: route existante sauvegardee (.bak-$stamp)"
}
$routeContent = @'
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
'@
Write-Utf8NoBom -Path $routePath -Content $routeContent
Write-Host "[OK] etape 2: route creee: src\app\api\diagnostic-cv\route.ts (lecture seule, desactivee en production)"

# --- ETAPE 3: client HTTP du diagnostic --------------------------------------
$cjsPath = Join-Path $root "diagnostic-cv-data.cjs"
if (Test-Path $cjsPath) {
  Copy-Item $cjsPath ($cjsPath + ".bak-" + $stamp)
  Write-Host "[INFO] etape 3: ancien diagnostic-cv-data.cjs sauvegarde (.bak-$stamp)"
}
$cjsContent = @'
/* =====================================================================
   diagnostic-cv-data.cjs  -  NexiRole  -  LECTURE SEULE (aucune ecriture)
   ---------------------------------------------------------------------
   Pourquoi ce client passe par le serveur dev ?
   Avec Prisma 7 + generateur "prisma-client", le client est genere en
   TypeScript/ESM dans src/generated/prisma: un script .cjs ne peut pas
   le charger via require(), meme apres npx prisma generate.
   La route /api/diagnostic-cv (lecture seule, desactivee en production)
   tourne dans le meme runtime que l'application (singleton @/lib/prisma
   + adapter pg): le diagnostic est donc fiable a 100%.
   ---------------------------------------------------------------------
   La route compare:
     - les donnees brutes PublicResume.cvData (slug kouton-clement)
     - la sortie de normalizeCvBase et du wrapper normalizeCv (+ enrichCv)
   et detecte: pertes de champs, "[object Object]", import manquant.
   ---------------------------------------------------------------------
   Usage:
     node diagnostic-cv-data.cjs
     node diagnostic-cv-data.cjs http://localhost:3000
     node diagnostic-cv-data.cjs http://localhost:3000 mon-slug
   Pre-requis: le serveur dev doit tourner (npm run dev).
   ===================================================================== */
"use strict";

const fs = require("fs");

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");
const SLUG = process.argv[3] || "kouton-clement";
const SECTION_WORDS = ["Experience", "Formation", "Langues", "Competences", "Projets", "Certifications"];

function stripAccents(s) {
  return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function hr(title) {
  console.log("");
  console.log("=== " + title + " " + "=".repeat(Math.max(1, 62 - title.length)));
}

function msg(e) {
  return e && e.message ? String(e.message) : String(e);
}

function printCounts(label, obj) {
  if (!obj || typeof obj !== "object") return;
  Object.keys(obj).forEach(function (k) {
    if (k === "type" || k === "elements") return;
    const v = obj[k];
    if (v && v.type === "array") console.log("  " + label + " - " + k + ": " + v.longueur + " element(s)");
    else if (v && v.type === "string") console.log("  " + label + " - " + k + ": string(" + v.longueur + ")");
  });
}

function saveRaw(endpoint, status, text) {
  try {
    fs.writeFileSync("diagnostic-cv-resultat.json", JSON.stringify({ endpoint: endpoint, status: status, body: String(text).slice(0, 4000) }, null, 2), "utf8");
    console.log("[OK] reponse brute sauvegardee: diagnostic-cv-resultat.json");
  } catch (e) {
    /* ignore */
  }
}

async function main() {
  console.log("=== NexiRole - diagnostic du CV public (LECTURE SEULE) ===");
  console.log("base: " + BASE);
  console.log("slug: " + SLUG);

  const endpoint = BASE + "/api/diagnostic-cv?slug=" + encodeURIComponent(SLUG);
  let data = null;
  try {
    const res = await fetch(endpoint, { headers: { Accept: "application/json" } });
    const text = await res.text();
    if (!res.ok) {
      hr("ECHEC HTTP " + res.status);
      console.log(String(text).slice(0, 1200));
      console.log("-> Regardez le terminal du serveur dev (npm run dev): l'erreur y est affichee.");
      saveRaw(endpoint, res.status, text);
      return;
    }
    data = JSON.parse(text);
  } catch (e) {
    hr("SERVEUR INJOIGNABLE");
    console.log("[!] " + msg(e));
    console.log("-> Demarrez d'abord le serveur:  npm run dev");
    console.log("-> Puis relancez:                node diagnostic-cv-data.cjs");
    return;
  }

  hr("PRISMA / BASE DE DONNEES");
  console.log("voie:               " + (data.voieUtilisee || "?"));
  console.log("table analysee:     " + (data.table || "(aucune)"));
  console.log("colonne de donnees: " + (data.colonneDonnees || "(ligne entiere passee au pipeline)"));
  if (data.erreurDb) console.log("[!] DB: " + data.erreurDb);
  if (Array.isArray(data.tablesAvecSlug) && data.tablesAvecSlug.length > 0) {
    console.log("tables candidates:  " + data.tablesAvecSlug.join(", "));
  }
  if (Array.isArray(data.recherche)) {
    data.recherche.forEach(function (r) {
      const etat = r.lignes !== undefined ? r.lignes + " ligne(s)" : r.erreur || r.statut || "?";
      console.log("  - " + r.table + " -> " + etat);
    });
  }

  hr("PIPELINE normalizeCv (normalizeCvBase + enrichCv)");
  const p = data.pipeline || {};
  if (p.baseErreur) console.log("[!] normalizeCvBase: " + p.baseErreur);
  if (p.wrapperErreur) console.log("[!] normalizeCv (wrapper): " + p.wrapperErreur);
  printCounts("brut   (normalizeCvBase)", p.base);
  printCounts("enrichi(normalizeCv)   ", p.wrapper);
  if (p.theme) console.log("theme: " + JSON.stringify(p.theme));

  hr("PROBLEMES DETECTES");
  const issues = Array.isArray(data.issues) ? data.issues : [];
  const notes = Array.isArray(data.notes) ? data.notes : [];
  if (issues.length === 0) console.log("(aucun probleme detecte dans les donnees et le pipeline)");
  issues.forEach(function (x) {
    console.log("[!] " + x);
  });
  notes.forEach(function (x) {
    console.log("(i) " + x);
  });

  hr("PAGE PUBLIQUE /u/" + SLUG);
  try {
    const res2 = await fetch(BASE + "/u/" + encodeURIComponent(SLUG));
    const html = await res2.text();
    const clean = stripAccents(html);
    console.log("HTTP " + res2.status + " - " + html.length + " octets");
    if (html.indexOf("[object Object]") !== -1) console.log("[!] '[object Object]' present dans le HTML rendu");
    if (/Application error/i.test(html) || /Internal Server Error/i.test(html)) console.log("[!] marqueur d'erreur Next detecte dans la page");
    SECTION_WORDS.forEach(function (w) {
      const n = clean.split(w).length - 1;
      if (n > 0) console.log("  - '" + w + "' trouve " + n + " fois");
    });
  } catch (e) {
    console.log("[!] page non testee (" + msg(e) + ")");
  }

  try {
    fs.writeFileSync("diagnostic-cv-resultat.json", JSON.stringify(data, null, 2), "utf8");
    console.log("");
    console.log("[OK] rapport complet sauvegarde: diagnostic-cv-resultat.json");
  } catch (e) {
    console.log("[!] sauvegarde impossible: " + msg(e));
  }

  hr("VERDICT");
  if (issues.length === 0 && !p.wrapperErreur && !p.baseErreur) {
    console.log("[OK] Donnees presentes et pipeline sans perte detectee.");
    console.log("-> Si la page /u/" + SLUG + " reste incomplete, le probleme est dans le rendu (template).");
    console.log("-> Envoyez diagnostic-cv-resultat.json a l'assistant pour la suite.");
  } else {
    console.log("-> Corrigez les points [!] ci-dessus (l'installateur gere deja l'import manquant).");
    console.log("-> Envoyez ensuite diagnostic-cv-resultat.json a l'assistant pour la suite.");
  }
}

main().catch(function (e) {
  console.error("[!] erreur inattendue: " + msg(e));
  process.exitCode = 1;
});
'@
Write-Utf8NoBom -Path $cjsPath -Content $cjsContent
Write-Host "[OK] etape 3: client mis a jour: diagnostic-cv-data.cjs"

Write-Host ""
Write-Host "=== PROTOCOLE DE TEST (localhost:3000) ==="
Write-Host "1) Terminal 1 - serveur dev:   npm run dev"
Write-Host "2) Terminal 2 - diagnostic:    node diagnostic-cv-data.cjs"
Write-Host "3) Ou navigateur:              http://localhost:3000/api/diagnostic-cv?slug=kouton-clement"
Write-Host "4) Rapport complet sauvegarde: diagnostic-cv-resultat.json"
Write-Host ""
Write-Host "Suppression de la route apres diagnostic (optionnel):"
Write-Host '  Remove-Item -Recurse -Force "src\app\api\diagnostic-cv"'
