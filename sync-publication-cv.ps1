# =============================================================================
# NEXIROLE - sync-publication-cv.ps1  -  VERSION 2 COMPLETE (remplace la v1)
# =============================================================================
# Objectif : chaque clic des boutons de publication / PDF ecrit les
#            modifications dans la base (route atomique /api/cv/<id>/publier)
#            AVANT toute action. Le publie et l export restent donc identiques.
#
# Corrections V2 par rapport a la V1 :
#   1. Le controle "FONCTIONS EN DOUBLON" ne compte plus les APPELS :
#      seules les DEFINITIONS (function X / const X =) sont comptees.
#      C etait la cause du blocage "publierCvActuel x2" (faux positif).
#   2. Idempotent : marqueurs [SYNC-PUBLICATION V2] - relancer ne duplique rien.
#   3. La route atomique existante est NORMALISEE vers la version V2
#      (contrat garanti entre la route et les fonctions injectees).
#   4. Detection automatique du payload et de l endpoint PDF dans le code
#      existant (JSON.stringify / fetch) : plus aucun libelle suppose.
#   5. Encodage UTF-8 gere en interne (BOM preserve) :
#      la commande externe "encodage lock" est OBSOLETE.
#   6. Diagnostic du schema Prisma (modeles + champs) sans client genere.
#
# Usage :
#   powershell -ExecutionPolicy Bypass -File .\sync-publication-cv.ps1
#   powershell -ExecutionPolicy Bypass -File .\sync-publication-cv.ps1 -DiagnostiqueSeul
#   Options : -SkipTsc (saute npx tsc)   -FermerAnciennesLignes (rapport anciens endpoints)
#
# NB : patcher-sync-publication-v2.ps1 est OBSOLETE (ne plus l utiliser).
# =============================================================================

