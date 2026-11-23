# =============================================================================
# NEXIROLE - sync-publication-cv.ps1  -  VERSION 3 FINALE (remplace v1 et v2)
# =============================================================================
# CAUSE RACINE DU BUG « chaque bouton affiche un contenu vide ou different »
# (prouvee en lisant le code reel du projet) :
#
#   1. DEUX chemins de publication ecrivent la MEME ligne PublicResume
#      (upsert par userId) avec DEUX FORMES de cvData differentes :
#        - createur  : POST /api/public-cv  { cvData: { cv, candidateName,
#          contact, showQrOnPdf }, templateId }        -> forme « wrapper »
#        - hub       : POST /api/public-cv/builder { theme, data } -> forme « spec »
#      La page /u/<slug> tolere les deux formes, mais la route
#      /api/public-cv/pdf?slug= (toDossier) ne comprend que la forme spec :
#      apres une publication depuis le createur, le PDF ?slug= ne trouve
#      aucun champ -> PDF « Candidat » quasi vide (capture d'ecran n2).
#
#   2. Le bouton « Mettre a jour la publication » du hub republie le
#      CvDocument relu en base. Si le createur etait ouvert sur un autre CV
#      (ou si l autosauvegarde debounce 900 ms n etait pas encore passee),
#      la page /u/<slug> est ECRASEE avec un contenu plus ancien
#      (capture n4 : KOUGJO John -> KOUTON Clement).
#
#   3. Les ameliorations IA vivent dans l etat local du createur ; elles ne
#      sont ecrites en base que par l autosauvegarde (debounce) et jamais de
#      facon garantie au moment du clic.
#
# CORRECTIONS V3 :
#   [2/6] createur : UNE fonction unique publierCvActuel() =
#           - PATCH /api/cv/<cvId> { data, design, step }   (ecriture base)
#           - POST /api/public-cv { cvData: buildPublicCvPayload(), ... }
#             (publication, meme appel que le bouton qui fonctionnait)
#           - PATCH drapeaux { isPublic: true, publishedSlug: slug }
#           - renvoie le slug public.
#         E-C : handlePublishPublicCv sauvegarde en base AVANT de publier.
#         E-D : handleDownloadPdfWithQr (3 boutons « PDF avec QR ») publie
#               puis ouvre /api/public-cv/pdf?slug=<slug frais> -> le PDF
#               correspond TOUJOURS a la page /u/.
#         E-E : le gestionnaire PDF simple ecrit en base avant l export.
#   [4/6] /api/public-cv/pdf : normalizeCvData() accepte les DEUX formes de
#         cvData (wrapper et spec) -> plus jamais de « Candidat » vide, quel
#         que soit le chemin de publication utilise.
#   [3/6] hub : DIAGNOSTIC UNIQUEMENT (il relit deja CvDocument a chaud ; il
#         devient coherent des que le createur sauvegarde avant de publier).
#   [1/6] la route /api/cv/[id]/publier existante est CONSERVEE telle quelle.
#
# Idempotent : marqueurs [SYNC V3]. Nettoie d abord les blocs des versions
# precedentes ([SYNC-PUBLICATION V2] / [SYNC v2 E-x]) avant d inserer.
#
# Usage :
#   powershell -ExecutionPolicy Bypass -File .\sync-publication-cv.ps1
#   powershell -ExecutionPolicy Bypass -File .\sync-publication-cv.ps1 -DiagnostiqueSeul
#   Option : -SkipTsc  (saute npx tsc --noEmit)
# NB : patcher-sync-publication-v2.ps1 est OBSOLETE (ne plus l utiliser).
# =============================================================================

param(
    [switch]$DiagnostiqueSeul,
    [switch]$SkipTsc
)

$ErrorActionPreference = 'Stop'
$Root = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }

# ------------------------------------------------------------------ helpers IO
function Read-TextUtf8([string]$Path) {
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    $enc = New-Object System.Text.UTF8Encoding($false)
    $text = $enc.GetString($bytes)
    $bom = $false
    if ($text.Length -gt 0 -and [int][char]$text[0] -eq 0xFEFF) { $bom = $true; $text = $text.Substring(1) }
    return @{ Text = $text; Bom = $bom }
}
function Write-TextUtf8([string]$Path, [string]$Text, [bool]$WithBom) {
    $dir = [System.IO.Path]::GetDirectoryName($Path)
    if ($dir -and -not [System.IO.Directory]::Exists($dir)) { [System.IO.Directory]::CreateDirectory($dir) | Out-Null }
    $enc = New-Object System.Text.UTF8Encoding($WithBom)
    [System.IO.File]::WriteAllText($Path, $Text, $enc)
}
function Test-FileExists([string]$Path) { return [System.IO.File]::Exists($Path) }
function Convert-Eol([string]$S, [string]$Nl) {
    return $S.Replace("`r`n", "`n").Replace("`n", $Nl)
}

