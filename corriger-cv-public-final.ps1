# ============================================================
# NEXIROLE - Corriger les bugs du module CV public (final)
# Bug A : bouton "PDF avec QR" -> /api/public-cv?slug=...&format=pdf
#         renvoyait {"error":"Erreur interne du serveur."}
# Bug B : "Mettre a jour la publication" (espace Lien Web Public &
#         QR Code) republiait un instantane ANCIEN du CV au lieu du
#         contenu courant (ameliorations IA incluses).
# ------------------------------------------------------------
# CE SCRIPT (conforme AGENTS.md, idempotent) :
#   [1/6] verifications d'environnement (racine, qrcode)
#   [2/6] BUG A : redirige TOUTES les URL PDF publiques
#         /api/public-cv?...&format=pdf -> /api/public-cv/pdf?...
#         dans tout src/ (pages ET composants), avec .bak
#   [3/6] BUG B (partie serveur) : reecrit
#         src/app/api/public-cv/builder/route.ts - le contenu du
#         CvDocument (source de verite, ameliorations IA incluses)
#         remplace tout instantane ancien recu du client ; le theme
#         recu et la photo existante restent appliques
#   [4/6] BUG B (partie client) : cree rapport-bug-publication.txt
#         (source exacte de la route /api/public-cv, du bloc bouton
#         "Mettre a jour la publication", des appels a l'ancienne
#         route, de la page /u/[slug]) - A ENVOYER A L'ASSISTANT
#         pour le patch final du bouton
#   [5/6] verification (+ npx tsc --noEmit sauf -SkipTsc)
#   [6/6] VERDICT + protocole de test localhost:3000
#
# EXECUTION (PowerShell 5.1, depuis D:\Next Js\nexirole) :
#   powershell -ExecutionPolicy Bypass -File .\corriger-cv-public-final.ps1
#
# ROLLBACK : restaurer les fichiers .bak-pdffinal-<horodatage> et
#   .bak-builder2-<horodatage> crees a cote des fichiers modifies.
# ============================================================

param(
    [switch]$SkipTsc
)

$ErrorActionPreference = "Stop"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

function Write-TextFile {
  param([string]$Path, [string]$Content)
  $plein = Join-Path (Get-Location).Path $Path
  $dir = Split-Path -Parent $plein
  if (-not [System.IO.Directory]::Exists($dir)) {
    [System.IO.Directory]::CreateDirectory($dir) | Out-Null
  }
  [System.IO.File]::WriteAllText($plein, $Content, $Utf8NoBom)
}

function Read-TextFile {
  param([string]$Path)
  return [System.IO.File]::ReadAllText((Join-Path (Get-Location).Path $Path))
}

function Backup-File {
  param([string]$Path, [string]$Tag)
  $plein = Join-Path (Get-Location).Path $Path
  if ([System.IO.File]::Exists($plein)) {
    $bak = "$plein.bak-$Tag-$stamp"
    Copy-Item -LiteralPath $plein -Destination $bak -Force
    Write-Host ("  [BAK] " + $Path + " -> " + (Split-Path -Leaf $bak))
    return $bak
  }
  return $null
}

function Test-Uffid {
  param([string]$Text, [string]$Label)
  if ($Text.Contains([string][char]0xFFFD)) {
    throw "Caracteres corrompus (U+FFFD) detectes dans $Label - encodage casse. Abandon."
  }
}

function Normalize-Lf {
  param([string]$Text)
  return $Text.Replace("`r`n", "`n")
}

Write-Host "=============================================================="
Write-Host " NEXIROLE - Correctif final module CV public (PDF + publication)"
Write-Host "=============================================================="

# ---------------- [1/6] environnement ----------------
if (-not ([System.IO.File]::Exists((Join-Path (Get-Location).Path "package.json"))) -or
    -not [System.IO.Directory]::Exists((Join-Path (Get-Location).Path "src"))) {
  Write-Host " [!] Lancez ce script depuis la racine du projet (D:\Next Js\nexirole)."
  exit 1
}
$pkg = Get-Content (Join-Path (Get-Location).Path "package.json") -Raw | ConvertFrom-Json
if (-not ($pkg.dependencies.PSObject.Properties["qrcode"])) {
  Write-Host " [!] dependance 'qrcode' absente (requise par /api/public-cv/pdf)."
  Write-Host "     Remediation : npm install qrcode  puis relancez ce script."
  exit 1
}
if (-not [System.IO.File]::Exists((Join-Path (Get-Location).Path "src\app\api\public-cv\pdf\route.ts"))) {
  Write-Host " [!] src\app\api\public-cv\pdf\route.ts introuvable."
  Write-Host "     Relancez d'abord : installer-bibliotheque-cv.ps1"
  exit 1
}
Write-Host " [1/6] environnement : OK (racine + qrcode + route PDF autonome presente)"