param(
    [switch]$DiagnostiqueSeul,
    [switch]$SkipTsc,
    [switch]$FermerAnciennesLignes
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
    $from = [Math]::Max(0, $idx - 300)
    $len = [Math]::Min(700, $Content.Length - $from)
    $slice = $Content.Substring($from, $len)
    $labelPos = $idx - $from
    $best = ''
    foreach ($m in [regex]::Matches($slice, 'onClick\s*=\{\s*(?:\(\)\s*=>\s*)?([\w$]+)')) {
        if ($m.Index + $m.Length -le $labelPos) { $best = $m.Groups[1].Value }
    }
    if ($best) { return $best }
    $after = $slice.Substring([Math]::Min($labelPos, $slice.Length))
    $mAfter = [regex]::Match($after, 'onClick\s*=\{\s*(?:\(\)\s*=>\s*)?([\w$]+)')
    if ($mAfter.Success) { return $mAfter.Groups[1].Value }
    return ''
}
function Test-HandlerDefined([string]$Content, [string]$Name) {
    if (-not $Name) { return $false }
    $esc = [regex]::Escape($Name)
    return ([regex]::Matches($Content, "(?m)\b(?:function|const|let|var)\s+$esc\b").Count -gt 0)
}
function Get-Balance([string]$S) {
    $o = [regex]::Matches($S, '\(').Count
    $c = [regex]::Matches($S, '\)').Count
    return ($o - $c)
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
function Get-FetchEndpoint([string]$Slice) {
    $m = [regex]::Match($Slice, 'fetch\(\s*[\x60\x27\x22]([^\x60\x27\x22]+)')
    if (-not $m.Success) { return '' }
    return $m.Groups[1].Value
}
function Get-HandlerSlice([string]$Content, [string]$Name) {
    $esc = [regex]::Escape($Name)
    $m = [regex]::Match($Content, "(?m)\b(?:async\s+)?function\s+$esc\b|\bconst\s+$esc\b")
    if (-not $m.Success) { return '' }
    $start = $m.Index
    $maxLen = [Math]::Min(1500, $Content.Length - $start)
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
function Get-EffectsStats([string]$C) {
    $n = 0; $w = 0
    foreach ($m in [regex]::Matches($C, 'useEffect\s*\(')) {
        $n++
        $len = [Math]::Min(1500, $C.Length - $m.Index)
        $s = $C.Substring($m.Index, $len)
        if ($s -match "method\s*:\s*[\x27\x22](POST|PUT|PATCH)") { $w++ }
    }
    return @{ Total = $n; Writes = $w }
}
function Show-EffectsReport([string]$C) {
    $count = 0
    foreach ($m in [regex]::Matches($C, 'useEffect\s*\(')) {
        $count++
        $len = [Math]::Min(1500, $C.Length - $m.Index)
        $s = $C.Substring($m.Index, $len)
        $ep = ''
        $mm = [regex]::Match($s, 'fetch\(\s*[\x60\x27\x22]([^\x60\x27\x22]+)')
        if ($mm.Success) { $ep = $mm.Groups[1].Value }
        $isWrite = ($s -match "method\s*:\s*[\x27\x22](POST|PUT|PATCH)")
        $type = 'lecture'
        if ($isWrite) { $type = 'ECRITURE AUTOMATIQUE' }
        $suffix = ''
        if ($ep) { $suffix = ' (' + $ep + ')' }
        Write-Host ('  - effet #' + $count + ' : ' + $type + $suffix)
    }
    if ($count -eq 0) { Write-Host '  - aucun useEffect detecte' }
}
function Show-DiagCreateur([string]$C) {
    Write-Host '  --- rapport diagnostic (createur) ---'
    Write-Host ('  cvId (patch bibliotheque) : ' + ([regex]::Matches($C, '\bcvId\b').Count -gt 0))
    $defsPublier = Get-DefinitionCount $C 'publierCvActuel'
    Write-Host ('  publierCvActuel deja present : ' + ($defsPublier -gt 0))
    $hasHP = [regex]::Matches($C, '\bhandlePublishPublicCv\b').Count -gt 0
    Write-Host ('  handlePublishPublicCv present : ' + $hasHP)
    $L_MAJ = 'Mettre ' + [char]0x00E0 + ' jour la publication'
    $L_TELECH = 'T' + [char]0x00E9 + 'l' + [char]0x00E9 + 'charger le CV PDF'
    foreach ($lbl in @($L_MAJ, 'Publier en ligne', 'Publier mon CV en ligne', 'PDF (QR)', 'PDF avec QR', $L_TELECH, 'Terminer')) {
        $n = Get-CountLabel $C $lbl
        Write-Host ("  libelle '" + $lbl + "' : " + $n + " occurrence(s)")
        if ($n -gt 0) {
            $h = Find-HandlerForLabel $C $lbl
            if ($h) {
                Write-Host ('      -> onClick={ ' + $h + ' } (fonction definie : ' + (Test-HandlerDefined $C $h) + ')')
            }
        }
    }
    $cvVar = ''
    foreach ($m in [regex]::Matches($C, '(?m)const\s+\[\s*(\w+)\s*,\s*set\w+\s*\]\s*=\s*useState')) {
        if ($m.Groups[1].Value -match '^(cv|cvData|cvDocument|cvActif|resume|formData|contenu)$') { $cvVar = $m.Groups[1].Value; break }
    }
    $aff = $cvVar
    if (-not $aff) { $aff = '(non trouvee)' }
    Write-Host ('  variable d etat CV detectee : ' + $aff)
    return $cvVar
}

# ------------------------------------------------------- blocs de code inseres
$ROUTE_TS = @'
// =============================================================
// [SYNC-PUBLICATION V2] Route atomique de publication du CV.
// POST /api/cv/<id>/publier : chaque clic d un bouton (publication,
// PDF avec QR, PDF simple) ecrit les modifications dans la base
// AVANT toute action. Le publie et l export restent identiques.
// GET  /api/cv/<id>/publier : diagnostic (existe ? publie ? cles ?)
// Body accepte : { cv: ... } | { data: ... } | { payload: ... } | brut
// Si "cv" est absent, la version stockee dans CvDocument est reprise.
// =============================================================
import { PrismaClient } from '@prisma/client';

const g = globalThis as any;
if (!g.__nexirolePrismaV2) {
  g.__nexirolePrismaV2 = new PrismaClient();
}
const prisma: any = g.__nexirolePrismaV2;

function errMsg(e: unknown): string {
  const anyE = e as any;
  return String((anyE && anyE.message) || e);
}

function jsonRes(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function getCvId(ctx: any): Promise<string> {
  let p: any = (ctx && ctx.params) || {};
  if (p && typeof p.then === 'function') {
    p = await p;
  }
  return String((p && p.id) || '').trim();
}

const ID_KEYS = ['cvId', 'documentId', 'cvDocumentId', 'id'];
const JSON_KEYS = ['data', 'contenu', 'content', 'payload', 'cv', 'cvData', 'resume', 'json'];

export async function POST(req: Request, ctx?: any) {
  try {
    const cvId = await getCvId(ctx);
    if (!cvId) {
      return jsonRes({ ok: false, error: 'cvId manquant dans l URL de la route' }, 400);
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    if (body && typeof body === 'object' && body.source !== undefined) {
      delete body.source;
    }
    const hasCvKey = !!(body && typeof body === 'object' && ('cv' in body || 'data' in body || 'payload' in body));
    let raw: any = null;
    if (hasCvKey) {
      raw = body.cv !== undefined ? body.cv : (body.data !== undefined ? body.data : body.payload);
    } else if (body && typeof body === 'object') {
      raw = { ...body };
    }
    const hasData = !!(raw && typeof raw === 'object' && Object.keys(raw).length > 0);

    const writes: string[] = [];
    const errors: string[] = [];

    // 1) version stockee actuelle
    let stored: any = null;
    try {
      stored = await prisma.cvDocument.findUnique({ where: { id: cvId } });
    } catch (e) {
      errors.push('cvDocument.findUnique: ' + errMsg(e));
    }

    // 2) ecriture CvDocument
    let docData: any = null;
    if (hasData) {
      docData = raw;
    } else if (stored) {
      const c: any = { ...stored };
      delete c.id;
      docData = c;
    }
    if (docData) {
      try {
        await prisma.cvDocument.update({ where: { id: cvId }, data: docData });
        writes.push('cvDocument.update');
      } catch (e) {
        errors.push('cvDocument.update: ' + errMsg(e));
        try {
          await prisma.cvDocument.update({ where: { id: cvId }, data: {} });
          writes.push('cvDocument.touch');
        } catch (e2) {
          errors.push('cvDocument.touch: ' + errMsg(e2));
        }
      }
    } else {
      errors.push('cvDocument: aucune donnee a ecrire (cv absent et version stockee introuvable)');
    }

    // 3) PublicResume (copie publique) - essais multiples sur formes de schema
    const pubContent: any = hasData ? raw : (docData || stored || {});
    let pubDone = false;
    for (const ik of ID_KEYS) {
      if (pubDone) break;
      for (const jk of JSON_KEYS) {
        try {
          await prisma.publicResume.upsert({
            where: { [ik]: cvId },
            update: { [jk]: pubContent },
            create: { [ik]: cvId, [jk]: pubContent },
          });
          writes.push('publicResume.upsert(' + ik + ',' + jk + ')');
          pubDone = true;
          break;
        } catch (e) {
          if (errors.length < 16) {
            errors.push('publicResume.upsert(' + ik + ',' + jk + '): ' + errMsg(e));
          }
        }
      }
    }
    if (!pubDone) {
      errors.push('publicResume: aucune forme de schema n a fonctionne (voir erreurs)');
    }

    // 4) relecture pour renvoyer le lien public
    let pubRow: any = null;
    for (const ik of ID_KEYS) {
      try {
        pubRow = await prisma.publicResume.findFirst({ where: { [ik]: cvId } });
        if (pubRow) break;
      } catch {
        // forme non supportee : essai suivant
      }
    }
    const slug: string = String((pubRow && (pubRow.slug || pubRow.url || pubRow.publicSlug)) || '');

    const ok = writes.some((w) => w !== 'cvDocument.touch');
    return jsonRes({
      ok,
      publicOk: pubDone,
      cvId,
      writes,
      errors,
      slug,
      url: slug ? '/u/' + slug : '',
      cv: pubContent,
      storedKeys: Object.keys(stored || {}),
      pubKeys: pubRow ? Object.keys(pubRow) : [],
    });
  } catch (e) {
    return jsonRes({ ok: false, error: errMsg(e) }, 500);
  }
}

export async function GET(_req: Request, ctx?: any) {
  try {
    const cvId = await getCvId(ctx);
    if (!cvId) {
      return jsonRes({ ok: false, error: 'cvId manquant' }, 400);
    }
    let stored: any = null;
    let err = '';
    try {
      stored = await prisma.cvDocument.findUnique({ where: { id: cvId } });
    } catch (e) {
      err = errMsg(e);
    }
    let pubRow: any = null;
    for (const ik of ID_KEYS) {
      try {
        pubRow = await prisma.publicResume.findFirst({ where: { [ik]: cvId } });
        if (pubRow) break;
      } catch {
        // essai suivant
      }
    }
    return jsonRes({
      ok: !!stored,
      cvId,
      exists: !!stored,
      published: !!pubRow,
      storedKeys: Object.keys(stored || {}),
      pubKeys: pubRow ? Object.keys(pubRow) : [],
      error: err,
    });
  } catch (e) {
    return jsonRes({ ok: false, error: errMsg(e) }, 500);
  }
}
'@

$HELPERS_JS = @'
  // [SYNC-PUBLICATION V2] debut - helpers : ecriture base avant chaque clic
  async function publierCvActuel(opts?: any): Promise<any> {
    try {
      const __cvIdSafe = String((cvId as any) || '');
      if (!__cvIdSafe) {
        console.error('[SYNC v2] cvId manquant - publication impossible');
        return { ok: false, error: 'cvId manquant' };
      }
      const __res = await fetch('/api/cv/' + encodeURIComponent(__cvIdSafe) + '/publier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(@@PUBLISH_BODY@@),
      });
      const __out: any = await __res.json().catch(() => null);
      if (!__res.ok || !__out || __out.ok === false) {
        const __detail = (__out && (__out.error || (__out.errors && __out.errors.join(' | ')))) || 'HTTP ' + __res.status;
        console.error('[SYNC v2] ecriture base echouee :', __detail, __out);
        return { ok: false, error: __detail, data: __out };
      }
      console.log('[SYNC v2] ecriture base OK :', __out.writes);
      if (__out.publicOk === false) {
        alert('Attention : CV enregistre mais copie publique non mise a jour. Detail : ' + ((__out.errors && __out.errors.join(' | ')) || '?'));
      }
      try {
        window.dispatchEvent(new CustomEvent('nexirole:cv-publie', { detail: __out }));
      } catch (_ev) {
        // ancien navigateur : ignore
      }
      return { ok: true, data: __out, cv: __out.cv };
    } catch (e) {
      console.error('[SYNC v2] exception publication :', e);
      return { ok: false, error: String(e) };
    }
  }

  async function pdfQrDepuisBase(opts?: any): Promise<any> {
    const __w = await publierCvActuel({ declencheur: (opts && opts.declencheur) || 'pdf-qr' });
    if (!__w || !__w.ok) {
      alert('Publication en base impossible : ' + ((__w && __w.error) || '?'));
      return { ok: false };
    }
    try {
      const __res2 = await fetch('@@PDF_ENDPOINT@@', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cv: (__w.cv || (@@PDF_PAYLOAD@@)), avecQr: true, qr: true, withQr: true }),
      });
      if (!__res2.ok) {
        alert('PDF impossible : HTTP ' + __res2.status);
        return { ok: false };
      }
      const __blob = await __res2.blob();
      const __url = URL.createObjectURL(__blob);
      const __a = document.createElement('a');
      __a.href = __url;
      __a.download = 'cv-' + Date.now() + '-qr.pdf';
      document.body.appendChild(__a);
      __a.click();
      __a.remove();
      setTimeout(() => URL.revokeObjectURL(__url), 5000);
      return { ok: true };
    } catch (e) {
      alert('PDF impossible : ' + String(e));
      return { ok: false };
    }
  }
  // [SYNC-PUBLICATION V2] fin - helpers
