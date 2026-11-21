# =====================================================================
#  corriger-cv-normalize.ps1  -  NexiRole
#  Contexte : le script precedent (reparer-cv-public.ps1) a ecrase le
#  fichier src/lib/cv-normalize.ts EXISTANT (qui exportait normalizeCv
#  et extractTheme, utilises par src/app/u/[slug]/page.tsx ligne 6).
#  Ce fichier avait ete sauvegarde automatiquement en
#  cv-normalize.ts.bak-fixcv-<horodatage> avant l'ecrasement.
#
#  Ce script repare sans rien ecraser de nouveau :
#    PARTIE 1 - diagnostic (backups disponibles, code actuel, appelants)
#    PARTIE 2 - correction :
#      2.1 restauration du cv-normalize.ts original (backup, sinon git)
#      2.2 nouveau fichier src/lib/cv-enrich.ts (enrichCv, double export)
#      2.3 wrap minimal : normalizeCv -> normalizeCvBase + wrapper
#          enrichCv(...) DANS cv-normalize.ts (extractTheme intact)
#      2.4 re-aiguillage des imports enrichCv (api/public-cv) vers
#          "@/lib/cv-enrich"
#      2.5 verification TypeScript (erreurs nouvelles uniquement)
#    PARTIE 3 - protocole de test localhost:3000 + git push pour Vercel
#  Conforme AGENTS.md 1.1 / 1.2 / 1.3 / 1.5. Backups *.bak-* conserves.
# =====================================================================

$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$libDir    = Join-Path $root "src\lib"
$libPath   = Join-Path $libDir "cv-normalize.ts"
$enrichPath = Join-Path $libDir "cv-enrich.ts"
$pagePath  = Join-Path $root "src\app\u\[slug]\page.tsx"
$apiPath   = Join-Path $root "src\app\api\public-cv\route.ts"

Write-Host "=== NexiRole - reparation de cv-normalize.ts ==="
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

function Backup-File([string]$path, [string]$tag) {
  if (-not [System.IO.File]::Exists($path)) { return $null }
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $bak = "$path.bak-$tag-$stamp"
  [System.IO.File]::Copy($path, $bak, $true)
  return $bak
}

# ---------------------------------------------------------------------
# PARTIE 1 - DIAGNOSTIC (lecture seule)
# ---------------------------------------------------------------------
Write-Host ""
Write-Host "=========== PARTIE 1 - DIAGNOSTIC (lecture seule) ==========="

# --- 1.A : backups disponibles pour cv-normalize.ts ---
Write-Host "--- 1.A sauvegardes cv-normalize.ts.bak-* disponibles ---"
$backupCandidates = @()
if ([System.IO.Directory]::Exists($libDir)) {
  $backupCandidates = Get-ChildItem -LiteralPath $libDir -Filter "cv-normalize.ts.bak-*" -File |
    Sort-Object LastWriteTime -Descending
}
$chosenBackup = $null
foreach ($candidate in $backupCandidates) {
  $candidateLines = [System.IO.File]::ReadAllLines($candidate.FullName)
  $hasNormalize = ($candidateLines | Where-Object { $_ -match 'normalizeCv' }).Count -gt 0
  $hasTheme = ($candidateLines | Where-Object { $_ -match 'extractTheme' }).Count -gt 0
  $isBroken = ($candidateLines | Where-Object { $_ -match 'enrichSkillItem' }).Count -gt 0
  Write-Host ("   " + $candidate.Name + " | " + $candidate.Length + " octets | " +
    $candidate.LastWriteTime + " | normalizeCv:" + $hasNormalize +
    " extractTheme:" + $hasTheme + " version-cassee:" + $isBroken)
  if ($chosenBackup -eq $null -and $hasNormalize -and $hasTheme -and (-not $isBroken)) {
    $chosenBackup = $candidate.FullName
  }
}
if ($chosenBackup -ne $null) {
  Write-Host ("   -> backup retenu pour restauration: " + [System.IO.Path]::GetFileName($chosenBackup))
  Write-Host "   --- 40 premieres lignes de ce backup ---"
  $bakLines = [System.IO.File]::ReadAllLines($chosenBackup)
  $cap = [Math]::Min(39, $bakLines.Count - 1)
  for ($i = 0; $i -le $cap; $i++) { Write-Host ("{0,4}: {1}" -f ($i + 1), $bakLines[$i]) }
  Write-Host "   --- lignes export de ce backup ---"
  for ($i = 0; $i -lt $bakLines.Count; $i++) {
    if ($bakLines[$i] -match '^export\s') { Write-Host ("{0,4}: {1}" -f ($i + 1), $bakLines[$i].Trim()) }
  }
} else {
  Write-Host "   aucun backup exploitable - PARTIE 2 tentera la recuperation via git."
}

