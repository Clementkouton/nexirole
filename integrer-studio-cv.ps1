# ============================================================
#  NexiRole - Integration PublicCvStudio v2 + diagnostic bouton
#  PARTIE 1 : diagnostic (colle-moi la sortie)
#  PARTIE 2 : deblocage prudent du bouton (sur confirmation O/N)
#  PARTIE 3 : insertion <PublicCvStudio /> (2 strategies)
#  PARTIE 4 : verifications environnement
#  Sauvegarde .bak-studio avant toute ecriture.
# ============================================================

 $ErrorActionPreference = "Stop"
 $root = "D:\Next Js\nexirole"
Set-Location $root
 $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
 $page = Join-Path $root "src\app\dashboard\cv-builder\page.tsx"
if (-not (Test-Path -LiteralPath $page)) { Write-Host "[ERREUR] $page introuvable" -ForegroundColor Red; exit 1 }

 $orig = [System.IO.File]::ReadAllLines($page, $utf8NoBom)
 $n = $orig.Count
 $backup = "$page.bak-studio"
[System.IO.File]::WriteAllLines($backup, $orig, $utf8NoBom)
Write-Host "[OK] Sauvegarde : $backup" -ForegroundColor Green

Write-Host ""
Write-Host "===== PARTIE 1 : DIAGNOSTIC (colle-moi cette sortie) =====" -ForegroundColor Cyan
function Show-Context([string]$title, [int[]]$idx, [int]$radius) {
    if ($idx.Count -eq 0) { Write-Host "--- $title : aucune occurrence ---" -ForegroundColor DarkGray; return }
    Write-Host "--- $title ---" -ForegroundColor Yellow
    $shown = @{}
    foreach ($i in $idx) {
        $a = [Math]::Max(0, $i - $radius); $b = [Math]::Min($n - 1, $i + $radius)
        for ($j = $a; $j -le $b; $j++) {
            if (-not $shown.ContainsKey($j)) {
                $shown[$j] = $true
                $mark = "  "; if ($idx -contains $j) { $mark = ">>" }
                Write-Host ("$mark {0,5}: {1}" -f ($j + 1), $orig[$j])
            }
        }
        Write-Host "      ..." -ForegroundColor DarkGray
    }
}
 $idxDer = @(0..($n-1) | Where-Object { $orig[$_] -match "Derni[eè]re|Derniere" })
 $idxTer = @(0..($n-1) | Where-Object { $orig[$_] -match "Terminer|Terminé" })
 $idxSt  = @(0..($n-1) | Where-Object { $orig[$_] -match "useState" -and $orig[$_] -match "cv|Cv|CV|personal|resume|profil" })
 $idxPub = @(0..($n-1) | Where-Object { $orig[$_] -match "Publier le CV en ligne|public-cv|PublicCvStudio" })
Show-Context "BOUTON DERNIERE ETAPE" $idxDer 12
Show-Context "BOUTON TERMINER" $idxTer 4
Show-Context "ETATS LIES AU CV (useState)" $idxSt 0
Show-Context "BLOC PUBLICATION / STUDIO" $idxPub 2

Write-Host ""
Write-Host "===== PARTIE 2 : DEBLOCAGE PRUDENT DU BOUTON =====" -ForegroundColor Cyan
 $reponse = Read-Host "Remplacer les conditions disabled={...} autour du bouton 'Derniere etape' par disabled={false} ? (O/N)"
 $applied = $false
if ($reponse -match "^[OoYy]") {
    function Close-Brace([string[]]$arr, [int]$startLine) {
        $line = $arr[$startLine]
        $open = $line.IndexOf("disabled={")
        if ($open -lt 0) { return $null }
        $depth = 0
        for ($m = $open + 9; $m -lt $line.Length; $m++) {
            $c = $line[$m]
            if ($c -eq '{') { $depth++ }
            elseif ($c -eq '}') { $depth--; if ($depth -eq 0) { return @{ end = $startLine; closeIdx = $m } } }
        }
        for ($k = $startLine + 1; $k -le [Math]::Min($arr.Count - 1, $startLine + 10); $k++) {
            for ($m = 0; $m -lt $arr[$k].Length; $m++) {
                $c = $arr[$k][$m]
                if ($c -eq '{') { $depth++ }
                elseif ($c -eq '}') { $depth--; if ($depth -eq 0) { return @{ end = $k; closeIdx = $m } } }
            }
        }
        return $null
    }
    $list = New-Object System.Collections.Generic.List[string]
    foreach ($l in $orig) { $list.Add($l) }
    $targets = @()
    foreach ($i in $idxDer) {
        for ($j = [Math]::Max(0, $i - 12); $j -le [Math]::Min($n - 1, $i + 12); $j++) { $targets += $j }
    }
    $targets = @($targets | Select-Object -Unique | Sort-Object -Descending)
    foreach ($k in $targets) {
        if ($k -ge $list.Count) { continue }
        if ($list[$k] -notmatch "disabled\s*=\s*\{") { continue }
        $nearPrev = $false
        for ($w = [Math]::Max(0, $k - 6); $w -le [Math]::Min($list.Count - 1, $k + 6); $w++) {
            if ($list[$w] -match "Précédent|Precedent|Retour|Previous") { $nearPrev = $true }
        }
        if ($nearPrev) { continue }
        $cl = Close-Brace $list.ToArray() $k
        if ($cl) {
            $lineText = $list[$k]
            $open = $lineText.IndexOf("disabled={")
            $prefix = $lineText.Substring(0, $open)
            $suffix = ""
            if ($cl.end -eq $k) {
                $suffix = $lineText.Substring($cl.closeIdx + 1)
                $list[$k] = $prefix + "disabled={false}" + $suffix
            } else {
                $suffix = $list[$cl.end].Substring($cl.closeIdx + 1)
                $list[$k] = $prefix + "disabled={false}" + $suffix
                for ($r = $cl.end; $r -gt $k; $r--) { $list.RemoveAt($r) }
            }
            Write-Host ("[FIX] Ligne {0} : disabled -> {{false}}" -f ($k + 1)) -ForegroundColor Green
            $applied = $true
        }
    }
    if ($applied) { Write-Host "[OK] Deblocage applique." -ForegroundColor Green }
    else { Write-Host "Aucun motif disabled={...} trouve autour du bouton : rien modifie." -ForegroundColor DarkGray }
} else {
    Write-Host "Deblocage ignore (choix N)." -ForegroundColor DarkGray
}