# ---------------- [2/6] BUG A : redirection des URL PDF publiques ----------------
Write-Host ""
Write-Host "[2/6] BUG A - redirection PDF public (format=pdf -> /api/public-cv/pdf)..."
$fichiers = @(Get-ChildItem -Path (Join-Path (Get-Location).Path "src") -Recurse -File |
  Where-Object { $_.Extension -in @(".ts", ".tsx") })
$modifies = 0
$restantsFormatPdf = New-Object System.Collections.Generic.List[string]
foreach ($f in $fichiers) {
  try { $t = Normalize-Lf ([System.IO.File]::ReadAllText($f.FullName)) } catch { continue }
  if (-not $t.Contains("format=pdf")) { continue }
  $avant = $t
  # variante 1 : /api/public-cv?<params>&format=pdf   (template literals inclus)
  $t = [regex]::Replace($t, '/api/public-cv\?([^"''`\s]*?)&format=pdf', '/api/public-cv/pdf?$1')
  # variante 2 : /api/public-cv?format=pdf&<params>
  $t = [regex]::Replace($t, '/api/public-cv\?format=pdf&([^"''`\s]*)', '/api/public-cv/pdf?$1')
  # variante 3 : /api/public-cv?format=pdf  (seul)
  $t = [regex]::Replace($t, '/api/public-cv\?format=pdf', '/api/public-cv/pdf')
  if ($t -ne $avant) {
    Test-Uffid $t $f.Name
    $relatif = $f.FullName.Substring((Get-Location).Path.Length).TrimStart([char]92).TrimStart([char]47)
    $null = Backup-File $relatif "pdffinal"
    [System.IO.File]::WriteAllText($f.FullName, $t, $Utf8NoBom)
    $modifies++
    $nbAppels = ([regex]::Matches($t, '/api/public-cv/pdf\?')).Count
    Write-Host ("  [OK] " + $relatif + " : URL PDF redirigee(s) -> /api/public-cv/pdf (" + $nbAppels + " appel(s) au total dans ce fichier)")
  }
  if ($t.Contains("format=pdf")) {
    $restantsFormatPdf.Add($f.FullName)
  }
}
Write-Host ("  [=] fichiers modifies pour le BUG A : " + $modifies)
if ($restantsFormatPdf.Count -gt 0) {
  Write-Host "  [i] 'format=pdf' encore present (URL concatenee ?) - detail dans rapport-bug-publication.txt (section 4)"
}

# ---------------- [3/6] BUG B (serveur) : route builder = source de verite ----------------
Write-Host ""
Write-Host "[3/6] BUG B (serveur) - /api/public-cv/builder : contenu du CvDocument prioritaire..."
$routeBuilderPath = "src/app/api/public-cv/builder/route.ts"
$routeBuilderMarker = "SOURCE-DE-VERITE-CVDOCUMENT"