# ------------------------------------------------------- helpers analyse texte
function Test-DansCommentaire([string]$Content, [int]$Index) {
    if ($Index -le 0) { return $false }
    $lineStart = $Content.LastIndexOf("`n", [Math]::Max($Index - 1, 0)) + 1
    if ($lineStart -lt 0) { $lineStart = 0 }
    $avant = ''
    if ($Index -gt $lineStart) { $avant = $Content.Substring($lineStart, $Index - $lineStart) }
    $t = $avant.TrimStart()
    if ($t.Length -eq 0) { return $false }  # match en debut de ligne : hors commentaire
    if ($t.StartsWith('//')) { return $true }
    if ($t.StartsWith('/*') -or $t.StartsWith('*')) { return $true }
    return $false
}
function Get-DefinitionCount([string]$Content, [string]$Name) {
    $esc = [regex]::Escape($Name)
    $total = 0
    $patterns = @(
        "(?m)^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+$esc\b",
        "(?m)\b(?:const|let|var)\s+$esc\s*[:=]"
    )
    foreach ($p in $patterns) {
        foreach ($m in [regex]::Matches($Content, $p)) {
            if (-not (Test-DansCommentaire $Content $m.Index)) { $total++ }
        }
    }
    return $total
}
function Get-OccurrenceCount([string]$Content, [string]$Name) {
    return [regex]::Matches($Content, [regex]::Escape($Name)).Count
}
function Get-CountLabel([string]$Content, [string]$Label) {
    return [regex]::Matches($Content, [regex]::Escape($Label)).Count
}
function Find-HandlerForLabel([string]$Content, [string]$Label) {
    $idx = $Content.IndexOf($Label, [System.StringComparison]::Ordinal)
    if ($idx -lt 0) { return '' }
    $from = [Math]::Max(0, $idx - 400)
    $len = [Math]::Min(900, $Content.Length - $from)
    $slice = $Content.Substring($from, $len)
    $labelPos = $idx - $from
    # forme 1 : onClick={() => void publier(cv)} / onClick={() => foo()}
    $best = ''
    foreach ($m in [regex]::Matches($slice, 'onClick\s*=\{[^}]{0,120}?([\w$]+)\s*\(')) {
        if ($m.Index -lt $labelPos) { $best = $m.Groups[1].Value }
    }
    if ($best -and $best -ne 'void') { return $best }
    # forme 2 : onClick={handleX} / onClick={() => handleX}
    $best = ''
    foreach ($m in [regex]::Matches($slice, 'onClick\s*=\{\s*(?:\(\)\s*=>\s*)?([\w$]+)')) {
        if ($m.Index + $m.Length -le $labelPos) { $best = $m.Groups[1].Value }
    }
    if (-not $best) {
        $after = $slice.Substring([Math]::Min($labelPos, $slice.Length))
        $mAfter = [regex]::Match($after, 'onClick\s*=\{\s*(?:\(\)\s*=>\s*)?([\w$]+)')
        if ($mAfter.Success) { $best = $mAfter.Groups[1].Value }
    }
    if ($best -eq 'void') { return '' }
    return $best
}
function Test-HandlerDefined([string]$Content, [string]$Name) {
    if (-not $Name) { return $false }
    $esc = [regex]::Escape($Name)
    return ([regex]::Matches($Content, "(?m)\b(?:function|const|let|var)\s+$esc\b").Count -gt 0)
}
function Get-HandlerSlice([string]$Content, [string]$Name) {
    $esc = [regex]::Escape($Name)
    $m = [regex]::Match($Content, "(?m)\b(?:async\s+)?function\s+$esc\b|\bconst\s+$esc\b")
    if (-not $m.Success) { return '' }
    $start = $m.Index
    $maxLen = [Math]::Min(1800, $Content.Length - $start)
    $slice = $Content.Substring($start, $maxLen)
    $cuts = @()
    $c1 = [regex]::Match($slice.Substring([Math]::Min(40, $slice.Length)), "(?m)^[ \t]{0,6}(?:async\s+)?function\s+\w+\b")
    if ($c1.Success) { $cuts += ($c1.Index + 40) }
    $c2 = [regex]::Match($slice.Substring([Math]::Min(40, $slice.Length)), "(?m)^[ \t]{0,6}const\s+handle\w+\s*=")
    if ($c2.Success) { $cuts += ($c2.Index + 40) }
    if ($cuts.Count -gt 0) {
        $cut = ($cuts | Measure-Object -Minimum).Minimum
        if ($cut -gt 120) { $slice = $slice.Substring(0, $cut) }
    }
    return $slice
}
function Get-StringifyExpr([string]$Slice) {
    $m = [regex]::Match($Slice, 'JSON\.stringify\(')
    if (-not $m.Success) { return '' }
    $start = $m.Index + $m.Length
    $depth = 1
    $i = $start
    $inStr = $false
    $q = ''
    while ($i -lt $Slice.Length -and $depth -gt 0) {
        $ch = $Slice[$i]
        if ($inStr) {
            if ($ch -eq '\') { $i += 2; continue }
            if ($ch -eq $q) { $inStr = $false }
        } else {
            if ($ch -eq [char]0x27 -or $ch -eq [char]0x22 -or $ch -eq [char]0x60) { $inStr = $true; $q = $ch }
            elseif ($ch -eq '(') { $depth++ }
            elseif ($ch -eq ')') { $depth-- }
        }
        $i++
    }
    if ($depth -ne 0) { return '' }
    $len = $i - $start - 1
    if ($len -le 0) { return '' }
    $e = $Slice.Substring($start, $len).Trim()
    while ($e.EndsWith(';')) { $e = $e.Substring(0, $e.Length - 1).Trim() }
    return $e
}
function Get-HandlerInsert([string]$Content, [string]$Name) {
    $esc = [regex]::Escape($Name)
    $mFn = [regex]::Match($Content, "(?m)^[ \t]*(?:async\s+)?function\s+$esc\b")
    $mAr = [regex]::Match($Content, "(?m)^[ \t]*const\s+$esc\s*=")
    $declStart = -1
    $isDeclFn = $false
    if ($mFn.Success -and ((-not $mAr.Success) -or $mFn.Index -le $mAr.Index)) { $declStart = $mFn.Index; $isDeclFn = $true }
    elseif ($mAr.Success) { $declStart = $mAr.Index }
    if ($declStart -lt 0) { return @{ Index = -1; Async = $false } }
    $winLen = [Math]::Min(900, $Content.Length - $declStart)
    $win = $Content.Substring($declStart, $winLen)
    $braceIdx = -1
    if ($isDeclFn) {
        $pi = $win.IndexOf(')')
        if ($pi -ge 0) { $bi = $win.IndexOf('{', $pi + 1); if ($bi -ge 0) { $braceIdx = $bi } }
    }
    if ($braceIdx -lt 0) {
        $ai = $win.IndexOf('=>')
        if ($ai -ge 0) { $bi = $win.IndexOf('{', $ai + 2); if ($bi -ge 0) { $braceIdx = $bi } }
    }
    if ($braceIdx -lt 0) {
        $pi = $win.IndexOf(')')
        if ($pi -ge 0) { $bi = $win.IndexOf('{', $pi + 1); if ($bi -ge 0) { $braceIdx = $bi } }
    }
    if ($braceIdx -lt 0 -or $braceIdx -gt 800) { return @{ Index = -1; Async = $false } }
    $head = $win.Substring(0, $braceIdx + 1)
    $isAsync = $head -match 'async'
    return @{ Index = $declStart + $braceIdx + 1; Async = $isAsync }
}
function Add-AsyncToDecl([string]$Content, [string]$Name) {
    $esc = [regex]::Escape($Name)
    foreach ($m in [regex]::Matches($Content, "\bconst\s+$esc\s*=\s*\(")) {
        if (-not (Test-DansCommentaire $Content $m.Index)) {
            $pos = $m.Index + $m.Value.Length - 1
            return @{ Content = $Content.Insert($pos, 'async '); Changed = $true }
        }
    }
    foreach ($m in [regex]::Matches($Content, "\bconst\s+$esc\s*=\s*useCallback\(\s*\(")) {
        if (-not (Test-DansCommentaire $Content $m.Index)) {
            $pos = $m.Index + $m.Value.Length - 1
            return @{ Content = $Content.Insert($pos, 'async '); Changed = $true }
        }
    }
    foreach ($m in [regex]::Matches($Content, "(?m)^[ \t]*function\s+$esc\s*\(")) {
        if (-not (Test-DansCommentaire $Content $m.Index)) {
            return @{ Content = $Content.Insert($m.Index, 'async '); Changed = $true }
        }
    }
    return @{ Content = $Content; Changed = $false }
}
# Nettoyage des blocs des versions precedentes (v1 / brouillon v2).
function Remove-LegacySyncBlocks([string]$Content) {
    $rx = '(?ms)^[ \t]*// \[SYNC(-PUBLICATION V2| v2 E-[A-Z])\][^\r\n]*debut[^\r\n]*\r?\n.*?^[ \t]*// \[SYNC(-PUBLICATION V2| v2 E-[A-Z])\][^\r\n]*fin[^\r\n]*\r?\n'
    return [regex]::Replace($Content, $rx, '')
}
function Test-LegacyMarkers([string]$Content) {
    return ([regex]::Matches($Content, '\[SYNC-PUBLICATION V2\]|\[SYNC v2 E-')).Count
}
# ------------------------------------------------- blocs de code inseres (V3)
# Helper unique : sauvegarde base + publication + renvoi du slug public.
$HELPER_JS = @'
  // [SYNC V3] debut - helper : ecriture base puis publication avant chaque action
  async function publierCvActuel(): Promise<string | null> {
    try {
@@PATCH_SAVE@@      const __res = await fetch('/api/public-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(@@PUBLISH_BODY@@),
      });
      const __json = (await __res.json().catch(() => null)) as
        | { publicResume?: { slug?: string } | null }
        | null;
      const __slug = __json && __json.publicResume && __json.publicResume.slug
        ? String(__json.publicResume.slug)
        : '';
      if (!__res.ok || !__slug) {
        console.warn('[SYNC V3] publication echouee (HTTP ' + __res.status + ')', __json);
        return null;
      }
      console.log('[SYNC V3] ecriture base + publication OK : /u/' + __slug);
@@FLAGS@@@@SET_PUB@@      return __slug;
    } catch (__e) {
      console.warn('[SYNC V3] exception publication', __e);
      return null;
    }
  }
  // [SYNC V3] fin - helper
