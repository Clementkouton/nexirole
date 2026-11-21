# =============================================================================
# corriger-cv-public-complet.ps1 - NexiRole
# Objectif : la page publique /u/[slug] doit afficher le CV EN ENTIER,
#            exactement comme le PDF "avec QR" (deja complet).
#
# Conforme AGENTS.md :
#   - Modification chirurgicale : un seul fichier existant est touche
#     (src/app/u/[slug]/page.tsx) et uniquement pour retirer la fonction
#     locale normalizeCv et importer la nouvelle librairie.
#   - Aucune route API, modele Prisma, template PDF ou auth modifie.
#   - Zero placeholder : tout le code ecrit est complet et type.
#   - Icones : aucun import d'icone ajoute (pas de lucide-react).
# =============================================================================

param(
    [switch]$SkipTsc
)

$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Banner([string]$text) {
    Write-Host ""
    Write-Host ("=" * 74)
    Write-Host $text
    Write-Host ("=" * 74)
}

function Read-FileText([string]$path) {
    return [System.IO.File]::ReadAllText($path)
}

function Write-FileText([string]$path, [string]$content) {
    $dir = Split-Path -Parent $path
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($path, $content, $Utf8NoBom)
}

$pagePath   = Join-Path $root "src\app\u\[slug]\page.tsx"
$routePath  = Join-Path $root "src\app\api\public-cv\route.ts"
$libPath    = Join-Path $root "src\lib\normalize-cv.ts"
$debugPath  = Join-Path $root "src\app\api\debug-public-cv\route.ts"
$layoutPath = Join-Path $root "src\app\layout.tsx"
$studioPath = Join-Path $root "src\components\dashboard\PublicCvStudio.tsx"
$qrTplPath  = Join-Path $root "src\components\pdf\CvPdfQrTemplates.tsx"

# =============================================================================
Write-Banner "PARTIE 0 - ETAT DES LIEUX (consultation, aucune modification)"
# =============================================================================

$filesOk = $true
foreach ($p in @($pagePath, $routePath)) {
    if (Test-Path -LiteralPath $p) {
        $item = Get-Item -LiteralPath $p
        Write-Host ("[OK] " + $p + "  (" + $item.Length + " octets)")
    } else {
        Write-Host ("[MANQUANT] " + $p)
        $filesOk = $false
    }
}
if (-not $filesOk) {
    Write-Host "Arret : place-toi a la racine du projet (D:\Next Js\nexirole) puis relance."
    exit 1
}

$pageText  = Read-FileText $pagePath
$routeText = Read-FileText $routePath
$pageLines = [System.IO.File]::ReadAllLines($pagePath)

Write-Host ""
Write-Host "--- Definitions de fonctions normalize* dans page.tsx ---"
$foundAny = $false
for ($i = 0; $i -lt $pageLines.Count; $i++) {
    if ($pageLines[$i] -match 'function\s+\w*[Nn]ormalize\w*' -or $pageLines[$i] -match 'const\s+\w*[Nn]ormalize\w*\s*[:=]') {
        Write-Host ("L" + ($i + 1) + ": " + $pageLines[$i].Trim())
        $foundAny = $true
    }
}
if (-not $foundAny) { Write-Host "(aucune definition locale detectee)" }

Write-Host ""
Write-Host "--- Appels normalizeCv et consommation des sections dans page.tsx ---"
$shown = 0
for ($i = 0; $i -lt $pageLines.Count -and $shown -lt 25; $i++) {
    if ($pageLines[$i] -match 'normalizeCv\(|renderWebTemplate\(|<Tpl[A-Z]') {
        Write-Host ("L" + ($i + 1) + ": " + $pageLines[$i].Trim())
        $shown++
    }
}