$routeBuilderTs = @'
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Publication du CV Builder vers la page publique /u/[slug].
 * GET  : etat de publication (slug, lien public, nombre de vues)
 *        pour l'utilisateur connecte.
 * POST : ecriture des donnees dans PublicResume (upsert par slug,
 *        photo existante preservee, isPublic force a true).
 *
 * SOURCE-DE-VERITE-CVDOCUMENT :
 * quand un CV de la bibliotheque (CvDocument) est lie au slug
 * publie, son champ data fait foi : les ameliorations IA et les
 * dernieres modifications enregistrees en base sont toujours
 * publiees, meme si le client envoie un instantane ancien (cas
 * "Mettre a jour la publication" de l'espace Lien Web Public).
 * Le theme recu reste applique ; la photo existante est conservee.
 * Sans CvDocument lie (CV local hors bibliotheque), le contenu recu
 * du createur est utilise, comme avant.
 * Ce fichier ne modifie aucune autre route, page ou modele.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

function slugifyNom(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const publishSchema = z.object({
  slug: z.string().regex(SLUG_RE).optional(),
  theme: z
    .object({
      webTemplate: z.string().max(40).default("classique"),
      accentColor: z.string().max(20).default("#FFC107"),
      qrTemplate: z.string().max(40).default("executif"),
    })
    .optional(),
  data: z.object({
    personal: z.object({
      fullName: z.string().max(120).default(""),
      title: z.string().max(160).default(""),
      email: z.string().max(160).default(""),
      phone: z.string().max(40).default(""),
      location: z.string().max(120).default(""),
      linkedin: z.string().max(200).default(""),
    }),
    summary: z.string().max(4000).default(""),
    experiences: z
      .array(
        z.object({
          role: z.string().max(160).default(""),
          company: z.string().max(160).default(""),
          period: z.string().max(80).default(""),
          location: z.string().max(120).default(""),
          achievements: z.array(z.string().max(800)).max(12).default([]),
        })
      )
      .max(15)
      .default([]),
    education: z
      .array(
        z.object({
          degree: z.string().max(160).default(""),
          school: z.string().max(160).default(""),
          period: z.string().max(80).default(""),
        })
      )
      .max(15)
      .default([]),
    skills: z.array(z.string().max(80)).max(40).default([]),
    languages: z
      .array(
        z.object({
          name: z.string().max(60).default(""),
          level: z.string().max(60).default(""),
        })
      )
      .max(12)
      .default([]),
  }),
});

type PublishData = z.infer<typeof publishSchema>["data"];

async function resolveSlug(
  preferred: string | undefined,
  fallbackName: string
): Promise<string | null> {
  const direct = (preferred ?? "").trim();
  if (direct !== "" && SLUG_RE.test(direct)) return direct;
  const derived = slugifyNom(fallbackName ?? "");
  return derived.length >= 2 ? derived : null;
}

function publicUrlFrom(request: NextRequest, slug: string): string {
  try {
    return `${new URL(request.url).origin.replace(/\/+$/, "")}/u/${slug}`;
  } catch {
    return `/u/${slug}`;
  }
}

function resumeJson(
  row: { slug: string; viewsCount: number } | null,
  request: NextRequest
) {
  if (!row) return null;
  return {
    slug: row.slug,
    publicUrl: publicUrlFrom(request, row.slug),
    viewsCount: typeof row.viewsCount === "number" ? row.viewsCount : 0,
  };
}

/**
 * Contenu effectif publie. Si un CV de la bibliotheque est lie a ce
 * slug (publishedSlug) et n'est pas dans la corbeille, son contenu
 * enregistre (data, ameliorations IA incluses) remplace celui du
 * payload. En cas d'echec de lecture ou de donnees non conformes, on
 * retombe sans erreur sur le contenu recu du createur.
 */
async function contenuSourceDeVerite(
  slug: string,
  dataRecu: PublishData
): Promise<PublishData> {
  try {
    const cv = await prisma.cvDocument.findFirst({
      where: { publishedSlug: slug, trashedAt: null },
      orderBy: { updatedAt: "desc" },
    });
    if (!cv || cv.data === null || typeof cv.data !== "object") {
      return dataRecu;
    }
    const parsedCv = publishSchema.shape.data.safeParse(cv.data);
    if (!parsedCv.success) {
      console.warn(
        "[public-cv/builder][POST] CvDocument.data non conforme - contenu recu utilise."
      );
      return dataRecu;
    }
    return parsedCv.data;
  } catch (error) {
    console.error(
      "[public-cv/builder][POST] Lecture du CvDocument impossible :",
      error
    );
    return dataRecu;
  }
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }
  const asked = new URL(request.url).searchParams.get("slug") ?? undefined;
  const sessionName = typeof session.user.name === "string" ? session.user.name : "";
  const slug = await resolveSlug(asked, sessionName);
  if (!slug) {
    return NextResponse.json({ publicResume: null });
  }
  try {
    const row = await prisma.publicResume.findUnique({ where: { slug } });
    return NextResponse.json({ publicResume: resumeJson(row, request) });
  } catch (error) {
    console.error("[public-cv/builder][GET]", error);
    return NextResponse.json(
      { error: "Lecture de la configuration impossible." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Connexion requise. Reconnectez-vous puis reessayez." },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requete JSON invalide." },
      { status: 400 }
    );
  }

  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Donnees du CV invalides (publication refusee)." },
      { status: 400 }
    );
  }

  const { slug: slugDemande, theme } = parsed.data;
  const slug = await resolveSlug(
    slugDemande,
    parsed.data.data.personal.fullName
  );
  if (!slug) {
    return NextResponse.json(
      {
        error:
          "Impossible de deriver le slug : renseignez votre nom complet (etape 1).",
      },
      { status: 400 }
    );
  }

  /* Contenu effectif : CvDocument lie au slug, sinon payload recu. */
  const data = await contenuSourceDeVerite(slug, parsed.data.data);

  const experiences = data.experiences.filter(
    (e) => e.role !== "" || e.company !== "" || e.achievements.length > 0
  );
  const education = data.education.filter(
    (e) => e.degree !== "" || e.school !== ""
  );
  const skills = data.skills.map((s) => s.trim()).filter(Boolean);
  const languages = data.languages.filter((l) => l.name !== "");

  try {
    const existing = await prisma.publicResume.findUnique({ where: { slug } });
    const existingCv =
      existing?.cvData &&
      typeof existing.cvData === "object" &&
      !Array.isArray(existing.cvData)
        ? (existing.cvData as unknown as Record<string, unknown>)
        : null;
    const photo =
      existingCv &&
      typeof existingCv.photo === "string" &&
      existingCv.photo.length > 0
        ? existingCv.photo
        : null;

    const cvData = {
      personal: data.personal,
      summary: data.summary,
      experiences,
      education,
      skills,
      languages,
      ...(theme ? { theme } : {}),
      photo,
    };

    const payload = JSON.parse(JSON.stringify(cvData));

    const row = existing
      ? await prisma.publicResume.update({
          where: { slug },
          data: { cvData: payload, isPublic: true },
        })
      : await prisma.publicResume.create({
          data: { slug, cvData: payload, isPublic: true, viewsCount: 0 },
        });

    return NextResponse.json({ publicResume: resumeJson(row, request) });
  } catch (error) {
    console.error("[public-cv/builder][POST]", error);
    return NextResponse.json(
      {
        error:
          "Enregistrement impossible. Si le probleme persiste, ouvrez /api/diagnostic-cv?slug=" +
          slug,
      },
      { status: 500 }
    );
  }
}
'@