'@

# E-C : sauvegarde explicite en base au debut de handlePublishPublicCv
# (la publication historique qui suit reste inchangee).
$EC_BLOCK = @'
    // [SYNC V3 E-C] debut - ecriture base avant la publication
    try {
      if (cvId) {
        const __saveRes = await fetch('/api/cv/' + encodeURIComponent(cvId), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, design, step }),
        });
        if (!__saveRes.ok) {
          console.warn('[SYNC V3] sauvegarde CvDocument echouee (HTTP ' + __saveRes.status + ')');
        }
      }
    } catch (__syncErrC) {
      console.warn('[SYNC V3] sauvegarde exception', __syncErrC);
    }
    // [SYNC V3 E-C] fin
'@

# E-D : publication puis PDF serveur depuis la copie publique fraiche.
$ED_BLOCK = @'
    // [SYNC V3 E-D] debut - ecriture base + publication puis PDF du slug frais
    try {
      const __slugPdf = await publierCvActuel();
      const __slugFinal = __slugPdf || @@SLUG_FALLBACK@@;
      if (__slugFinal) {
        window.open('/api/public-cv/pdf?slug=' + encodeURIComponent(__slugFinal), '_blank');
        return;
      }
      console.warn('[SYNC V3] slug indisponible : export historique en secours');
    } catch (__syncErrD) {
      console.warn('[SYNC V3] exception PDF QR : export historique en secours', __syncErrD);
    }
    // [SYNC V3 E-D] fin
