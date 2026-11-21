# ============================================================
# NexiRole - ajouter-import-enrichcv.ps1
# But    : corriger "ReferenceError: enrichCv is not defined"
#          src/lib/cv-normalize.ts(151) appelle enrichCv(...) mais
#          l'import depuis "@/lib/cv-enrich" manque (TS2304 au tsc).
# Methode: modification chirurgicale - UNE seule ligne ajoutee
#          (l'import), apres le dernier import existant.
# Garde-fous (AGENTS.md 1.1 / 1.2) :
#          - backup .bak-importfix-<horodatage> avant ecriture
#          - idempotent : ne fait rien si l'import existe deja
#          - page.tsx et cv-enrich.ts NE SONT PAS modifies
# ============================================================

$ErrorActionPreference = "Stop"
Set-Location "D:\Next Js\nexirole"

Write-Host "=== NexiRole - ajout de l'import enrichCv manquant ==="
Write-Host ""

$target = "src\lib\cv-normalize.ts"
$enrich = "src\lib\cv-enrich.ts"

if (-not (Test-Path -LiteralPath $target)) { Write-Host ("ERREUR: introuvable: " + $target); exit 1 }
if (-not (Test-Path -LiteralPath $enrich)) { Write-Host ("ERREUR: introuvable: " + $enrich); exit 1 }

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$src   = [System.IO.File]::ReadAllText($target)
$lines = [System.IO.File]::ReadAllLines($target)
$eSrc  = [System.IO.File]::ReadAllText($enrich)

Write-Host "=========== PARTIE 1 - DIAGNOSTIC (lecture seule) ==========="
Write-Host ("   cv-normalize.ts : " + $lines.Count + " lignes")

$hasCall   = $false
$hasImport = $false
foreach ($l in $lines) {
  if ($l -match 'enrichCv\s*\(') { $hasCall = $true }
  if (($l -match '^\s*import\b') -and ($l -match 'cv-enrich')) { $hasImport = $true }
}
Write-Host ("   appel enrichCv(...) present     : " + $hasCall)
Write-Host ("   import depuis cv-enrich present : " + $hasImport)

Write-Host "   --- lignes autour de l'appel enrichCv ---"
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match 'enrichCv\s*\(') {
    $a = $i - 2; if ($a -lt 0) { $a = 0 }
    $b = $i + 1; if ($b -gt ($lines.Count - 1)) { $b = $lines.Count - 1 }
    for ($j = $a; $j -le $b; $j++) { Write-Host ("   " + ($j + 1) + ": " + $lines[$j]) }
    break
  }
}

$page = "src\app\u\[slug]\page.tsx"
if (Test-Path -LiteralPath $page) {
  $pl = [System.IO.File]::ReadAllLines($page)
  if ($pl.Count -ge 6) { Write-Host ("   page.tsx ligne 6 (controle, non modifie) : " + $pl[5].Trim()) }
}
$route = "src\app\api\public-cv\route.ts"
if (Test-Path -LiteralPath $route) {
  foreach ($l in [System.IO.File]::ReadAllLines($route)) {
    if (($l -match '^\s*import\b') -and ($l -match 'cv-enrich')) {
      Write-Host ("   reference route.ts (deja fonctionnel)     : " + $l.Trim())
      break
    }
  }
}

if (-not $hasCall) {
  Write-Host "   -> aucun appel enrichCv dans cv-normalize.ts : rien a corriger."
  exit 0
}
if ($hasImport) {
  Write-Host "   -> l'import est deja present : rien a faire."
  exit 0
}

# ---- forme d'export de enrichCv dans cv-enrich.ts ----
$named = (($eSrc -match '(?m)^\s*export\s+(async\s+)?function\s+enrichCv\b') -or
          ($eSrc -match '(?m)^\s*export\s+const\s+enrichCv\b') -or
          ($eSrc -match 'export\s*\{[^}]*\benrichCv\b'))
if ($named) {
  $importLine = 'import { enrichCv } from "@/lib/cv-enrich";'
} elseif ($eSrc -match '(?m)^\s*export\s+default\b') {
  $importLine = 'import enrichCv from "@/lib/cv-enrich";'
} else {
  Write-Host "ERREUR: export enrichCv non detecte dans cv-enrich.ts."
  Write-Host "Collez a l'assistant les lignes 'export' de cv-enrich.ts."
  exit 1
}

if ($eSrc -match 'cv-normalize') {
  Write-Host "   ATTENTION: cv-enrich.ts mentionne cv-normalize (cycle d'import possible)."
}

Write-Host ""
Write-Host "=========== PARTIE 2 - CORRECTION (une seule ligne ajoutee) ==========="
$stamp  = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "$target.bak-importfix-$stamp"
Copy-Item $target $backup
Write-Host ("   backup: " + $backup)