'@

$EC_BLOCK = @'
    // [SYNC v2 E-C] debut - chaque clic ecrit en base avant la publication
    try {
      const __syncRes = await publierCvActuel({ declencheur: 'handlePublishPublicCv' });
      if (__syncRes && __syncRes.ok) {
        return __syncRes;
      }
      console.warn('[SYNC v2] publication : ecriture en echec, code historique en secours', __syncRes && __syncRes.error);
    } catch (__syncErrC) {
      console.warn('[SYNC v2] publication : exception, code historique en secours', __syncErrC);
    }
    // [SYNC v2 E-C] fin
'@

$ED_BLOCK = @'
    // [SYNC v2 E-D] debut - chaque clic ecrit en base puis telecharge le PDF QR
    try {
      const __pdfRes = await pdfQrDepuisBase({ declencheur: 'handleDownloadPdfWithQr' });
      if (__pdfRes && __pdfRes.ok) {
        return __pdfRes;
      }
      console.warn('[SYNC v2] PDF QR : echec, code historique en secours');
    } catch (__syncErrD) {
      console.warn('[SYNC v2] PDF QR : exception, code historique en secours', __syncErrD);
    }
    // [SYNC v2 E-D] fin
'@

$EE_BLOCK = @'
    // [SYNC v2 E-E] debut - ecriture en base avant le telechargement du PDF simple
    try {
      await publierCvActuel({ declencheur: 'pdf-simple' });
    } catch (_syncErrE) {
      // PDF simple : le telechargement historique continue meme si l ecriture echoue
    }
    // [SYNC v2 E-E] fin