'@

# E-E : ecriture base avant le telechargement du PDF simple.
$EE_BLOCK = @'
    // [SYNC V3 E-E] debut - ecriture base avant le telechargement PDF
    try {
      await publierCvActuel();
    } catch (_syncErrE) {
      // l export historique continue meme si l ecriture echoue
    }
    // [SYNC V3 E-E] fin
'@

# [4/6] : normalisation des deux formes de cvData dans la route PDF.
$PDF_NORMALIZE = @'
/* [SYNC V3 PDF] debut - accepte les deux formes de cvData :
   wrapper { cv, candidateName, contact } (createur) et
   spec { theme, data } (bibliotheque) ; sinon renvoie cv inchange. */
function normalizeCvData(cv: Record<string, unknown>): Record<string, unknown> {
  const wrapper = asRecord((cv as Record<string, unknown>).cv);
  const spec = asRecord((cv as Record<string, unknown>).data);
  let base: Record<string, unknown> = cv;
  if (str(asRecord(wrapper.personal).fullName) !== "" || str(wrapper.summary) !== "") {
    base = wrapper;
  } else if (str(asRecord(spec.personal).fullName) !== "" || str(spec.summary) !== "") {
    base = spec;
  }
  const personal: Record<string, unknown> = { ...asRecord(base.personal) };
  if (str(personal.fullName) === "" && str(cv.candidateName) !== "") {
    personal.fullName = str(cv.candidateName);
  }
  const contact = asRecord(cv.contact);
  const champsContact = ["email", "phone", "location", "linkedin"] as const;
  for (const champ of champsContact) {
    if (str(personal[champ]) === "" && str(contact[champ]) !== "") {
      personal[champ] = str(contact[champ]);
    }
  }
  return {
    ...base,
    personal,
    theme: cv.theme !== undefined ? cv.theme : base.theme,
    photo: cv.photo !== undefined ? cv.photo : base.photo,
  };
}
/* [SYNC V3 PDF] fin */
'@

# ------------------------------------------------------------------ libelles
$L_TELECH = 'T' + [char]0x00E9 + 'l' + [char]0x00E9 + 'charger le CV PDF'
$L_MAJ = 'Mettre ' + [char]0x00E0 + ' jour la publication'
$L_PDFQR = 'PDF avec QR'
$L_PDFQRPAREN = 'PDF (QR)'

# ------------------------------------------------------------------ demarrage
Write-Host '=============================================================='
Write-Host ' NEXIROLE - Synchronisation publication CV (boutons -> base) V3'
Write-Host '=============================================================='
Write-Host ''

$chemins = @{
    createur  = Join-Path $Root 'src/app/dashboard/cv-builder/createur/page.tsx'
    hub       = Join-Path $Root 'src/app/dashboard/cv-builder/page.tsx'
    pdfPublic = Join-Path $Root 'src/app/api/public-cv/pdf/route.ts'
    route     = Join-Path $Root 'src/app/api/cv/[id]/publier/route.ts'
    schema    = Join-Path $Root 'prisma/schema.prisma'
}

Write-Host '[0/6] Fichiers detectes :'
$okCreateur = Test-FileExists $chemins.createur
$okHub = Test-FileExists $chemins.hub
$okPdf = Test-FileExists $chemins.pdfPublic
$okRoute = Test-FileExists $chemins.route
if ($okCreateur) { Write-Host '  - createur     : src/app/dashboard/cv-builder/createur/page.tsx' } else { Write-Host '  - createur     : INTROUVABLE' }
if ($okHub) { Write-Host '  - hub          : src/app/dashboard/cv-builder/page.tsx' } else { Write-Host '  - hub          : INTROUVABLE' }
if ($okPdf) { Write-Host '  - pdf public   : src/app/api/public-cv/pdf/route.ts' } else { Write-Host '  - pdf public   : INTROUVABLE' }
if ($okRoute) { Write-Host '  - route atom.  : src/app/api/cv/[id]/publier/route.ts (presente)' } else { Write-Host '  - route atom.  : absente (non requise en V3)' }
if (-not $okCreateur) {
    Write-Host '[!] createur introuvable - lancez le script depuis la racine du projet.'
    exit 1
}

$written = @()
$stopAll = $false

# ------------------------------------------------------------------ [1/6] route
Write-Host ''
Write-Host '[1/6] Route atomique /api/cv/[id]/publier ...'
if ($okRoute) {
    $routeInfo = Read-TextUtf8 $chemins.route
    if ($routeInfo.Text.Contains('SYNC-PUBLICATION V2')) {
        Write-Host '  [=] route V2 presente - conservee (non requise par le flux V3)'
    } else {
        Write-Host '  [=] route presente - conservee telle quelle'
    }
} else {
    Write-Host '  [=] absente - le flux V3 passe par PATCH /api/cv/<id> + POST /api/public-cv (endpoints existants)'
}

# ------------------------------------------------------- [2/6] createur
Write-Host ''
Write-Host '[2/6] Createur : rebranchement des boutons (ecriture base avant action) ...'
$cInfo = Read-TextUtf8 $chemins.createur
$creator = $cInfo.Text
$nlC = "`n"
if ($creator.Contains("`r`n")) { $nlC = "`r`n" }