# ---- insertion apres le dernier import complet (une ligne, se termine par ;) ----
$insertIdx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  if (($lines[$i] -match '^\s*import\b') -and ($lines[$i] -match ';\s*$')) { $insertIdx = $i }
}

$newLines = New-Object System.Collections.Generic.List[string]
if ($insertIdx -ge 0) {
  for ($i = 0; $i -le $insertIdx; $i++) { $newLines.Add($lines[$i]) }
  $newLines.Add($importLine)
  for ($i = $insertIdx + 1; $i -lt $lines.Count; $i++) { $newLines.Add($lines[$i]) }
  Write-Host ("   import insere apres la ligne " + ($insertIdx + 1) + " de cv-normalize.ts")
} else {
  $newLines.Add($importLine)
  for ($i = 0; $i -lt $lines.Count; $i++) { $newLines.Add($lines[$i]) }
  Write-Host "   import insere en tete de fichier"
}
Write-Host ("   ligne ajoutee : " + $importLine)

# ---- ecriture : UTF-8 sans BOM, fins de ligne d'origine preservees ----
$eol = "`r`n"
if (-not $src.Contains("`r`n")) { $eol = "`n" }
$content = ($newLines -join $eol)
if ($src.EndsWith("`n")) { $content += $eol }
[System.IO.File]::WriteAllText($target, $content, $utf8NoBom)
Write-Host ("   ecrit: " + $target + " (" + $newLines.Count + " lignes)")

$checkLines = [System.IO.File]::ReadAllLines($target)
$okImport = $false
foreach ($l in $checkLines) {
  if (($l -match '^\s*import\b') -and ($l -match 'cv-enrich')) { $okImport = $true }
}
Write-Host ("   controle apres ecriture (import present) : " + $okImport)
if (-not $okImport) { Write-Host "ERREUR: l'import n'a pas ete insere."; exit 1 }
Write-Host "   --- 8 premieres lignes du fichier corrige ---"
$max = 8; if ($max -gt $checkLines.Count) { $max = $checkLines.Count }
for ($i = 0; $i -lt $max; $i++) { Write-Host ("   " + ($i + 1) + ": " + $checkLines[$i]) }

Write-Host ""
Write-Host "=========== PARTIE 3 - VERIFICATION TYPESCRIPT (1 a 2 min) ==========="
$ErrorActionPreference = "Continue"
$tscOut = & cmd /c "npx tsc --noEmit 2>&1" | Out-String
$totalErr = ([regex]::Matches($tscOut, "error TS")).Count
Write-Host ("   total 'error TS' rapportes : " + $totalErr + " (les erreurs preexistantes connues restent inchangees)")
$cvErrLines = $tscOut -split "`r?`n" | Where-Object { $_ -match "cv-normalize|cv-enrich" }
if ($cvErrLines) {
  Write-Host "   ERREURS LIEES AUX FICHIERS CV :"
  foreach ($e in $cvErrLines) { Write-Host ("     " + $e) }
  Write-Host "   -> collez cette sortie a l'assistant."
} else {
  Write-Host "   AUCUNE erreur TS liee a cv-normalize.ts / cv-enrich.ts : CORRECTION OK"
}

Write-Host ""
Write-Host "=========== PARTIE 4 - PROTOCOLE DE TEST ==========="
Write-Host "1) Arretez le serveur (Ctrl+C) puis relancez :  npm run dev"
Write-Host "2) Ouvrez http://localhost:3000/u/kouton-clement (Ctrl+F5)"
Write-Host "   -> la page doit s'afficher sans erreur 500"
Write-Host "      (l'erreur 'ReferenceError: enrichCv is not defined' doit avoir disparu)"
Write-Host "   -> verifiez TOUTES les sections : Profil, EXPERIENCES PROFESSIONNELLES,"
Write-Host "      Formation, Competences, Langues (texte lisible, jamais [object Object])"
Write-Host "3) Ouvrez http://localhost:3000/api/public-cv?slug=kouton-clement&format=pdf"
Write-Host "   -> le PDF avec QR doit contenir experiences + langues"
Write-Host "4) Si tout est bon, redeployez Vercel :"
Write-Host '      git add src'
Write-Host '      git commit -m "Fix: import enrichCv manquant dans cv-normalize.ts (ReferenceError)"'
Write-Host '      git push'
Write-Host ""
Write-Host "Note 1 : page.tsx et cv-enrich.ts ne sont PAS modifies (AGENTS.md 1.2)."
Write-Host "Note 2 : warnings Google Fonts et erreurs P1001/P1017 (Neon) = reseau local,"
Write-Host "         aucun changement de code necessaire (voir explication)."
Write-Host "Termine."
