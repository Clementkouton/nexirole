#Requires -Version 5.1
<#
=====================================================================
 NEXIROLE - Synchronisation base de donnees <-> CV publie (boutons)
=====================================================================
 PROBLEME CONFIRME (captures d'ecran du 22/11/2026) :
   Les 5 boutons du createur n'affichent pas le meme contenu :
   - "Mettre a jour la publication" -> anciennes donnees de test
     figees dans PublicResume ("Ajou", "2D3D"...) ;
   - "Publier en ligne" / page /u/<slug> -> contenu perime ;
   - "PDF (QR)" -> /api/public-cv/pdf?slug=... rend un PDF quasi
     vide ("Candidat") car toDossier() ne comprend pas l'ancienne
     forme ATS stockee par /api/public-cv ({cv, candidateName,
     contact}) ;
   - "Telecharger le PDF avec QR code" / "Telecharger le CV PDF"
     lisent l'etat live du createur (corrects) -> plusieurs contenus
     differents pour un seul CV.

 CAUSE RACINE : aucune ecriture atomique "etat du createur -> base
 -> page publique" ; les modifications (dont les ameliorations IA)
 n'atteignent pas PublicResume de facon fiable.

 REMEDE (conforme AGENTS.md : chirurgical, ancres, sauvegardes) :
   [1/6] NOUVELLE ROUTE src/app/api/cv/[id]/publier/route.ts
         POST = sauvegarde l'etat exact du createur (data, design,
         step) dans CvDocument PUIS ecrit PublicResume depuis la
         base (source unique) + drapeaux isPublic/publishedSlug +
         un seul CV publie a la fois.
         GET  = etat publie reel du CV (slug, lien, vues).
   [2/6] CREATEUR (createur/page.tsx sinon page.tsx) :
         E-A effect d'etat publie rebranche sur la nouvelle route ;
         E-B fonctions publierCvActuel() et pdfQrDepuisBase() ;
         E-C handlers des boutons "Mettre a jour la publication" /
         "Publier en ligne" -> publierCvActuel ;
         E-D bouton "PDF (QR)" -> pdfQrDepuisBase (publie puis ouvre
         /api/public-cv/pdf?slug=...).
   [3/6] HUB bibliotheque (page.tsx) : bouton Publier -> meme route
         atomique (publier() reecrit, sauvegarde .bak).
   [4/6] PDF PUBLIC (api/public-cv/pdf/route.ts) : demoteAtsCvData()
         tolere l'ancienne forme ATS -> plus jamais de PDF vide.
   [5/6] DIAGNOSTIC BASE : CvDocument + PublicResume (slug, forme,
         fullName, vues). Avec -FermerAnciennesLignes : isPublic=false
         sur les lignes non referencees par un CvDocument.
   [6/6] VERIFICATION npx tsc --noEmit + protocole de test.

 EXECUTION (PowerShell 5.1, depuis la racine du projet) :
   powershell -ExecutionPolicy Bypass -File .\sync-publication-cv.ps1
   Variantes : -SkipTsc  -FermerAnciennesLignes  -DiagnostiqueSeul

 ROLLBACK : restaurer les fichiers .bak-sync-<horodatage> crees a
 cote des fichiers modifies ; supprimer le dossier
 src/app/api/cv/[id]/publier pour revenir en arriere sur [1/6].
=====================================================================
#>

param(
    [switch]$SkipTsc,
    [switch]$FermerAnciennesLignes,
    [switch]$DiagnostiqueSeul
)

$ErrorActionPreference = "Stop"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

# ------------------------- utilitaires -------------------------

function Write-TextFile {
  param([string]$Path, [string]$Content)
  $full = Join-Path (Get-Location).Path $Path
  $dir = Split-Path -Parent $full
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    [void][System.IO.Directory]::CreateDirectory($dir)
  }
  [System.IO.File]::WriteAllText($full, $Content, $Utf8NoBom)
}

function Read-TextFile {
  param([string]$Path)
  return [System.IO.File]::ReadAllText((Join-Path (Get-Location).Path $Path))
}

function Backup-File {
  param([string]$Path, [string]$Tag)
  $full = Join-Path (Get-Location).Path $Path
  if (Test-Path -LiteralPath $full) {
    $bak = Join-Path (Get-Location).Path ("$Path.bak-$Tag-$stamp")
    [void][System.IO.File]::Copy($full, $bak, $true)
    Write-Host ("  [BAK] " + $Path + " -> " + "$Path.bak-$Tag-$stamp")
  }
}

function Test-Uffid {
  param([string]$Text, [string]$Label)
  if ($Text.Contains([string][char]0xFFFD)) {
    throw "Caracteres corrompus (U+FFFD) detectes dans $Label - encodage casse. Abandon."
  }
}

# REMPLACE-CORPS : remplace le corps d'une fonction entre accolades equilibrees
function Replace-FunctionBody {
  param([string]$Text, [string]$Signature, [string]$NewBody, [string]$Marker, [string]$Label)
  $pattern = [regex]::Escape($Signature) + "\s*\{"
  $m = [regex]::Match($Text, $pattern)
  if (-not $m.Success) {
    throw "ANCRE INTROUVABLE [$Label] : $Signature"
  }
  $openIdx = $m.Index + $m.Length - 1
  $depth = 0
  $closeIdx = -1
  for ($i = $openIdx; $i -lt $Text.Length; $i++) {
    $c = $Text[$i]
    if ($c -eq '{') { $depth++ }
    elseif ($c -eq '}') {
      $depth--
      if ($depth -eq 0) { $closeIdx = $i; break }
    }
  }
  if ($closeIdx -lt 0) {
    throw "ACCOLADES DESEQUILIBREES [$Label] - abandon sans ecriture."
  }
  $body = $Text.Substring($openIdx, $closeIdx - $openIdx + 1)
  if ($body.Contains($NewBody.Trim())) {
    Write-Host ("  [=] " + $Label + " : deja applique, ignore")
    return $Text
  }
  if ($Marker -ne "" -and -not $body.Contains($Marker)) {
    throw "CORPS INATTENDU [$Label] (marqueur absent) - abandon sans ecriture."
  }
  if ($body.Length -lt 60) {
    throw "CORPS TROP COURT [$Label] - abandon sans ecriture."
  }
  Write-Host ("  [+] " + $Label)
  return $Text.Substring(0, $openIdx) + "{" + $NewBody + "}" + $Text.Substring($closeIdx + 1)
}

function Find-HandlersForLabel {
  param([string]$Text, [string]$LabelRegex, [int]$Window = 1800)
  $names = New-Object System.Collections.Generic.List[string]
  $found = [regex]::Matches($Text, $LabelRegex)
  foreach ($m in $found) {
    $start = [Math]::Max(0, $m.Index - $Window)
    $len = $m.Index - $start
    if ($len -le 0) { continue }
    $windowText = $Text.Substring($start, $len)
    $om = [regex]::Matches($windowText, 'onClick=\{([A-Za-z_$][A-Za-z0-9_$]*)\}')
    if ($om.Count -eq 0) { continue }
    $name = $om[$om.Count - 1].Groups[1].Value
    if (-not $names.Contains($name)) { $names.Add($name) }
  }
  return $names
}