$legacyCount = Test-LegacyMarkers $creator
$creator = Remove-LegacySyncBlocks $creator
if ($legacyCount -gt 0) {
    Write-Host ('  [+] nettoyage : ' + $legacyCount + ' marqueur(s) des versions precedentes supprime(s)')
}

# --- diagnostics (affiches dans les deux modes)
$hasCvId    = ([regex]::Matches($creator, '(?m)(?<![\w$])cvId(?![\w$])').Count -gt 0)
$hasData    = ([regex]::Matches($creator, '(?m)^\s*const\s*\[\s*data\s*,\s*setData\s*\]').Count -gt 0)
$hasDesign  = ([regex]::Matches($creator, '(?m)^\s*const\s*\[\s*design\s*,\s*setDesign\s*\]').Count -gt 0)
$hasStep    = ([regex]::Matches($creator, '(?m)^\s*const\s*\[\s*step\s*,\s*setStep\s*\]').Count -gt 0)
$hasBuild   = $creator.Contains('buildPublicCvPayload')
$hasMapTpl  = $creator.Contains('mapDesignTemplate')
$hasSetPub  = $creator.Contains('setPubSlug')
$hasPubSlug = ([regex]::Matches($creator, '(?m)(?<![\w$])pubSlug(?![\w$])').Count -gt 0)
$patchOk    = ($hasCvId -and $hasData -and $hasDesign -and $hasStep)

Write-Host ('  identifiants : cvId=' + $hasCvId + ' data=' + $hasData + ' design=' + $hasDesign + ' step=' + $hasStep + ' buildPublicCvPayload=' + $hasBuild + ' mapDesignTemplate=' + $hasMapTpl + ' setPubSlug=' + $hasSetPub + ' pubSlug=' + $hasPubSlug)

$hpSlice = Get-HandlerSlice $creator 'handlePublishPublicCv'
$publishBody = Get-StringifyExpr $hpSlice
$bodySource = 'extrait de handlePublishPublicCv'
if (-not $publishBody) {
    if ($hasBuild -and $hasMapTpl) {
        $publishBody = '{ cvData: buildPublicCvPayload(), templateId: mapDesignTemplate(design.template) }'
        $bodySource = 'reconstruit (buildPublicCvPayload)'
    }
}
Write-Host ('  corps publication utilise : ' + $bodySource)
if ($publishBody) { Write-Host ('    -> ' + $publishBody) }

# libelles presents et handlers cibles (transparence totale)
foreach ($lbl in @($L_MAJ, 'Publier en ligne', 'Publier mon CV en ligne', $L_PDFQRPAREN, $L_PDFQR, $L_TELECH)) {
    $n = Get-CountLabel $creator $lbl
    if ($n -gt 0) {
        $h = Find-HandlerForLabel $creator $lbl
        $info = ''
        if ($h) { $info = ' -> onClick { ' + $h + ' } (defini : ' + (Test-HandlerDefined $creator $h) + ')' }
        Write-Host ("  libelle '" + $lbl + "' : " + $n + ' occurrence(s)' + $info)
    }
}
$defsPubAvant = Get-DefinitionCount $creator 'publierCvActuel'
if ($defsPubAvant -gt 0) { Write-Host '  [!] publierCvActuel deja defini : ' + $defsPubAvant + ' definition(s)' }

if ($DiagnostiqueSeul) {
    Write-Host '  (mode diagnostic : aucune ecriture)'
} else {

# ------------------------------------------------- [2/6] createur (ecritures)
$creatorNew = $creator

# --- generation du corps du helper selon les identifiants disponibles
$patchSave = ''
if ($patchOk) {
    $patchSave = @'
      if (cvId) {
        const __saveRes = await fetch('/api/cv/' + encodeURIComponent(cvId), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, design, step }),
        });
        if (!__saveRes.ok) {
          console.warn('[SYNC V3] sauvegarde CvDocument echouee (HTTP ' + __saveRes.status + ')');
        }
      }
'@
}
$flagsJs = ''
if ($patchOk) {
    $flagsJs = @'
      try {
        if (cvId) {
          await fetch('/api/cv/' + encodeURIComponent(cvId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isPublic: true, publishedSlug: __slug }),
          });
        }
      } catch (_flagErr) {
        // drapeaux non critiques : la publication reste valide
      }
'@
}
$setPubJs = ''
if ($hasSetPub) {
    $setPubJs = @'
      try { setPubSlug(__slug); } catch (_setPubErr) { /* etat indisponible */ }
'@
}

# --- E-B : insertion du helper avant handlePublishPublicCv (ou PDF QR en secours)
$eB = $false
$eBAnchor = ''
foreach ($cand in @('handlePublishPublicCv', 'handleDownloadPdfWithQr')) {
    $m = [regex]::Match($creatorNew, "(?m)^[ \t]*(?:async\s+)?(?:const|function)\s+$cand\b")
    if ($m.Success) { $eBAnchor = $cand; break }
}
if ($creatorNew.Contains('[SYNC V3] debut - helper')) {
    Write-Host '  [=] E-B helper deja present, ignore'
    $eB = $true
} elseif (-not $publishBody) {
    Write-Host '  [!] E-B impossible : corps de publication non determine (ni extraction, ni buildPublicCvPayload)'
} elseif (-not $eBAnchor) {
    Write-Host '  [!] E-B ancre introuvable (handlePublishPublicCv / handleDownloadPdfWithQr)'
} else {
    $bloc = $HELPER_JS.Replace('@@PATCH_SAVE@@', $patchSave).Replace('@@PUBLISH_BODY@@', $publishBody).Replace('@@FLAGS@@', $flagsJs).Replace('@@SET_PUB@@', $setPubJs)
    $bloc = Convert-Eol $bloc $nlC
    $mAncre = [regex]::Match($creatorNew, "(?m)^[ \t]*(?:async\s+)?(?:const|function)\s+$eBAnchor\b")
    $creatorNew = $creatorNew.Insert($mAncre.Index, $bloc.TrimEnd() + $nlC + $nlC)
    Write-Host ('  [+] E-B helper publierCvActuel insere avant ' + $eBAnchor + ' (sauvegarde base : ' + $patchOk + ')')
    $eB = $true
}

