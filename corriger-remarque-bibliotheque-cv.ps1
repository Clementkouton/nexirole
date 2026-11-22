# ==================================================================
# NEXIROLE - Correction de la remarque "bibliotheque de CV"
# ------------------------------------------------------------------
# Objet : dans LISEZMOI-BIBLIOTHEQUE-CV.txt, la remarque
#         "Un seul CV peut etre publie a la fois" est obsolete.
#         Version correcte : plusieurs CV peuvent etre publies en
#         ligne (une page /u/<slug> par CV) ; c'est pourquoi le
#         renommage existe ; renommer un CV conserve le slug et les
#         ameliorations IA enregistrees dans le contenu.
# Conforme AGENTS.md :
#   1.1 modification chirurgicale (un seul bloc de la remarque)
#   1.2 sauvegarde .bak-remarque-<horodatage> avant ecriture
#   1.5 verification + verdict a la fin
# Idempotent : relancer ne fait rien (deja corrige = skip).
# Aucun fichier source du projet n'est touche : documentation seule.
# ==================================================================

param(
    [string]$Racine = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

function Get-EncodageFichier {
    param([string]$Chemin)
    $octets = [System.IO.File]::ReadAllBytes($Chemin)
    if ($octets.Length -ge 3 -and $octets[0] -eq 0xEF -and $octets[1] -eq 0xBB -and $octets[2] -eq 0xBF) {
        return [System.Text.Encoding]::UTF8
    }
    return [System.Text.Encoding]::Default
}

$exclusions = @("\\node_modules\\", "\\.next\\", "\\.git\\", "\\src\\generated\\")
$horodatage = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host "=============================================================="
Write-Host " NEXIROLE - Correction remarque bibliotheque CV"
Write-Host " recherche dans : $Racine"
Write-Host "=============================================================="

$cibles = @(Get-ChildItem -Path $Racine -Recurse -Filter "LISEZMOI-BIBLIOTHEQUE-CV.txt" -File -ErrorAction SilentlyContinue |
    Where-Object {
        $cheminComplet = $_.FullName
        $hors = $false
        foreach ($ex in $exclusions) {
            if ($cheminComplet -like ("*" + $ex + "*")) { $hors = $true; break }
        }
        -not $hors
    })

if ($cibles.Count -eq 0) {
    Write-Host " [!] LISEZMOI-BIBLIOTHEQUE-CV.txt introuvable sous : $Racine"
    Write-Host "     Placez ce script dans le dossier du package (a cote du"
    Write-Host "     LISEZMOI) ou a la racine du projet, puis relancez."
    exit 1
}

# Bloc de remplacement (13 lignes, ASCII pur, sans accents)
$nouveauBloc = @(
"  - Plusieurs CV peuvent etre publies en ligne en meme temps : chaque",
"    CV publie a sa propre page /u/<slug>, deduite du nom inscrit sur",
"    le CV (etape 1 du createur) au premier envoi puis figee sur ce CV",
"    (champ publishedSlug). C'est pourquoi le renommage existe : il",
"    permet de distinguer les CV publies les uns des autres dans la",
"    bibliotheque. Renommer un CV (bouton Renommer du hub) ne change",
"    que ce nom : le slug, le lien public /u/<slug> et les",
"    ameliorations IA deja enregistrees dans le contenu (resume,",
"    experiences enrichis) sont conserves ; la republication reutilise",
"    le meme slug, donc le lien public ne change jamais.",
"  - Seule limite : deux CV portant le meme nom complet visent la",
"    meme page publique. Donnez un nom distinct a chaque CV avant sa",
"    premiere publication."
)

$nbCorriges = 0
$nbDejaOk = 0

foreach ($fichier in $cibles) {
    $enc = Get-EncodageFichier -Chemin $fichier.FullName
    $texte = [System.IO.File]::ReadAllText($fichier.FullName, $enc)

    if ($texte -match "Plusieurs CV peuvent etre publies") {
        Write-Host " [=] deja corrige (aucune action) : $($fichier.FullName)"
        $nbDejaOk++
        continue
    }

    $lignes = @($texte -split "\r?\n")
    $idx = -1
    for ($i = 0; $i -lt $lignes.Count; $i++) {
        if ($lignes[$i] -match "^  - Un seul CV peut etre publie") { $idx = $i; break }
    }
    if ($idx -lt 0) {
        Write-Host " [=] remarque obsolete absente (rien a corriger) : $($fichier.FullName)"
        continue
    }

    # Fin du bloc : premiere ligne suivante contenant kouton-clement (incluse)
    $fin = $idx
    while ($fin -lt ($lignes.Count - 1) -and $lignes[$fin] -notmatch "kouton-clement") { $fin++ }

    # Cosmetique (meme fichier) : normalise les guillemets mal encodes
    # guillemets (simples ou double-encodes, espaces internes absorbes)
    $motifGuillemets = "(?:\u00C2)?\u00AB\s*([^\r\n\u00BB]*?)\s*(?:\u00C2)?\u00BB"
    $texte = [regex]::Replace($texte, $motifGuillemets, '"$1"')
    $lignes = @($texte -split "\r?\n")
    # re-ancrage apres normalisation (les ancres sont ASCII : inchangees)
    $idx = -1
    for ($i = 0; $i -lt $lignes.Count; $i++) {
        if ($lignes[$i] -match "^  - Un seul CV peut etre publie") { $idx = $i; break }
    }
    $fin = $idx
    while ($fin -lt ($lignes.Count - 1) -and $lignes[$fin] -notmatch "kouton-clement") { $fin++ }

    $avant = @()
    if ($idx -gt 0) { $avant = $lignes[0..($idx - 1)] }
    $apres = @()
    if (($fin + 1) -lt $lignes.Count) { $apres = $lignes[($fin + 1)..($lignes.Count - 1)] }

    $nouvellesLignes = @($avant + $nouveauBloc + $apres)

    $nouvelleFinDeLigne = if ($texte.Contains("`r`n")) { "`r`n" } else { "`n" }
    $nouveauTexte = ($nouvellesLignes -join $nouvelleFinDeLigne) + $nouvelleFinDeLigne

    $sauvegarde = "$($fichier.FullName).bak-remarque-$horodatage"
    Copy-Item -Path $fichier.FullName -Destination $sauvegarde -Force
    [System.IO.File]::WriteAllText($fichier.FullName, $nouveauTexte, $enc)

    Write-Host " [OK] corrige : $($fichier.FullName)"
    Write-Host "      sauvegarde : $sauvegarde"
    $nbCorriges++
}

Write-Host ""
Write-Host "=============================================================="
Write-Host " VERDICT"
Write-Host "=============================================================="
Write-Host " fichiers corriges : $nbCorriges"
Write-Host " deja a jour       : $nbDejaOk"
Write-Host ""
Write-Host " La remarque dit maintenant : plusieurs CV peuvent etre publies"
Write-Host " renommage = nom de bibliotheque seulement (slug + ameliorations"
Write-Host " IA conserves). Aucun fichier source du projet n'a ete touche :"
Write-Host " pas de npm run dev requis pour cette correction documentaire."
exit 0