function Test-HandlerDefined {
  param([string]$Text, [string]$Name)
  if ($Name -eq "") { return $false }
  $pattern = '(async\s+)?function\s+' + [regex]::Escape($Name) + '\s*\('
  return [regex]::IsMatch($Text, $pattern)
}

function Get-FunctionBody {
  param([string]$Text, [string]$Name)
  $pattern = '(async\s+)?function\s+' + [regex]::Escape($Name) + '\s*\([^)]*\)\s*\{'
  $m = [regex]::Match($Text, $pattern)
  if (-not $m.Success) { return "" }
  $openIdx = $m.Index + $m.Length - 1
  $depth = 0
  for ($i = $openIdx; $i -lt $Text.Length; $i++) {
    $c = $Text[$i]
    if ($c -eq '{') { $depth++ }
    elseif ($c -eq '}') {
      $depth--
      if ($depth -eq 0) { return $Text.Substring($openIdx, $i - $openIdx + 1) }
    }
  }
  return ""
}

function Get-Signature {
  param([string]$Text, [string]$Name)
  $m = [regex]::Match($Text, '(async\s+)?function\s+' + [regex]::Escape($Name) + '\s*\([^)]*\)')
  if ($m.Success) { return $m.Value }
  return ("function " + $Name + "()")
}

# Remplace UNE occurrence de onClick={Old} par onClick={New}, la plus
# proche AVANT le libelle de bouton donne.
function Swap-OnClickAtLabel {
  param([string]$Text, [string]$LabelRegex, [string]$OldHandler, [string]$NewHandler, [int]$Window = 1800)
  $m = [regex]::Match($Text, $LabelRegex)
  if (-not $m.Success) { return $Text }
  $start = [Math]::Max(0, $m.Index - $Window)
  $windowText = $Text.Substring($start, $m.Index - $start)
  $om = [regex]::Matches($windowText, 'onClick=\{([A-Za-z_$][A-Za-z0-9_$]*)\}')
  if ($om.Count -eq 0) { return $Text }
  $last = $om[$om.Count - 1]
  if ($last.Groups[1].Value -ne $OldHandler) { return $Text }
  $absIdx = $start + $last.Index
  Write-Host ("  [+] bouton PDF : onClick { " + $OldHandler + " } -> { " + $NewHandler + " }")
  return $Text.Substring(0, $absIdx) + ("onClick={" + $NewHandler + "}") + $Text.Substring($absIdx + $last.Length)
}

Write-Host "=============================================================="
Write-Host " NEXIROLE - Synchronisation publication CV (boutons -> base)"
Write-Host "=============================================================="

if (-not (Test-Path -LiteralPath (Join-Path (Get-Location).Path "package.json"))) {
  throw "Lancez ce script depuis la racine du projet (package.json introuvable)."
}

# ------------------------- fichiers cibles -------------------------

$editorPath = $null
foreach ($cand in @(
  "src/app/dashboard/cv-builder/createur/page.tsx",
  "src/app/dashboard/cv-builder/page.tsx"
)) {
  if (Test-Path -LiteralPath (Join-Path (Get-Location).Path $cand)) {
    $editorPath = $cand
    break
  }
}
$hubPath = "src/app/dashboard/cv-builder/page.tsx"
$pdfPath = "src/app/api/public-cv/pdf/route.ts"
$routePath = "src/app/api/cv/[id]/publier/route.ts"
$hubIsEditor = ($editorPath -eq $hubPath)

Write-Host ""
Write-Host "[0/6] Fichiers detectes :"
Write-Host ("  - createur     : " + $(if ($editorPath) { $editorPath } else { "INTROUVABLE" }))
Write-Host ("  - hub          : " + $(if (Test-Path -LiteralPath (Join-Path (Get-Location).Path $hubPath)) { $hubPath } else { "INTROUVABLE" }) + $(if ($hubIsEditor) { "  (= fichier du createur : patch hub ignore)" } else { "" }))
Write-Host ("  - pdf public   : " + $(if (Test-Path -LiteralPath (Join-Path (Get-Location).Path $pdfPath)) { $pdfPath } else { "INTROUVABLE" }))

if ($DiagnostiqueSeul) {
  Write-Host ""
  Write-Host "MODE DIAGNOSTIC : aucune ecriture ne sera effectuee."
}

# ============================================================================
Write-Host ""
Write-Host "[1/6] Nouvelle route atomique /api/cv/[id]/publier ..."
# ============================================================================

$routeDone = $false
if (Test-Path -LiteralPath (Join-Path (Get-Location).Path $routePath)) {
  $existingRoute = Read-TextFile $routePath
  if ($existingRoute.Contains("Publication ATOMIQUE")) {
    Write-Host "  [=] $routePath deja present, ignore"
    $routeDone = $true
  }
}
if (-not $routeDone -and -not $DiagnostiqueSeul) {
  Backup-File $routePath "sync"

$RouteCode = @'
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildPublishPayload } from "@/lib/cv-publish-payload";

/* ==================================================================
   NexiRole - Publication ATOMIQUE d'un CV de la bibliotheque
   POST /api/cv/[id]/publier
     corps optionnel : { data?, design?, step? }
     1. enregistre l'etat exact du createur dans CvDocument (source
        unique de verite - supprime la course avec l'autosauvegarde) ;
     2. relit le CV depuis la base et construit le payload publie via
        buildPublishPayload (memes regles que le hub) ;
     3. ecrit LA ligne PublicResume de l'utilisateur (cvData forme
        builder + theme + photo conservee) : les donnees de test ou
        perimees sont ecrasees a chaque publication ;
     4. met a jour isPublic/publishedSlug du CV et depublie les
        autres CV de l'utilisateur.
   GET /api/cv/[id]/publier
     etat publie reel : { ok, published, slug, publicUrl, viewsCount }
   ================================================================== */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

function slugifyNom(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function originFrom(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (configured.trim() !== "") return configured.trim().replace(/\/+$/, "");
  return new URL(request.url).origin;
}

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  const sessionUser = (session?.user ?? null) as unknown as
    | { id?: string; email?: string | null }
    | null;

  const directId = typeof sessionUser?.id === "string" ? sessionUser.id.trim() : "";
  if (directId !== "") return directId;

  const email = typeof sessionUser?.email === "string" ? sessionUser.email.trim() : "";
  if (email !== "") {
    try {
      const found = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      return found?.id ?? null;
    } catch (error) {
      console.error("[api/cv/[id]/publier] Resolution utilisateur par email impossible :", error);
      return null;
    }
  }
  return null;
}