'@

$HUB_BLOCK = @'
    // [SYNC-PUBLICATION V2 HUB] debut - ecriture base via route atomique
    try {
      const __hubSrc: any = @@PARAM@@;
      const __hubCvId = String((__hubSrc && __hubSrc.id !== undefined && __hubSrc.id !== null) ? __hubSrc.id : __hubSrc);
      if (__hubCvId) {
        const __hubRes = await fetch('/api/cv/' + encodeURIComponent(__hubCvId) + '/publier', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'hub' }),
        });
        const __hubOut: any = await __hubRes.json().catch(() => null);
        if (!__hubRes.ok || !__hubOut || __hubOut.ok === false) {
          console.error('[SYNC v2 hub] ecriture base echouee', __hubOut);
        } else {
          console.log('[SYNC v2 hub] ecriture base OK', __hubOut.writes);
        }
      }
    } catch (__hubErr) {
      console.error('[SYNC v2 hub] exception', __hubErr);
    }
    // [SYNC-PUBLICATION V2 HUB] fin
'@

$TOL_BLOCK = @'
  // [SYNC-PUBLICATION V2 TOL] anciennes formes tolerees (cv a la racine, drapeaux QR)
  const __tolCv = (@@VAR@@ && (@@VAR@@.cv || @@VAR@@.data || @@VAR@@.payload || @@VAR@@.resume)) || @@VAR@@ || {};
  const __tolQr = !!(@@VAR@@ && (@@VAR@@.avecQr || @@VAR@@.qr || @@VAR@@.withQr || @@VAR@@.avecQR));
  void __tolCv;
  void __tolQr;
'@

# ------------------------------------------------------------------ libelles
$L_TELECH = 'T' + [char]0x00E9 + 'l' + [char]0x00E9 + 'charger le CV PDF'
$L_MAJ = 'Mettre ' + [char]0x00E0 + ' jour la publication'

# ------------------------------------------------------------------ demarrage
Write-Host '=============================================================='
Write-Host ' NEXIROLE - Synchronisation publication CV (boutons -> base)  V2'
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
if (-not $okCreateur) {
    Write-Host '[!] createur introuvable - lancez le script depuis la racine du projet.'
    exit 1
}

$written = @()
$stopAll = $false