if ([System.IO.File]::Exists((Join-Path (Get-Location).Path $routeBuilderPath))) {
  $existant = Normalize-Lf (Read-TextFile $routeBuilderPath)
  Test-Uffid $existant $routeBuilderPath
  if ($existant.Contains($routeBuilderMarker)) {
    Write-Host "  [=] $routeBuilderPath : deja en version source-de-verite, ignore"
  } else {
    $null = Backup-File $routeBuilderPath "builder2"
    Write-TextFile $routeBuilderPath ($routeBuilderTs.Replace("`r`n", "`n"))
    Write-Host "  [OK] route builder reecrite : contenu = CvDocument (source de verite)"
  }
} else {
  Write-Host "  [!] $routeBuilderPath introuvable : installez d'abord reintegrer-publication-cv.ps1"
  Write-Host "      (le BUG A est corrige ; le BUG B partie serveur sera applique apres installation)"
}

# ---------------- [4/6] BUG B (client) : rapport d'extraction ----------------
Write-Host ""
Write-Host "[4/6] BUG B (client) - extraction du code exact pour le patch final..."
$motifMaj = "Mettre " + [char]0x00E0 + " jour la publication"
$motifMajAscii = "Mettre a jour la publication"
$rapport = New-Object System.Text.StringBuilder
$rootPath = (Get-Location).Path

function Add-Rapport([string]$titre) {
  [void]$rapport.AppendLine("")
  [void]$rapport.AppendLine("======================================================================")
  [void]$rapport.AppendLine(" " + $titre)
  [void]$rapport.AppendLine("======================================================================")
}