# --- E-C : sauvegarde en tete de handlePublishPublicCv
if ($creatorNew.Contains('[SYNC V3 E-C]')) {
    Write-Host '  [=] E-C deja applique, ignore'
} elseif (-not $patchOk) {
    Write-Host '  [=] E-C saute : cvId/data/design/step incomplets (la publication historique reste inchangee)'
} else {
    $resC = Get-HandlerInsert $creatorNew 'handlePublishPublicCv'
    if ($resC.Index -lt 0) {
        Write-Host '  [!] E-C corps de handlePublishPublicCv non localise'
    } else {
        if (-not $resC.Async) {
            $aC = Add-AsyncToDecl $creatorNew 'handlePublishPublicCv'
            if ($aC.Changed) {
                $creatorNew = $aC.Content
                $resC = Get-HandlerInsert $creatorNew 'handlePublishPublicCv'
            }
        }
        if ($resC.Index -ge 0 -and $resC.Async) {
            $creatorNew = $creatorNew.Insert($resC.Index, $nlC + (Convert-Eol $EC_BLOCK $nlC).TrimEnd() + $nlC)
            Write-Host '  [+] E-C handlePublishPublicCv : ecriture base avant publication'
        } else {
            Write-Host '  [!] E-C handler non async (forme non reconnue) - envoyez la sortie'
        }
    }
}

# --- E-D : publication + PDF serveur depuis le slug frais
if ($creatorNew.Contains('[SYNC V3 E-D]')) {
    Write-Host '  [=] E-D deja applique, ignore'
} elseif (-not $eB) {
    Write-Host '  [!] E-D saute : helper absent'
} else {
    $resD = Get-HandlerInsert $creatorNew 'handleDownloadPdfWithQr'
    if ($resD.Index -lt 0) {
        Write-Host '  [!] E-D corps de handleDownloadPdfWithQr non localise'
    } else {
        if (-not $resD.Async) {
            $aD = Add-AsyncToDecl $creatorNew 'handleDownloadPdfWithQr'
            if ($aD.Changed) {
                $creatorNew = $aD.Content
                $resD = Get-HandlerInsert $creatorNew 'handleDownloadPdfWithQr'
            }
        }
        if ($resD.Index -ge 0 -and $resD.Async) {
            $slugFallback = "''"
            if ($hasPubSlug) { $slugFallback = 'pubSlug || ' + "''" }
            $blocD = (Convert-Eol ($ED_BLOCK.Replace('@@SLUG_FALLBACK@@', $slugFallback)) $nlC).TrimEnd()
            $creatorNew = $creatorNew.Insert($resD.Index, $nlC + $blocD + $nlC)
            Write-Host '  [+] E-D handleDownloadPdfWithQr : publication puis PDF du slug frais (couvre les 3 boutons PDF avec QR)'
        } else {
            Write-Host '  [!] E-D handler non async (forme non reconnue) - envoyez la sortie'
        }
    }
}

# --- E-E : PDF simple (Telecharger le CV PDF) -> ecriture base avant export
$eeHandler = ''
$eeViaLabel = Find-HandlerForLabel $creator $L_TELECH
if ($eeViaLabel -and $eeViaLabel -ne 'handleDownloadPdfWithQr' -and $eeViaLabel -notmatch 'Print' -and (Test-HandlerDefined $creator $eeViaLabel)) {
    $eeHandler = $eeViaLabel
} else {
    foreach ($m2 in [regex]::Matches($creator, "(?m)^[ \t]*(?:async\s+)?(?:const|function)\s+(handle\w*[Dd]ownload\w*Pdf\w*|handle\w*Pdf\w*|handle\w*Export\w*)\s*[=(]")) {
        $nm = $m2.Groups[1].Value
        if ($nm -ne 'handleDownloadPdfWithQr' -and $nm -notmatch 'WithQr|AvecQr|Public|Print') { $eeHandler = $nm; break }
    }
}
if (-not $eeHandler) {
    Write-Host '  [=] E-E aucun gestionnaire PDF simple distinct (normal si le meme handler sert au QR)'
} elseif ($creatorNew.Contains('[SYNC V3 E-E]')) {
    Write-Host '  [=] E-E deja applique, ignore'
} elseif (-not $eB) {
    Write-Host '  [!] E-E saute : helper absent'
} else {
    $resE = Get-HandlerInsert $creatorNew $eeHandler
    if ($resE.Index -lt 0) {
        Write-Host ('  [!] E-E corps de ' + $eeHandler + ' non localise')
    } else {
        if (-not $resE.Async) {
            $aE = Add-AsyncToDecl $creatorNew $eeHandler
            if ($aE.Changed) {
                $creatorNew = $aE.Content
                $resE = Get-HandlerInsert $creatorNew $eeHandler
            }
        }
        if ($resE.Index -ge 0 -and $resE.Async) {
            $creatorNew = $creatorNew.Insert($resE.Index, $nlC + (Convert-Eol $EE_BLOCK $nlC).TrimEnd() + $nlC)
            Write-Host ('  [+] E-E ' + $eeHandler + ' : ecriture base avant telechargement')
        } else {
            Write-Host ('  [!] E-E handler ' + $eeHandler + ' non async (forme non reconnue) - envoyez la sortie')
        }
    }
}