Write-Host ""
Write-Host "--- Conformite AGENTS.md : recherche de lucide-react (interdit) ---"
$lucideCount = 0
foreach ($p in @($pagePath, $routePath, $studioPath, $qrTplPath)) {
    if (Test-Path -LiteralPath $p) {
        $hits = @(Select-String -LiteralPath $p -Pattern 'lucide-react' -SimpleMatch)
        foreach ($h in $hits) {
            $lucideCount++
            Write-Host ("[LUCIDE] " + $p + " L" + $h.LineNumber + ": " + $h.Line.Trim())
        }
    }
}
if ($lucideCount -eq 0) {
    Write-Host "[OK] aucun import lucide-react dans les fichiers du module CV public."
}

Write-Host ""
Write-Host "--- Risques d'hydratation dans page.tsx (Math.random / Date.now / window) ---"
$hydHits = @(Select-String -LiteralPath $pagePath -Pattern 'Math\.random|Date\.now|typeof window|window\.')
if ($hydHits.Count -gt 0) {
    foreach ($h in $hydHits) { Write-Host ("L" + $h.LineNumber + ": " + $h.Line.Trim()) }
} else {
    Write-Host "[OK] aucun motif a risque detecte."
}

Write-Host ""
Write-Host "--- Exigence 'page publique sans menu (header)' ---"
if (Test-Path -LiteralPath $layoutPath) {
    $layoutHits = @(Select-String -LiteralPath $layoutPath -Pattern 'Header|Navbar|SiteHeader|AppHeader')
    if ($layoutHits.Count -gt 0) {
        foreach ($h in $layoutHits) { Write-Host ("layout.tsx L" + $h.LineNumber + ": " + $h.Line.Trim()) }
    } else {
        Write-Host "[OK] src/app/layout.tsx ne monte aucun Header/Navbar global."
    }
} else {
    Write-Host "[INFO] src/app/layout.tsx introuvable a cet emplacement."
}
$uHits = @(Select-String -LiteralPath $pagePath -Pattern 'Header|Navbar|SiteHeader|AppHeader')
if ($uHits.Count -gt 0) {
    foreach ($h in $uHits) { Write-Host ("page.tsx L" + $h.LineNumber + ": " + $h.Line.Trim()) }
} else {
    Write-Host "[OK] la page /u/[slug] n'importe aucun Header/Navbar (conforme a ta demande)."
}

# =============================================================================
Write-Banner "PARTIE 1 - Creation de src/lib/normalize-cv.ts (nouveau fichier)"
# =============================================================================

$libTs = @'
// =============================================================================
// src/lib/normalize-cv.ts - NexiRole
// Normalisation tolerante des donnees CV pour la page publique /u/[slug].
//
// Contexte : le PDF public (/api/public-cv?format=pdf) affiche deja le CV
// complet, mais la page web affichait une version tronquee (titre errone,
// aucune experience, une seule competence, formation partielle). Les deux
// lisent le MEME enregistrement Prisma : le probleme venait de la fonction
// de normalisation web, qui ne couvrait pas toutes les cles historiques de
// cvData (apres les mises a jour incrementales, anciens et nouveaux champs
// coexistent dans le meme objet JSON).
//
// Strategie : pour chaque section, toutes les cles candidates (FR + EN)
// sont scannees et la liste la plus RICHE gagne (nombre d'elements +
// volume de texte). Aucune liste n'est jamais tronquee. Les entrees vides
// ou parasites ("...", "Ajouter...") sont filtrees.
//
// Fichier pur TypeScript (aucune dependance React ni PDF) : utilisable
// cote serveur sans aucun impact d'hydratation.
// =============================================================================

export type NormalizedExperience = {
  role: string;
  company: string;
  period: string;
  description: string;
};

export type NormalizedEducation = {
  school: string;
  degree: string;
  period: string;
  description: string;
};

export type NormalizedCv = {
  name: string;
  title: string;
  photo: string | null;
  email: string;
  phone: string;
  location: string;
  website: string;
  summary: string;
  experiences: NormalizedExperience[];
  educations: NormalizedEducation[];
  skills: string[];
  languages: string[];
  slug?: string;
  viewsCount?: number;
};