# ------------------------------------------------------------------ [1/6] route
Write-Host ''
Write-Host '[1/6] Nouvelle route atomique /api/cv/[id]/publier ...'
if ($DiagnostiqueSeul) {
    if ($okRoute) { Write-Host '  [=] route deja presente' } else { Write-Host '  [!] route absente (sera creee au lancement normal)' }
} else {
    if ($okRoute) {
        $routeInfo = Read-TextUtf8 $chemins.route
        if ($routeInfo.Text.Contains('SYNC-PUBLICATION V2')) {
            Write-Host '  [=] src/app/api/cv/[id]/publier/route.ts deja en V2, ignore'
        } else {
            Write-Host '  [2] route presente -> normalisee vers V2 (contrat garanti avec les boutons)'
            Write-TextUtf8 $chemins.route $ROUTE_TS $routeInfo.Bom
            $written += 'src/app/api/cv/[id]/publier/route.ts (normalisee V2)'
        }
    } else {
        Write-Host '  [+] route creee : src/app/api/cv/[id]/publier/route.ts'
        Write-TextUtf8 $chemins.route $ROUTE_TS $false
        $written += 'src/app/api/cv/[id]/publier/route.ts (creee)'
    }
}

# ------------------------------------------------------- [2/6] createur (diag)
Write-Host ''
Write-Host '[2/6] Createur : rebranchement des boutons sur la route atomique ...'
$cInfo = Read-TextUtf8 $chemins.createur
$creator = $cInfo.Text
$nlC = ' '
if ($creator.Contains("`r`n")) { $nlC = "`r`n" } else { $nlC = "`n" }

$cvVarName = Show-DiagCreateur $creator
$effStats = Get-EffectsStats $creator
Write-Host ('  effets useEffect : ' + $effStats.Total + ' (dont ' + $effStats.Writes + ' ecriture(s) auto au montage)')

$hpSlice = Get-HandlerSlice $creator 'handlePublishPublicCv'
$payloadRaw = Get-StringifyExpr $hpSlice
$payloadPublie = $payloadRaw
if (-not $payloadPublie) { $payloadPublie = $cvVarName }
if (-not $payloadPublie) { $payloadPublie = 'cv' }
$hdSlice = Get-HandlerSlice $creator 'handleDownloadPdfWithQr'
$pdfEndpoint = Get-FetchEndpoint $hdSlice
if (-not $pdfEndpoint) { $pdfEndpoint = '/api/public-cv/pdf' }
$pdfPayload = Get-StringifyExpr $hdSlice
if (-not $pdfPayload) { $pdfPayload = $payloadPublie }

Write-Host ('  payload publication extrait : ' + $payloadPublie)
Write-Host ('  endpoint PDF extrait : ' + $pdfEndpoint)
Write-Host ('  payload PDF extrait : ' + $pdfPayload)

if ($DiagnostiqueSeul) {
    Write-Host '  --- effets (detail) ---'
    Show-EffectsReport $creator
} else {

# ------------------------------------------------------- [2/6] createur (ecrit)
$creatorNew = $creator
$publishBody = ''
if ($payloadPublie.StartsWith('{')) {
    $inner = $payloadPublie
    $open = $inner.IndexOf('{')
    $close = $inner.LastIndexOf('}')
    if ($open -ge 0 -and $close -gt $open) {
        $inner = $inner.Substring($open + 1, $close - $open - 1).Trim()
    }
    $sep = ''
    if ($inner.Length -gt 0) { $sep = ', ' }
    $publishBody = '{ ' + $inner + $sep + "source: 'createur:' + ((opts && opts.declencheur) || 'bouton') }"
} else {
    $publishBody = '{ cv: (' + $payloadPublie + "), source: 'createur:' + ((opts && opts.declencheur) || 'bouton') }"
}

# E-A : analyse uniquement (une ecriture automatique au montage est un bug, pas une cible de patch)
Write-Host ('  [=] E-A effets analyses : aucune modification automatique (voir detail via -DiagnostiqueSeul)')

# E-B : helpers
$eB = $false
if ($creatorNew.Contains('[SYNC-PUBLICATION V2] debut - helpers')) {
    Write-Host '  [=] E-B helpers deja presents, ignore'
    $eB = $true
} else {
    $declPub = [regex]::Match($creatorNew, "(?m)^[ \t]*(?:const|function)\s+handlePublishPublicCv\b")
    if ($declPub.Success) {
        $bloc = $HELPERS_JS.Replace('@@PUBLISH_BODY@@', $publishBody).Replace('@@PDF_ENDPOINT@@', $pdfEndpoint).Replace('@@PDF_PAYLOAD@@', $pdfPayload)
        $bloc = Convert-Eol $bloc $nlC
        $creatorNew = $creatorNew.Insert($declPub.Index, $bloc.TrimEnd() + $nlC + $nlC)
        Write-Host '  [+] E-B publierCvActuel + pdfQrDepuisBase ajoutes'
        $eB = $true
    } else {
        Write-Host '  [!] E-B ancre handlePublishPublicCv introuvable - helpers non inseres'
    }
}

# E-C : handlePublishPublicCv -> publierCvActuel
if ($creatorNew.Contains('[SYNC v2 E-C]')) {
    Write-Host '  [=] E-C deja applique, ignore'
} else {
    $resC = Get-HandlerInsert $creatorNew 'handlePublishPublicCv'
    if ($resC.Index -lt 0) {
        Write-Host '  [!] E-C corps de handlePublishPublicCv non localise - bouton publication non rebranche'
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
            Write-Host '  [+] E-C publication handlePublishPublicCv -> publierCvActuel'
        } else {
            Write-Host '  [!] E-C handler non async (forme non reconnue) - envoyez la sortie'
        }
    }
}