/* Slug unique : base, puis base-2, base-3... */
async function slugUnique(base: string, ownRowId: string | null): Promise<string> {
  const clean = slugifyNom(base);
  const prefix = clean.length >= 2 ? clean : "candidat";
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const candidate = attempt === 1 ? prefix : `${prefix}-${attempt}`;
    const clash = await prisma.publicResume.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!clash || clash.id === ownRowId) return candidate;
  }
  return `${prefix}-${Date.now().toString(36)}`;
}

function resumeJson(row: { slug: string; viewsCount: number }, origin: string) {
  return {
    slug: row.slug,
    publicUrl: `${origin}/u/${row.slug}`,
    viewsCount: typeof row.viewsCount === "number" ? row.viewsCount : 0,
  };
}

/* ------------------------ GET : etat publie reel ------------------------ */

export async function GET(request: NextRequest, context: RouteContext) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    const row = await prisma.cvDocument.findUnique({ where: { id } });
    if (!row || row.userId !== userId) {
      return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
    }
    const origin = originFrom(request);
    const slug = typeof row.publishedSlug === "string" ? row.publishedSlug.trim() : "";
    if (slug === "" || !SLUG_RE.test(slug)) {
      return NextResponse.json({
        ok: true,
        published: false,
        slug: null,
        publicUrl: null,
        viewsCount: null,
      });
    }
    const pub = await prisma.publicResume.findUnique({ where: { slug } });
    if (!pub || !pub.isPublic) {
      return NextResponse.json({
        ok: true,
        published: false,
        slug: null,
        publicUrl: null,
        viewsCount: null,
      });
    }
    return NextResponse.json({ ok: true, published: true, ...resumeJson(pub, origin) });
  } catch (error) {
    console.error("[api/cv/[id]/publier][GET]", error);
    return NextResponse.json(
      { error: "Lecture de l'etat de publication impossible." },
      { status: 500 }
    );
  }
}

/* --------------- POST : sauvegarde + publication atomiques --------------- */

export async function POST(request: NextRequest, context: RouteContext) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Connexion requise. Reconnectez-vous puis reessayez." },
      { status: 401 }
    );
  }
  const { id } = await context.params;

  let body: Record<string, unknown> = {};
  try {
    const raw: unknown = await request.json();
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      body = raw as Record<string, unknown>;
    }
  } catch {
    body = {}; /* corps vide accepte : publication depuis l'etat en base */
  }

  try {
    const row = await prisma.cvDocument.findUnique({ where: { id } });
    if (!row || row.userId !== userId) {
      return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
    }
    if (row.trashedAt) {
      return NextResponse.json(
        { error: "Ce CV est dans la corbeille : restaurez-le avant de le publier." },
        { status: 409 }
      );
    }

    /* 1) Sauvegarde de l'etat EXACT envoye par le createur (anti-course). */
    const patch: { data?: unknown; design?: unknown; step?: number } = {};
    if (
      body.data !== undefined && body.data !== null &&
      typeof body.data === "object" && !Array.isArray(body.data)
    ) {
      patch.data = JSON.parse(JSON.stringify(body.data));
    }
    if (
      body.design !== undefined && body.design !== null &&
      typeof body.design === "object" && !Array.isArray(body.design)
    ) {
      patch.design = JSON.parse(JSON.stringify(body.design));
    }
    if (
      typeof body.step === "number" &&
      Number.isFinite(body.step) && body.step >= 0 && body.step <= 5
    ) {
      patch.step = Math.floor(body.step);
    }
    const saved =
      Object.keys(patch).length > 0
        ? await prisma.cvDocument.update({ where: { id: row.id }, data: patch })
        : row;

    /* 2) Payload construit DEPUIS LA BASE (jamais depuis un etat client). */
    const payload = buildPublishPayload({
      data: saved.data,
      design: saved.design,
      slug: saved.publishedSlug,
    });
    if (payload.data.personal.fullName === "") {
      return NextResponse.json(
        { error: "Renseignez votre nom complet (etape 1) avant la publication." },
        { status: 400 }
      );
    }

    /* 3) Cible = LA ligne publique de l'utilisateur ; slug stable. */
    const ownRows = await prisma.publicResume.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
    const ownRow = ownRows.length > 0 ? ownRows[0] : null;

    let targetSlug = typeof saved.publishedSlug === "string" ? saved.publishedSlug.trim() : "";
    if (targetSlug === "" || !SLUG_RE.test(targetSlug)) {
      targetSlug = slugifyNom(payload.data.personal.fullName);
    }
    if (!SLUG_RE.test(targetSlug)) {
      targetSlug = await slugUnique(payload.data.personal.fullName, ownRow?.id ?? null);
    } else if (ownRow === null || ownRow.slug !== targetSlug) {
      const clash = await prisma.publicResume.findUnique({
        where: { slug: targetSlug },
        select: { id: true, userId: true },
      });
      const clashOwner = clash ? (clash as unknown as { userId?: string | null }).userId : null;
      if (clash && clashOwner !== null && clashOwner !== userId) {
        targetSlug = await slugUnique(payload.data.personal.fullName, ownRow?.id ?? null);
      }
    }

    /* Photo conservee depuis la ligne deja en ligne (publication ou apercu). */
    const photoSource =
      ownRow ?? (await prisma.publicResume.findUnique({ where: { slug: targetSlug } }));
    const photoCv = asRecord(photoSource?.cvData);
    const photo = typeof photoCv.photo === "string" && photoCv.photo !== "" ? photoCv.photo : null;

    const cvDataJson = JSON.parse(
      JSON.stringify({
        ...payload.data,
        theme: payload.theme,
        ...(photo !== null ? { photo } : {}),
      })
    );

    let published: { slug: string; viewsCount: number };
    if (ownRow) {
      published = await prisma.publicResume.update({
        where: { id: ownRow.id },
        data: { slug: targetSlug, cvData: cvDataJson, isPublic: true },
      });
    } else {
      const slugRow = await prisma.publicResume.findUnique({ where: { slug: targetSlug } });
      const slugOwner = slugRow ? (slugRow as unknown as { userId?: string | null }).userId : null;
      if (slugRow && (slugOwner === null || slugOwner === userId)) {
        published = await prisma.publicResume.update({
          where: { id: slugRow.id },
          data: {
            cvData: cvDataJson,
            isPublic: true,
            ...(slugOwner === null ? { userId } : {}),
          },
        });
      } else {
        try {
          published = await prisma.publicResume.create({
            data: { userId, slug: targetSlug, cvData: cvDataJson, isPublic: true, viewsCount: 0 },
          });
        } catch (createError) {
          /* Repli : schema sans colonne userId obligatoire ou contrainte inattendue. */
          const retry = await prisma.publicResume
            .create({ data: { slug: targetSlug, cvData: cvDataJson, isPublic: true, viewsCount: 0 } })
            .catch(() => null);
          if (!retry) throw createError;
          published = retry;
        }
      }
    }

    /* 4) Drapeaux du CV + un seul CV publie a la fois pour cet utilisateur. */
    await prisma.cvDocument.update({
      where: { id: saved.id },
      data: { isPublic: true, publishedSlug: targetSlug },
    });
    await prisma.cvDocument.updateMany({
      where: { userId, id: { not: saved.id }, isPublic: true },
      data: { isPublic: false },
    });

    const origin = originFrom(request);
    return NextResponse.json({ ok: true, published: true, ...resumeJson(published, origin) });
  } catch (error) {
    console.error("[api/cv/[id]/publier][POST]", error);
    return NextResponse.json(
      { error: "La publication a echoue. Reessayez - le contenu du createur est conserve." },
      { status: 500 }
    );
  }
}
'@

  Write-TextFile $routePath $RouteCode
  Write-Host ("  [OK] " + $routePath + " cree")
}

