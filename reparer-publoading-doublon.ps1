#Requires -Version 5.1
<#
=====================================================================
 NEXIROLE - Reparation de l'erreur de compilation
 "the name `pubLoading` is defined multiple times"
 dans src/app/dashboard/cv-builder/page.tsx
=====================================================================
 CAUSE : une declaration d'etat useState est presente au moins deux
         fois dans le meme composant (patch applique deux fois ou
         ligne residuelle d'un patch anterieur).

 REMEDE CHIRURGICAL (conforme AGENTS.md) :
   [1/4] DIAGNOSTIC : recense toutes les declarations
         "const [x, setX] = useState" et liste les doublons.
   [2/4] SECURITE : n'intervient que si toutes les occurrences
         doublonnees sont strictement identiques (apres Trim).
         Sinon : ARRET sans aucune ecriture + rapport a copier.
   [3/4] SAUVEGARDE .bak-<tag>-<horodatage> puis suppression des
         occurrences redondantes (1re occurrence conservee),
         octet par octet : fins de ligne et encodage preserves.
   [4/4] VERIFICATION : re-lecture du fichier, plus aucun doublon,
         comptage des occurrences restantes de pubLoading.

 EXECUTION (PowerShell 5.1, depuis la racine du projet) :
   powershell -ExecutionPolicy Bypass -File .\reparer-publoading-doublon.ps1

 ROLLBACK : restaurer le fichier .bak-* cree a cote de page.tsx.
=====================================================================
#>

$ErrorActionPreference = "Stop"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

$builderPath = "src/app/dashboard/cv-builder/page.tsx"
if (-not (Test-Path -LiteralPath $builderPath)) {
  throw "Fichier introuvable : $builderPath - lancez ce script depuis la racine du projet (D:\Next Js\nexirole)."
}

Write-Host "=============================================================="
Write-Host " NEXIROLE - Reparation doublon 'pubLoading' (cv-builder)"
Write-Host "=============================================================="

$fichierComplet = Join-Path (Get-Location).Path $builderPath
$texte = [System.IO.File]::ReadAllText($fichierComplet)
if ($texte.Contains([string][char]0xFFFD)) {
  throw "Caracteres corrompus (U+FFFD) detectes dans $builderPath - encodage casse. Abandon."
}
$lignes = $texte -split "`r?`n"

# --- [1/4] DIAGNOSTIC -------------------------------------------------------
$motifEtat = '^\s*const\s*\[\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*,\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\]\s*=\s*useState\b'
$etats = @{}
for ($i = 0; $i -lt $lignes.Count; $i++) {
  if ($lignes[$i] -match $motifEtat) {
    $nom = $Matches[1]
    if (-not $etats.ContainsKey($nom)) {
      $etats[$nom] = New-Object System.Collections.Generic.List[int]
    }
    [void]$etats[$nom].Add($i)
  }
}

$doublons = @()
foreach ($nom in $etats.Keys) {
  if ($etats[$nom].Count -gt 1) { $doublons += $nom }
}

Write-Host ""
Write-Host "[1/4] Diagnostic :"
Write-Host ("  - {0} noms d'etat useState recenses ({1} lignes analysees)" -f $etats.Count, $lignes.Count)
if ($doublons.Count -eq 0) {
  Write-Host "  [OK] aucune declaration useState dupliquee - rien a reparer." -ForegroundColor Green
  Write-Host "      Si l'erreur 'pubLoading' persiste quand meme dans le navigateur :" -ForegroundColor Yellow
  Write-Host "      stoppez le serveur, supprimez le dossier .next, relancez 'npm run dev'."
  Write-Host "      Sinon, copiez la sortie de : Select-String -Path `"src\app\dashboard\cv-builder\page.tsx`" -Pattern `"pubLoading`""
  exit 0
}
foreach ($nom in ($doublons | Sort-Object)) {
  $numeros = ($etats[$nom] | ForEach-Object { $_ + 1 }) -join ", "
  Write-Host ("  [!] '{0}' declaree {1} fois (lignes {2})" -f $nom, $etats[$nom].Count, $numeros) -ForegroundColor Yellow
}

# --- [2/4] SECURITE : occurrences identiques uniquement ---------------------
Write-Host ""
Write-Host "[2/4] Securite :"
$arret = $false
foreach ($nom in $doublons) {
  $variantes = @()
  foreach ($idx in $etats[$nom]) {
    $variantes += ($lignes[$idx].Trim())
  }
  if ((@($variantes | Select-Object -Unique)).Count -gt 1) {
    $arret = $true
    Write-Host ("  [!] '{0}' : occurrences DIFFERENTES - arret sans ecriture." -f $nom) -ForegroundColor Red
  }
}
if ($arret) {
  Write-Host ""
  Write-Host "  Rapport complet des doublons (a copier et envoyer a l'assistant) :" -ForegroundColor Yellow
  foreach ($nom in ($doublons | Sort-Object)) {
    foreach ($idx in $etats[$nom]) {
      Write-Host ("    ligne {0} : {1}" -f ($idx + 1), $lignes[$idx].Trim())
    }
  }
  Write-Host ""
  Write-Host "  Aucune ecriture effectuee : le fichier est intact."
  exit 1
}
Write-Host "  [OK] toutes les occurrences doublonnees sont identiques - suppression sure." -ForegroundColor Green

# --- [3/4] SAUVEGARDE puis SUPPRESSION CHIRURGICALE -------------------------
$tag = "doublon-etat-" + (($doublons | Sort-Object) -join "-")
$bak = "$builderPath.bak-$tag-$stamp"
Copy-Item -LiteralPath $fichierComplet -Destination (Join-Path (Get-Location).Path $bak) -Force
Write-Host ""
Write-Host "[3/4] Sauvegarde : $bak"

$supprimees = 0
foreach ($nom in ($doublons | Sort-Object)) {
  $nomRegex = [regex]::Escape($nom)
  $motifLigne = '(?m)^[ \t]*const\s*\[\s*' + $nomRegex + '\s*,\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\]\s*=\s*useState\b[^\r\n]*\r?\n?'
  $trouvailles = [regex]::Matches($texte, $motifLigne)
  if ($trouvailles.Count -lt 2) { continue }

  $sb = New-Object System.Text.StringBuilder
  $position = 0
  for ($k = 1; $k -lt $trouvailles.Count; $k++) {
    $m = $trouvailles[$k]
    [void]$sb.Append($texte.Substring($position, $m.Index - $position))
    $position = $m.Index + $m.Length
  }
  [void]$sb.Append($texte.Substring($position))
  $texte = $sb.ToString()
  $supprimees += ($trouvailles.Count - 1)
  Write-Host ("  [OK] '{0}' : {1} occurrence(s) redondante(s) supprimee(s) - la 1re (ligne {2}) est conservee." -f $nom, ($trouvailles.Count - 1), ($etats[$nom][0] + 1)) -ForegroundColor Green
}
if ($supprimees -eq 0) {
  Write-Host "  [!] aucune suppression effectuee (cas inattendu) - fichier NON modifie." -ForegroundColor Red
  exit 1
}
[System.IO.File]::WriteAllText($fichierComplet, $texte, $Utf8NoBom)
Write-Host "  [OK] fichier reecrit (UTF-8 sans BOM, fins de ligne preservees)."

# --- [4/4] VERIFICATION ------------------------------------------------------
$verif = [System.IO.File]::ReadAllText($fichierComplet)
$lignesVerif = $verif -split "`r?`n"
$etats2 = @{}
for ($i = 0; $i -lt $lignesVerif.Count; $i++) {
  if ($lignesVerif[$i] -match $motifEtat) {
    $nom = $Matches[1]
    if (-not $etats2.ContainsKey($nom)) { $etats2[$nom] = 0 }
    $etats2[$nom] = $etats2[$nom] + 1
  }
}
$restants = @()
foreach ($nom in $etats2.Keys) {
  if ($etats2[$nom] -gt 1) { $restants += $nom }
}
$nbDeclPub = ([regex]::Matches($verif, '(?m)^[ \t]*const\s*\[\s*pubLoading\s*,')).Count
$nbTotalPub = ([regex]::Matches($verif, 'pubLoading')).Count

Write-Host ""
Write-Host "[4/4] Verification :"
if ($restants.Count -eq 0) {
  Write-Host "  [OK] plus aucune declaration useState dupliquee dans le fichier." -ForegroundColor Green
} else {
  Write-Host ("  [!] doublons restants (non geres) : {0}" -f ($restants -join ", ")) -ForegroundColor Red
}
Write-Host ("  [i] 'pubLoading' : {0} declaration(s) restante(s), {1} occurrence(s) au total (usages inclus)." -f $nbDeclPub, $nbTotalPub)

Write-Host ""
Write-Host "=============================================================="
Write-Host " VERDICT"
Write-Host "=============================================================="
if (($restants.Count -eq 0) -and ($nbDeclPub -eq 1)) {
  Write-Host " [OK] Reparation terminee. Passez au protocole de test localhost:3000."
  Write-Host "      Ne commitez pas le fichier .bak (hygiene Git - regle 1.4 AGENTS.md)."
  exit 0
}
Write-Host " [!] Situation non standard - copiez la sortie complete ci-dessus"
Write-Host "     et envoyez-la a l'assistant pour une reparation ciblee."
exit 1