type AnyRec = Record<string, unknown>;

const EXPERIENCE_KEYS: string[] = ["experiences", "experience", "work", "workExperience", "workExperiences", "professionalExperiences", "jobs", "emplois", "parcours", "professions"];
const EDUCATION_KEYS: string[] = ["educations", "education", "formations", "formation", "studies", "academics", "academic", "diplomes"];
const SKILL_KEYS: string[] = ["skills", "competences", "competencies", "technicalSkills", "hardSkills", "keySkills", "skillsList", "atouts"];
const LANGUAGE_KEYS: string[] = ["languages", "langues", "languageList"];
const SUMMARY_KEYS: string[] = ["summary", "profil", "profile", "resume", "objectif", "objective", "bio", "about", "presentation"];
const TITLE_KEYS: string[] = ["jobTitle", "headline", "titrePoste", "posteOccupe", "position", "title", "poste", "titre", "fonction", "metier"];
const PHOTO_KEYS: string[] = ["photo", "photoUrl", "photoProfil", "profilePhoto", "photoDeProfil", "avatar", "image", "profileImage"];
const NAME_KEYS: string[] = ["name", "fullName", "nom", "nomComplet", "nomPrenom", "displayName"];

function asRec(value: unknown): AnyRec | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as AnyRec;
  }
  return null;
}

function cleanText(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || /^\.+$/.test(trimmed)) return "";
    return trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function pickStr(source: AnyRec | null, keys: string[]): string {
  if (!source) return "";
  for (const key of keys) {
    const found = cleanText(source[key]);
    if (found) return found;
  }
  return "";
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const rec = asRec(value);
  if (rec) {
    for (const key of ["items", "list", "data", "values"]) {
      if (Array.isArray(rec[key])) return rec[key] as unknown[];
    }
  }
  return [];
}

function arrayScore(items: unknown[]): number {
  let score = items.length * 10;
  for (const item of items) {
    if (typeof item === "string") {
      score += Math.min(item.trim().length, 80);
    } else if (asRec(item)) {
      score += 20;
    }
  }
  return score;
}

