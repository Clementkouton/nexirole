# =====================================================================
#  reparer-cv-public.ps1  -  NexiRole
#  Objectif : la page publique /u/[slug] n'affiche pas tout le CV
#  (les EXPERIENCES PROFESSIONNELLES disparaissent alors que l'apercu
#  du createur de CV les montre).
#  Methode (conforme AGENTS.md 1.1 / 1.2 / 1.3 / 1.5) :
#    PARTIE 1 - diagnostic en lecture seule :
#               1.A page HTML rendue par le serveur (recensement sections)
#               1.B contenu reellement stocke en base (PublicResume.cvData)
#               1.C code actuel de normalizeCv dans page.tsx + sites d'appel
#    PARTIE 2 - correction chirurgicale (diffs minimaux, sauvegardes) :
#               2.1 nouveau module src/lib/cv-normalize.ts (enrichCv)
#               2.2 page.tsx : normalizeCv renomme en normalizeCvBase + wrapper
#               2.3 api/public-cv/route.ts : normalizeCvForPdf -> Base + wrapper
#               2.4 verification TypeScript (erreurs nouvelles uniquement)
#    PARTIE 3 - protocole de test sur http://localhost:3000
#  Aucune donnee en base n'est modifiee. Backups : *.bak-fixcv-<horodatage>
# =====================================================================

$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$pagePath = Join-Path $root "src\app\u\[slug]\page.tsx"
$apiPath  = Join-Path $root "src\app\api\public-cv\route.ts"
$libPath  = Join-Path $root "src\lib\cv-normalize.ts"
$dumpPath = Join-Path $root "dump-cv-public.cjs"

Write-Host "=== NexiRole - reparation de l'affichage public du CV ==="
if (-not [System.IO.File]::Exists((Join-Path $root "package.json"))) {
  Write-Host "ERREUR: lancez ce script a la racine du projet (package.json introuvable ici)."
  exit 1
}

function Read-FileLines([string]$path) {
  if (-not [System.IO.File]::Exists($path)) { return $null }
  return [System.IO.File]::ReadAllLines($path)
}

function Write-FileText([string]$path, [string]$content) {
  $dir = [System.IO.Path]::GetDirectoryName($path)
  if (-not [System.IO.Directory]::Exists($dir)) {
    [System.IO.Directory]::CreateDirectory($dir) | Out-Null
  }
  [System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))
}

# ---------------------------------------------------------------------
# PARTIE 1 - DIAGNOSTIC (lecture seule)
# ---------------------------------------------------------------------
Write-Host ""
Write-Host "=========== PARTIE 1 - DIAGNOSTIC (lecture seule) ==========="

$pageLines = Read-FileLines $pagePath
if ($pageLines -eq $null) {
  Write-Host "1.C page.tsx INTROUVABLE : $pagePath"
  Write-Host "   -> verifiez le chemin exact et relancez."
} else {
  Write-Host ("1.C page.tsx present - " + $pageLines.Count + " lignes")

  # --- definition de normalizeCv (colonne 0 uniquement : niveau module) ---
  $defIndex = -1
  $defForm = $null
  $nestedHit = $null
  for ($i = 0; $i -lt $pageLines.Count; $i++) {
    if ($pageLines[$i] -match '^(export\s+)?(async\s+)?function\s+normalizeCv\b') { $defIndex = $i; $defForm = "function"; break }
    if ($pageLines[$i] -match '^(export\s+)?(async\s+)?const\s+normalizeCv\b') { $defIndex = $i; $defForm = "const"; break }
    if ($nestedHit -eq $null -and $pageLines[$i] -match '^\s+(export\s+)?(async\s+)?(function|const)\s+normalizeCv\b') { $nestedHit = $i }
  }
  if ($defIndex -ge 0) {
    Write-Host ("   definition normalizeCv trouvee ligne " + ($defIndex + 1) + " (forme: $defForm)")
    $endIndex = -1
    for ($i = $defIndex + 1; $i -lt $pageLines.Count; $i++) {
      if ($pageLines[$i] -match '^\}\s*;?\s*$') { $endIndex = $i; break }
    }
    if ($endIndex -lt 0) { $endIndex = [Math]::Min($defIndex + 70, $pageLines.Count - 1) }
    $cap = [Math]::Min($endIndex, $defIndex + 70)
    for ($i = $defIndex; $i -le $cap; $i++) { Write-Host ("{0,4}: {1}" -f ($i + 1), $pageLines[$i]) }
    if ($endIndex -gt $cap) { Write-Host "   ... (sortie tronquee a 70 lignes)" }
  } else {
    Write-Host "   ATTENTION: normalizeCv introuvable au niveau module dans page.tsx"
    if ($nestedHit -ne $null) { Write-Host ("   (une definition indentee existe ligne " + ($nestedHit + 1) + ")") }
  }

  # --- liste des fonctions niveau module + sites d'appel ---
  Write-Host "--- fonctions de niveau module dans page.tsx ---"
  for ($i = 0; $i -lt $pageLines.Count; $i++) {
    if ($pageLines[$i] -match '^(export\s+)?(async\s+)?function\s+([A-Za-z0-9_]+)') {
      Write-Host ("   ligne " + ($i + 1) + ": " + $Matches[3])
    }
  }
  Write-Host "--- sites d'appel normalizeCv (hors definition) ---"
  for ($i = 0; $i -lt $pageLines.Count; $i++) {
    if ($i -eq $defIndex) { continue }
    if ($pageLines[$i] -match 'normalizeCv\s*\(') { Write-Host ("{0,4}: {1}" -f ($i + 1), $pageLines[$i].Trim()) }
  }

  # --- occurrences 'experience' ---
  Write-Host "--- lignes contenant 'experience' (page.tsx, max 60) ---"
  $shown = 0
  for ($i = 0; $i -lt $pageLines.Count -and $shown -lt 60; $i++) {
    if ($pageLines[$i] -match 'experience') {
      Write-Host ("{0,4}: {1}" -f ($i + 1), $pageLines[$i].Trim())
      $shown++
    }
  }

  # --- titres de sections (marqueurs ASCII pour eviter tout souci d'encodage) ---
  Write-Host "--- titres de sections (RIENCE/TENCES/ANGUES/ORMATION/ROFIL, max 60) ---"
  $shown = 0
  for ($i = 0; $i -lt $pageLines.Count -and $shown -lt 60; $i++) {
    if ($pageLines[$i] -match 'RIENCE|TENCES|ANGUES|ORMATION|ROFIL') {
      Write-Host ("{0,4}: {1}" -f ($i + 1), $pageLines[$i].Trim())
      $shown++
    }
  }
}