# E-D : handleDownloadPdfWithQr -> pdfQrDepuisBase
if ($creatorNew.Contains('[SYNC v2 E-D]')) {
    Write-Host '  [=] E-D deja applique, ignore'
} else {
    $resD = Get-HandlerInsert $creatorNew 'handleDownloadPdfWithQr'
    if ($resD.Index -lt 0) {
        Write-Host '  [!] E-D corps de handleDownloadPdfWithQr non localise - bouton PDF QR non rebranche'
    } else {
        if (-not $resD.Async) {
            $aD = Add-AsyncToDecl $creatorNew 'handleDownloadPdfWithQr'
            if ($aD.Changed) {
                $creatorNew = $aD.Content
                $resD = Get-HandlerInsert $creatorNew 'handleDownloadPdfWithQr'
            }
        }
        if ($resD.Index -ge 0 -and $resD.Async) {
            $creatorNew = $creatorNew.Insert($resD.Index, $nlC + (Convert-Eol $ED_BLOCK $nlC).TrimEnd() + $nlC)
            Write-Host '  [+] E-D PDF QR handleDownloadPdfWithQr -> pdfQrDepuisBase'
        } else {
            Write-Host '  [!] E-D handler non async (forme non reconnue) - envoyez la sortie'
        }
    }
}

# E-E : PDF simple (Telecharger le CV PDF) -> ecriture base puis telechargement historique
$eeHandler = ''
$eeViaLabel = Find-HandlerForLabel $creator $L_TELECH
if ($eeViaLabel -and $eeViaLabel -ne 'handleDownloadPdfWithQr' -and (Test-HandlerDefined $creator $eeViaLabel)) {
    $eeHandler = $eeViaLabel
} else {
    foreach ($m2 in [regex]::Matches($creator, "(?m)^[ \t]*(?:const|function)\s+(handle\w*[Dd]ownload\w*Pdf\w*|handle\w*Pdf\w*)\s*[=(]")) {
        $nm = $m2.Groups[1].Value
        if ($nm -ne 'handleDownloadPdfWithQr' -and $nm -notmatch 'WithQr|AvecQr') { $eeHandler = $nm; break }
    }
}
if (-not $eeHandler) {
    Write-Host '  [=] E-E aucun gestionnaire PDF simple distinct (normal si le meme handler sert au QR)'
} elseif ($creatorNew.Contains('[SYNC v2 E-E]')) {
    Write-Host '  [=] E-E deja applique, ignore'
} else {
    $resE = Get-HandlerInsert $creatorNew $eeHandler
    if ($resE.Index -lt 0) {
        Write-Host ('  [!] E-E corps de ' + $eeHandler + ' non localise - rien modifie')
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
            Write-Host ('  [+] E-E PDF simple ' + $eeHandler + ' -> ecriture base avant telechargement')
        } else {
            Write-Host ('  [!] E-E handler ' + $eeHandler + ' non async (forme non reconnue) - envoyez la sortie')
        }
    }
}

# controle doublon V2 : DEFINITIONS uniquement (les appels ne comptent plus)
$rapDup = @()
foreach ($n in @('publierCvActuel', 'pdfQrDepuisBase')) {
    $defs = Get-DefinitionCount $creatorNew $n
    $occ = Get-OccurrenceCount $creatorNew $n
    $rapDup += [pscustomobject]@{ Nom = $n; Defs = $defs; Occ = $occ }
}
$dups = @($rapDup | Where-Object { $_.Defs -gt 1 })
$manquants = @($rapDup | Where-Object { $_.Defs -lt 1 })
foreach ($r in $rapDup) {
    Write-Host ('  occurrences : ' + $r.Nom + ' -> definitions ' + $r.Defs + ', appels ' + ($r.Occ - $r.Defs))
}
if ($dups.Count -gt 0) {
    Write-Host ('  [!] FONCTIONS EN DOUBLON (definitions) : ' + (($dups | ForEach-Object { $_.Nom + ' x' + $_.Defs }) -join ', '))
    Write-Host '  Aucune ecriture du createur. Envoyez cette sortie.'
    $stopAll = $true
} elseif ($manquants.Count -gt 0) {
    Write-Host ('  [!] DEFINITION MANQUANTE : ' + (($manquants | ForEach-Object { $_.Nom }) -join ', '))
    Write-Host '  Aucune ecriture du createur. Envoyez cette sortie.'
    $stopAll = $true
} else {
    Write-TextUtf8 $chemins.createur $creatorNew $cInfo.Bom
    $written += 'src/app/dashboard/cv-builder/createur/page.tsx'
    Write-Host '  [OK] controle definitions : publierCvActuel x1, pdfQrDepuisBase x1'
}
} # fin bloc ecriture createur (non-diag)