function bestArrayFromSources(sources: AnyRec[], keys: string[]): unknown[] {
  let best: unknown[] = [];
  let bestScore = 0;
  for (const source of sources) {
    for (const key of keys) {
      const candidate = asArray(source[key]);
      if (candidate.length > 0) {
        const score = arrayScore(candidate);
        if (score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
    }
  }
  return best;
}

function isGarbageText(value: string): boolean {
  const lower = value.trim().toLowerCase();
  if (lower.length < 2) return true;
  if (/^\.+$/.test(lower)) return true;
  if (/^(ajou|add|nouvel|new|exemp|placehold|lorem|demo)/.test(lower)) return true;
  return false;
}

function joinBullets(value: unknown): string {
  if (typeof value === "string") return cleanText(value);
  const items = asArray(value);
  if (items.length > 0) {
    const parts: string[] = [];
    for (const item of items) {
      const text = cleanText(item);
      if (text) parts.push(text);
    }
    if (parts.length > 0) return parts.join(" \u2022 ");
  }
  return "";
}

function composePeriod(source: AnyRec | null): string {
  const direct = pickStr(source, ["periode", "period", "dates", "duree", "duration", "annees", "years"]);
  if (direct) return direct;
  const start = pickStr(source, ["dateDebut", "startDate", "debut", "start", "from", "anneeDebut"]);
  const end = pickStr(source, ["dateFin", "endDate", "fin", "end", "to", "anneeFin"]);
  if (start && end) return start + " - " + end;
  if (start) return start + " - aujourd'hui";
  if (end) return end;
  return "";
}

function normalizeExperienceItem(item: unknown): NormalizedExperience | null {
  const rec = asRec(item);
  if (!rec) {
    const text = cleanText(item);
    if (!text || isGarbageText(text)) return null;
    return { role: text, company: "", period: "", description: "" };
  }
  const role = pickStr(rec, ["poste", "role", "title", "intitule", "intitulePoste", "position", "jobTitle", "fonction", "metier", "nom"]);
  const company = pickStr(rec, ["entreprise", "company", "employeur", "societe", "employer", "organisation", "structure"]);
  const period = composePeriod(rec);
  let description = "";
  const descriptionKeys = ["description", "details", "missions", "contenu", "realisations", "achievements", "accomplissements", "resume", "text", "tasks", "taches"];
  for (const key of descriptionKeys) {
    const joined = joinBullets(rec[key]);
    if (joined) {
      description = joined;
      break;
    }
  }
  if (!role && !company && !description && !period) return null;
  return { role, company, period, description };
}

function normalizeEducationItem(item: unknown): NormalizedEducation | null {
  const rec = asRec(item);
  if (!rec) {
    const text = cleanText(item);
    if (!text || isGarbageText(text)) return null;
    return { school: "", degree: text, period: "", description: "" };
  }
  const school = pickStr(rec, ["ecole", "school", "universite", "university", "institution", "etablissement", "organisme"]);
  const degree = pickStr(rec, ["diplome", "degree", "formation", "titre", "certificat", "certificate", "programme", "intitule", "niveau", "specialite", "domaine", "field"]);
  const period = composePeriod(rec);
  const description = pickStr(rec, ["description", "details", "mention", "note", "info"]);
  if (!school && !degree && !period && !description) return null;
  return { school, degree, period, description };
}

function normalizeSkillsFromSources(sources: AnyRec[]): string[] {
  let bestItems: unknown[] = [];
  let bestScore = 0;
  for (const source of sources) {
    for (const key of SKILL_KEYS) {
      const value = source[key];
      if (Array.isArray(value)) {
        const score = arrayScore(value);
        if (score > bestScore) {
          bestItems = value;
          bestScore = score;
        }
      } else if (typeof value === "string" && cleanText(value)) {
        const single: unknown[] = [value];
        const score = 10 + Math.min(cleanText(value).length, 80);
        if (score > bestScore) {
          bestItems = single;
          bestScore = score;
        }
      } else {
        const rec = asRec(value);
        if (rec) {
          const keys = Object.keys(rec);
          const score = keys.length * 10 + 20;
          if (score > bestScore) {
            bestItems = keys;
            bestScore = score;
          }
        }
      }
    }
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of bestItems) {
    const rec = asRec(item);
    const text = rec
      ? pickStr(rec, ["name", "nom", "label", "titre", "skill", "competence", "intitule"])
      : cleanText(item);
    if (!text || isGarbageText(text)) continue;
    const lower = text.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(text);
  }
  if (result.length === 1 && result[0].includes(",")) {
    const parts = result[0]
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 1 && !isGarbageText(part));
    if (parts.length > 1) return parts;
  }
  return result;
}

function normalizeLanguagesFromSources(sources: AnyRec[]): string[] {
  let bestItems: unknown[] = [];
  let bestScore = 0;
  for (const source of sources) {
    for (const key of LANGUAGE_KEYS) {
      const value = source[key];
      if (Array.isArray(value)) {
        const score = arrayScore(value);
        if (score > bestScore) {
          bestItems = value;
          bestScore = score;
        }
      } else if (typeof value === "string" && cleanText(value)) {
        const single: unknown[] = [value];
        const score = 10 + Math.min(cleanText(value).length, 80);
        if (score > bestScore) {
          bestItems = single;
          bestScore = score;
        }
      } else {
        const rec = asRec(value);
        if (rec) {
          const entries: unknown[] = Object.keys(rec).map((mapKey) => ({
            name: mapKey,
            level: cleanText(rec[mapKey]),
          }));
          const score = entries.length * 10 + 20;
          if (score > bestScore) {
            bestItems = entries;
            bestScore = score;
          }
        }
      }
    }
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of bestItems) {
    let name = "";
    let level = "";
    const rec = asRec(item);
    if (rec) {
      name = pickStr(rec, ["language", "langue", "name", "nom", "label", "intitule", "titre"]);
      level = pickStr(rec, ["level", "niveau", "proficiency", "maitrise"]);
      if (!name) {
        const keys = Object.keys(rec);
        if (keys.length === 1) {
          name = keys[0];
          level = cleanText(rec[keys[0]]);
        }
      }
    } else {
      name = cleanText(item);
    }
    if (!name || isGarbageText(name)) continue;
    const lower = name.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(level ? name + " (" + level + ")" : name);
  }
  if (result.length === 1 && result[0].includes(",")) {
    const parts = result[0]
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 1 && !isGarbageText(part));
    if (parts.length > 1) return parts;
  }
  return result;
}