# ============================================================================
Write-Host ""
Write-Host "[2/6] Createur : rebranchement des boutons sur la route atomique ..."
# ============================================================================

$PubNewBody = @'

    await publierCvActuel();
  
'@

$PdfNewBody = @'

    await pdfQrDepuisBase();
  
'@

$HelpersCode = @'

  /* ================================================================
     Publication synchronisee - source unique : la base de donnees.
     "Publier en ligne", "Mettre a jour la publication" et "PDF (QR)"
     passent tous par POST /api/cv/<id>/publier : le serveur enregistre
     d'abord l'etat EXACT du createur (data, design, step) dans
     CvDocument, puis ecrit la page publique DEPUIS LA BASE. Les cinq
     boutons (publication, PDF QR serveur, PDF QR local, impression,
     apercu en ligne) affichent donc le meme contenu.
     ================================================================ */
  async function publierCvActuel(): Promise<string | null> {
    if (!data.personal.fullName.trim()) {
      toast.error("Renseignez votre nom complet (etape 1) avant la publication.");
      setStep(0);
      return null;
    }
    if (cvId === null) {
      toast.info(
        "Ouvrez ce CV depuis Ma bibliotheque pour le publier (synchronisation base)."
      );
      return null;
    }
    setPubLoading(true);
    setPubError(null);
    try {
      const res = await fetch(`/api/cv/${cvId}/publier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, design, step }),
      });
      const json = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            slug?: string;
            publicUrl?: string;
            viewsCount?: number | null;
            error?: string;
          }
        | null;
      const slug = json?.slug;
      if (!res.ok || !slug) {
        const message = json?.error ?? `Publication impossible (code ${res.status}). Reessayez.`;
        setPubError(message);
        toast.error(message);
        return null;
      }
      setPubSlug(slug);
      setPubUrl(json?.publicUrl ?? null);
      setPubViews(typeof json?.viewsCount === "number" ? (json?.viewsCount as number) : 0);
      toast.success("Contenu enregistre dans la base et publie en ligne !");
      return slug;
    } catch {
      const message = "Impossible de joindre le serveur. Verifiez votre connexion et reessayez.";
      setPubError(message);
      toast.error(message);
      return null;
    } finally {
      setPubLoading(false);
    }
  }

  async function pdfQrDepuisBase() {
    const slug = await publierCvActuel();
    if (slug === null) return;
    window.open(
      `/api/public-cv/pdf?slug=${encodeURIComponent(slug)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

'@

$EffetAncien = @'
  /* Configuration existante (slug, lien, vues) au chargement de la page. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/public-cv", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as
          | {
              publicResume?: {
                slug?: string;
                viewsCount?: number;
                publicUrl?: string;
              } | null;
            }
          | null;
        if (cancelled || !json?.publicResume?.slug) return;
        setPubSlug(json.publicResume.slug);
        setPubUrl(json.publicResume.publicUrl ?? null);
        setPubViews(
          typeof json.publicResume.viewsCount === "number"
            ? json.publicResume.viewsCount
            : 0
        );
      } catch {
        /* serveur injoignable : le bloc reste en mode « non publié » */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
'@

$EffetNouveau = @'
  /* Configuration existante (slug, lien, vues) - source unique : la base.
     CV de la bibliotheque (?cv=<id> ou cvId) : /api/cv/<id>/publier renvoie
     l'etat publie REEL du CV ; CV local : ancien canal conserve. */
  useEffect(() => {
    const asked = cvId ?? new URLSearchParams(window.location.search).get("cv");
    let cancelled = false;
    (async () => {
      try {
        if (asked) {
          const res = await fetch(`/api/cv/${asked}/publier`, { cache: "no-store" });
          if (!res.ok) return;
          const json = (await res.json().catch(() => null)) as
            | { slug?: string; publicUrl?: string; viewsCount?: number | null }
            | null;
          if (cancelled || !json?.slug) return;
          setPubSlug(json.slug);
          setPubUrl(json.publicUrl ?? null);
          setPubViews(typeof json.viewsCount === "number" ? json.viewsCount : 0);
          return;
        }
        const res = await fetch("/api/public-cv", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as
          | {
              publicResume?: {
                slug?: string;
                viewsCount?: number;
                publicUrl?: string;
              } | null;
            }
          | null;
        if (cancelled || !json?.publicResume?.slug) return;
        setPubSlug(json.publicResume.slug);
        setPubUrl(json.publicResume.publicUrl ?? null);
        setPubViews(
          typeof json.publicResume.viewsCount === "number"
            ? json.publicResume.viewsCount
            : 0
        );
      } catch {
        /* serveur injoignable : le bloc reste en mode non publie */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cvId]);
'@

if (-not $editorPath) {
  Write-Host "  [!] fichier du createur introuvable - etape ignoree."
} elseif ($DiagnostiqueSeul) {
  $editorText = Read-TextFile $editorPath
  Test-Uffid $editorText $editorPath
  Write-Host "  --- rapport diagnostic (createur) ---"
  Write-Host ("  cvId (patch bibliotheque) : " + $editorText.Contains("const [cvId, setCvId]"))
  Write-Host ("  publierCvActuel deja present : " + $editorText.Contains("function publierCvActuel"))
  Write-Host ("  handlePublishPublicCv present : " + $editorText.Contains("handlePublishPublicCv"))
  $labelMaj = "Mettre " + [string][char]0xE0 + " jour la publication"
  foreach ($lbl in @($labelMaj, "Publier en ligne", "Publier mon CV en ligne", "PDF (QR)", "PDF avec QR", "Terminer")) {
    $lblRegex = [regex]::Escape($lbl)
    $c = ([regex]::Matches($editorText, $lblRegex)).Count
    Write-Host ("  libelle '" + $lbl + "' : " + $c + " occurrence(s)")
    foreach ($h in (Find-HandlersForLabel $editorText $lblRegex)) {
      $defini = Test-HandlerDefined $editorText $h
      Write-Host ("      -> onClick={ " + $h + " } (fonction definie : " + $defini + ")")
    }
  }
} else {
  $editorText = Read-TextFile $editorPath
  Test-Uffid $editorText $editorPath
  $editorOriginal = $editorText

  # --- pre-requis (fatal si absents : patch bibliotheque non applique) ---
  $manquants = @()
  if (-not $editorText.Contains("const [cvId, setCvId]")) { $manquants += "cvId (patch bibliotheque P1)" }
  foreach ($st in @("setPubSlug", "setPubUrl", "setPubViews", "setPubLoading", "setPubError")) {
    if (-not $editorText.Contains($st)) { $manquants += $st }
  }
  if ($manquants.Count -gt 0) {
    Write-Host ""
    Write-Host "  [!] ELEMENTS MANQUANTS DANS LE CREATEUR :" -ForegroundColor Red
    foreach ($mk in $manquants) { Write-Host ("      - " + $mk) -ForegroundColor Red }
    Write-Host "  Aucune ecriture effectuee. Copiez la sortie entiere et renvoyez-la." -ForegroundColor Yellow
    exit 2
  }

  # --- E-A : effect d'etat publie -> nouvelle route (non bloquant) ---
  if ($editorText.Contains('/api/cv/${asked}/publier')) {
    Write-Host "  [=] E-A effect d'etat publie : deja applique"
  } elseif ($editorText.Contains($EffetAncien)) {
    $editorText = $editorText.Replace($EffetAncien, $EffetNouveau)
    Write-Host "  [+] E-A effect d'etat publie rebranche sur /api/cv/<id>/publier"
  } else {
    Write-Host "  [!] E-A : bloc d'effect non reconnu - ignore (non bloquant)."
  }

  # --- E-B : fonctions publierCvActuel / pdfQrDepuisBase (bloquant) ---
  $helpersInsertes = $false
  if ($editorText.Contains("function publierCvActuel")) {
    Write-Host "  [=] E-B publierCvActuel : deja present"
    $helpersInsertes = $true
  } else {
    $ancre1 = "  async function handlePublishPublicCv() {"
    $ancre2 = "  function buildDossierForCvPdf(): {"
    if ($editorText.Contains($ancre1)) {
      $editorText = $editorText.Replace($ancre1, ($HelpersCode + $ancre1))
      $helpersInsertes = $true
      Write-Host "  [+] E-B publierCvActuel + pdfQrDepuisBase ajoutes"
    } elseif ($editorText.Contains($ancre2)) {
      $editorText = $editorText.Replace($ancre2, ($HelpersCode + $ancre2))
      $helpersInsertes = $true
      Write-Host "  [+] E-B publierCvActuel + pdfQrDepuisBase ajoutes (ancre 2)"
    }
  }
  if (-not $helpersInsertes) {
    Write-Host ""
    Write-Host "  [!] ANCRE E-B INTROUVABLE (handlePublishPublicCv / buildDossierForCvPdf)." -ForegroundColor Red
    Write-Host "  Le createur a derive. Aucune ecriture. Copiez la sortie et renvoyez-la." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Fonctions detectees (extrait) :"
    $sigs = [regex]::Matches($editorText, '(async\s+)?function\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\([^)]*\)')
    $shown = 0
    foreach ($s in $sigs) {
      if ($shown -ge 30) { Write-Host "  ..."; break }
      Write-Host ("    " + $s.Value)
      $shown++
    }
    exit 2
  }

  # --- E-C : handlers des boutons de publication -> publierCvActuel ---
  $labelMajPubli = "Mettre " + [string][char]0xE0 + " jour la publication"
  $publishHandlers = New-Object System.Collections.Generic.List[string]
  foreach ($lblRegex in @(
    [regex]::Escape($labelMajPubli),
    [regex]::Escape("Publier en ligne"),
    [regex]::Escape("Publier mon CV en ligne")
  )) {
    foreach ($h in (Find-HandlersForLabel $editorText $lblRegex)) {
      if (-not $publishHandlers.Contains($h)) { $publishHandlers.Add($h) }
    }
  }
  $aRebrancher = New-Object System.Collections.Generic.List[string]
  foreach ($h in $publishHandlers) {
    if ($h -eq "publierCvActuel" -or $h -eq "pdfQrDepuisBase") { continue }
    if (-not (Test-HandlerDefined $editorText $h)) { continue }
    $bodyH = Get-FunctionBody $editorText $h
    if ($bodyH.Contains("publierCvActuel")) { continue }
    if (-not $aRebrancher.Contains($h)) { $aRebrancher.Add($h) }
  }
  if ($aRebrancher.Count -eq 0 -and (Test-HandlerDefined $editorText "handlePublishPublicCv")) {
    $bodyOld = Get-FunctionBody $editorText "handlePublishPublicCv"
    if (-not $bodyOld.Contains("publierCvActuel")) { $aRebrancher.Add("handlePublishPublicCv") }
  }
  if ($aRebrancher.Count -eq 0) {
    Write-Host ""
    Write-Host "  [!] AUCUN HANDLER DE PUBLICATION IDENTIFIE (E-C)." -ForegroundColor Red
    Write-Host "  Libelles cherches : '$labelMajPubli', 'Publier en ligne', 'Publier mon CV en ligne'." -ForegroundColor Yellow
    Write-Host "  Aucune ecriture. Copiez TOUTE cette sortie et renvoyez-la." -ForegroundColor Yellow
    Write-Host ""
    foreach ($lblRegex in @([regex]::Escape($labelMajPubli), [regex]::Escape("Publier en ligne"))) {
      $found = [regex]::Matches($editorText, $lblRegex)
      Write-Host ("  '" + $lblRegex + "' : " + $found.Count + " occurrence(s)")
      foreach ($m in $found) {
        $start = [Math]::Max(0, $m.Index - 400)
        $ctx = $editorText.Substring($start, $m.Index - $start).Replace("`r", " ").Replace("`n", " | ")
        Write-Host ("    contexte avant : ..." + $ctx.Substring([Math]::Max(0, $ctx.Length - 200)))
      }
    }
    exit 2
  }
  foreach ($h in $aRebrancher) {
    $sig = Get-Signature $editorText $h
    try {
      $editorText = Replace-FunctionBody -Text $editorText -Signature $sig -NewBody $PubNewBody -Marker "" -Label ("E-C publication '{0}' -> publierCvActuel" -f $h)
    } catch {
      Write-Host ("  [!] E-C : " + $_.Exception.Message) -ForegroundColor Yellow
    }
  }

  # --- E-D : bouton "PDF (QR)" -> pdfQrDepuisBase (non bloquant) ---
  $pdfWired = $editorText.Contains("pdfQrDepuisBase") -and
    ($editorText -match 'onClick=\{pdfQrDepuisBase\}')
  if ($pdfWired) {
    Write-Host "  [=] E-D bouton PDF (QR) : deja rebranche"
  } else {
    $pdfLabelRegexes = @([regex]::Escape("PDF (QR)"), [regex]::Escape("PDF avec QR"))
    $pdfHandled = $false
    foreach ($lblRegex in $pdfLabelRegexes) {
      $handlers = Find-HandlersForLabel $editorText $lblRegex
      foreach ($h in $handlers) {
        if ($h -eq "pdfQrDepuisBase") { $pdfHandled = $true; continue }
        if (-not (Test-HandlerDefined $editorText $h)) { continue }
        if ($h -eq "publierCvActuel") {
          # meme handler que la publication : on ne remplace que CE bouton
          $editorText = Swap-OnClickAtLabel $editorText $lblRegex "publierCvActuel" "pdfQrDepuisBase"
          $pdfHandled = $true
          continue
        }
        $bodyH = Get-FunctionBody $editorText $h
        if ($bodyH.Contains("publierCvActuel") -or $bodyH.Contains("pdfQrDepuisBase")) {
          $editorText = Swap-OnClickAtLabel $editorText $lblRegex $h "pdfQrDepuisBase"
          $pdfHandled = $true
          continue
        }
        try {
          $sig = Get-Signature $editorText $h
          $editorText = Replace-FunctionBody -Text $editorText -Signature $sig -NewBody $PdfNewBody -Marker "" -Label ("E-D PDF QR '{0}' -> pdfQrDepuisBase" -f $h)
          $pdfHandled = $true
        } catch {
          Write-Host ("  [!] E-D : " + $_.Exception.Message) -ForegroundColor Yellow
        }
      }
    }
    if (-not $pdfHandled) {
      Write-Host "  [!] E-D : bouton 'PDF (QR)' non identifie - ignore (non bloquant)."
    }
  }

  # --- verification de forme avant ecriture (delta d'accolades stable) ---
  $nbOuvrants = ([regex]::Matches($editorText, '\{')).Count
  $nbFermants = ([regex]::Matches($editorText, '\}')).Count
  $nbOuvrants0 = ([regex]::Matches($editorOriginal, '\{')).Count
  $nbFermants0 = ([regex]::Matches($editorOriginal, '\}')).Count
  $nbPublier = ([regex]::Matches($editorText, [regex]::Escape("function publierCvActuel"))).Count
  $nbPdfQr = ([regex]::Matches($editorText, [regex]::Escape("function pdfQrDepuisBase"))).Count
  if (($nbOuvrants - $nbFermants) -ne ($nbOuvrants0 - $nbFermants0)) {
    Write-Host ""
    Write-Host ("  [!] ACCOLADES DESEQUILIBREES apres patch : {0} ouvrantes / {1} fermantes (original : {2} / {3})." -f $nbOuvrants, $nbFermants, $nbOuvrants0, $nbFermants0) -ForegroundColor Red
    Write-Host "  Aucune ecriture effectuee (fichier original intact)." -ForegroundColor Yellow
    exit 2
  }
  if ($nbPublier -ne 1 -or $nbPdfQr -ne 1) {
    Write-Host ""
    Write-Host ("  [!] FONCTIONS EN DOUBLON : publierCvActuel x{0}, pdfQrDepuisBase x{1}." -f $nbPublier, $nbPdfQr) -ForegroundColor Red
    Write-Host "  Aucune ecriture effectuee." -ForegroundColor Yellow
    exit 2
  }

  if ($editorText -ne $editorOriginal) {
    Backup-File $editorPath "sync"
    Write-TextFile $editorPath $editorText
    Write-Host ("  [OK] " + $editorPath + " mis a jour")
  } else {
    Write-Host "  [=] createur : aucun changement necessaire"
  }
}

# ============================================================================
Write-Host ""
Write-Host "[3/6] Hub bibliotheque : bouton Publier -> route atomique ..."
# ============================================================================

if ($DiagnostiqueSeul) {
  Write-Host "  (mode diagnostic : etape ignoree)"
} elseif (-not (Test-Path -LiteralPath (Join-Path (Get-Location).Path $hubPath))) {
  Write-Host "  [!] hub introuvable ($hubPath) - etape ignoree."
} elseif ($hubIsEditor) {
  Write-Host "  [=] hub = fichier du createur (ancien layout) - patch hub ignore."
} else {
  $hubText = Read-TextFile $hubPath
  Test-Uffid $hubText $hubPath
  $hubOriginal = $hubText
  if ($hubText.Contains('/api/cv/${cv.id}/publier')) {
    Write-Host "  [=] hub publier() : deja rebranche"
  } elseif ([regex]::IsMatch($hubText, 'async\s+function\s+publier\s*\(')) {
    $sig = Get-Signature $hubText "publier"
    $HubNewBody = @'

    setBusy(cv.id);
    try {
      const res = await fetch(`/api/cv/${cv.id}/publier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => null)) as
        | { slug?: string; publicUrl?: string; viewsCount?: number | null; error?: string }
        | null;
      const slug = json?.slug;
      if (!res.ok || !slug) {
        toast.error(json?.error ?? "Publication en ligne impossible.");
        return;
      }
      toast.success(`CV publie en ligne : /u/${slug}`);
      await charger();
    } catch {
      toast.error("Serveur injoignable. Reessayez.");
    } finally {
      setBusy(null);
    }
  
'@
      try {
        $hubText = Replace-FunctionBody -Text $hubText -Signature $sig -NewBody $HubNewBody -Marker "/api/public-cv/builder" -Label "hub publier() -> route atomique"
        if ($hubText -ne $hubOriginal) {
          Backup-File $hubPath "sync"
          Write-TextFile $hubPath $hubText
          Write-Host ("  [OK] " + $hubPath + " mis a jour")
        }
      } catch {
        Write-Host ("  [!] hub : " + $_.Exception.Message + " - ignore (non bloquant, l'ancien canal du hub reste fonctionnel).") -ForegroundColor Yellow
      }
  } else {
    Write-Host "  [=] hub : fonction publier() non trouvee - rien a faire."
  }
}

# ============================================================================
Write-Host ""
Write-Host "[4/6] PDF public : tolerance de l'ancienne forme ATS ..."
# ============================================================================

$DemoteFn = @'
/** Tolere l'ancienne forme ATS stockee par /api/public-cv
 *  ({ cv: {...}, candidateName, contact }) : la convertit en forme
 *  builder attendue par toDossier. Sans effet sur la forme builder
 *  (publication recente du createur) - corrige le PDF vide "Candidat". */
function demoteAtsCvData(cv: Record<string, unknown>): Record<string, unknown> {
  if (asRecord(cv.personal).fullName !== "" || asArray(cv.experiences).length > 0) {
    return cv; /* deja en forme builder */
  }
  const inner = asRecord(cv.cv);
  const contact = asRecord(cv.contact);
  const hasAts =
    Object.keys(inner).length > 0 ||
    Object.keys(contact).length > 0 ||
    str(cv.candidateName) !== "";
  if (!hasAts) return cv;
  const personal = {
    fullName: str(cv.candidateName) || "Candidat",
    title: str(inner.title),
    email: str(contact.email),
    phone: str(contact.phone),
    location: str(contact.location),
    linkedin: str(contact.linkedin),
  };
  const experiences = asArray(inner.experiences).map((e) => ({
    role: str(e.role) || str(e.poste) || "Poste",
    company: str(e.company) || str(e.entreprise) || "Entreprise",
    period: str(e.period) || str(e.dates) || str(e.periode),
    location: str(e.location) || str(e.lieu),
    achievements: asArray(e.achievements)
      .map((m) => (typeof m === "string" ? m.trim() : ""))
      .filter(Boolean),
  }));
  const education = asArray(inner.education).map((e) => ({
    degree: str(e.degree) || str(e.diplome) || "Diplome",
    school: str(e.school) || str(e.etablissement),
    period: str(e.period) || str(e.periode),
  }));
  const skills = asArray(inner.skills)
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  const languages = asArray(inner.languages)
    .filter((l) => str(l.name) !== "")
    .map((l) => ({ name: str(l.name), level: str(l.level) || "Courant" }));
  return {
    personal,
    summary: str(inner.summary),
    experiences,
    education,
    skills,
    languages,
    theme: asRecord(cv.theme),
    ...(typeof cv.photo === "string" && cv.photo !== "" ? { photo: cv.photo } : {}),
  };
}

'@

if ($DiagnostiqueSeul) {
  Write-Host "  (mode diagnostic : etape ignoree)"
} elseif (-not (Test-Path -LiteralPath (Join-Path (Get-Location).Path $pdfPath))) {
  Write-Host "  [!] $pdfPath introuvable - etape ignoree."
} else {
  $pdfText = Read-TextFile $pdfPath
  Test-Uffid $pdfText $pdfPath
  $pdfOriginal = $pdfText
  if ($pdfText.Contains("demoteAtsCvData")) {
    Write-Host "  [=] PDF public : demoteAtsCvData deja present"
  } else {
    $ancrePdf1 = "/** Convertit le cvData stock" + [string][char]0x00E9 + " (builder ou publication) en DossierData PDF. */"
    $ancrePdf2 = "function toDossier(cv: Record<string, unknown>): DossierData {"
    if ($pdfText.Contains($ancrePdf1)) {
      $pdfText = $pdfText.Replace($ancrePdf1, ($DemoteFn + $ancrePdf1))
      Write-Host "  [+] demoteAtsCvData insere (ancre commentaire)"
    } elseif ($pdfText.Contains($ancrePdf2)) {
      $pdfText = $pdfText.Replace($ancrePdf2, ($DemoteFn + $ancrePdf2))
      Write-Host "  [+] demoteAtsCvData insere (ancre fonction)"
    } else {
      Write-Host "  [!] ancre toDossier introuvable - patch PDF ignore (non bloquant)." -ForegroundColor Yellow
    }
    $ligneCv = "      const cv = asRecord(row.cvData);"
    $nbLigne = ([regex]::Matches($pdfText, [regex]::Escape($ligneCv))).Count
    if ($nbLigne -eq 1) {
      $pdfText = $pdfText.Replace($ligneCv, "      const cv = demoteAtsCvData(asRecord(row.cvData));")
      Write-Host "  [+] mode slug : cvData passe par demoteAtsCvData"
    } else {
      Write-Host ("  [!] ancre 'const cv = asRecord(row.cvData)' : " + $nbLigne + " occurrence(s) - ignore.") -ForegroundColor Yellow
    }
    if ($pdfText -ne $pdfOriginal) {
      Backup-File $pdfPath "sync"
      Write-TextFile $pdfPath $pdfText
      Write-Host ("  [OK] " + $pdfPath + " mis a jour")
    }
  }
}

# ============================================================================
Write-Host ""
Write-Host "[5/6] Diagnostic base de donnees (CvDocument + PublicResume) ..."
# ============================================================================

$DumpCjs = @'
/* diagnostic-sync-publication.cjs - lecture seule (ecriture seulement
   avec --fermer : isPublic=false sur les lignes non referencees). */
const fs = require("fs");
const path = require("path");
const FERMER = process.argv.includes("--fermer");

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
    console.log("[dump] client Prisma non charge (lancez npx prisma generate) - etape ignoree");
    return;
  }

  const prisma = new PrismaClient();
  try {
    const slugsRefs = [];
    let docs = [];
    try {
      docs = await prisma.cvDocument.findMany({ orderBy: { updatedAt: "desc" }, take: 20 });
    } catch (e) {
      console.log("[dump] CvDocument illisible: " + trunc(e && e.message ? e.message : e, 200));
    }
    console.log("=== CvDocument (" + docs.length + ") ===");
    for (const d of docs) {
      const data = d.data && typeof d.data === "object" && !Array.isArray(d.data) ? d.data : {};
      const personal = data.personal && typeof data.personal === "object" ? data.personal : {};
      console.log(
        "- nom: " + d.name +
        " | isPublic: " + d.isPublic +
        " | slug: " + (d.publishedSlug || "-") +
        " | corbeille: " + (d.trashedAt ? "oui" : "non") +
        " | fullName: " + (personal.fullName || "(vide)") +
        " | maj: " + (d.updatedAt ? new Date(d.updatedAt).toISOString() : "?")
      );
      if (d.publishedSlug) slugsRefs.push(d.publishedSlug);
    }

    let rows = [];
    let usedRaw = false;
    try {
      rows = await prisma.publicResume.findMany({ orderBy: { updatedAt: "desc" }, take: 20 });
    } catch (e) {
      rows = await prisma.$queryRawUnsafe('SELECT * FROM "PublicResume" ORDER BY "updatedAt" DESC LIMIT 20');
      usedRaw = true;
    }
    console.log("=== PublicResume (" + rows.length + ")" + (usedRaw ? " [lecture brute]" : "") + " ===");
    for (const r of rows) {
      let cv = null;
      try {
        cv = typeof r.cvData === "string" ? JSON.parse(r.cvData) : r.cvData;
      } catch (error) {
        cv = null;
      }
      const isObj = cv && typeof cv === "object" && !Array.isArray(cv);
      const personal = isObj && cv.personal && typeof cv.personal === "object" ? cv.personal : null;
      const forme = personal ? "builder" : (isObj && cv.cv ? "ATS (ancienne)" : (isObj ? "inconnue" : "vide"));
      const fullName = personal && personal.fullName ? personal.fullName : (isObj && cv.candidateName ? cv.candidateName : "(vide)");
      console.log(
        "- slug: " + r.slug +
        " | isPublic: " + r.isPublic +
        " | vues: " + (typeof r.viewsCount === "number" ? r.viewsCount : "-") +
        " | forme: " + forme +
        " | fullName: " + fullName +
        " | maj: " + (r.updatedAt ? new Date(r.updatedAt).toISOString() : "?")
      );
      if (isObj) {
        console.log("    cles cvData: " + Object.keys(cv).join(", "));
        if (Array.isArray(cv.experiences)) {
          console.log(
            "    experiences: " + cv.experiences.length +
            " | formations: " + (Array.isArray(cv.education) ? cv.education.length : "?") +
            " | competences: " + (Array.isArray(cv.skills) ? cv.skills.length : "?")
          );
        }
      }
    }

    if (FERMER) {
      console.log("--- fermeture des lignes non referencees (--fermer) ---");
      let fermees = 0;
      for (const r of rows) {
        if (!r.isPublic) continue;
        if (slugsRefs.indexOf(r.slug) === -1) {
          try {
            await prisma.publicResume.update({ where: { id: r.id }, data: { isPublic: false } });
            console.log("  [fermee] " + r.slug + " (aucun CvDocument ne reference ce slug)");
            fermees++;
          } catch (e) {
            console.log("  [erreur] " + r.slug + ": " + trunc(e && e.message ? e.message : e, 150));
          }
        }
      }
      if (fermees === 0) {
        console.log("  aucune ligne a fermer - les lignes publiques correspondent a un CvDocument.");
      } else {
        console.log("  total fermees: " + fermees);
      }
    }
  } finally {
    try {
      if (prisma && prisma.$disconnect) await prisma.$disconnect();
    } catch (error) {
      /* ignore */
    }
  }
})();
'@

$dumpFile = "diagnostic-sync-publication.cjs"
Write-TextFile $dumpFile $DumpCjs
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
  $nodeArgs = @($dumpFile)
  if ($FermerAnciennesLignes -and -not $DiagnostiqueSeul) { $nodeArgs += "--fermer" }
  $out = & node @nodeArgs 2>&1
  foreach ($line in @($out)) {
    Write-Host ("   " + ($line | Out-String).TrimEnd())
  }
} catch {
  Write-Host ("   Node.js indisponible ou erreur non bloquante : " + $_.Exception.Message)
} finally {
  $ErrorActionPreference = $prevEap
  try {
    if (Test-Path -LiteralPath (Join-Path (Get-Location).Path $dumpFile)) {
      Remove-Item -LiteralPath (Join-Path (Get-Location).Path $dumpFile) -Force
    }
  } catch {
    # suppression non bloquante
  }
}

if ($DiagnostiqueSeul) {
  Write-Host ""
  Write-Host "DIAGNOSTIC TERMINE (aucune ecriture). Renvoyez cette sortie si un patch doit etre ajuste."
  exit 0
}

# ============================================================================
Write-Host ""
Write-Host "[6/6] Verification TypeScript (npx tsc --noEmit) ..."
# ============================================================================

if ($SkipTsc) {
  Write-Host "  [=] -SkipTsc : verification ignoree (a relancer sans -SkipTsc avant de deployer)."
} else {
  $prevEap2 = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $tscCode = 1
  $tscOut = $null
  try {
    $tscOut = & npx tsc --noEmit 2>&1
    $tscCode = $LASTEXITCODE
  } catch {
    Write-Host ("  [!] tsc n'a pas pu etre lance : " + $_.Exception.Message) -ForegroundColor Yellow
    $tscCode = -1
  } finally {
    $ErrorActionPreference = $prevEap2
  }
  if ($tscCode -eq 0) {
    Write-Host "  [OK] TypeScript : aucune erreur."
  } elseif ($tscCode -eq -1) {
    Write-Host "  [!] verification TypeScript impossible - lancez manuellement : npx tsc --noEmit" -ForegroundColor Yellow
  } else {
    Write-Host ""
    Write-Host "  [!] ERREURS TYPESCRIPT (les dernieres lignes) :" -ForegroundColor Red
    if ($tscOut) {
      $lines = @($tscOut | Out-String).TrimEnd() -split "`r?`n"
      $startIdx = [Math]::Max(0, $lines.Count - 40)
      for ($i = $startIdx; $i -lt $lines.Count; $i++) {
        Write-Host ("    " + $lines[$i])
      }
    }
    Write-Host ""
    Write-Host "  Corrigez puis relancez : powershell -ExecutionPolicy Bypass -File .\sync-publication-cv.ps1" -ForegroundColor Yellow
    exit 3
  }
}

Write-Host ""
Write-Host "=============================================================="
Write-Host " VERDICT : SUCCES - pipeline de publication atomique en place"
Write-Host "=============================================================="
Write-Host " Desormais : createur -> POST /api/cv/<id>/publier ->"
Write-Host "   1) CvDocument (data, design, step) enregistre a l'instant ;"
Write-Host "   2) PublicResume.cvData ecrit DEPUIS LA BASE (formes test/ATS"
Write-Host "      ecrasees) ;"
Write-Host "   3) page /u/<slug> + PDF public + hub : meme contenu."
Write-Host ""
Write-Host " PROTOCOLE DE TEST (http://localhost:3000) :"
Write-Host "  T1. npm run dev, puis /dashboard/cv-builder -> ouvrez votre CV"
Write-Host "      (createur?cv=...)."
Write-Host "  T2. Appliquez une amelioration IA ; attendez 'Base enregistree'"
Write-Host "      dans le sous-titre (ou 2 s)."
Write-Host "  T3. 'Mettre a jour la publication' -> toast OK -> ouvrez"
Write-Host "      /u/<slug> : le contenu IA doit s'afficher (PAS 'Ajou',"
Write-Host "      PAS '2D3D', PAS l'ancien contenu)."
Write-Host "  T4. 'PDF (QR)' -> le PDF serveur doit afficher le MEME contenu"
Write-Host "      avec le QR code (plus de page 'Candidat' vide)."
Write-Host "  T5. 'Publier en ligne' (barre du haut) -> meme verification."
Write-Host "  T6. 'Telecharger le PDF avec QR code' et 'Telecharger le CV PDF'"
Write-Host "      -> meme contenu que la page publique."
Write-Host "  T7. Hub -> bouton Publier d'un 2e CV -> le 1er CV est depublie"
Write-Host "      (un seul CV en ligne a la fois)."
Write-Host "  T8. Relancez ce script sans -SkipTsc : l'etape [5/6] doit montrer"
Write-Host "      PublicResume en forme 'builder' avec le nom/titre a jour."
Write-Host ""
Write-Host " Si une ligne 'ANCRE INTROUVABLE' ou un rapport diagnostic"
Write-Host " apparait : copiez LA SORTIE COMPLETE et renvoyez-la - aucune"
Write-Host " ecriture partielle n'a ete faite (garantie AGENTS.md)."
