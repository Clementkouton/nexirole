# ==================================================================
# NEXIROLE - Finalisation : commit propre + push + production
# ------------------------------------------------------------------
# Objectif : apres l'installation de la bibliotheque de CV et la
# correction de la remarque, envoyer le chantier vers GitHub (main)
# puis preparer la production (schema Neon + Vercel).
#
# Conforme AGENTS.md :
#   1.4 hygiene Git : les fichiers .bak-* ne sont JAMAIS commites
#       (desstaging automatique + controle avant commit) ;
#       les fichiers .env / .env.local ne sont jamais commits ;
#   1.2 toute modification locale de .gitignore est precedee d'un
#       .bak-<horodatage> ;
#   1.5 verification + verdict.
#
# EXECUTION (PowerShell 5.1, depuis D:\Next Js\nexirole) :
#   powershell -ExecutionPolicy Bypass -File .\finaliser-et-deployer.ps1
#
# Options :
#   -SkipTsc                              ignorer npx tsc --noEmit
#   -NoPush                               commit local sans git push
#   -Message "..."                        message de commit personnalise
#   -SyncDbProduction "<URL Neon directe>"
#                                         cree la table cv_documents sur
#                                         la base de PRODUCTION (Neon,
#                                         operation additive, aucune
#                                         donnee existante perdue)
#   -RetirerDiagnostic                    supprime la route temporaire
#                                         /api/diagnostic-cv avant commit
# ==================================================================

param(
    [string]$Message = "Bibliotheque de CV : hub, corbeille 30 j, publication multi-CV, PDF public",
    [switch]$SkipTsc,
    [switch]$NoPush,
    [switch]$RetirerDiagnostic,
    [string]$SyncDbProduction = ""
)

$ErrorActionPreference = "Stop"
$horodatage = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host "=============================================================="
Write-Host " NEXIROLE - Finalisation commit + production"
Write-Host "=============================================================="

# ---------------- [1/6] racine du projet ----------------
$estRacine = (Test-Path "package.json") -and (Test-Path "prisma\schema.prisma") -and (Test-Path "src")
if (-not $estRacine) {
    Write-Host " [!] Placez-vous a la racine du projet (D:\Next Js\nexirole) :"
    Write-Host "     package.json / prisma\schema.prisma / src introuvables ici."
    exit 1
}
Write-Host " [1/6] racine du projet : OK"

# ---------------- [1b/6] dependance qrcode (build Vercel) ----------------
$pkgJsonPath = Join-Path (Get-Location).Path "package.json"
$pkgJson = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
$deps = $pkgJson.dependencies
$qrcodeOk = $false
if ($deps -and $deps.PSObject.Properties["qrcode"]) { $qrcodeOk = $true }
if ($qrcodeOk) {
    Write-Host " [1b/6] dependance qrcode : presente dans package.json"
} else {
    Write-Host " [!] DEPENDANCE MANQUANTE : qrcode (requise par /api/public-cv/pdf)."
    Write-Host "     Le build Vercel echouera sans elle. Remediation :"
    Write-Host "       npm install qrcode"
    Write-Host "     puis relancez ce script."
    exit 1
}

# ---------------- [2/6] hygiene .gitignore ----------------
$gitignorePath = Join-Path (Get-Location).Path ".gitignore"
$lignesGitignore = @()
if (Test-Path $gitignorePath) {
    $lignesGitignore = @(Get-Content $gitignorePath -ErrorAction SilentlyContinue)
}
$doitAjouter = @()
foreach ($motif in @("*.bak", "*.bak-*", ".env", ".env.local")) {
    $present = $lignesGitignore | Where-Object { $_.Trim() -eq $motif }
    if (-not $present) { $doitAjouter += $motif }
}
if ($doitAjouter.Count -gt 0) {
    if (Test-Path $gitignorePath) {
        Copy-Item $gitignorePath "$gitignorePath.bak-gitignore-$horodatage" -Force
    }
    $doitAjouter | ForEach-Object { Add-Content -Path $gitignorePath -Value $_ }
    Write-Host " [2/6] .gitignore complete : $($doitAjouter -join ', ')  (.bak de securite cree)"
} else {
    Write-Host " [2/6] .gitignore : deja conforme (.bak et .env exclus)"
}