function extractPersonal(root: AnyRec): AnyRec {
  for (const key of ["personal", "profile", "identity", "infos", "contact"]) {
    const rec = asRec(root[key]);
    if (rec) return rec;
  }
  return root;
}

function extractName(personal: AnyRec, root: AnyRec): string {
  const direct = pickStr(personal, NAME_KEYS);
  if (direct) return direct;
  const first = pickStr(personal, ["firstName", "prenom"]);
  const last = pickStr(personal, ["lastName", "nomFamille"]);
  const joined = (first + " " + last).trim();
  if (joined) return joined;
  return pickStr(root, NAME_KEYS);
}

function extractTitle(personal: AnyRec, root: AnyRec): string {
  let best = "";
  for (const source of [personal, root]) {
    for (const key of TITLE_KEYS) {
      const value = cleanText(source[key]);
      if (value.length > best.length) best = value;
    }
  }
  return best;
}

function extractSummary(personal: AnyRec, root: AnyRec): string {
  let best = "";
  for (const source of [personal, root]) {
    for (const key of SUMMARY_KEYS) {
      const value = cleanText(source[key]);
      if (value.length > best.length) best = value;
    }
  }
  return best;
}

function extractPhotoValue(source: AnyRec, keys: string[]): string | null {
  for (const key of keys) {
    const value = cleanText(source[key]);
    if (!value) continue;
    if (/^data:image\/(png|jpe?g|webp);base64,/i.test(value)) return value;
    if (/^https?:\/\/\S+$/i.test(value)) return value;
  }
  return null;
}

function extractPhoto(personal: AnyRec, root: AnyRec): string | null {
  return extractPhotoValue(personal, PHOTO_KEYS) || extractPhotoValue(root, PHOTO_KEYS);
}

export function normalizeCv(raw: unknown): NormalizedCv {
  const root = asRec(raw) ?? {};
  const sources: AnyRec[] = [root];
  const sections = asRec(root["sections"]);
  if (sections) sources.push(sections);
  const nested = asRec(root["data"]);
  if (nested) sources.push(nested);
  const personal = extractPersonal(root);

  const experienceItems = bestArrayFromSources(sources, EXPERIENCE_KEYS);
  const experiences: NormalizedExperience[] = [];
  for (const item of experienceItems) {
    const normalized = normalizeExperienceItem(item);
    if (normalized) experiences.push(normalized);
  }

  const educationItems = bestArrayFromSources(sources, EDUCATION_KEYS);
  const educations: NormalizedEducation[] = [];
  for (const item of educationItems) {
    const normalized = normalizeEducationItem(item);
    if (normalized) educations.push(normalized);
  }

  return {
    name: extractName(personal, root),
    title: extractTitle(personal, root),
    photo: extractPhoto(personal, root),
    email: pickStr(personal, ["email", "mail", "courriel"]) || pickStr(root, ["email", "mail"]),
    phone: pickStr(personal, ["phone", "telephone", "tel", "mobile", "whatsapp", "numero"]) || pickStr(root, ["phone", "telephone"]),
    location: pickStr(personal, ["location", "ville", "city", "adresse", "localisation", "pays"]) || pickStr(root, ["location", "ville"]),
    website: pickStr(personal, ["website", "site", "siteWeb", "portfolio", "url", "linkedin", "linkedinUrl", "github", "web"]) || pickStr(root, ["website", "linkedin"]),
    summary: extractSummary(personal, root),
    experiences,
    educations,
    skills: normalizeSkillsFromSources(sources),
    languages: normalizeLanguagesFromSources(sources),
  };
}