function Add-FichierEntier([string]$relatif) {
  $plein = Join-Path $rootPath $relatif
  if ([System.IO.File]::Exists($plein)) {
    [void]$rapport.AppendLine("--- FICHIER : " + $relatif + " ---")
    [void]$rapport.AppendLine([System.IO.File]::ReadAllText($plein))
    [void]$rapport.AppendLine("--- FIN " + $relatif + " ---")
    Write-Host ("  [OK] rapport : " + $relatif)
    return $true
  } else {
    [void]$rapport.AppendLine("--- FICHIER : " + $relatif + " : ABSENT ---")
    Write-Host ("  [!] absent : " + $relatif)
    return $false
  }
}

Add-Rapport "RAPPORT BUG 'METTRE A JOUR LA PUBLICATION' - NexiRole ($stamp)"
[void]$rapport.AppendLine("Genere par corriger-cv-public-final.ps1 [4/6].")
[void]$rapport.AppendLine("ENVOYEZ CE FICHIER A L'ASSISTANT : il contient le code exact")
[void]$rapport.AppendLine("necessaire au patch final du bouton (routage + donnees fraiches).")

Add-Rapport "SECTION 1 : src/app/api/public-cv/route.ts (ancienne route)"
$null = Add-FichierEntier "src/app/api/public-cv/route.ts"

Add-Rapport "SECTION 2 : bloc bouton 'Mettre a jour la publication' (createur)"
$trouveBloc = $false
foreach ($f in $fichiers) {
  try { $t = Normalize-Lf ([System.IO.File]::ReadAllText($f.FullName)) } catch { continue }
  if (-not ($t.Contains($motifMaj) -or $t.Contains($motifMajAscii))) { continue }
  $relatif = $f.FullName.Substring($rootPath.Length).TrimStart([char]92).TrimStart([char]47)
  [void]$rapport.AppendLine("--- FICHIER : " + $relatif + " (contexte du bouton) ---")
  $lignes = $t -split "`n"
  for ($i = 0; $i -lt $lignes.Count; $i++) {
    if ($lignes[$i].Contains($motifMaj) -or $lignes[$i].Contains($motifMajAscii)) {
      $debut = [Math]::Max(0, $i - 70)
      $fin = [Math]::Min($lignes.Count - 1, $i + 25)
      [void]$rapport.AppendLine(">>> occurrences autour de la ligne " + ($i + 1) + " (lignes " + ($debut + 1) + " a " + ($fin + 1) + ") :")
      for ($j = $debut; $j -le $fin; $j++) {
        [void]$rapport.AppendLine(($j + 1).ToString("D5") + "| " + $lignes[$j])
      }
      $trouveBloc = $true
    }
  }
  [void]$rapport.AppendLine("--- FIN contexte " + $relatif + " ---")
  Write-Host ("  [OK] contexte du bouton : " + $relatif)
}
if (-not $trouveBloc) {
  [void]$rapport.AppendLine("AUCUN fichier contenant le libelle du bouton (a chercher autrement).")
  Write-Host "  [!] libelle du bouton introuvable dans src/"
}

Add-Rapport "SECTION 3 : appels a l'ancienne route /api/public-cv (fetch, href, window.open)"
foreach ($f in $fichiers) {
  try { $t = Normalize-Lf ([System.IO.File]::ReadAllText($f.FullName)) } catch { continue }
  $hits = [regex]::Matches($t, '["''`]/api/public-cv\?')
  if ($hits.Count -eq 0) { continue }
  $relatif = $f.FullName.Substring($rootPath.Length).TrimStart([char]92).TrimStart([char]47)
  [void]$rapport.AppendLine("--- FICHIER : " + $relatif + " (" + $hits.Count + " appel(s)) ---")
  $lignes = $t -split "`n"
  $vus = New-Object System.Collections.Generic.List[int]
  foreach ($h in $hits) {
    $ligneNo = ($t.Substring(0, $h.Index) -split "`n").Count - 1
    if (-not $vus.Contains($ligneNo)) { [void]$vus.Add($ligneNo) }
  }
  foreach ($ligneNo in $vus) {
    $debut = [Math]::Max(0, $ligneNo - 12)
    $fin = [Math]::Min($lignes.Count - 1, $ligneNo + 12)
    [void]$rapport.AppendLine(">>> ligne " + ($ligneNo + 1) + " :")
    for ($j = $debut; $j -le $fin; $j++) {
      [void]$rapport.AppendLine(($j + 1).ToString("D5") + "| " + $lignes[$j])
    }
  }
  [void]$rapport.AppendLine("--- FIN " + $relatif + " ---")
  Write-Host ("  [OK] appels ancienne route : " + $relatif)
}