# ---------------- [3/6] route de diagnostic (optionnel) ----------------
if ($RetirerDiagnostic) {
    $diag = Join-Path (Get-Location).Path "src\app\api\diagnostic-cv"
    if (Test-Path $diag) {
        Copy-Item -Recurse $diag "$diag.bak-diag-$horodatage" -Force
        Remove-Item -Recurse -Force $diag
        Write-Host " [3/6] route temporaire /api/diagnostic-cv retiree (sauvegarde .bak a cote)"
    } else {
        Write-Host " [3/6] /api/diagnostic-cv : absente (rien a retirer)"
    }
} else {
    Write-Host " [3/6] /api/diagnostic-cv : conservee (auto-desactivee en production)"
}

# ---------------- [4/6] staging + filtres de securite ----------------
$estGitRepo = Test-Path (Join-Path (Get-Location).Path ".git")
if (-not $estGitRepo) {
    Write-Host " [!] Ce dossier n'est pas un depot Git (pas de .git)."
    Write-Host "     Initialisez : git init puis branchez le depot GitHub."
    exit 1
}

& git add -A 2> $null
if ($LASTEXITCODE -ne 0) { Write-Host " [!] git add a echoue."; exit 1 }

# desstage tout ce qui est interdit (regle 1.4 + secret .env)
$staged = @(& git diff --cached --name-only)
$interdits = @($staged | Where-Object { $_ -match "\.bak" -or $_ -match "(^|/)\.env" })
foreach ($f in $interdits) { & git reset -q HEAD -- $f }
if ($interdits.Count -gt 0) {
    Write-Host " [4/6] $($interdits.Count) fichier(s) interdit(s) retire(s) du commit (.bak / .env)"
} else {
    Write-Host " [4/6] staging : aucun .bak ni .env dans le commit"
}

$stagedFinal = @(& git diff --cached --name-only)
$fuite = @($stagedFinal | Where-Object { $_ -match "\.bak" -or $_ -match "(^|/)\.env" })
if ($fuite.Count -gt 0) {
    Write-Host " [!] ARRET : fichiers interdits encore stages : $($fuite -join ', ')"
    exit 1
}

# securite supplementaire : un .env deja TRACKED (commite avant) doit sortir
$traces = @(& git ls-files)
$tracesEnv = @($traces | Where-Object { $_ -match "(^|/)\.env" })
foreach ($f in $tracesEnv) {
    & git rm --cached -q $f
    Write-Host " [4/6] SECURITE : $f etait tracke - retire du depot (fichier local conserve)"
}
$stagedFinal = @(& git diff --cached --name-only)
if ($stagedFinal.Count -eq 0) {
    Write-Host " [=] aucun changement a committer (depot deja a jour)."
    $aCommitter = $false
} else {
    Write-Host " [4/6] $($stagedFinal.Count) fichier(s) stages pour le commit."
    $aCommitter = $true
}

# ---------------- [5/6] verrou de types puis commit + push ----------------
if ($aCommitter -and -not $SkipTsc) {
    if (Test-Path (Join-Path (Get-Location).Path "node_modules")) {
        Write-Host " [5/6] npx tsc --noEmit (verrou de types, 1-2 min)..."
        $ErrorActionPreference = "Continue"
        $outTsc = & npx tsc --noEmit 2>&1
        $tscOk = ($LASTEXITCODE -eq 0)
        $ErrorActionPreference = "Stop"
        if (-not $tscOk) {
            Write-Host " [!] tsc signale des erreurs - commit INTERROMPU :"
            $outTsc | Select-Object -First 15 | ForEach-Object { Write-Host ("      " + $_) }
            Write-Host "      relancez avec -SkipTsc pour forcer, ou corrigez d'abord."
            exit 1
        }
        Write-Host " [5/6] tsc : aucune erreur de type"
    } else {
        Write-Host " [5/6] node_modules absent : verrou tsc ignore (lancez npm install)"
    }
}