export default normalizeCv;
'@

if (Test-Path -LiteralPath $libPath) {
    $libBackup = $libPath + ".bak-cvcomplet"
    Copy-Item -LiteralPath $libPath -Destination $libBackup -Force
    Write-Host ("Sauvegarde existante : " + $libBackup)
}
Write-FileText $libPath $libTs
Write-Host ("[ECRIT] " + $libPath)

# =============================================================================
Write-Banner "PARTIE 2 - Patch chirurgical de src/app/u/[slug]/page.tsx"
# =============================================================================

$pageBackup = $pagePath + ".bak-cvcomplet"
Copy-Item -LiteralPath $pagePath -Destination $pageBackup -Force
Write-Host ("Sauvegarde : " + $pageBackup)

$funcStart = -1
for ($i = 0; $i -lt $pageLines.Count; $i++) {
    if ($pageLines[$i] -match '^\s*(export\s+)?(async\s+)?function\s+normalizeCv\b' -or
        $pageLines[$i] -match '^\s*(export\s+)?const\s+normalizeCv\b') {
        $funcStart = $i
        break
    }
}

if ($funcStart -lt 0) {
    Write-Host "[INFO] aucune fonction locale 'normalizeCv' trouvee dans page.tsx."
    Write-Host "       Soit le fichier a deja ete corrige, soit la fonction porte un autre nom."
    Write-Host "       Aucune modification appliquee a page.tsx : copie-colle moi la sortie PARTIE 0."
} else {
    $depth = 0
    $sawOpen = $false
    $funcEnd = -1
    for ($i = $funcStart; $i -lt $pageLines.Count; $i++) {
        foreach ($ch in $pageLines[$i].ToCharArray()) {
            if ($ch -eq '{') { $depth++; $sawOpen = $true }
            elseif ($ch -eq '}') { $depth-- }
        }
        if ($sawOpen -and $depth -le 0) { $funcEnd = $i; break }
    }
    if ($funcEnd -lt 0) {
        Write-Host "[ARRET] fin du bloc normalizeCv introuvable : aucune modification appliquee."
        Write-Host "        Colle-moi la sortie PARTIE 0 pour un patch cible."
    } else {
        Write-Host ("Bloc local 'normalizeCv' detecte : lignes " + ($funcStart + 1) + " a " + ($funcEnd + 1) + ".")
        Write-Host 'Il sera remplace par : import { normalizeCv } from "@/lib/normalize-cv";'
        Write-Host "--- Extrait du bloc actuel (30 premieres lignes) ---"
        $printEnd = [Math]::Min($funcEnd, $funcStart + 29)
        for ($i = $funcStart; $i -le $printEnd; $i++) {
            Write-Host ("L" + ($i + 1) + ": " + $pageLines[$i])
        }
        if (($funcEnd - $funcStart) -ge 30) {
            Write-Host ("... (+ " + ($funcEnd - $funcStart - 29) + " autres lignes, copie integrale dans la sauvegarde .bak-cvcomplet)")
        }

        $keep = New-Object System.Collections.Generic.List[string]
        for ($i = 0; $i -lt $pageLines.Count; $i++) {
            if ($i -ge $funcStart -and $i -le $funcEnd) { continue }
            $keep.Add($pageLines[$i])
        }

        $importLine = 'import { normalizeCv } from "@/lib/normalize-cv";'
        $lastImport = -1
        for ($i = 0; $i -lt $keep.Count; $i++) {
            if ($keep[$i] -match '^\s*import\b' -and $keep[$i] -match 'from\s+["'']') { $lastImport = $i }
            elseif ($keep[$i] -match '^\s*\}\s*from\s+["'']') { $lastImport = $i }
        }
        if ($lastImport -ge 0) {
            $keep.Insert($lastImport + 1, $importLine)
        } else {
            $keep.Insert(0, $importLine)
        }

        $newText = [string]::Join("`r`n", $keep) + "`r`n"
        Write-FileText $pagePath $newText
        Write-Host "[ECRIT] page.tsx mis a jour (fonction locale supprimee + import de la librairie)."

        $checkLines = [System.IO.File]::ReadAllLines($pagePath)
        $stillThere = $false
        foreach ($l in $checkLines) {
            if ($l -match 'function\s+normalizeCv\b') { $stillThere = $true }
        }
        if ($stillThere) {
            Write-Host "[WARN] une definition normalizeCv subsiste : verifie manuellement."
        } else {
            Write-Host "[OK] verification : plus aucune definition locale normalizeCv."
        }
    }
}