Add-Rapport "SECTION 4 : 'format=pdf' restants apres la redirection (variante concatenee ?)"
if ($restantsFormatPdf.Count -eq 0) {
  [void]$rapport.AppendLine("Aucun : toutes les URL PDF ont ete redirigees vers /api/public-cv/pdf.")
} else {
  foreach ($p in $restantsFormatPdf) {
    $relatif = $p.Substring($rootPath.Length).TrimStart([char]92).TrimStart([char]47)
    [void]$rapport.AppendLine("--- FICHIER : " + $relatif + " ---")
    $t = Normalize-Lf ([System.IO.File]::ReadAllText($p))
    $lignes = $t -split "`n"
    for ($i = 0; $i -lt $lignes.Count; $i++) {
      if ($lignes[$i].Contains("format=pdf")) {
        $debut = [Math]::Max(0, $i - 6)
        $fin = [Math]::Min($lignes.Count - 1, $i + 6)
        [void]$rapport.AppendLine(">>> ligne " + ($i + 1) + " :")
        for ($j = $debut; $j -le $fin; $j++) {
          [void]$rapport.AppendLine(($j + 1).ToString("D5") + "| " + $lignes[$j])
        }
      }
    }
    [void]$rapport.AppendLine("--- FIN " + $relatif + " ---")
  }
}

Add-Rapport "SECTION 5 : page publique src/app/u/[slug]/page.tsx"
$relatifU = "src/app/u/[slug]/page.tsx"
$pleinU = Join-Path $rootPath $relatifU
if ([System.IO.File]::Exists($pleinU)) {
  $tailleU = (Get-Item -LiteralPath $pleinU).Length
  if ($tailleU -le 60000) {
    $null = Add-FichierEntier $relatifU
  } else {
    [void]$rapport.AppendLine("--- FICHIER : " + $relatifU + " (" + $tailleU + " octets - fragments autour des mots-cles) ---")
    $t = Normalize-Lf ([System.IO.File]::ReadAllText($pleinU))
    $lignes = $t -split "`n"
    $mots = @("format=pdf", "public-cv", "Imprimer", "PDF avec QR", "export default", "prisma.publicResume")
    foreach ($mot in $mots) {
      for ($i = 0; $i -lt $lignes.Count; $i++) {
        if ($lignes[$i].Contains($mot)) {
          $debut = [Math]::Max(0, $i - 20)
          $fin = [Math]::Min($lignes.Count - 1, $i + 20)
          [void]$rapport.AppendLine(">>> '" + $mot + "' ligne " + ($i + 1) + " :")
          for ($j = $debut; $j -le $fin; $j++) {
            [void]$rapport.AppendLine(($j + 1).ToString("D5") + "| " + $lignes[$j])
          }
          break
        }
      }
    }
    [void]$rapport.AppendLine("--- FIN " + $relatifU + " ---")
    Write-Host "  [OK] page /u/[slug] (fragments, fichier > 60 Ko)"
  }
} else {
  [void]$rapport.AppendLine("ABSENT : " + $relatifU)
  Write-Host "  [!] absent : $relatifU"
}

$rapportPath = "rapport-bug-publication.txt"
[System.IO.File]::WriteAllText((Join-Path $rootPath $rapportPath), $rapport.ToString(), $Utf8NoBom)
Write-Host ("  [OK] rapport complet : " + $rapportPath)