if (-not $applied) {
    $list = New-Object System.Collections.Generic.List[string]
    foreach ($l in $orig) { $list.Add($l) }
}

Write-Host ""
Write-Host "===== PARTIE 3 : INSERTION DE PUBLICCVSTUDIO =====" -ForegroundColor Cyan
 $joined = $list -join "`n"
if ($joined -match "PublicCvStudio") {
    Write-Host "[OK] Deja integre : aucune insertion." -ForegroundColor Green
} else {
    $lastImport = -1
    for ($j = 0; $j -lt $list.Count; $j++) { if ($list[$j] -match "^import\s") { $lastImport = $j } }
    $insertAt = -1; $indent = "      "; $strategy = ""
    for ($j = $list.Count - 1; $j -ge 1; $j--) {
        if ($list[$j] -match "^\s*\)\s*;?\s*$" -and $list[$j - 1] -match "^\s*</div>\s*$") {
            $insertAt = $j - 1; $strategy = "A(fin du JSX)"
            if ($list[$j - 1] -match "^(\s*)") { $indent = $Matches[1] + "  " }
            break
        }
    }
    if ($insertAt -lt 0) {
        for ($j = $list.Count - 1; $j -ge 0; $j--) {
            if ($list[$j] -match "^\s*return\s*\(\s*$") {
                for ($m = $j + 1; $m -le [Math]::Min($list.Count - 1, $j + 5); $m++) {
                    if ($list[$m] -match "^(\s*)<div[^>]*>\s*$") {
                        $insertAt = $m; $strategy = "B(haut du JSX)"
                        if ($list[$m] -match "^(\s*)") { $indent = $Matches[1] + "  " }
                        break
                    }
                }
                if ($insertAt -ge 0) { break }
            }
        }
    }
    if ($lastImport -ge 0 -and $insertAt -ge 0) {
        $list.Insert($insertAt + 1, $indent + "<PublicCvStudio />")
        $list.Insert($lastImport + 1, 'import { PublicCvStudio } from "@/components/dashboard/PublicCvStudio";')
        Write-Host "[OK] Import ajoute (strategie $strategy)" -ForegroundColor Green
        Write-Host "[OK] <PublicCvStudio /> insere apres la ligne $($insertAt + 1)" -ForegroundColor Green
        $applied = $true
    } else {
        Write-Host "[ATTENTION] Ancres non trouvees (import: $lastImport, jsx: $insertAt) -> colle-moi la sortie PARTIE 1." -ForegroundColor Yellow
    }
}

if ($applied) {
    [System.IO.File]::WriteAllText($page, ($list -join "`r`n") + "`r`n", $utf8NoBom)
    Write-Host "[OK] Fichier enregistre (UTF-8 sans BOM)." -ForegroundColor Green
}

Write-Host ""
Write-Host "===== PARTIE 4 : VERIFICATIONS ENVIRONNEMENT =====" -ForegroundColor Cyan
Write-Host ("cv-normalize.ts            : {0}" -f (Test-Path "src\lib\cv-normalize.ts"))
Write-Host ("CvPdfQrTemplates.tsx       : {0}" -f (Test-Path "src\components\pdf\CvPdfQrTemplates.tsx"))
Write-Host ("PublicCvStudio.tsx         : {0}" -f (Test-Path "src\components\dashboard\PublicCvStudio.tsx"))
Write-Host ("package qrcode installe    : {0}" -f (Test-Path "node_modules\qrcode"))
Write-Host ("src\auth.ts                : {0}" -f (Test-Path "src\auth.ts"))
Write-Host ("AGENTS.md                  : {0}" -f (Test-Path "AGENTS.md"))
if (-not (Test-Path "src\lib\cv-normalize.ts")) { Write-Host "[ALERTE] Crée d'abord src\lib\cv-normalize.ts (FICHIER 1) sinon la compilation echoue." -ForegroundColor Red }

Write-Host ""
Write-Host "===== TERMINE =====" -ForegroundColor Green
Write-Host "Retour arriere :" -ForegroundColor Gray
Write-Host '  Copy-Item "src\app\dashboard\cv-builder\page.tsx.bak-studio" "src\app\dashboard\cv-builder\page.tsx" -Force' -ForegroundColor Gray