# =============================================================================
Write-Banner "PARTIE 3 - Route de diagnostic /api/debug-public-cv (fichier additif)"
# =============================================================================

$importLine = $null
$binding = "prisma"

$allRouteLines = [System.IO.File]::ReadAllLines($routePath)
foreach ($l in $allRouteLines) {
    if (-not $importLine) {
        if ($l -match '^\s*import\b' -and $l -match 'from\s+["'']') {
            if ($l -match '(?i)prisma' -or $l -match 'from\s+["'']@/lib/(db|database)["'']') {
                $importLine = $l.Trim()
                if ($importLine -match '\{([^}]+)\}') {
                    foreach ($n in ($Matches[1] -split ',')) {
                        $t = $n.Trim()
                        if ($t -match '^(\w+)\s+as\s+(\w+)$') { $binding = $Matches[2]; break }
                        elseif ($t -match '^(\w+)$') { $binding = $Matches[1]; break }
                    }
                }
            }
        }
    }
}
if (-not $importLine) {
    foreach ($l in $pageLines) {
        if (-not $importLine) {
            if ($l -match '^\s*import\b' -and $l -match 'from\s+["'']') {
                if ($l -match '(?i)prisma' -or $l -match 'from\s+["'']@/lib/(db|database)["'']') {
                    $importLine = $l.Trim()
                    if ($importLine -match '\{([^}]+)\}') {
                        foreach ($n in ($Matches[1] -split ',')) {
                            $t = $n.Trim()
                            if ($t -match '^(\w+)\s+as\s+(\w+)$') { $binding = $Matches[2]; break }
                            elseif ($t -match '^(\w+)$') { $binding = $Matches[1]; break }
                        }
                    }
                }
            }
        }
    }
}