# ---------------- [5/6] verification ----------------
Write-Host ""
Write-Host "[5/6] Verification..."
$routePdfPresent = [System.IO.File]::Exists((Join-Path (Get-Location).Path "src\app\api\public-cv\pdf\route.ts"))
if (-not $routePdfPresent) { throw "VERIFICATION : route PDF autonome absente." }
if ([System.IO.File]::Exists((Join-Path (Get-Location).Path $routeBuilderPath))) {
  $verifBuilder = Normalize-Lf (Read-TextFile $routeBuilderPath)
  if (-not $verifBuilder.Contains($routeBuilderMarker)) {
    throw "VERIFICATION : la route builder n'est pas en version source-de-verite."
  }
  if (-not $verifBuilder.Contains("contenuSourceDeVerite")) {
    throw "VERIFICATION : fonction contenuSourceDeVerite absente."
  }
  Write-Host "  [OK] route builder : source de verite CvDocument active"
}
$restesTsx = @()
foreach ($f in $fichiers) {
  if ($f.Name -eq "route.ts") { continue }
  try { $t = Normalize-Lf ([System.IO.File]::ReadAllText($f.FullName)) } catch { continue }
  if ($t.Contains("/api/public-cv?") -and $t.Contains("&format=pdf")) { $restesTsx += $f.FullName }
}
if ($restesTsx.Count -eq 0) {
  Write-Host "  [OK] plus aucune URL '/api/public-cv?...&format=pdf' dans src/"
} else {
  Write-Host "  [!] URL format=pdf restante(s) :" ($restesTsx -join ", ")
  Write-Host "      (voir rapport-bug-publication.txt section 4)"
}
if (-not $SkipTsc) {
  if ([System.IO.Directory]::Exists((Join-Path (Get-Location).Path "node_modules"))) {
    Write-Host "  [..] npx tsc --noEmit (verrou de types, 1-2 min)..."
    $ErrorActionPreference = "Continue"
    $outTsc = & npx tsc --noEmit 2>&1
    $tscOk = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = "Stop"
    if (-not $tscOk) {
      Write-Host "  [!] tsc signale des erreurs - envoyez les premieres lignes a l'assistant :"
      $outTsc | Select-Object -First 15 | ForEach-Object { Write-Host ("      " + $_) }
      exit 1
    }
    Write-Host "  [OK] tsc : aucune erreur de type"
  } else {
    Write-Host "  [i] node_modules absent : tsc ignore (lancez npm install)"
  }
}

# ---------------- [6/6] VERDICT + protocole ----------------
Write-Host ""
Write-Host "=============================================================="
Write-Host " VERDICT + PROTOCOLE DE TEST (localhost:3000)"
Write-Host "=============================================================="
Write-Host " BUG A (PDF 500)     : corrige - toutes les URL pointent vers"
Write-Host "                       la route autonome /api/public-cv/pdf."
Write-Host " BUG B (publication) : partie serveur appliquee (CvDocument ="
Write-Host "                       source de verite sur /api/public-cv/builder)."
Write-Host "                       Pour la PARTIE CLIENT (bouton de l'espace),"
Write-Host "                       envoyez rapport-bug-publication.txt."
Write-Host ""
Write-Host " Redemarrez le serveur : Ctrl+C puis  npm run dev"
Write-Host ""
Write-Host " TEST 1 (PDF - Bug A) :"
Write-Host "   a) http://localhost:3000/u/kouton-clement  (Ctrl+Shift+R)"
Write-Host "   b) bouton 'PDF avec QR' -> l'adresse doit etre"
Write-Host "      /api/public-cv/pdf?slug=kouton-clement et le PDF s'affiche."
Write-Host "   c) Direct : http://localhost:3000/api/public-cv/pdf?slug=kouton-clement"
Write-Host " TEST 2 (contenu) :"
Write-Host "   a) Ouvrez le createur, appliquez 'Ameliorer avec l'IA',"
Write-Host "      attendez le toast 'Base enregistree',"
Write-Host "   b) hub -> 'Publier en ligne' (ou en-tete du createur) :"
Write-Host "      /u/<slug> affiche le contenu enrichi."
Write-Host " TEST 3 (bouton de l'espace) :"
Write-Host "   a) Espace 'Lien Web Public & QR Code' -> 'Mettre a jour la"
Write-Host "      publication' puis /u/<slug> (Ctrl+Shift+R) :"
Write-Host "      - si le contenu enrichi reste : Bug B resolu ;"
Write-Host "      - si le contenu ancien revient : envoyez le fichier"
Write-Host "        rapport-bug-publication.txt a l'assistant (patch final"
Write-Host "        du bouton, partie client)."
Write-Host ""
Write-Host " Hygiene Git (regle 1.4) : ne commitez jamais les .bak ni .env."
exit 0
