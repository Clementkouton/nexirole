# ============================================================
#  NexiRole - Creation de la table PublicResume dans la base
#  Corrige l'erreur P2021 :
#  "The table public.PublicResume does not exist in the current database"
#  Aucun fichier source n'est modifie : schema.prisma est consulte,
#  sauvegarde, puis applique a la base via db push.
# ============================================================

 $ErrorActionPreference = "Stop"
 $root = "D:\Next Js\nexirole"
Set-Location $root

 $utf8NoBom  = New-Object System.Text.UTF8Encoding($false)
 $schemaPath = Join-Path $root "prisma\schema.prisma"

# --- 1/5 Consultation du repo : le modele PublicResume existe-t-il ? ---
Write-Host ""
Write-Host "=== 1/5 Consultation de prisma/schema.prisma ===" -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $schemaPath)) {
    Write-Host "[ERREUR] $schemaPath introuvable." -ForegroundColor Red
    exit 1
}

 $schema = [System.IO.File]::ReadAllText($schemaPath, $utf8NoBom)

if ($schema -notmatch [regex]::Escape("model PublicResume")) {
    Write-Host "[ERREUR] Le modele PublicResume est ABSENT de schema.prisma." -ForegroundColor Red
    Write-Host "Arret : relancer d'abord ajouter-public-resume.ps1 puis retester." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Modele PublicResume trouve dans schema.prisma" -ForegroundColor Green

 $start = $schema.IndexOf("model PublicResume")
 $end   = $schema.IndexOf("}", $start)
if ($start -ge 0 -and $end -gt $start) {
    Write-Host "----- Definition actuelle dans le repo -----" -ForegroundColor Gray
    Write-Host ($schema.Substring($start, $end - $start + 1)) -ForegroundColor Gray
    Write-Host "--------------------------------------------" -ForegroundColor Gray
}

# --- 2/5 Sauvegarde ---
Write-Host ""
Write-Host "=== 2/5 Sauvegarde de schema.prisma ===" -ForegroundColor Cyan
 $backup = "$schemaPath.bak-public-resume"
[System.IO.File]::WriteAllText($backup, $schema, $utf8NoBom)
Write-Host "[OK] Sauvegarde : $backup" -ForegroundColor Green

# --- 3/5 Controle des bases (host uniquement, aucun secret affiche) ---
Write-Host ""
Write-Host "=== 3/5 Controle des chaines de connexion (host uniquement) ===" -ForegroundColor Cyan

function Get-DbHost([string]$file) {
    if (-not (Test-Path -LiteralPath $file)) { return "(fichier absent)" }
    $txt = [System.IO.File]::ReadAllText($file, $utf8NoBom)
    if ($txt -match "DATABASE_URL\s*=\s*[`"']?([^`"'\r\n]+)[`"']?") {
        try {
            $u = [System.Uri]$Matches[1]
            return $u.Host
        } catch { return "(url illisible)" }
    }
    return "(DATABASE_URL absent)"
}

 $hLocal = Get-DbHost (Join-Path $root ".env.local")
 $hEnv   = Get-DbHost (Join-Path $root ".env")
Write-Host ".env.local -> $hLocal" -ForegroundColor Gray
Write-Host ".env       -> $hEnv"   -ForegroundColor Gray
if ($hLocal -ne $hEnv) {
    Write-Host "[ATTENTION] Les deux fichiers ne pointent pas vers la meme base." -ForegroundColor Yellow
    Write-Host "Si l'erreur P2021 persiste apres le push, alignez DATABASE_URL." -ForegroundColor Yellow
} else {
    Write-Host "[OK] Meme base detectee pour .env.local et .env" -ForegroundColor Green
}

# --- 4/5 Creation de la table ---
Write-Host ""
Write-Host "=== 4/5 Creation de la table : npx prisma db push ===" -ForegroundColor Cyan
Write-Host "Cette commande ajoute uniquement ce qui manque (PublicResume)." -ForegroundColor Yellow
Write-Host "Elle ne supprime aucune donnee existante." -ForegroundColor Yellow
Write-Host "Si elle demande une confirmation de perte de donnees : repondre NON et me coller la sortie." -ForegroundColor Yellow

npx prisma db push
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERREUR] prisma db push a echoue (code $LASTEXITCODE). Colle-moi la sortie complete." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Schema applique a la base" -ForegroundColor Green

# --- 5/5 Regeneration du client ---
Write-Host ""
Write-Host "=== 5/5 Regeneration du client : npx prisma generate ===" -ForegroundColor Cyan
npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERREUR] prisma generate a echoue (code $LASTEXITCODE)." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Client Prisma regenere" -ForegroundColor Green

Write-Host ""
Write-Host "=== TERMINE ===" -ForegroundColor Green
Write-Host "La table PublicResume existe maintenant. Redemarre le serveur puis teste la publication."