$apiLines = Read-FileLines $apiPath
if ($apiLines -eq $null) {
  Write-Host "1.C api/public-cv/route.ts INTROUVABLE : $apiPath"
} else {
  Write-Host "--- occurrences 'experience' (api/public-cv/route.ts, max 30) ---"
  $shown = 0
  for ($i = 0; $i -lt $apiLines.Count -and $shown -lt 30; $i++) {
    if ($apiLines[$i] -match 'experience') {
      Write-Host ("{0,4}: {1}" -f ($i + 1), $apiLines[$i].Trim())
      $shown++
    }
  }
}

# --- 1.A : ce que le serveur rend vraiment ---
Write-Host "--- 1.A GET http://localhost:3000/u/kouton-clement ---"
$html = $null
try {
  $html = (& curl.exe -s -L --max-time 20 "http://localhost:3000/u/kouton-clement") | Out-String
} catch {
  Write-Host "   curl.exe indisponible ou serveur arrete (information non bloquante)."
}
if ($html -and $html.Trim().Length -gt 0) {
  foreach ($marker in @("ROFIL", "RIENCE", "ORMATION", "TENCES", "ANGUES", "PERSONNELLE")) {
    $count = ([regex]::Matches($html, $marker)).Count
    Write-Host ("   $marker -> $count occurrence(s) dans le HTML serveur")
  }
  $tplMatch = [regex]::Match($html, 'tpl-[a-z\-]+')
  if ($tplMatch.Success) { Write-Host ("   classe template detectee: " + $tplMatch.Value) }
} else {
  Write-Host "   page non recuperee (serveur eteint ?) - relancez le script avec npm run dev actif."
}

# --- 1.B : ce qui est reellement stocke en base ---
Write-Host "--- 1.B contenu stocke (PublicResume) via dump-cv-public.cjs ---"

$DumpJs = @'
/* dump-cv-public.cjs - diagnostic lecture seule (aucune ecriture en base) */
const fs = require("fs");
const path = require("path");