# ------------------------------------------------------------------ [3/6] hub
Write-Host ''
Write-Host '[3/6] Hub bibliotheque : bouton Publier -> route atomique ...'
if (-not $okHub) {
    Write-Host '  [=] hub introuvable, ignore'
} elseif ($DiagnostiqueSeul) {
    $hubTxt = (Read-TextUtf8 $chemins.hub).Text
    $hFound = [regex]::Matches($hubTxt, "(?m)^[ \t]*(?:async\s+)?function\s+\w*(?:Publier|Publish)\w*\s*\(|(?m)^[ \t]*const\s+\w*(?:Publier|Publish)\w*\s*=")
    Write-Host ('  gestionnaires publication detectes : ' + $hFound.Count)
    foreach ($m in $hFound) { Write-Host ('    - ' + $m.Value.Trim()) }
    Write-Host ('  occurrences publier : ' + [regex]::Matches($hubTxt, '[Pp]ublier\w*').Count)
    $eps = [regex]::Matches($hubTxt, "[\x27\x22\x60](/api/[^\x27\x22\x60]+)") | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
    Write-Host ('  endpoints utilises : ' + ($eps -join ', '))
} elseif ($stopAll) {
    Write-Host '  (arret demande a l etape 2 : etape ignoree)'
} else {
    $hInfo = Read-TextUtf8 $chemins.hub
    $hub = $hInfo.Text
    if ($hub.Contains('[SYNC-PUBLICATION V2 HUB]')) {
        Write-Host '  [=] hub deja branche en V2, ignore'
    } else {
        $cand = $null
        foreach ($m in [regex]::Matches($hub, "(?m)^[ \t]*(?:async\s+)?function\s+(handle\w*(?:Publier|Publish)\w*|publierCv\w*)\s*\(([^)]*)\)")) {
            $cand = @{ Nom = $m.Groups[1].Value; Params = $m.Groups[2].Value }; break
        }
        if (-not $cand) {
            foreach ($m in [regex]::Matches($hub, "(?m)^[ \t]*const\s+(handle\w*(?:Publier|Publish)\w*|publierCv\w*)\s*=\s*(?:async\s*)?\(([^)]*)\)")) {
                $cand = @{ Nom = $m.Groups[1].Value; Params = $m.Groups[2].Value }; break
            }
        }
        if ($cand) {
            $param = ''
            foreach ($p in ($cand.Params -split ',')) {
                $t = ($p -replace ':.*$', '') -replace '\s*=.*$', ''
                $t = $t.Trim()
                if ($t -match '^[\w$]+$' -and $t -notmatch '^(e|event|ev|_e|_event)$') { $param = $t; break }
            }
            if (-not $param) {
                Write-Host '  [=] gestionnaire hub trouve mais parametre non exploitable - rien modifie (envoyez la sortie -DiagnostiqueSeul)'
            } else {
                $nlH = ' '
                if ($hub.Contains("`r`n")) { $nlH = "`r`n" } else { $nlH = "`n" }
                $resH = Get-HandlerInsert $hub $cand.Nom
                if ($resH.Index -lt 0) {
                    Write-Host '  [!] corps du gestionnaire hub non localise - rien modifie (envoyez la sortie)'
                } else {
                    if (-not $resH.Async) {
                        $aH = Add-AsyncToDecl $hub $cand.Nom
                        if ($aH.Changed) {
                            $hub = $aH.Content
                            $resH = Get-HandlerInsert $hub $cand.Nom
                        }
                    }
                    if ($resH.Index -ge 0 -and $resH.Async) {
                        $blocH = Convert-Eol ($HUB_BLOCK.Replace('@@PARAM@@', $param)) $nlH
                        $hub = $hub.Insert($resH.Index, $nlH + $blocH.TrimEnd() + $nlH)
                        Write-TextUtf8 $chemins.hub $hub $hInfo.Bom
                        $written += 'src/app/dashboard/cv-builder/page.tsx'
                        Write-Host ('  [+] hub : ' + $cand.Nom + '(' + $param + ') -> ecriture base /api/cv/<id>/publier')
                    } else {
                        Write-Host '  [=] gestionnaire hub non async (forme non reconnue) - rien modifie (envoyez la sortie)'
                    }
                }
            }
        } else {
            Write-Host '  [=] aucun gestionnaire de publication nomme detecte dans le hub - rien modifie'
            Write-Host '      si le bouton Publier du hub doit aussi ecrire, envoyez la sortie -DiagnostiqueSeul'
        }
    }
}