# --- 1.B : etat actuel de cv-normalize.ts ---
Write-Host "--- 1.B etat actuel de src/lib/cv-normalize.ts ---"
$libLines = Read-FileLines $libPath
if ($libLines -eq $null) {
  Write-Host "   FICHIER INTROUVABLE: $libPath"
} else {
  $libText = [string]::Join("`n", $libLines)
  Write-Host ("   " + $libLines.Count + " lignes")
  Write-Host ("   contient normalizeCvBase: " + ($libText -match 'normalizeCvBase'))
  Write-Host ("   contient enrichSkillItem (version cassee): " + ($libText -match 'enrichSkillItem'))
  Write-Host ("   contient extractTheme: " + ($libText -match 'extractTheme'))
  Write-Host "   --- 12 premieres lignes ---"
  $cap = [Math]::Min(11, $libLines.Count - 1)
  for ($i = 0; $i -le $cap; $i++) { Write-Host ("{0,4}: {1}" -f ($i + 1), $libLines[$i]) }
}

# --- 1.C : page.tsx - import et sites d'appel ---
Write-Host "--- 1.C page.tsx : import + appels normalizeCv / extractTheme ---"
$pageLines = Read-FileLines $pagePath
if ($pageLines -eq $null) {
  Write-Host "   FICHIER INTROUVABLE: $pagePath"
} else {
  $cap = [Math]::Min(14, $pageLines.Count - 1)
  for ($i = 0; $i -le $cap; $i++) { Write-Host ("{0,4}: {1}" -f ($i + 1), $pageLines[$i]) }
  Write-Host "   --- sites d'appel ---"
  for ($i = 0; $i -lt $pageLines.Count; $i++) {
    if ($pageLines[$i] -match 'normalizeCv\s*\(|extractTheme\s*\(') {
      Write-Host ("{0,4}: {1}" -f ($i + 1), $pageLines[$i].Trim())
    }
  }
}

# --- 1.D : tous les importeurs de cv-normalize / utilisateurs de enrichCv ---
Write-Host "--- 1.D fichiers mentionnant cv-normalize ou enrichCv (src/) ---"
$srcDir = Join-Path $root "src"
if ([System.IO.Directory]::Exists($srcDir)) {
  $allFiles = Get-ChildItem -LiteralPath $srcDir -Recurse -Include *.ts,*.tsx -File |
    Where-Object { $_.FullName -notlike "*\generated\*" }
  foreach ($f in $allFiles) {
    $fLines = [System.IO.File]::ReadAllLines($f.FullName)
    for ($i = 0; $i -lt $fLines.Count; $i++) {
      if ($fLines[$i] -match 'cv-normalize|cv-enrich|enrichCv') {
        Write-Host ("   " + $f.FullName.Substring($root.Length + 1) + " ligne " + ($i + 1) + ": " + $fLines[$i].Trim())
      }
    }
  }
}

# --- 1.E : historique git du fichier ---
Write-Host "--- 1.E git log src/lib/cv-normalize.ts ---"
try {
  $gitLog = & git log --oneline -n 6 -- "src/lib/cv-normalize.ts" 2>&1
  if ($gitLog) { $gitLog | ForEach-Object { Write-Host ("   " + $_) } }
  else { Write-Host "   aucun historique git pour ce fichier" }
} catch {
  Write-Host "   git indisponible - information non bloquante"
}

# ---------------------------------------------------------------------
# PARTIE 2 - CORRECTION
# ---------------------------------------------------------------------
Write-Host ""
Write-Host "=========== PARTIE 2 - CORRECTION ==========="