function trunc(value, max) {
  const text = String(value);
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function readEnvFile(file) {
  const result = {};
  if (!fs.existsSync(file)) return result;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

function describeValue(value) {
  if (value === undefined || value === null) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[] (vide)";
    const first = value[0];
    if (first !== null && typeof first === "object") {
      return "Array(" + value.length + ") - cles du 1er item: " + Object.keys(first).join(", ");
    }
    return "Array(" + value.length + ") - ex: " + trunc(JSON.stringify(first), 80);
  }
  if (typeof value === "object") return "Object - cles: " + Object.keys(value).join(", ");
  return trunc(String(value), 120);
}

(async () => {
  const envLocal = readEnvFile(path.join(process.cwd(), ".env.local"));
  const env = readEnvFile(path.join(process.cwd(), ".env"));
  const databaseUrl = process.env.DATABASE_URL || envLocal.DATABASE_URL || env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("[dump] DATABASE_URL introuvable dans .env.local / .env - etape ignoree");
    return;
  }
  process.env.DATABASE_URL = databaseUrl;

  let PrismaClient = null;
  const candidates = [
    "./src/generated/prisma",
    "./src/generated/prisma/index.js",
    "./src/generated/prisma/client",
    "@prisma/client",
  ];
  for (const candidate of candidates) {
    try {
      const mod = require(candidate);
      const Client = mod.PrismaClient || (mod.default && mod.default.PrismaClient);
      if (Client) {
        PrismaClient = Client;
        console.log("[dump] client Prisma charge via: " + candidate);
        break;
      }
    } catch (error) {
      /* candidat suivant */
    }
  }
  if (!PrismaClient) {
    console.log("[dump] client Prisma non charge (relancez npx prisma generate) - etape ignoree");
    return;
  }

  let prisma;
  try {
    prisma = new PrismaClient();
  } catch (error) {
    console.log("[dump] initialisation impossible: " + trunc(error && error.message ? error.message : error, 200));
    return;
  }

  try {
    let rows = null;
    let usedRaw = false;
    try {
      rows = await prisma.publicResume.findMany({ orderBy: { updatedAt: "desc" }, take: 5 });
    } catch (errorModel) {
      rows = await prisma.$queryRawUnsafe('SELECT * FROM "PublicResume" ORDER BY "updatedAt" DESC LIMIT 5');
      usedRaw = true;
    }
    if (!rows || rows.length === 0) {
      console.log("[dump] aucune ligne dans PublicResume");
      return;
    }
    for (const row of rows) {
      console.log("--------------------------------------------------");
      if (usedRaw) console.log("colonnes: " + Object.keys(row).join(", "));
      console.log(
        "slug: " + row.slug +
        " | isPublic: " + row.isPublic +
        " | templateId: " + row.templateId +
        " | vues: " + row.viewsCount +
        " | maj: " + (row.updatedAt ? new Date(row.updatedAt).toISOString() : "?")
      );
      let parsed = null;
      try {
        parsed = typeof row.cvData === "string" ? JSON.parse(row.cvData) : row.cvData;
      } catch (error) {
        console.log("cvData: JSON invalide");
        continue;
      }
      if (!parsed || typeof parsed !== "object") {
        console.log("cvData: vide");
        continue;
      }
      console.log("cvData - cles racine: " + Object.keys(parsed).join(", "));
      for (const key of Object.keys(parsed)) {
        console.log("  " + key + " => " + describeValue(parsed[key]));
      }
      const exps = parsed.experiences || parsed.experience || parsed.work || null;
      console.log("cvData.experiences brut: " + trunc(JSON.stringify(exps), 1500));
      const personal = parsed.personal || parsed.infos || null;
      console.log("cvData.personal brut: " + trunc(JSON.stringify(personal), 600));
      if (parsed.theme) console.log("cvData.theme: " + trunc(JSON.stringify(parsed.theme), 200));
    }
  } catch (error) {
    console.log("[dump] erreur: " + trunc(error && error.message ? error.message : error, 300));
  } finally {
    try {
      if (prisma && prisma.$disconnect) await prisma.$disconnect();
    } catch (error) {
      /* ignore */
    }
  }
})();
'@

Write-FileText $dumpPath $DumpJs
try {
  $dumpOutput = & node $dumpPath 2>&1
  $dumpOutput | ForEach-Object { Write-Host ("   " + ($_ | Out-String).TrimEnd()) }
} catch {
  Write-Host "   Node.js indisponible - etape ignoree (non bloquante)."
}

# ---------------------------------------------------------------------
# PARTIE 2 - CORRECTION CHIRURGICALE
# ---------------------------------------------------------------------
Write-Host ""
Write-Host "=========== PARTIE 2 - CORRECTION CHIRURGICALE ==========="
Write-Host "Plan :"
Write-Host "  2.1 nouveau module src/lib/cv-normalize.ts (enrichCv, double export)"
Write-Host "  2.2 page.tsx : normalizeCv -> normalizeCvBase + wrapper enrichCv (diff minimal)"
Write-Host "  2.3 api/public-cv/route.ts : normalizeCvForPdf -> Base + wrapper (diff minimal)"
Write-Host "  2.4 verification TypeScript (erreurs nouvelles uniquement)"

$LibTs = @'
/**
 * Couche de tolerance pour l'affichage public des CV (page /u/[slug] et PDF public).
 *
 * enrichCv() complete la sortie du normalisateur existant :
 *  1. il retrouve les sections manquantes (experiences, formations, competences,
 *     langues) dans la donnee brute, en acceptant les cles anglaises et francaises,
 *     le singulier et le pluriel, ainsi que les formes imbriquees
 *     ({ items: [...] }, carte nom -> niveau, carte d objets, objet unique) ;
 *  2. il expose chaque champ sous tous ses alias habituels (title/poste/role,
 *     company/entreprise, period/dates/periode...) afin que les 7 templates web
 *     et les 5 templates PDF affichent le contenu quel que soit le nom de cle
 *     utilise a la source ;
 *  3. il ne modifie jamais les donnees stockees : tout se fait en memoire.
 */

type Dict = Record<string, unknown>;