# --- controle final : UNE SEULE definition du helper, puis ecriture
$defsPub = Get-DefinitionCount $creatorNew 'publierCvActuel'
$occPub = Get-OccurrenceCount $creatorNew 'publierCvActuel'
Write-Host ('  controle : publierCvActuel -> definitions ' + $defsPub + ', appels ' + ($occPub - $defsPub))
if ($defsPub -ne 1) {
    Write-Host '  [!] nombre de definitions inattendu - AUCUNE ecriture du createur. Envoyez cette sortie.'
    $stopAll = $true
} else {
    Write-TextUtf8 $chemins.createur $creatorNew $cInfo.Bom
    $written += 'src/app/dashboard/cv-builder/createur/page.tsx'
    Write-Host '  [OK] createur ecrit (sauvegarde base + publication + PDF slug frais)'
}
} # fin bloc ecriture createur (non-diag)

# ------------------------------------------------------------------ [3/6] hub
Write-Host ''
Write-Host '[3/6] Hub bibliotheque : diagnostic (aucune modification) ...'
if (-not $okHub) {
    Write-Host '  [=] hub introuvable, ignore'
} else {
    $hubTxt = (Read-TextUtf8 $chemins.hub).Text
    foreach ($lbl in @($L_MAJ, 'Publier en ligne', $L_PDFQRPAREN, $L_TELECH, $L_PDFQR)) {
        $n = Get-CountLabel $hubTxt $lbl
        if ($n -gt 0) {
            $h = Find-HandlerForLabel $hubTxt $lbl
            $info = ''
            if ($h) { $info = ' -> onClick { ' + $h + ' } (defini : ' + (Test-HandlerDefined $hubTxt $h) + ')' }
            Write-Host ("  libelle '" + $lbl + "' : " + $n + ' occurrence(s)' + $info)
        }
    }
    $eps = [regex]::Matches($hubTxt, "[\x27\x22\x60](/api/[^\x27\x22\x60]+)") | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
    Write-Host ('  endpoints utilises : ' + ($eps -join ', '))
    Write-Host '  info : le hub relit deja GET /api/cv/<id> avant de republier ;'
    Write-Host '         desormais le createur sauvegarde (PATCH) avant chaque clic,'
    Write-Host '         donc le hub republie le contenu a jour (plus d ecrasement ancien).'
}

# ------------------------------------------------------------ [4/6] pdf public
Write-Host ''
Write-Host '[4/6] PDF public : normalisation des deux formes de cvData ...'
if (-not $okPdf) {
    Write-Host '  [=] fichier pdf public introuvable, ignore'
} elseif ($DiagnostiqueSeul) {
    $pdfTxt0 = (Read-TextUtf8 $chemins.pdfPublic).Text
    Write-Host ('  deja V3 : ' + $pdfTxt0.Contains('[SYNC V3 PDF]'))
    Write-Host ('  ancre toDossier        : ' + $pdfTxt0.Contains('function toDossier('))
    Write-Host ('  ancre asRecord(row.cvData) : ' + $pdfTxt0.Contains('const cv = asRecord(row.cvData);'))
    Write-Host ('  ancre asRecord(row.data)   : ' + $pdfTxt0.Contains('const cv = asRecord(row.data);'))
    Write-Host ('  ancre theme            : ' + $pdfTxt0.Contains('const theme = asRecord(cv.theme);'))
    Write-Host '  forme wrapper detectee dans le code createur : buildPublicCvPayload'
} elseif ($stopAll) {
    Write-Host '  (arret demande a l etape 2 : etape ignoree)'
} else {
    $pInfo = Read-TextUtf8 $chemins.pdfPublic
    $pdfTxt = $pInfo.Text
    if ($pdfTxt.Contains('[SYNC V3 PDF]')) {
        Write-Host '  [=] normalisation deja presente, ignore'
    } else {
        $nlP = "`n"
        if ($pdfTxt.Contains("`r`n")) { $nlP = "`r`n" }
        $okA = $false
        $okB = $false
        $okC = $false
        # A : insertion de normalizeCvData avant toDossier
        $idxA = $pdfTxt.IndexOf('function toDossier(')
        if ($idxA -ge 0) {
            $blocN = (Convert-Eol $PDF_NORMALIZE $nlP).TrimEnd()
            $pdfTxt = $pdfTxt.Insert($idxA, $blocN + $nlP + $nlP)
            $okA = $true
        }
        # B : wrapper PublicResume (mode ?slug=)
        $ancreB = 'const cv = asRecord(row.cvData);'
        if ($pdfTxt.Contains($ancreB)) {
            $pdfTxt = $pdfTxt.Replace($ancreB, 'const cv = normalizeCvData(asRecord(row.cvData));')
            $okB = $true
        }
        # C : CvDocument (mode ?cv=)
        $ancreC = 'const cv = asRecord(row.data);'
        if ($pdfTxt.Contains($ancreC)) {
            $pdfTxt = $pdfTxt.Replace($ancreC, 'const cv = normalizeCvData(asRecord(row.data));')
            $okC = $true
        }
        # D (optionnel) : theme de secours depuis row.templateId
        $ancreD = 'const theme = asRecord(cv.theme);'
        if ($pdfTxt.Contains($ancreD)) {
            $pdfTxt = $pdfTxt.Replace($ancreD, "const theme0 = asRecord(cv.theme);`n" + "      const theme: Record<string, unknown> = Object.keys(theme0).length > 0 ? theme0 : { webTemplate: typeof row.templateId === 'string' ? row.templateId : '' };")
        }
        if ($okA -and ($okB -or $okC)) {
            Write-TextUtf8 $chemins.pdfPublic $pdfTxt $pInfo.Bom
            $written += 'src/app/api/public-cv/pdf/route.ts'
            Write-Host ('  [+] normalizeCvData inseree (wrapper=' + $okB + ', cvDocument=' + $okC + ') - le PDF ?slug= accepte les deux formes de publication')
        } else {
            Write-Host '  [!] ancres non trouvees (toDossier=' + $okA + ', cvData=' + $okB + ', data=' + $okC + ') - rien modifie. Envoyez la sortie -DiagnostiqueSeul.'
        }
    }
}

