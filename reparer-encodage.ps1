# ============================================================
# reparer-tracker.ps1 - NexiRole / JOB TRACKER
# 1. route.ts : remplace followUpDate par lastActionDate
# 2. route.ts : retire la ligne de diagnostic session (401 resolu)
# 3. Diagnostic lecture-seule de prisma/schema.prisma et page.tsx
# Ecriture UTF-8 sans BOM ([System.IO.File], methode sure)
# Sauvegarde automatique : route.ts.bak-tracker
# ============================================================

 $ErrorActionPreference = "Stop"

 $routePath  = Join-Path (Get-Location) "src\app\api\tracker\route.ts"
 $schemaPath = Join-Path (Get-Location) "prisma\schema.prisma"
 $pagePath   = Join-Path (Get-Location) "src\app\dashboard\tracker\page.tsx"

Write-Host ""
Write-Host "=== Reparation du JOB TRACKER ===" -ForegroundColor Cyan

if (-not (Test-Path $routePath)) {
    Write-Host "ERREUR : fichier introuvable : $routePath" -ForegroundColor Red
    Write-Host "Lancez le script depuis la racine du projet (D:\Next Js\nexirole)." -ForegroundColor Yellow
    exit 1
}

# ----- 1) Lecture securisee de route.ts (UTF-8) -----
 $texte = [System.IO.File]::ReadAllText($routePath, [System.Text.Encoding]::UTF8)
if ($texte.Contains([string][char]0xFFFD)) {
    Write-Host "ERREUR : caracteres invalides (U+FFFD) dans route.ts." -ForegroundColor Red
    Write-Host "Ouvrez le fichier dans VS Code, verifiez l'encodage (barre du bas : UTF-8), puis relancez." -ForegroundColor Yellow
    exit 1
}
 $lignes = $texte -split "`r?`n"

# ----- 2) Corrections -----
 $nbChamps = 0
 $nbDiag   = 0
 $sortie   = New-Object System.Collections.Generic.List[string]

foreach ($ligne in $lignes) {
    $corrige = [regex]::Replace($ligne, '\bfollowUpDate\b', 'lastActionDate')
    if ($corrige -ne $ligne) { $nbChamps++ }

    # Ligne de diagnostic devenue inutile (le 401 est resolu)
    if ($corrige -match '\[api/tracker\]\s*session\s*pr.esente') {
        $nbDiag++
        continue
    }
    $sortie.Add($corrige)
}

if ($nbChamps -eq 0 -and $nbDiag -eq 0) {
    Write-Host "route.ts : rien a corriger (deja conforme)." -ForegroundColor Green
} else {
    $backupPath = "$routePath.bak-tracker"
    [System.IO.File]::WriteAllText($backupPath, $texte, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Sauvegarde creee : $backupPath" -ForegroundColor DarkGray

    $nouveauTexte = [string]::Join("`r`n", [string[]]$sortie)
    [System.IO.File]::WriteAllText($routePath, $nouveauTexte, (New-Object System.Text.UTF8Encoding($false)))

    if ($nbChamps -gt 0) { Write-Host ("followUpDate -> lastActionDate : {0} ligne(s) corrigee(s)." -f $nbChamps) -ForegroundColor Green }
    if ($nbDiag -gt 0)   { Write-Host ("Ligne(s) de diagnostic supprimee(s) : {0}." -f $nbDiag) -ForegroundColor Green }
}

# ----- 3) Verifications de route.ts -----
 $verif = [System.IO.File]::ReadAllText($routePath, [System.Text.Encoding]::UTF8)
if ($verif -match '\bfollowUpDate\b') {
    Write-Host "PROBLEME : il reste du followUpDate dans route.ts -> collez-moi le fichier." -ForegroundColor Red
} else {
    Write-Host "route.ts : plus aucun followUpDate : OK." -ForegroundColor Green
}
if ($verif -notmatch 'lastActionDate') {
    Write-Host "PROBLEME : lastActionDate absent de route.ts -> collez-moi le fichier." -ForegroundColor Red
}
 $octets = [System.IO.File]::ReadAllBytes($routePath)
if ($octets.Length -ge 3 -and $octets[0] -eq 0xEF -and $octets[1] -eq 0xBB -and $octets[2] -eq 0xBF) {
    Write-Host "PROBLEME : BOM detecte dans route.ts (anormal)." -ForegroundColor Red
} else {
    Write-Host "route.ts : encodage UTF-8 sans BOM : OK." -ForegroundColor Green
}

# ----- 4) page.tsx : controle lecture-seule -----
if (Test-Path $pagePath) {
    $pageTexte = [System.IO.File]::ReadAllText($pagePath, [System.Text.Encoding]::UTF8)
    if ($pageTexte -match '\bfollowUpDate\b') {
        Write-Host "PROBLEME : page.tsx contient aussi followUpDate -> dites-le-moi." -ForegroundColor Red
    } else {
        Write-Host "page.tsx : aucun followUpDate : OK." -ForegroundColor Green
    }
}

# ----- 5) Diagnostic lecture-seule de prisma/schema.prisma -----
Write-Host ""
Write-Host "=== Diagnostic prisma/schema.prisma (lecture seule) ===" -ForegroundColor Cyan
if (Test-Path $schemaPath) {
    $octetsSchema = [System.IO.File]::ReadAllBytes($schemaPath)
    if ($octetsSchema.Length -ge 3 -and $octetsSchema[0] -eq 0xEF -and $octetsSchema[1] -eq 0xBB -and $octetsSchema[2] -eq 0xBF) {
        Write-Host "PROBLEME : BOM dans schema.prisma -> relancez reparer-encodage.ps1." -ForegroundColor Red
    } else {
        Write-Host "schema.prisma : encodage UTF-8 sans BOM : OK." -ForegroundColor Green
    }

    $schemaTexte = [System.Text.Encoding]::UTF8.GetString($octetsSchema)
    $nbModele = [regex]::Matches($schemaTexte, '(?m)^\s*model\s+JobApplicationTracker\b').Count
    Write-Host ("Occurrences du modele JobApplicationTracker : {0} (attendu : 1)." -f $nbModele)
    if ($nbModele -ne 1) {
        Write-Host "PROBLEME : modele absent ou en double -> collez-moi la sortie du script." -ForegroundColor Red
    }
    if ($schemaTexte -match '(?m)^\s*followUpDate\b') {
        Write-Host "PROBLEME : le schema contient un champ followUpDate hors spec -> collez-moi le bloc du modele." -ForegroundColor Red
    } else {
        Write-Host "schema.prisma : aucun followUpDate : OK." -ForegroundColor Green
    }
    if ($schemaTexte -match 'lastActionDate') {
        Write-Host "schema.prisma : lastActionDate present : OK." -ForegroundColor Green
    } else {
        Write-Host "PROBLEME : lastActionDate introuvable dans le schema -> collez-moi le bloc du modele." -ForegroundColor Red
    }
} else {
    Write-Host "schema.prisma introuvable. Lancez le script depuis la racine du projet." -ForegroundColor Red
}

# ----- 6) Prochaines etapes -----
Write-Host ""
Write-Host "=== Prochaines etapes (a lancer manuellement) ===" -ForegroundColor Cyan
Write-Host "1. npx tsc --noEmit          (verification TypeScript)"
Write-Host "2. npx prisma db push        (cree la table JobApplicationTracker dans Neon)"
Write-Host "3. npx prisma generate"
Write-Host "4. Redemarrez le serveur : Ctrl+C puis npm run dev"
Write-Host "5. Testez http://localhost:3000/dashboard/tracker"
Write-Host ""