# ------------------------------------------------------------ [4/6] pdf public
Write-Host ''
Write-Host '[4/6] PDF public : tolerance des anciennes formes ...'
if (-not $okPdf) {
    Write-Host '  [=] fichier pdf public introuvable, ignore'
} elseif ($DiagnostiqueSeul) {
    $pdfTxt0 = (Read-TextUtf8 $chemins.pdfPublic).Text
    $mJ0 = [regex]::Match($pdfTxt0, '(?m)^[ \t]*(?:const|let)\s+(\w+)\s*=\s*await\s+req\.json(?:<[^>]*>)?\(\s*\)')
    if ($mJ0.Success) { Write-Host ('  ancre req.json() : OK (' + $mJ0.Groups[1].Value + ')') } else { Write-Host '  [!] ancre req.json() non trouvee' }
    Write-Host ('  deja V2 : ' + $pdfTxt0.Contains('[SYNC-PUBLICATION V2 TOL]'))
} elseif ($stopAll) {
    Write-Host '  (arret demande a l etape 2 : etape ignoree)'
} else {
    $pInfo = Read-TextUtf8 $chemins.pdfPublic
    $pdfTxt = $pInfo.Text
    if ($pdfTxt.Contains('[SYNC-PUBLICATION V2 TOL]')) {
        Write-Host '  [=] tolerance deja presente, ignore'
    } else {
        $nlP = ' '
        if ($pdfTxt.Contains("`r`n")) { $nlP = "`r`n" } else { $nlP = "`n" }
        $mJ = [regex]::Match($pdfTxt, '(?m)^[ \t]*(?:const|let)\s+(\w+)\s*=\s*await\s+req\.json(?:<[^>]*>)?\(\s*\)')
        if ($mJ.Success) {
            $varName = $mJ.Groups[1].Value
            $ls = $pdfTxt.LastIndexOf("`n", $mJ.Index) + 1
            if ($ls -lt 0) { $ls = 0 }
            $indent = ''
            if ($mJ.Index -gt $ls) { $indent = $pdfTxt.Substring($ls, $mJ.Index - $ls) }
            $le = $pdfTxt.IndexOf($nlP, $mJ.Index + $mJ.Length)
            $blocT = Convert-Eol ($TOL_BLOCK.Replace('@@VAR@@', $varName)) $nlP
            $blocT = ($blocT.TrimEnd() -replace '(?m)^', $indent)
            if ($le -ge 0) {
                $pdfTxt = $pdfTxt.Insert($le + $nlP.Length, $blocT + $nlP)
            } else {
                $pdfTxt = $pdfTxt + $nlP + $blocT + $nlP
            }
            Write-TextUtf8 $chemins.pdfPublic $pdfTxt $pInfo.Bom
            $written += 'src/app/api/public-cv/pdf/route.ts'
            Write-Host ('  [+] tolerance ajoutee apres ' + $varName + ' = await req.json()')
        } else {
            Write-Host '  [!] ancre req.json() non trouvee - tolerance non ajoutee (envoyez la sortie -DiagnostiqueSeul)'
        }
    }
}

# ------------------------------------------------------------------ [5/6] base
Write-Host ''
Write-Host '[5/6] Diagnostic base de donnees (CvDocument + PublicResume) ...'
if (Test-FileExists $chemins.schema) {
    $schemaTxt = (Read-TextUtf8 $chemins.schema).Text
    foreach ($modele in @('CvDocument', 'PublicResume')) {
        $mm = [regex]::Match($schemaTxt, "(?ms)model\s+$modele\s*\{(.*?)^\}")
        if ($mm.Success) {
            Write-Host ('  modele ' + $modele + ' :')
            foreach ($ln in ($mm.Groups[1].Value -split "`n")) {
                $t = $ln.Trim()
                if ($t -and -not $t.StartsWith('//') -and $t -ne '}') { Write-Host ('    ' + $t) }
            }
        } else {
            Write-Host ('  [!] modele ' + $modele + ' introuvable dans prisma/schema.prisma')
        }
    }
    $autres = [regex]::Matches($schemaTxt, '(?m)model\s+(\w+)\s*\{') | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -match 'Public|Resume|Cv|Document' } | Select-Object -Unique
    Write-Host ('  modeles voisins : ' + ($autres -join ', '))
} else {
    Write-Host '  [!] prisma/schema.prisma introuvable'
}
Write-Host '  probe manuelle (serveur lance) : http://localhost:3000/api/cv/<cvId>/publier en GET'

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
if ($FermerAnciennesLignes) {
    $nbCreateur = [regex]::Matches($creatorNew, '/api/public-cv').Count
    $nbHub = 0
    if ($okHub) { $nbHub = [regex]::Matches((Read-TextUtf8 $chemins.hub).Text, '/api/public-cv').Count }
    Write-Host ('  anciens endpoints encore presents (createur : ' + $nbCreateur + ', hub : ' + $nbHub + ')')
    Write-Host '  les boutons passent desormais par /api/cv/<id>/publier ; les anciens endpoints restent accessibles.'
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
Write-Host '  2) Cliquez chaque bouton ; la console navigateur doit afficher "[SYNC v2] ecriture base OK"'
Write-Host '  3) Verifiez le contenu publie sur la page /u/<slug>'
Write-Host '  4) git add . ; git commit -m "SYNC V2 : boutons -> route atomique" ; git push'
Write-Host '  Si un point [!] apparait : relancez avec -DiagnostiqueSeul et renvoyez la sortie.'