if ($aCommitter) {
    & git commit -m $Message 2> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host " [!] git commit a echoue (identite Git configuree ?)."
        Write-Host "     git config user.name ""Votre Nom"" ; git config user.email ""vous@mail.com"""
        exit 1
    }
    Write-Host " [5/6] commit cree : $Message"
    if (-not $NoPush) {
        $ErrorActionPreference = "Continue"
        $outPush = & git push origin main 2>&1
        $pushOk = ($LASTEXITCODE -eq 0)
        $ErrorActionPreference = "Stop"
        if (-not $pushOk) {
            Write-Host " [!] git push a echoue :"
            $outPush | Select-Object -First 10 | ForEach-Object { Write-Host ("      " + $_) }
            Write-Host "      verifiez la connexion GitHub puis relancez avec -NoPush apres un push manuel."
            exit 1
        }
        Write-Host " [5/6] push vers origin/main : OK -> deploy Vercel declenche"
    } else {
        Write-Host " [5/6] -NoPush : commit local uniquement"
    }
}

# ---------------- [6/6] schema de production (optionnel) ----------------
if ($SyncDbProduction -ne "") {
    Write-Host " [6/6] npx prisma db push vers la base de PRODUCTION (Neon, additif)..."
    $env:DIRECT_URL = $SyncDbProduction
    $env:DATABASE_URL = $SyncDbProduction
    $ErrorActionPreference = "Continue"
    $outDb = & npx prisma db push 2>&1
    $dbOk = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = "Stop"
    if (-not $dbOk) {
        Write-Host " [!] prisma db push (production) a echoue :"
        $outDb | Select-Object -First 10 | ForEach-Object { Write-Host ("      " + $_) }
        Write-Host "      verifiez l'URL Neon DIRECTE (sans -pooler) et reessayez."
        exit 1
    }
    Write-Host " [6/6] schema de production synchronise (table cv_documents presente)"
    Remove-Item Env:DIRECT_URL -ErrorAction SilentlyContinue
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
} else {
    Write-Host " [6/6] schema production : non synchronise (option -SyncDbProduction)"
}

Write-Host ""
Write-Host "=============================================================="
Write-Host " VERDICT + PROTOCOLE DE TEST PRODUCTION"
Write-Host "=============================================================="
Write-Host " Depot    : commit + push vers GitHub main"
Write-Host " Vercel   : deploy automatique depuis main"
Write-Host "            (sinon : Deployments -> ... -> Redeploy)"
Write-Host ""
Write-Host " SUR https://nexirole.vercel.app (une fois le deploy vert) :"
Write-Host "  [1] /dashboard/cv-builder : hub affiche (table cv_documents"
Write-Host "      presente en production). Si erreur Prisma << table"
Write-Host "      cv_documents does not exist >> : relancez ce script avec"
Write-Host "      -SyncDbProduction ""postgres://...Neon DIRECT..."""
Write-Host "  [2] Publier un CV en ligne -> /u/<slug> accessible hors"
Write-Host "      connexion, contenu complet, PDF avec QR fonctionne."
Write-Host "  [3] Renommer ce CV publie -> le slug /u/<slug> ne change PAS"
Write-Host "      et les ameliorations IA restent affichees."
Write-Host "  [4] Publier un 2e CV avec un nom complet different -> sa"
Write-Host "      propre page /u/<autre-slug> (les deux restent en ligne)."
Write-Host "  [5] Corbeille : supprimer un CV -> /u/<slug> hors ligne"
Write-Host "      immediatement, restauration possible 30 jours."
Write-Host ""
Write-Host " Secrets : ne commitez jamais .env / .env.local (regle 1.4)."
exit 0
