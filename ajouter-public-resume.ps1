# ============================================================
# ajouter-public-resume.ps1 - NexiRole / CV EN LIGNE PARTAGEABLE
# Ajoute a prisma/schema.prisma :
#   1. la relation "publicResume PublicResume?" dans model User
#   2. le modele PublicResume a la fin du fichier
# Ecriture UTF-8 SANS BOM ([System.IO.File], methode sure)
# Sauvegarde : schema.prisma.bak-public-resume
# Idempotent : peut etre relance sans risque.
# ============================================================

 $ErrorActionPreference = "Stop"

 $schemaPath = Join-Path (Get-Location) "prisma\schema.prisma"
Write-Host ""
Write-Host "=== Ajout du modele PublicResume ===" -ForegroundColor Cyan

if (-not (Test-Path $schemaPath)) {
    Write-Host "ERREUR : prisma\schema.prisma introuvable. Lancez le script depuis la racine du projet." -ForegroundColor Red
    exit 1
}

 $octets = [System.IO.File]::ReadAllBytes($schemaPath)
if ($octets.Length -ge 3 -and $octets[0] -eq 0xEF -and $octets[1] -eq 0xBB -and $octets[2] -eq 0xBF) {
    Write-Host "PROBLEME : schema.prisma commence par un BOM. Relancez d'abord reparer-encodage.ps1." -ForegroundColor Red
    exit 1
}

 $texte = [System.Text.Encoding]::UTF8.GetString($octets)
if ($texte.Contains([string][char]0xFFFD)) {
    Write-Host "ERREUR : caracteres invalides dans schema.prisma (encodage endommage)." -ForegroundColor Red
    exit 1
}

 $lignes = $texte -split "`r?`n"
 $sortie = New-Object System.Collections.Generic.List[string]
 $modifie = $false

# ----- 1) Relation dans model User -----
 $hasRelation = $false
for ($i = 0; $i -lt $lignes.Count; $i++) {
    if ($lignes[$i] -match '^\s*publicResume\s+PublicResume\b') { $hasRelation = $true; break }
}

if ($hasRelation) {
    Write-Host "Relation 'publicResume' deja presente dans model User : OK." -ForegroundColor Green
} else {
    $inUser = $false
    $depth = 0
    $userCloseIndex = -1
    for ($i = 0; $i -lt $lignes.Count; $i++) {
        $l = $lignes[$i]
        $open = ([regex]::Matches($l, '\{')).Count
        $close = ([regex]::Matches($l, '\}')).Count
        if (-not $inUser) {
            if ($l -match '^\s*model\s+User\s*\{') { $inUser = $true; $depth = $open - $close }
            continue
        }
        $depth += ($open - $close)
        if ($depth -le 0) { $userCloseIndex = $i; break }
    }
    if ($userCloseIndex -lt 0) {
        Write-Host "PROBLEME : bloc 'model User' introuvable ou non termine -> collez-moi schema.prisma." -ForegroundColor Red
        exit 1
    }
    for ($i = 0; $i -lt $lignes.Count; $i++) {
        if ($i -eq $userCloseIndex) {
            $sortie.Add("  publicResume PublicResume?")
            $modifie = $true
        }
        $sortie.Add($lignes[$i])
    }
    Write-Host "Relation 'publicResume PublicResume?' ajoutee dans model User." -ForegroundColor Green
}

# ----- 2) Modele PublicResume a la fin -----
 $hasModel = $false
for ($i = 0; $i -lt $lignes.Count; $i++) {
    if ($lignes[$i] -match '^\s*model\s+PublicResume\s*\{') { $hasModel = $true; break }
}

 $modeleBlock = @(
    '',
    'model PublicResume {',
    '  id         String   @id @default(cuid())',
    '  userId     String   @unique',
    '  slug       String   @unique',
    '  isPublic   Boolean  @default(true)',
    '  templateId String   @default("modern-accent")',
    '  cvData     Json',
    '  viewsCount Int      @default(0)',
    '  createdAt  DateTime @default(now())',
    '  updatedAt  DateTime @updatedAt',
    '',
    '  user User @relation(fields: [userId], references: [id], onDelete: Cascade)',
    '}'
)

if ($hasModel) {
    Write-Host "Modele PublicResume deja present : OK." -ForegroundColor Green
} else {
    while ($sortie.Count -gt 0 -and $sortie[$sortie.Count - 1].Trim() -eq "") { $sortie.RemoveAt($sortie.Count - 1) }
    foreach ($l in $modeleBlock) { $sortie.Add($l) }
    $modifie = $true
    Write-Host "Modele PublicResume ajoute a la fin du fichier." -ForegroundColor Green
}

if ($modifie) {
    $backupPath = "$schemaPath.bak-public-resume"
    [System.IO.File]::WriteAllText($backupPath, $texte, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Sauvegarde creee : $backupPath" -ForegroundColor DarkGray

    $nouveauTexte = [string]::Join("`r`n", [string[]]$sortie) + "`r`n"
    [System.IO.File]::WriteAllText($schemaPath, $nouveauTexte, (New-Object System.Text.UTF8Encoding($false)))
}

# ----- 3) Verifications -----
 $verifTexte = [System.IO.File]::ReadAllText($schemaPath, [System.Text.Encoding]::UTF8)
 $nbModele = [regex]::Matches($verifTexte, '(?m)^\s*model\s+PublicResume\b').Count
 $nbRelation = [regex]::Matches($verifTexte, '(?m)^\s*publicResume\s+PublicResume\b').Count
Write-Host ("Verification : modele PublicResume = {0} (attendu 1) | relation dans User = {1} (attendu 1)." -f $nbModele, $nbRelation)
if ($nbModele -ne 1 -or $nbRelation -ne 1) {
    Write-Host "PROBLEME de verification -> collez-moi la sortie du script (ne poussez pas sur git)." -ForegroundColor Red
} else {
    Write-Host "schema.prisma : OK (UTF-8 sans BOM)." -ForegroundColor Green
}

 $finOctets = [System.IO.File]::ReadAllBytes($schemaPath)
if ($finOctets.Length -ge 3 -and $finOctets[0] -eq 0xEF -and $finOctets[1] -eq 0xBB -and $finOctets[2] -eq 0xBF) {
    Write-Host "PROBLEME : BOM apres ecriture (anormal)." -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Prochaines etapes (a lancer manuellement) ===" -ForegroundColor Cyan
Write-Host "1. npx prisma format                      (reformate et VALIDE le schema)"
Write-Host "2. npx prisma db push                     (cree la table PublicResume dans Neon)"
Write-Host "3. npx prisma generate"
Write-Host "4. npm install qrcode"
Write-Host "   npm install --save-dev @types/qrcode"
Write-Host "5. Redemarrez : Ctrl+C puis npm run dev"
Write-Host ""