if (-not $importLine) {
    Write-Host "[INFO] ligne d'import Prisma introuvable : route de diagnostic non creee."
    Write-Host "       Envoie-moi les premieres lignes de src/app/api/public-cv/route.ts."
} else {
    $debugTs = @'
// =============================================================================
// src/app/api/debug-public-cv/route.ts - NexiRole (DIAGNOSTIC TEMPORAIRE)
// Renvoie le cvData brut enregistre en base pour un slug public donne.
// N'expose QUE les donnees deja publiques (isPublic = true), les memes que
// la page /u/[slug] affiche deja. A supprimer apres le diagnostic.
// =============================================================================
import { NextResponse } from "next/server";
__PRISMA_IMPORT__

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug) {
    return NextResponse.json(
      { error: "Parametre slug requis. Exemple : /api/debug-public-cv?slug=kouton-clement" },
      { status: 400 }
    );
  }
  try {
    const record = await __PRISMA_BINDING__.publicResume.findUnique({ where: { slug } });
    if (!record || !record.isPublic) {
      return NextResponse.json(
        { error: "CV public introuvable ou prive pour ce slug" },
        { status: 404 }
      );
    }
    const cvData = (record.cvData ?? {}) as unknown as Record<string, unknown>;
    const personal = (cvData["personal"] ?? {}) as unknown as Record<string, unknown>;
    return NextResponse.json({
      slug: record.slug,
      isPublic: record.isPublic,
      templateId: record.templateId,
      viewsCount: record.viewsCount,
      updatedAt: record.updatedAt,
      topKeys: Object.keys(cvData),
      personalKeys: Object.keys(personal),
      raw: cvData,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
'@
    $debugTs = $debugTs.Replace("__PRISMA_IMPORT__", $importLine).Replace("__PRISMA_BINDING__", $binding)
    if (Test-Path -LiteralPath $debugPath) {
        Copy-Item -LiteralPath $debugPath -Destination ($debugPath + ".bak-cvcomplet") -Force
    }
    Write-FileText $debugPath $debugTs
    Write-Host ("[ECRIT] " + $debugPath)
    Write-Host ("        import detecte  : " + $importLine)
    Write-Host ("        binding utilise : " + $binding)
    $hasModel = ($routeText -match 'publicResume') -or ($pageText -match 'publicResume')
    if ($hasModel) {
        Write-Host "[OK] accesseur 'publicResume' confirme dans le code existant."
    } else {
        Write-Host "[WARN] accesseur 'publicResume' non trouve dans route.ts / page.tsx : a verifier."
    }
}

# =============================================================================
Write-Banner "PARTIE 4 - Validation TypeScript (npx tsc --noEmit)"
# =============================================================================

if ($SkipTsc) {
    Write-Host "[SKIP] validation ignoree (option -SkipTsc)."
} else {
    Write-Host "(30 a 60 secondes, patience...)"
    $tscOutput = $null
    try {
        $tscOutput = (& npx tsc --noEmit 2>&1) | Out-String
    } catch {
        Write-Host ("[WARN] tsc n'a pas pu etre lance : " + $_.Exception.Message)
    }
    if ($tscOutput) {
        $allLines = $tscOutput -split "`r?`n"
        $errorLines = @($allLines | Where-Object { $_ -match 'error TS\d+' })
        Write-Host ("Total d'erreurs TypeScript dans tout le projet : " + $errorLines.Count)
        Write-Host "--- Erreurs liees aux fichiers du module CV public (les seules critiques ici) ---"
        $relevant = @($errorLines | Where-Object { $_ -match 'normalize-cv|u\[slug\]|u/|public-cv|debug-public-cv|PublicCvStudio|CvPdfQrTemplates' })
        if ($relevant.Count -gt 0) {
            foreach ($r in $relevant) { Write-Host $r }
            Write-Host "=> copie-colle ces lignes pour correction ciblee."
        } else {
            Write-Host "[OK] aucune erreur TypeScript dans les fichiers du module CV public."
        }
    }
}

# =============================================================================
Write-Banner "PARTIE 5 - TERMINE - prochains gestes"
# =============================================================================

Write-Host ""
Write-Host "1) Redemarre le serveur si besoin :  Ctrl+C  puis  npm run dev"
Write-Host "2) Ouvre http://localhost:3000/u/kouton-clement et verifie que le CV"
Write-Host "   s'affiche EN ENTIER (3 experiences, 12 competences, 3 formations,"
Write-Host "   langues avec niveau, titre complet)."
Write-Host "3) Si une donne manque encore : ouvre"
Write-Host "   http://localhost:3000/api/debug-public-cv?slug=kouton-clement"
Write-Host "   et copie-colle le JSON recu."
Write-Host ""
Write-Host "Annulation complete (rollback) :"
Write-Host ('  Copy-Item -LiteralPath "' + $pageBackup + '" -Destination "' + $pagePath + '" -Force')
Write-Host ('  Remove-Item -LiteralPath "' + $libPath + '"')
Write-Host ""