$EnrichTs = @'
/**
 * cv-enrich.ts - couche de tolerance pour l affichage public des CV.
 *
 * enrichCv() complete la sortie du normalisateur existant (src/lib/cv-normalize.ts) :
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
    Write-Host "     definition '$FuncName' introuvable au niveau module - patch ignore"
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
  if ($ImportLine -ne "") {
    $hasImport = $false
    $lastImport = -1
    for ($i = 0; $i -lt $newLines.Count; $i++) {
      if ($newLines[$i] -match '^import\s') { $lastImport = $i }
      if ($newLines[$i] -match 'cv-enrich') { $hasImport = $true }
    }
    if (-not $hasImport -and $lastImport -ge 0) {
      $newLines.Insert($lastImport + 1, $ImportLine)
    }
  }
  $bak = Backup-File $FilePath "wrapcv"
  if ($bak) { Write-Host ("     sauvegarde: " + [System.IO.Path]::GetFileName($bak)) }
  $content = [string]::Join("`r`n", $newLines.ToArray()) + "`r`n"
  [System.IO.File]::WriteAllText($FilePath, $content, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "     patch applique ($FuncName enrichi, diff minimal)"
  return $true
}

function Restore-OriginalLib {
  Write-Host "  2.1 restauration de src/lib/cv-normalize.ts"
  if (-not [System.IO.File]::Exists($libPath)) {
    Write-Host "     fichier actuel absent - restauration directe"
  }
  # source 1 : backup local
  if ($chosenBackup -ne $null) {
    $brokenBak = Backup-File $libPath "broken"
    if ($brokenBak) { Write-Host ("     version cassee sauvegardee: " + [System.IO.Path]::GetFileName($brokenBak)) }
    [System.IO.File]::Copy($chosenBackup, $libPath, $true)
    $check = [string]::Join("`n", [System.IO.File]::ReadAllLines($libPath))
    if ($check -match 'normalizeCv' -and $check -match 'extractTheme') {
      Write-Host ("     restaure depuis: " + [System.IO.Path]::GetFileName($chosenBackup))
      return $true
    }
    Write-Host "     backup restaure mais incomplet - tentative git..."
  }
  # source 2 : historique git
  try {
    $rel = "src/lib/cv-normalize.ts"
    $hashes = & git log --format=%H -n 20 -- $rel 2>$null
    foreach ($h in $hashes) {
      $shown = (& git show "${h}:$rel" 2>$null) | Out-String
      if ($shown -match 'normalizeCv' -and $shown -match 'extractTheme' -and $shown -notmatch 'enrichSkillItem') {
        $brokenBak2 = Backup-File $libPath "broken"
        Write-Host ("     restauration depuis git commit " + $h.Substring(0, 8))
        Write-FileText $libPath $shown
        return $true
      }
    }
  } catch {
    Write-Host "     recuperation git impossible"
  }
  Write-Host "     ECHEC restauration: ni backup ni git - collez la sortie PARTIE 1 a l'assistant"
  return $false
}

function Repair-EnrichImports {
  Write-Host "  2.4 re-aiguillage des imports enrichCv vers @/lib/cv-enrich"
  $srcDir = Join-Path $root "src"
  if (-not [System.IO.Directory]::Exists($srcDir)) { return }
  $allFiles = Get-ChildItem -LiteralPath $srcDir -Recurse -Include *.ts,*.tsx -File |
    Where-Object { $_.FullName -notlike "*\generated\*" -and $_.FullName -notlike "*cv-enrich*" -and $_.FullName -notlike "*cv-normalize*" }
  foreach ($f in $allFiles) {
    $fLines = [System.IO.File]::ReadAllLines($f.FullName)
    $changed = $false
    for ($i = 0; $i -lt $fLines.Count; $i++) {
      if ($fLines[$i] -match 'enrichCv' -and $fLines[$i] -match '@/lib/cv-normalize') {
        $fLines[$i] = $fLines[$i] -replace '@/lib/cv-normalize', '@/lib/cv-enrich'
        $changed = $true
      }
    }
    if ($changed) {
      $bak = Backup-File $f.FullName "imports"
      if ($bak) { Write-Host ("     sauvegarde: " + [System.IO.Path]::GetFileName($bak)) }
      Write-FileText $f.FullName ([string]::Join("`r`n", $fLines) + "`r`n")
      Write-Host ("     import corrige: " + $f.FullName.Substring($root.Length + 1))
    }
  }
}

$alreadyFixed = $false
if ($libLines -ne $null -and ([string]::Join("`n", $libLines) -match 'normalizeCvBase') -and ([string]::Join("`n", $libLines) -match 'cv-enrich')) {
  Write-Host "  cv-normalize.ts deja corrige (normalizeCvBase + import cv-enrich presents) - restauration ignoree"
  $alreadyFixed = $true
}

if (-not $alreadyFixed) {
  $restored = Restore-OriginalLib
  if (-not $restored) {
    Write-Host ""
    Write-Host "CORRECTION INTERROMPUE - corrigez manuellement puis relancez ce script."
    exit 1
  }

  Write-Host "  2.2 ecriture de src/lib/cv-enrich.ts (nouveau fichier, aucun remplacement)"
  $bakEnrich = Backup-File $enrichPath "enrich"
  if ($bakEnrich) { Write-Host ("     cv-enrich.ts existait deja - sauvegarde: " + [System.IO.Path]::GetFileName($bakEnrich)) }
  Write-FileText $enrichPath $EnrichTs
  Write-Host ("     ecrit: src/lib/cv-enrich.ts (" + $EnrichTs.Length + " caracteres)")

  Write-Host "  2.3 wrap minimal de normalizeCv dans cv-normalize.ts"
  $wrapOk = Invoke-CvWrapPatch -FilePath $libPath -FuncName "normalizeCv" -ImportLine 'import { enrichCv } from "@/lib/cv-enrich";'
  if ($wrapOk) {
    $finalLines = [System.IO.File]::ReadAllLines($libPath)
    Write-Host "     --- exports finaux de cv-normalize.ts ---"
    for ($i = 0; $i -lt $finalLines.Count; $i++) {
      if ($finalLines[$i] -match '^export\s') { Write-Host ("{0,4}: {1}" -f ($i + 1), $finalLines[$i].Trim()) }
    }
    $finalText = [string]::Join("`n", $finalLines)
    if ($finalText -match 'extractTheme') {
      Write-Host "     extractTheme: PRESENT (intact)"
    } else {
      Write-Host "     ATTENTION: extractTheme ABSENT du fichier restaure - collez la sortie PARTIE 1 a l'assistant"
    }
  } else {
    Write-Host "     wrap non applique - la restauration suffit deja pour corriger l'erreur de build"
  }
}

Repair-EnrichImports

# --- 2.5 verification TypeScript ---
Write-Host ""
Write-Host "  2.5 verification TypeScript (1 a 2 minutes)..."
try {
  $tscRaw = & cmd /c "npx tsc --noEmit" 2>&1
  $tscText = ($tscRaw | ForEach-Object { "$_" }) -join "`n"
  $totalErrors = ([regex]::Matches($tscText, "error TS")).Count
  Write-Host ("     total 'error TS' rapportes: $totalErrors (les erreurs preexistantes connues restent inchangees)")
  $newErrors = $tscText -split "`n" | Where-Object { $_ -match 'cv-enrich|cv-normalize|u/\[slug\]|api/public-cv' }
  if ($newErrors.Count -gt 0) {
    Write-Host "     ERREURS LIEES AUX FICHIERS CV :"
    $newErrors | ForEach-Object { Write-Host ("       " + $_.Trim()) }
    Write-Host "     -> collez cette sortie a l'assistant."
  } else {
    Write-Host "     aucune erreur sur cv-enrich / cv-normalize / page publique / API public-cv."
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
Write-Host "   -> l'erreur 'Export extractTheme doesn't exist' doit disparaitre."
Write-Host "2) Ouvrez http://localhost:3000/u/kouton-clement (Ctrl+F5)"
Write-Host "   -> le CV doit s'afficher EN ENTIER, avec la section"
Write-Host "      EXPERIENCES PROFESSIONNELLES (grace a enrichCv)."
Write-Host "3) Ouvrez http://localhost:3000/api/public-cv?slug=kouton-clement&format=pdf"
Write-Host "   -> le PDF avec QR doit aussi contenir les experiences."
Write-Host "4) Redeployer Vercel (l'erreur de build vient du commit casse 743e6ba) :"
Write-Host "      git add src"
Write-Host '      git commit -m "Fix: restauration cv-normalize + enrichissement CV public"'
Write-Host "      git push"
Write-Host "5) Renvoyez a l'assistant : la sortie complete de ce script"
Write-Host "   (surtout 1.A backups, 1.C sites d'appel, exports finaux, tsc)."
Write-Host ""
Write-Host "Note : les backups *.bak-* a la racine de src/lib peuvent etre supprimes"
Write-Host "une fois que la page et le PDF affichent tout le CV correctement."
Write-Host "Termine."