/** Vrai si la valeur est un objet pur (ni tableau, ni null). */
export function isDict(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Vrai si la valeur est un tableau non vide. */
export function isNonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

/** Convertit proprement une valeur en chaine non vide, sinon undefined. */
function str(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/** Premiere chaine non vide trouvee parmi les cles donnees. */
function firstString(source: Dict, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = str(source[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

/** Remplit les alias absents avec la valeur canonique (n ecrase jamais une valeur existante). */
function fillAliases(target: Dict, canonical: string | undefined, keys: readonly string[]): void {
  if (canonical === undefined) return;
  for (const key of keys) {
    const current = target[key];
    if (current === undefined || current === null || (typeof current === "string" && current.trim().length === 0)) {
      target[key] = canonical;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Recherche de sections                                              */
/* ------------------------------------------------------------------ */

const EXPERIENCE_KEYS: readonly string[] = [
  "experiences", "experience", "workExperiences", "workExperience", "work",
  "jobs", "job", "emplois", "emploi", "professionalExperiences",
  "experiencesProfessionnelles", "experiencesPro", "parcours",
  "parcoursProfessionnel", "positions", "career",
];

const EDUCATION_KEYS: readonly string[] = [
  "educations", "education", "formations", "formation", "studies", "study",
  "academicBackground", "academics", "diplomas", "diplomes", "schools",
];

const SKILL_KEYS: readonly string[] = [
  "skills", "skill", "competences", "competence", "competencies", "competency",
  "technicalSkills", "hardSkills", "softSkills", "technologies", "tools",
];

const LANGUAGE_KEYS: readonly string[] = [
  "languages", "language", "langues", "langue", "spokenLanguages",
];

const SUMMARY_KEYS: readonly string[] = [
  "summary", "profil", "profile", "bio", "about", "objectif",
  "presentation", "accroche", "resume",
];

const PERSONAL_KEYS: readonly string[] = [
  "personal", "infosPersonnelles", "identite", "contact", "contacts", "profile",
];

/**
 * Ramene une valeur a une forme de tableau : tableau deja correct, tableau
 * imbrique dans un objet a une seule cle ({ items: [...] }), carte nom ->
 * niveau ({ Francais: "courant" }), carte d objets, ou objet unique.
 */
function toArrayShape(raw: unknown): unknown[] | undefined {
  if (isNonEmptyArray(raw)) return raw;
  if (!isDict(raw)) return undefined;
  const keys = Object.keys(raw);
  if (keys.length === 1) {
    const inner = toArrayShape(raw[keys[0]]);
    if (inner !== undefined) return inner;
  }
  const values = Object.values(raw);
  if (values.length === 0) return undefined;
  const dictValues = values.filter(isDict);
  if (dictValues.length === values.length && values.length >= 2) return dictValues;
  const stringValues = values.filter(
    (value) => typeof value === "string" && (value as string).trim().length > 0,
  );
  if (stringValues.length === values.length && values.length >= 2) {
    return Object.entries(raw).map(([name, level]) => ({
      name,
      level: typeof level === "string" ? level : undefined,
      value: level,
    }));
  }
  return [raw];
}

/** Cherche chaque cle, dans chaque source, dans l ordre de priorite. */
function pickStage(sources: Dict[], keys: readonly string[]): unknown[] | undefined {
  for (const key of keys) {
    for (const source of sources) {
      const found = toArrayShape(source[key]);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** Recherche en profondeur bornee : premiere section sous une des cles donnees. */
function deepPick(root: Dict, keys: readonly string[], maxDepth: number): unknown[] | undefined {
  let level: Dict[] = [root];
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next: Dict[] = [];
    for (const node of level) {
      for (const key of keys) {
        const found = toArrayShape(node[key]);
        if (found !== undefined) return found;
      }
    }
    for (const node of level) {
      for (const value of Object.values(node)) {
        if (isDict(value)) {
          next.push(value);
        } else if (Array.isArray(value)) {
          for (const element of value) {
            if (isDict(element)) next.push(element);
          }
        }
      }
    }
    level = next;
  }
  return undefined;
}

/** Heuristique de forme : poste + entreprise, ou poste + periode/description. */
export function looksLikeExperienceItem(item: unknown): boolean {
  if (!isDict(item)) return false;
  const role = firstString(item, ["title", "poste", "role", "position", "fonction", "intitule", "jobTitle"]);
  const employer = firstString(item, ["company", "entreprise", "employer", "societe", "organisation", "employeur"]);
  const period = firstString(item, ["period", "dates", "periode", "startDate", "debut", "endDate", "fin", "duration", "duree"]);
  const description = firstString(item, ["description", "descriptions", "missions", "realisations", "summary", "details", "contenu"]);
  if (role !== undefined && employer !== undefined) return true;
  return role !== undefined && (period !== undefined || description !== undefined);
}

/** Recherche par forme : premier tableau dont tous les elements passent le garde-fou. */
function shapedPick(root: Dict, guard: (item: unknown) => boolean, maxDepth: number): unknown[] | undefined {
  let level: Dict[] = [root];
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next: Dict[] = [];
    for (const node of level) {
      for (const value of Object.values(node)) {
        if (isNonEmptyArray(value) && value.some(isDict) && value.every(guard)) return value;
        if (isDict(value)) {
          next.push(value);
        } else if (Array.isArray(value)) {
          for (const element of value) {
            if (isDict(element)) next.push(element);
          }
        }
      }
    }
    level = next;
  }
  return undefined;
}

function pickDict(sources: Dict[], keys: readonly string[]): Dict | undefined {
  for (const key of keys) {
    for (const source of sources) {
      const candidate = source[key];
      if (isDict(candidate)) return candidate;
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Enrichissement des elements                                        */
/* ------------------------------------------------------------------ */

const TITLE_KEYS: readonly string[] = ["title", "poste", "role", "position", "fonction", "intitule", "jobTitle", "job"];
const COMPANY_KEYS: readonly string[] = ["company", "entreprise", "employer", "societe", "organisation", "employeur", "structure"];
const PERIOD_KEYS: readonly string[] = ["period", "dates", "dateLabel", "periode", "duree", "duration", "dateRange"];
const START_KEYS: readonly string[] = ["startDate", "start", "debut", "dateDebut", "from", "dateStart"];
const END_KEYS: readonly string[] = ["endDate", "end", "fin", "dateFin", "to", "dateEnd"];
const LOCATION_KEYS: readonly string[] = ["location", "ville", "city", "lieu", "adresse", "pays", "country"];
const DESCRIPTION_SOURCES: readonly string[] = [
  "description", "descriptions", "missions", "realisations", "achievements",
  "bullets", "responsabilites", "details", "contenu", "summary",
];

/** Lit une description chaine ou liste et fournit les deux formes (string + string[]). */
function readDescription(item: Dict): { description: string | undefined; descriptions: string[] | undefined } {
  for (const key of DESCRIPTION_SOURCES) {
    const value = item[key];
    if (typeof value === "string") {
      const text = value.trim();
      if (text.length === 0) continue;
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
      return { description: text, descriptions: lines.length > 0 ? lines : [text] };
    }
    if (Array.isArray(value) && value.length > 0) {
      const parts: string[] = [];
      for (const element of value) {
        if (typeof element === "string" && element.trim().length > 0) {
          parts.push(element.trim());
          continue;
        }
        if (isDict(element)) {
          const text = firstString(element, ["text", "description", "label", "value", "titre", "intitule"]);
          if (text !== undefined) parts.push(text);
        }
      }
      if (parts.length > 0) return { description: parts.join("\n"), descriptions: parts };
    }
  }
  return { description: undefined, descriptions: undefined };
}

function joinPeriod(start: string | undefined, end: string | undefined): string | undefined {
  if (start === undefined && end === undefined) return undefined;
  return [start, end].filter((part): part is string => part !== undefined).join(" - ");
}

/** Expose un element d experience sous tous ses alias usuels. */
export function enrichExperienceItem(item: unknown): Dict {
  if (!isDict(item)) {
    const text = str(item);
    const out: Dict = {};
    fillAliases(out, text, TITLE_KEYS);
    if (text !== undefined) {
      out["description"] = text;
      out["descriptions"] = [text];
    }
    return out;
  }
  const out: Dict = { ...item };
  const title = firstString(item, TITLE_KEYS);
  const company = firstString(item, COMPANY_KEYS);
  const location = firstString(item, LOCATION_KEYS);
  const start = firstString(item, START_KEYS);
  const end = firstString(item, END_KEYS);
  const period = firstString(item, PERIOD_KEYS) ?? joinPeriod(start, end);
  const { description, descriptions } = readDescription(item);
  fillAliases(out, title, TITLE_KEYS);
  fillAliases(out, company, COMPANY_KEYS);
  fillAliases(out, period, PERIOD_KEYS);
  fillAliases(out, location, LOCATION_KEYS);
  fillAliases(out, start, START_KEYS);
  fillAliases(out, end, END_KEYS);
  fillAliases(out, description, ["description", "contenu", "descriptionText"]);
  if (descriptions !== undefined && !isNonEmptyArray(out["descriptions"])) out["descriptions"] = descriptions;
  if (descriptions !== undefined && !isNonEmptyArray(out["bullets"])) out["bullets"] = descriptions;
  return out;
}

const DEGREE_KEYS: readonly string[] = ["degree", "diplome", "diploma", "title", "formation", "intitule", "qualification", "programme", "mention"];
const SCHOOL_KEYS: readonly string[] = ["school", "etablissement", "institution", "university", "universite", "ecole", "college", "lycee", "organisation", "structure"];
const FIELD_KEYS: readonly string[] = ["field", "fieldOfStudy", "specialite", "domaine", "filiere", "study"];

/** Expose un element de formation sous tous ses alias usuels. */
export function enrichEducationItem(item: unknown): Dict {
  if (!isDict(item)) {
    const text = str(item);
    const out: Dict = {};
    fillAliases(out, text, DEGREE_KEYS);
    return out;
  }
  const out: Dict = { ...item };
  const degree = firstString(item, DEGREE_KEYS) ?? firstString(item, FIELD_KEYS);
  const school = firstString(item, SCHOOL_KEYS);
  const field = firstString(item, FIELD_KEYS);
  const location = firstString(item, LOCATION_KEYS);
  const start = firstString(item, START_KEYS);
  const end = firstString(item, END_KEYS);
  const period = firstString(item, PERIOD_KEYS) ?? joinPeriod(start, end);
  const { description, descriptions } = readDescription(item);
  fillAliases(out, degree, DEGREE_KEYS);
  fillAliases(out, school, SCHOOL_KEYS);
  fillAliases(out, field, FIELD_KEYS);
  fillAliases(out, period, PERIOD_KEYS);
  fillAliases(out, location, LOCATION_KEYS);
  fillAliases(out, start, START_KEYS);
  fillAliases(out, end, END_KEYS);
  fillAliases(out, description, ["description", "contenu"]);
  if (descriptions !== undefined && !isNonEmptyArray(out["descriptions"])) out["descriptions"] = descriptions;
  return out;
}

const LANGUAGE_NAME_KEYS: readonly string[] = ["name", "langue", "language", "title", "label", "intitule"];
const LEVEL_KEYS: readonly string[] = ["level", "niveau", "proficiency", "certification"];

/** Expose un element de langue sous tous ses alias usuels. */
export function enrichLanguageItem(item: unknown): Dict {
  if (!isDict(item)) {
    const text = str(item);
    const out: Dict = {};
    fillAliases(out, text, LANGUAGE_NAME_KEYS);
    return out;
  }
  const out: Dict = { ...item };
  const name = firstString(item, LANGUAGE_NAME_KEYS);
  const level = firstString(item, LEVEL_KEYS);
  fillAliases(out, name, LANGUAGE_NAME_KEYS);
  fillAliases(out, level, LEVEL_KEYS);
  return out;
}

/** Expose un element de competence ; les chaines simples restent inchangees. */
export function enrichSkillItem(item: unknown): unknown {
  if (!isDict(item)) return item;
  const out: Dict = { ...item };
  const name = firstString(item, ["name", "label", "title", "text", "competence", "skill", "intitule", "value"]);
  fillAliases(out, name, ["name", "label", "title", "competence"]);
  const level = firstString(item, LEVEL_KEYS);
  fillAliases(out, level, ["level", "niveau"]);
  return out;
}

/** Expose le bloc d informations personnelles sous tous ses alias usuels. */
export function enrichPersonal(personal: Dict): Dict {
  const out: Dict = { ...personal };
  let name = firstString(personal, ["name", "fullName", "nomComplet", "nom", "displayName"]);
  if (name === undefined) {
    const firstName = firstString(personal, ["firstName", "prenom"]);
    const lastName = firstString(personal, ["lastName", "nomDeFamille", "famille"]);
    const joined = [firstName, lastName]
      .filter((part): part is string => part !== undefined)
      .join(" ")
      .trim();
    if (joined.length > 0) name = joined;
  }
  fillAliases(out, name, ["name", "fullName", "nom", "nomComplet", "displayName"]);
  fillAliases(out, firstString(personal, ["title", "jobTitle", "poste", "fonction", "titre", "intitule"]), ["title", "jobTitle", "poste", "titre"]);
  fillAliases(out, firstString(personal, ["email", "mail", "courriel"]), ["email", "mail", "courriel"]);
  fillAliases(out, firstString(personal, ["phone", "telephone", "tel", "mobile", "portable"]), ["phone", "telephone", "tel", "mobile"]);
  fillAliases(out, firstString(personal, ["location", "ville", "city", "adresse", "pays", "country"]), ["location", "ville", "city"]);
  fillAliases(out, firstString(personal, ["photo", "photoUrl", "avatar", "image", "photoProfil"]), ["photo", "photoUrl", "avatar", "image"]);
  fillAliases(out, firstString(personal, ["website", "siteWeb", "site", "url", "portfolio", "websiteUrl"]), ["website", "siteWeb", "site", "url"]);
  fillAliases(out, firstString(personal, ["linkedin", "linkedinUrl", "urlLinkedin", "profilLinkedin"]), ["linkedin", "linkedinUrl"]);
  fillAliases(out, firstString(personal, ["github", "githubUrl", "urlGithub"]), ["github", "githubUrl"]);
  return out;
}

/* ------------------------------------------------------------------ */
/* Enrichissement global                                              */
/* ------------------------------------------------------------------ */

/**
 * Enrichit le CV normalise. raw (donnee brute d origine) est facultatif :
 * quand la sortie du normalisateur a perdu une section, elle est recheree
 * dans raw avant d etre exposee sous toutes ses formes d alias.
 */
export function enrichCv<T>(cv: T, raw?: unknown): T {
  if (!isDict(cv)) return cv;
  const base: Dict = cv;
  const origin: Dict | undefined = isDict(raw) ? raw : undefined;
  const sources: Dict[] = origin ? [base, origin] : [base];
  const out: Dict = { ...base };

  const experiences =
    pickStage(sources, EXPERIENCE_KEYS) ??
    deepPick(base, EXPERIENCE_KEYS, 3) ??
    (origin ? deepPick(origin, EXPERIENCE_KEYS, 3) : undefined) ??
    shapedPick(base, looksLikeExperienceItem, 3) ??
    (origin ? shapedPick(origin, looksLikeExperienceItem, 3) : undefined);
  if (experiences !== undefined) {
    const items = experiences.map(enrichExperienceItem);
    out["experiences"] = items;
    out["experience"] = items;
    if (out["workExperiences"] === undefined) out["workExperiences"] = items;
  }

  const educations =
    pickStage(sources, EDUCATION_KEYS) ??
    deepPick(base, EDUCATION_KEYS, 3) ??
    (origin ? deepPick(origin, EDUCATION_KEYS, 3) : undefined);
  if (educations !== undefined) {
    const items = educations.map(enrichEducationItem);
    out["educations"] = items;
    out["education"] = items;
    if (out["formations"] === undefined) out["formations"] = items;
  }

  const skills =
    pickStage(sources, SKILL_KEYS) ??
    deepPick(base, SKILL_KEYS, 3) ??
    (origin ? deepPick(origin, SKILL_KEYS, 3) : undefined);
  if (skills !== undefined) {
    const items = skills.map(enrichSkillItem);
    out["skills"] = items;
    if (out["competences"] === undefined) out["competences"] = items;
  }

  const languages =
    pickStage(sources, LANGUAGE_KEYS) ??
    deepPick(base, LANGUAGE_KEYS, 3) ??
    (origin ? deepPick(origin, LANGUAGE_KEYS, 3) : undefined);
  if (languages !== undefined) {
    const items = languages.map(enrichLanguageItem);
    out["languages"] = items;
    if (out["langues"] === undefined) out["langues"] = items;
  }

  const summary = firstString(base, SUMMARY_KEYS) ?? (origin ? firstString(origin, SUMMARY_KEYS) : undefined);
  if (summary !== undefined) {
    if (out["summary"] === undefined) out["summary"] = summary;
    if (out["profil"] === undefined) out["profil"] = summary;
    if (out["profile"] === undefined) out["profile"] = summary;
  }

  const personalDict = pickDict(sources, PERSONAL_KEYS);
  if (personalDict !== undefined) {
    out["personal"] = enrichPersonal(personalDict);
  } else {
    const merged: Dict = origin ? { ...origin, ...base } : { ...base };
    const name = firstString(merged, ["name", "fullName", "nom"]);
    const email = firstString(merged, ["email", "mail"]);
    if (name !== undefined || email !== undefined) out["personal"] = enrichPersonal(merged);
  }

  return out as unknown as T;
}

export default enrichCv;
'@

function Write-LibFile {
  param([string]$Path, [string]$Content)
  $dir = [System.IO.Path]::GetDirectoryName($Path)
  if (-not [System.IO.Directory]::Exists($dir)) {
    [System.IO.Directory]::CreateDirectory($dir) | Out-Null
  }
  if ([System.IO.File]::Exists($Path)) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    [System.IO.File]::Copy($Path, "$Path.bak-fixcv-$stamp", $true)
    Write-Host "  2.1 cv-normalize.ts existait deja - sauvegarde puis remplacement"
  }
  [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host ("  2.1 ecrit: $Path (" + $Content.Length + " caracteres)")
}

function Invoke-CvWrapPatch {
  param(
    [string]$FilePath,
    [string]$FuncName,
    [string]$ImportLine
  )
  Write-Host ("  -> patch: $FilePath")
  if (-not [System.IO.File]::Exists($FilePath)) {
    Write-Host "     fichier introuvable - etape ignoree"
    return $false
  }
  $lines = [System.IO.File]::ReadAllLines($FilePath)
  $already = $false
  foreach ($l in $lines) {
    if ($l -match ($FuncName + "Base\b")) { $already = $true; break }
  }
  if ($already) {
    Write-Host "     deja patche (Base present) - rien a faire"
    return $true
  }
  $defIndex = -1
  $defForm = $null
  $defLine = $null
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match ('^(export\s+)?(async\s+)?function\s+' + [regex]::Escape($FuncName) + '\b')) {
      $defIndex = $i; $defForm = "function"; $defLine = $lines[$i]; break
    }
    if ($lines[$i] -match ('^(export\s+)?(async\s+)?const\s+' + [regex]::Escape($FuncName) + '\b')) {
      $defIndex = $i; $defForm = "const"; $defLine = $lines[$i]; break
    }
  }
  if ($defIndex -lt 0) {
    Write-Host "     definition '$FuncName' introuvable au niveau module - patch ignore (collez la sortie PARTIE 1 a l'assistant)"
    return $false
  }
  if ($defLine.TrimEnd().EndsWith(";")) {
    Write-Host "     signature seule (surcharge) detectee - patch annule pour securite"
    return $false
  }
  $endIndex = -1
  for ($i = $defIndex + 1; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^\}\s*;?\s*$') { $endIndex = $i; break }
  }
  if ($endIndex -lt 0) {
    Write-Host "     fin de fonction introuvable - patch annule pour securite"
    return $false
  }
  $isExport = $defLine -match '^\s*export\s'
  $isAsync = $defLine -match '\basync\b'
  $prefix = ""
  if ($isExport) { $prefix = "export " }
  $baseLine = $null
  if ($defForm -eq "function") {
    $baseLine = $defLine -replace ('function\s+' + [regex]::Escape($FuncName) + '\b'), ('function ' + $FuncName + 'Base')
  } else {
    $baseLine = $defLine -replace ('const\s+' + [regex]::Escape($FuncName) + '\b'), ('const ' + $FuncName + 'Base')
  }
  $wrapperLines = @()
  if ($defForm -eq "function") {
    if ($isAsync) {
      $wrapperLines = @(
        "${prefix}async function ${FuncName}(...args: Parameters<typeof ${FuncName}Base>) {",
        "  const result = await ${FuncName}Base(...args);",
        "  return enrichCv(result, args[0]);",
        "}"
      )
    } else {
      $wrapperLines = @(
        "${prefix}function ${FuncName}(...args: Parameters<typeof ${FuncName}Base>) {",
        "  return enrichCv(${FuncName}Base(...args), args[0]);",
        "}"
      )
    }
  } else {
    if ($isAsync) {
      $wrapperLines = @(
        "${prefix}const ${FuncName}: typeof ${FuncName}Base = async (...args: Parameters<typeof ${FuncName}Base>) => enrichCv(await ${FuncName}Base(...args), args[0]);"
      )
    } else {
      $wrapperLines = @(
        "${prefix}const ${FuncName}: typeof ${FuncName}Base = (...args: Parameters<typeof ${FuncName}Base>) => enrichCv(${FuncName}Base(...args), args[0]);"
      )
    }
  }
  $newLines = New-Object System.Collections.Generic.List[string]
  for ($i = 0; $i -lt $defIndex; $i++) { $newLines.Add($lines[$i]) }
  if ($defForm -eq "function") {
    foreach ($w in $wrapperLines) { $newLines.Add($w) }
    $newLines.Add($baseLine)
  } else {
    $newLines.Add($baseLine)
  }
  for ($i = $defIndex + 1; $i -le $endIndex; $i++) { $newLines.Add($lines[$i]) }
  if ($defForm -eq "const") {
    foreach ($w in $wrapperLines) { $newLines.Add($w) }
  }
  for ($i = $endIndex + 1; $i -lt $lines.Count; $i++) { $newLines.Add($lines[$i]) }
  $hasImport = $false
  $lastImport = -1
  for ($i = 0; $i -lt $newLines.Count; $i++) {
    if ($newLines[$i] -match '^import\s') { $lastImport = $i }
    if ($newLines[$i] -match 'cv-normalize') { $hasImport = $true }
  }
  if (-not $hasImport -and $lastImport -ge 0) {
    $newLines.Insert($lastImport + 1, $ImportLine)
  }
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $bak = "$FilePath.bak-fixcv-$stamp"
  [System.IO.File]::Copy($FilePath, $bak, $true)
  Write-Host ("     sauvegarde: $bak")
  $content = [string]::Join("`r`n", $newLines.ToArray()) + "`r`n"
  [System.IO.File]::WriteAllText($FilePath, $content, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "     patch applique ($FuncName enrichi via cv-normalize.ts, diff minimal)"
  return $true
}

Write-LibFile -Path $libPath -Content $LibTs
$pageOk = Invoke-CvWrapPatch -FilePath $pagePath -FuncName "normalizeCv" -ImportLine 'import { enrichCv } from "@/lib/cv-normalize";'
$apiOk = Invoke-CvWrapPatch -FilePath $apiPath -FuncName "normalizeCvForPdf" -ImportLine 'import { enrichCv } from "@/lib/cv-normalize";'

if ($pageOk) {
  Write-Host "  2.2 page /u/[slug] : OK"
} else {
  Write-Host "  2.2 page /u/[slug] : NON PATCHEE (voir message au-dessus)"
}
if ($apiOk) {
  Write-Host "  2.3 api/public-cv : OK"
} else {
  Write-Host "  2.3 api/public-cv : NON PATCHEE (le PDF QR gardera le comportement actuel)"
}

# --- 2.4 verification TypeScript ---
Write-Host ""
Write-Host "  2.4 verification TypeScript (1 a 2 minutes)..."
try {
  $tscRaw = & cmd /c "npx tsc --noEmit" 2>&1
  $tscText = ($tscRaw | ForEach-Object { "$_" }) -join "`n"
  $totalErrors = ([regex]::Matches($tscText, "error TS")).Count
  Write-Host ("     total 'error TS' rapportes: $totalErrors (les erreurs preexistantes connues restent inchangees)")
  $newErrors = $tscText -split "`n" | Where-Object { $_ -match 'cv-normalize|u/\[slug\]|api/public-cv' }
  if ($newErrors.Count -gt 0) {
    Write-Host "     ERREURS NOUVELLEMENT LIEES AU PATCH :"
    $newErrors | ForEach-Object { Write-Host ("       " + $_.Trim()) }
    Write-Host "     -> restaurez le .bak correspondant et collez cette sortie a l'assistant."
  } else {
    Write-Host "     aucune erreur nouvelle liee au patch (cv-normalize / page publique / API public-cv)."
  }
} catch {
  Write-Host "     tsc non executable ici - verifiez manuellement avec : npx tsc --noEmit"
}

# ---------------------------------------------------------------------
# PARTIE 3 - PROTOCOLE DE TEST
# ---------------------------------------------------------------------
Write-Host ""
Write-Host "=========== PARTIE 3 - PROTOCOLE DE TEST ==========="
Write-Host "1) (Re)demarrez le serveur :  npm run dev"
Write-Host "2) Ouvrez http://localhost:3000/u/kouton-clement  (Ctrl+F5)"
Write-Host "   -> la section EXPERIENCES PROFESSIONNELLES doit apparaitre,"
Write-Host "      comme dans l'apercu du createur de CV."
Write-Host "3) Ouvrez http://localhost:3000/api/public-cv?slug=kouton-clement&format=pdf"
Write-Host "   -> le PDF avec QR doit aussi contenir les experiences."
Write-Host "4) Si la section manque ENCORE : ouvrez le createur de CV puis re-publiez"
Write-Host "   (les donnees stockees seront remplacees par les dernieres), puis Ctrl+F5."
Write-Host "5) Renvoyez a l'assistant : la sortie complete de ce script (PARTIE 1"
Write-Host "   surtout : recensement HTML + dump cvData) + toute erreur tsc nouvelle."
Write-Host ""
Write-Host "Backups crees : *.bak-fixcv-<horodatage> a cote de chaque fichier modifie."
Write-Host "Retour arriere manuel (exemple) :"
Write-Host '  Copy-Item -LiteralPath "src\app\u\[slug]\page.tsx.bak-fixcv-XXXX" -Destination "src\app\u\[slug]\page.tsx" -Force'
Write-Host ""
Write-Host "Note : dump-cv-public.cjs (racine) ne sert qu'au diagnostic - supprimable apres."
Write-Host "Termine."