# ------------------------------------------------------------------ [5/6] base
Write-Host ''
Write-Host '[5/6] Diagnostic base de donnees (CvDocument + PublicResume) ...'
if (Test-FileExists $chemins.schema) {
    $schemaTxt = (Read-TextUtf8 $chemins.schema).Text
    $modeles = @()
    foreach ($modele in @('CvDocument', 'PublicResume')) {
        $mm = [regex]::Match($schemaTxt, "(?ms)model\s+$modele\s*\{(.*?)^\}")
        if ($mm.Success) {
            $modeles += $modele
            Write-Host ('  modele ' + $modele + ' :')
            foreach ($ln in ($mm.Groups[1].Value -split "`n")) {
                $t = $ln.Trim()
                if ($t -and -not $t.StartsWith('//') -and $t -ne '}') { Write-Host ('    ' + $t) }
            }
        }
    }
    if ($modeles.Count -eq 0) {
        $autres = [regex]::Matches($schemaTxt, '(?m)model\s+(\w+)\s*\{') | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -match 'Public|Resume|Cv|Document' } | Select-Object -Unique
        if ($autres) { Write-Host ('  modeles voisins trouves : ' + ($autres -join ', ')) }
        else { Write-Host '  [!] aucun modele Cv/Public trouve dans prisma/schema.prisma' }
    }
} else {
    Write-Host '  [!] prisma/schema.prisma introuvable'
}
Write-Host '  rappels utiles :'
Write-Host '   - PublicResume est upsert par userId : UN seul CV public par compte.'
Write-Host '   - probe manuelle (serveur lance) : ouvrir http://localhost:3000/api/public-cv (GET)'

# ------------------------------------------------------------------ [6/6] fin
Write-Host ''
Write-Host '[6/6] Recapitulatif ...'
if ($DiagnostiqueSeul) {
    Write-Host ''
    Write-Host 'DIAGNOSTIC TERMINE (aucune ecriture). Renvoyez cette sortie si un patch doit etre ajuste.'
    exit 0
}
if ($written.Count -gt 0) {
    foreach ($w in $written) { Write-Host ('  modifie : ' + $w) }
} else {
    Write-Host '  aucun fichier modifie'
}
if ($stopAll) {
    Write-Host ''
    Write-Host 'ARRET : corrigez le point [!] ci-dessus puis relancez (ou renvoyez la sortie).'
    exit 1
}
if ($SkipTsc) {
    Write-Host '  tsc : saute (-SkipTsc)'
} else {
    if (Test-Path (Join-Path $Root 'node_modules')) {
        Write-Host '  [...] npx tsc --noEmit (peut prendre 30-60 s) ...'
        $oldEap = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            Push-Location $Root
            $tscOut = & npx --no-install tsc --noEmit 2>&1
            $tscCode = $LASTEXITCODE
            Pop-Location
            $ErrorActionPreference = $oldEap
            if ($tscCode -eq 0) {
                Write-Host '  [OK] TypeScript : aucune erreur'
            } else {
                Write-Host '  [!] TypeScript : erreurs (extrait) :'
                $tscOut | Select-Object -Last 15 | ForEach-Object { Write-Host ('    ' + $_) }
            }
        } catch {
            Pop-Location
            $ErrorActionPreference = $oldEap
            Write-Host ('  [!] tsc indisponible : ' + $_.Exception.Message)
        }
    } else {
        Write-Host '  [=] node_modules absent - tsc saute'
    }
}
Write-Host ''
Write-Host 'TERMINE.'
Write-Host 'Prochaines etapes :'
Write-Host '  1) Redemarrez le serveur : Ctrl+C puis npm run dev'
Write-Host '  2) Ouvrez le createur avec ?cv=<id>, faites une modification IA,'
Write-Host '     puis cliquez chaque bouton : la console navigateur doit afficher'
Write-Host '     "[SYNC V3] ecriture base + publication OK : /u/<slug>"'
Write-Host '  3) Verifiez : la page /u/<slug>, le PDF ?slug= et le PDF telecharge'
Write-Host '     montrent maintenant le MEME contenu que l editeur.'
Write-Host '  4) git add . ; git commit -m "SYNC V3 : boutons -> sauvegarde + publication + PDF coherent" ; git push'
Write-Host '  Si un point [!] apparait : relancez avec -DiagnostiqueSeul et renvoyez la sortie.'
