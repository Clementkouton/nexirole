#Requires -Version 5.1
<#
=====================================================================
 NEXIROLE - PATCHER : sync-publication-cv.ps1  v1 -> v2
=====================================================================
 CORRIGE le blocage "FONCTIONS EN DOUBLON : publierCvActuel x2," :
   - E-B insere les helpers UNE SEULE FOIS (1re occurrence utile de
     l'ancre) au lieu de String.Replace qui dupliquait le bloc quand
     l'ancre existe plusieurs fois dans le createur ;
   - E-C / E-D rebranchent TOUTES les occurrences des handlers ;
   - re-execution neutre (toutes les etapes affichent [=]) ;
   - rapport de position (lignes) en cas de doublon residuel.

 SECURITE : chaque paire doit matcher exactement 1 fois (sinon abort
 sans ecriture) ; le resultat final est verifie par empreinte SHA-256
 avant toute ecriture ; sauvegarde .bak-v1-<horodatage> systematique.

 EXECUTION (depuis la racine du projet) :
   powershell -ExecutionPolicy Bypass -File .\patcher-sync-publication-v2.ps1
=====================================================================
#>

 $ErrorActionPreference = "Stop"
 $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
 $cible = "sync-publication-cv.ps1"
 $full = Join-Path (Get-Location).Path $cible

Write-Host "==============================================================="
Write-Host " PATCHER sync-publication-cv.ps1 : v1 -> v2 (correctif doublon)"
Write-Host "==============================================================="

if (-not (Test-Path -LiteralPath $full)) {
  throw ("Fichier introuvable : " + $cible + " - lancez le patcher depuis la racine du projet.")
}

 $octetsOriginaux = [System.IO.File]::ReadAllBytes($full)
 $texte = [System.IO.File]::ReadAllText($full)
 $texte = $texte.TrimStart([string][char]0xFEFF)

if ($texte.Contains([string][char]0xFFFD)) {
  Write-Host "  [!] caracteres corrompus (U+FFFD) dans le fichier - encodage casse." -ForegroundColor Red
  Write-Host "  Aucune ecriture. Utilisez le plan B : remplacez le fichier entier" -ForegroundColor Yellow
  Write-Host "  par la v2 complete fournie, puis relancez le script." -ForegroundColor Yellow
  exit 2
}

if ($texte.Contains("VERSION 2 (correctif")) {
  Write-Host "  [=] le script est deja en v2 - rien a faire."
  exit 0
}

 $texte = $texte.Replace("`r`n", "`n")

function Apply-Un {
  param([string]$Texte, [string]$Avant, [string]$Apres, [string]$Label)
  $Avant = $Avant.Replace("`r`n", "`n")
  $Apres = $Apres.Replace("`r`n", "`n")
  $nb = ([regex]::Matches($Texte, [regex]::Escape($Avant))).Count
  if ($nb -ne 1) {
    Write-Host ""
    Write-Host ("  [!] " + $Label + " : ancre trouvee x" + $nb + " (attendu 1).") -ForegroundColor Red
    Write-Host "  Votre copie n'est pas la v1 attendue - AUCUNE ecriture (fichier intact)." -ForegroundColor Yellow
    Write-Host "  Plan B : remplacez tout le fichier par la v2 complete, puis relancez." -ForegroundColor Yellow
    exit 2
  }
  Write-Host ("  [+] " + $Label)
  return $Texte.Replace($Avant, $Apres)
}

# ---- PA01 - A en-tete VERSION 2 ----
 $AV1 = @'
   [6/6] VERIFICATION npx tsc --noEmit + protocole de test.
'@
 $AP1 = @'
   [6/6] VERIFICATION npx tsc --noEmit + protocole de test.

 VERSION 2 (correctif "FONCTIONS EN DOUBLON") :
   - E-B insere les helpers UNE SEULE FOIS (1re occurrence utile de
     l'ancre). L'ancien String.Replace dupliquait le bloc quand
     l'ancre existe plusieurs fois dans le createur (declarations
     heritees d'anciens patchs) -> abort "publierCvActuel x2" sans
     aucune ecriture.
   - E-C / E-D rebranchent TOUTES les occurrences des handlers
     (les occurrences situees dans un commentaire sont ignorees).
   - E-B2 retire un eventuel bloc helpers en doublon (assurance).
   - Rapports de position (numero de ligne) si un doublon residuel
     subsiste ; mode -DiagnostiqueSeul enrichi.
'@
 $texte = Apply-Un $texte $AV1 $AP1 "PA01 - A en-tete VERSION 2"

# ---- PA02 - B fonctions v2 (Show-Occurrences / DansBlocCommentaire / All / AnyUnpatched) ----
 $AV2 = @'
  Write-Host ("  [+] " + $Label)
  return $Text.Substring(0, $openIdx) + "{" + $NewBody + "}" + $Text.Substring($closeIdx + 1)
}
'@
 $AP2 = @'
  Write-Host ("  [+] " + $Label)
  return $Text.Substring(0, $openIdx) + "{" + $NewBody + "}" + $Text.Substring($closeIdx + 1)
}

# AFFICHE-OCCURRENCES : rapport de position (ligne + extrait) pour diagnostic
function Show-Occurrences {
  param([string]$Text, [string]$Needle, [string]$Label)
  $count = 0
  $idx = $Text.IndexOf($Needle)
  while ($idx -ge 0) {
    $count++
    $line = 1
    for ($i = 0; $i -lt $idx; $i++) {
      if ($Text[$i] -eq "`n") { $line++ }
    }
    $start = [Math]::Max(0, $idx - 40)
    $len = [Math]::Min(110, $Text.Length - $start)
    $ctx = $Text.Substring($start, $len).Replace("`r", " ").Replace("`n", " | ")
    Write-Host ("    " + $Label + " #" + $count + " (ligne " + $line + ") : ..." + $ctx + "...")
    $idx = $Text.IndexOf($Needle, $idx + $Needle.Length)
  }
  if ($count -eq 0) {
    Write-Host ("    " + $Label + " : 0 occurrence")
  }
}

# Teste si une position de correspondance se trouve juste sous l'ouverture
# d'un bloc commentaire non ferme (/* , * ou // non termines sur la ligne
# precedente) : ces occurrences ne sont PAS du code executable.
function Test-DansBlocCommentaire {
  param([string]$Text, [int]$MatchIndex)
  $nl = $Text.LastIndexOf("`n", [Math]::Max(0, $MatchIndex - 1))
  if ($nl -lt 0) { return $false }
  $ligneAvant = $Text.Substring(0, $nl)
  $debut = $ligneAvant.LastIndexOf("`n")
  if ($debut -ge 0) { $ligneAvant = $ligneAvant.Substring($debut + 1) }
  $t = $ligneAvant.Trim()
  if ($t.Length -eq 0) { return $false }
  if ($t.StartsWith("/*") -and -not $t.Contains("*/")) { return $true }
  if ($t.StartsWith("*") -and -not $t.Contains("*/")) { return $true }
  return $false
}

# REMPLACE-CORPS-TOUS : remplace le corps de TOUTES les occurrences d'une
# fonction (couvre les declarations en doublon heritees d'anciens patchs).
# Deja applique -> message [=] sans modification.
function Replace-FunctionBodyAll {
  param([string]$Text, [string]$Name, [string]$NewBody, [string]$Label)
  $total = 0
  for ($round = 1; $round -le 25; $round++) {
    $patched = $false
    $pattern = '(async\s+)?function\s+' + [regex]::Escape($Name) + '\s*\([^)]*\)\s*\{'
    foreach ($m in [regex]::Matches($Text, $pattern)) {
      if (Test-DansBlocCommentaire $Text $m.Index) { continue }
      $openIdx = $m.Index + $m.Length - 1
      $depth = 0
      $closeIdx = -1
      for ($i = $openIdx; $i -lt $Text.Length; $i++) {
        $c = $Text[$i]
        if ($c -eq '{') { $depth++ }
        elseif ($c -eq '}') {
          $depth--
          if ($depth -eq 0) { $closeIdx = $i; break }
        }
      }
      if ($closeIdx -lt 0) {
        throw ("ACCOLADES DESEQUILIBREES [" + $Label + "] - abandon sans ecriture.")
      }
      $body = $Text.Substring($openIdx, $closeIdx - $openIdx + 1)
      if ($body.Contains($NewBody.Trim())) { continue }
      if ($body.Length -lt 60) {
        throw ("CORPS TROP COURT [" + $Label + "] - abandon sans ecriture.")
      }
      $Text = $Text.Substring(0, $openIdx) + "{" + $NewBody + "}" + $Text.Substring($closeIdx + 1)
      $total++
      $patched = $true
      Write-Host ("  [+] " + $Label + " (occurrence " + $total + ")")
      break
    }
    if (-not $patched) { break }
  }
  if ($total -eq 0) {
    Write-Host ("  [=] " + $Label + " : deja applique")
  }
  return $Text
}

# Renvoie $true si au moins une occurrence utile (hors commentaires) du
# corps de la fonction $Name ne contient pas $Marker (reste a rebrancher).
function Test-AnyUnpatchedOccurrence {
  param([string]$Text, [string]$Name, [string]$Marker)
  $pattern = '(async\s+)?function\s+' + [regex]::Escape($Name) + '\s*\([^)]*\)\s*\{'
  foreach ($m in [regex]::Matches($Text, $pattern)) {
    if (Test-DansBlocCommentaire $Text $m.Index) { continue }
    $openIdx = $m.Index + $m.Length - 1
    $depth = 0
    $closeIdx = -1
    for ($i = $openIdx; $i -lt $Text.Length; $i++) {
      $c = $Text[$i]
      if ($c -eq '{') { $depth++ }
      elseif ($c -eq '}') {
        $depth--
        if ($depth -eq 0) { $closeIdx = $i; break }
      }
    }
    if ($closeIdx -lt 0) { return $true }
    $body = $Text.Substring($openIdx, $closeIdx - $openIdx + 1)
    if (-not $body.Contains($Marker)) { return $true }
  }
  return $false
}
'@
 $texte = Apply-Un $texte $AV2 $AP2 "PA02 - B fonctions v2 (Show-Occurrences / DansBlocCommentaire / All / AnyUnpatched)"

# ---- PA03 - C variante $PdfOnlyCode derivee (source unique) ----
 $AV3 = @'
 $EffetAncien = @'
'@
 $AP3 = @'
# Variante PDF seul (E-B partiel : publierCvActuel deja present sans
# pdfQrDepuisBase) : derivee de $HelpersCode (source unique, aucun
# second heredoc a maintenir).
 $PdfOnlyCode = "`n" + $HelpersCode.Substring($HelpersCode.IndexOf("  async function pdfQrDepuisBase() {"))

 $EffetAncien = @'
'@
 $texte = Apply-Un $texte $AV3 $AP3 "PA03 - C variante PdfOnlyCode derivee (source unique)"

# ---- PA04 - D ancres $ancre1/$ancre2 globalisees ----
 $AV4 = @'
if (-not $editorPath) {
  Write-Host "  [!] fichier du createur introuvable - etape ignoree."
} elseif ($DiagnostiqueSeul) {
'@
 $AP4 = @'
 $ancre1 = "  async function handlePublishPublicCv() {"
 $ancre2 = "  function buildDossierForCvPdf(): {"

if (-not $editorPath) {
  Write-Host "  [!] fichier du createur introuvable - etape ignoree."
} elseif ($DiagnostiqueSeul) {
'@
 $texte = Apply-Un $texte $AV4 $AP4 "PA04 - D ancres ancre1/ancre2 globalisees"

# ---- PA05 - E rapport diagnostic v2 (occurrences cles) ----
 $AV5 = @'
  foreach ($lbl in @($labelMaj, "Publier en ligne", "Publier mon CV en ligne", "PDF (QR)", "PDF avec QR", "Terminer")) {
    $lblRegex = [regex]::Escape($lbl)
    $c = ([regex]::Matches($editorText, $lblRegex)).Count
    Write-Host ("  libelle '" + $lbl + "' : " + $c + " occurrence(s)")
    foreach ($h in (Find-HandlersForLabel $editorText $lblRegex)) {
      $defini = Test-HandlerDefined $editorText $h
      Write-Host ("      -> onClick={ " + $h + " } (fonction definie : " + $defini + ")")
    }
  }
'@
 $AP5 = @'
  foreach ($lbl in @($labelMaj, "Publier en ligne", "Publier mon CV en ligne", "PDF (QR)", "PDF avec QR", "Terminer")) {
    $lblRegex = [regex]::Escape($lbl)
    $c = ([regex]::Matches($editorText, $lblRegex)).Count
    Write-Host ("  libelle '" + $lbl + "' : " + $c + " occurrence(s)")
    foreach ($h in (Find-HandlersForLabel $editorText $lblRegex)) {
      $defini = Test-HandlerDefined $editorText $h
      Write-Host ("      -> onClick={ " + $h + " } (fonction definie : " + $defini + ")")
    }
  }
  Write-Host "  --- occurrences cles (v2) ---"
  Show-Occurrences $editorText $ancre1 "ancre handlePublishPublicCv"
  Show-Occurrences $editorText "function publierCvActuel" "publierCvActuel"
  Show-Occurrences $editorText "function pdfQrDepuisBase" "pdfQrDepuisBase"
'@
 $texte = Apply-Un $texte $AV5 $AP5 "PA05 - E rapport diagnostic v2 (occurrences cles)"

# ---- PA06 - F E-B insertion unique + E-B2 anti-doublon ----
 $AV6 = @'
  # --- E-B : fonctions publierCvActuel / pdfQrDepuisBase (bloquant) ---
  $helpersInsertes = $false
  if ($editorText.Contains("function publierCvActuel")) {
    Write-Host "  [=] E-B publierCvActuel : deja present"
    $helpersInsertes = $true
  } else {
    $ancre1 = "  async function handlePublishPublicCv() {"
    $ancre2 = "  function buildDossierForCvPdf(): {"
    if ($editorText.Contains($ancre1)) {
      $editorText = $editorText.Replace($ancre1, ($HelpersCode + $ancre1))
      $helpersInsertes = $true
      Write-Host "  [+] E-B publierCvActuel + pdfQrDepuisBase ajoutes"
    } elseif ($editorText.Contains($ancre2)) {
      $editorText = $editorText.Replace($ancre2, ($HelpersCode + $ancre2))
      $helpersInsertes = $true
      Write-Host "  [+] E-B publierCvActuel + pdfQrDepuisBase ajoutes (ancre 2)"
    }
  }
'@
 $AP6 = @'
  # --- E-B : fonctions publierCvActuel / pdfQrDepuisBase (bloquant) ---
  # v2 : insertion UNIQUE avant la 1re occurrence utile de l'ancre.
  # L'ancien String.Replace dupliquait les helpers quand l'ancre est
  # presente plusieurs fois (cause du bug "FONCTIONS EN DOUBLON").
  $helpersInsertes = $false
  $hasPublier = $editorText.Contains("function publierCvActuel")
  $hasPdfQr = $editorText.Contains("function pdfQrDepuisBase")
  $ancreUtilisee = $null
  if ($editorText.Contains($ancre1)) { $ancreUtilisee = $ancre1 }
  elseif ($editorText.Contains($ancre2)) { $ancreUtilisee = $ancre2 }
  if ($hasPublier -and $hasPdfQr) {
    Write-Host "  [=] E-B publierCvActuel + pdfQrDepuisBase : deja presents"
    $helpersInsertes = $true
  } elseif ($hasPdfQr -and -not $hasPublier) {
    Write-Host "  [!] etat inattendu : pdfQrDepuisBase present sans publierCvActuel." -ForegroundColor Red
    Write-Host "  Aucune ecriture. Copiez la sortie et renvoyez-la." -ForegroundColor Yellow
    exit 2
  } elseif ($null -ne $ancreUtilisee) {
    $nbAncre = ([regex]::Matches($editorText, [regex]::Escape($ancreUtilisee))).Count
    if ($nbAncre -gt 1) {
      Write-Host ""
      Write-Host ("  [!] E-B : ancre presente x" + $nbAncre + " dans le createur (declarations en doublon heritees d'anciens patchs) :") -ForegroundColor Yellow
      if ($ancreUtilisee -eq $ancre1) {
        Show-Occurrences $editorText $ancre1 "ancre handlePublishPublicCv"
      } else {
        Show-Occurrences $editorText $ancre2 "ancre buildDossierForCvPdf"
      }
      Write-Host "      -> insertion UNIQUE ; E-C / E-D rebrancheront chaque occurrence utile." -ForegroundColor Yellow
    }
    $idxAncre = -1
    $cherche = 0
    while ($true) {
      $cand = $editorText.IndexOf($ancreUtilisee, $cherche)
      if ($cand -lt 0) { break }
      if (-not (Test-DansBlocCommentaire $editorText $cand)) { $idxAncre = $cand; break }
      $cherche = $cand + $ancreUtilisee.Length
    }
    if ($idxAncre -lt 0) { $idxAncre = $editorText.IndexOf($ancreUtilisee) }
    if (-not $hasPublier) {
      $editorText = $editorText.Substring(0, $idxAncre) + $HelpersCode + $ancreUtilisee + $editorText.Substring($idxAncre + $ancreUtilisee.Length)
      $helpersInsertes = $true
      Write-Host "  [+] E-B publierCvActuel + pdfQrDepuisBase ajoutes (1 insertion)"
    } else {
      $editorText = $editorText.Substring(0, $idxAncre) + $PdfOnlyCode + $ancreUtilisee + $editorText.Substring($idxAncre + $ancreUtilisee.Length)
      $helpersInsertes = $true
      Write-Host "  [+] E-B pdfQrDepuisBase ajoute (1 insertion, publierCvActuel deja present)"
    }
  }

  # --- E-B2 : assurance anti-doublon - un seul bloc helpers au final ---
  $hcCount = ([regex]::Matches($editorText, [regex]::Escape($HelpersCode))).Count
  if ($hcCount -gt 1) {
    $firstHc = $editorText.IndexOf($HelpersCode)
    $avantHc = $editorText.Substring(0, $firstHc + $HelpersCode.Length)
    $apresHc = $editorText.Substring($firstHc + $HelpersCode.Length).Replace($HelpersCode, "")
    $editorText = $avantHc + $apresHc
    Write-Host ("  [!] E-B2 : " + ($hcCount - 1) + " bloc(s) helpers en doublon retire(s).") -ForegroundColor Yellow
  }
'@
 $texte = Apply-Un $texte $AV6 $AP6 "PA06 - F E-B insertion unique + E-B2 anti-doublon"

# ---- PA07 - G E-C collection toutes occurrences (AnyUnpatched) ----
 $AV7 = @'
  $aRebrancher = New-Object System.Collections.Generic.List[string]
  foreach ($h in $publishHandlers) {
    if ($h -eq "publierCvActuel" -or $h -eq "pdfQrDepuisBase") { continue }
    if (-not (Test-HandlerDefined $editorText $h)) { continue }
    $bodyH = Get-FunctionBody $editorText $h
    if ($bodyH.Contains("publierCvActuel")) { continue }
    if (-not $aRebrancher.Contains($h)) { $aRebrancher.Add($h) }
  }
  if ($aRebrancher.Count -eq 0 -and (Test-HandlerDefined $editorText "handlePublishPublicCv")) {
    $bodyOld = Get-FunctionBody $editorText "handlePublishPublicCv"
    if (-not $bodyOld.Contains("publierCvActuel")) { $aRebrancher.Add("handlePublishPublicCv") }
  }
'@
 $AP7 = @'
  $aRebrancher = New-Object System.Collections.Generic.List[string]
  foreach ($h in $publishHandlers) {
    if ($h -eq "publierCvActuel" -or $h -eq "pdfQrDepuisBase") { continue }
    if (-not (Test-HandlerDefined $editorText $h)) { continue }
    if (-not (Test-AnyUnpatchedOccurrence $editorText $h "publierCvActuel")) { continue }
    if (-not $aRebrancher.Contains($h)) { $aRebrancher.Add($h) }
  }
  if ($aRebrancher.Count -eq 0 -and (Test-HandlerDefined $editorText "handlePublishPublicCv")) {
    if (Test-AnyUnpatchedOccurrence $editorText "handlePublishPublicCv" "publierCvActuel") {
      $aRebrancher.Add("handlePublishPublicCv")
    }
  }
'@
 $texte = Apply-Un $texte $AV7 $AP7 "PA07 - G E-C collection toutes occurrences (AnyUnpatched)"

# ---- PA08 - H E-C deja-rebranche (idempotence) ----
 $AV8 = @'
  if ($aRebrancher.Count -eq 0) {
    Write-Host ""
    Write-Host "  [!] AUCUN HANDLER DE PUBLICATION IDENTIFIE (E-C)." -ForegroundColor Red
    Write-Host "  Libelles cherches : '$labelMajPubli', 'Publier en ligne', 'Publier mon CV en ligne'." -ForegroundColor Yellow
    Write-Host "  Aucune ecriture. Copiez TOUTE cette sortie et renvoyez-la." -ForegroundColor Yellow
    Write-Host ""
    foreach ($lblRegex in @([regex]::Escape($labelMajPubli), [regex]::Escape("Publier en ligne"))) {
      $found = [regex]::Matches($editorText, $lblRegex)
      Write-Host ("  '" + $lblRegex + "' : " + $found.Count + " occurrence(s)")
      foreach ($m in $found) {
        $start = [Math]::Max(0, $m.Index - 400)
        $ctx = $editorText.Substring($start, $m.Index - $start).Replace("`r", " ").Replace("`n", " | ")
        Write-Host ("    contexte avant : ..." + $ctx.Substring([Math]::Max(0, $ctx.Length - 200)))
      }
    }
    exit 2
  }
'@
 $AP8 = @'
  if ($aRebrancher.Count -eq 0) {
    $publicationDejaOk = $false
    if (Test-HandlerDefined $editorText "handlePublishPublicCv") {
      if (-not (Test-AnyUnpatchedOccurrence $editorText "handlePublishPublicCv" "publierCvActuel")) {
        $publicationDejaOk = $true
      }
    }
    if (-not $publicationDejaOk -and $editorText.Contains("onClick={publierCvActuel}")) {
      $publicationDejaOk = $true
    }
    if ($publicationDejaOk) {
      Write-Host "  [=] E-C publication : deja rebranchee sur publierCvActuel"
    } else {
      Write-Host ""
      Write-Host "  [!] AUCUN HANDLER DE PUBLICATION IDENTIFIE (E-C)." -ForegroundColor Red
      Write-Host "  Libelles cherches : '$labelMajPubli', 'Publier en ligne', 'Publier mon CV en ligne'." -ForegroundColor Yellow
      Write-Host "  Aucune ecriture. Copiez TOUTE cette sortie et renvoyez-la." -ForegroundColor Yellow
      Write-Host ""
      foreach ($lblRegex in @([regex]::Escape($labelMajPubli), [regex]::Escape("Publier en ligne"))) {
        $found = [regex]::Matches($editorText, $lblRegex)
        Write-Host ("  '" + $lblRegex + "' : " + $found.Count + " occurrence(s)")
        foreach ($m in $found) {
          $start = [Math]::Max(0, $m.Index - 400)
          $ctx = $editorText.Substring($start, $m.Index - $start).Replace("`r", " ").Replace("`n", " | ")
          Write-Host ("    contexte avant : ..." + $ctx.Substring([Math]::Max(0, $ctx.Length - 200)))
        }
      }
      exit 2
    }
  }
'@
 $texte = Apply-Un $texte $AV8 $AP8 "PA08 - H E-C deja-rebranche (idempotence)"

# ---- PA09 - I E-C boucle Replace-FunctionBodyAll ----
 $AV9 = @'
  foreach ($h in $aRebrancher) {
    $sig = Get-Signature $editorText $h
    try {
      $editorText = Replace-FunctionBody -Text $editorText -Signature $sig -NewBody $PubNewBody -Marker "" -Label ("E-C publication '{0}' -> publierCvActuel" -f $h)
    } catch {
      Write-Host ("  [!] E-C : " + $_.Exception.Message) -ForegroundColor Yellow
    }
  }
'@
 $AP9 = @'
  foreach ($h in $aRebrancher) {
    try {
      $editorText = Replace-FunctionBodyAll -Text $editorText -Name $h -NewBody $PubNewBody -Label ("E-C publication '{0}' -> publierCvActuel" -f $h)
    } catch {
      Write-Host ("  [!] E-C : " + $_.Exception.Message) -ForegroundColor Yellow
    }
  }
'@
 $texte = Apply-Un $texte $AV9 $AP9 "PA09 - I E-C boucle Replace-FunctionBodyAll"

# ---- PA10 - J E-D corps deja branche (idempotence) ----
 $AV10 = @'
        $bodyH = Get-FunctionBody $editorText $h
        if ($bodyH.Contains("publierCvActuel") -or $bodyH.Contains("pdfQrDepuisBase")) {
          $editorText = Swap-OnClickAtLabel $editorText $lblRegex $h "pdfQrDepuisBase"
          $pdfHandled = $true
          continue
        }
'@
 $AP10 = @'
        $bodyH = Get-FunctionBody $editorText $h
        if ($bodyH.Contains("pdfQrDepuisBase")) {
          # corps deja branche (idempotent) : rien a changer pour ce handler
          $pdfHandled = $true
          continue
        }
        if ($bodyH.Contains("publierCvActuel")) {
          # handler partage avec la publication : on ne remplace que CE bouton
          $editorText = Swap-OnClickAtLabel $editorText $lblRegex $h "pdfQrDepuisBase"
          $pdfHandled = $true
          continue
        }
'@
 $texte = Apply-Un $texte $AV10 $AP10 "PA10 - J E-D corps deja branche (idempotence)"

# ---- PA11 - K E-D appel Replace-FunctionBodyAll ----
 $AV11 = @'
        try {
          $sig = Get-Signature $editorText $h
          $editorText = Replace-FunctionBody -Text $editorText -Signature $sig -NewBody $PdfNewBody -Marker "" -Label ("E-D PDF QR '{0}' -> pdfQrDepuisBase" -f $h)
          $pdfHandled = $true
        } catch {
          Write-Host ("  [!] E-D : " + $_.Exception.Message) -ForegroundColor Yellow
        }
'@
 $AP11 = @'
        try {
          $editorText = Replace-FunctionBodyAll -Text $editorText -Name $h -NewBody $PdfNewBody -Label ("E-D PDF QR '{0}' -> pdfQrDepuisBase" -f $h)
          $pdfHandled = $true
        } catch {
          Write-Host ("  [!] E-D : " + $_.Exception.Message) -ForegroundColor Yellow
        }
'@
 $texte = Apply-Un $texte $AV11 $AP11 "PA11 - K E-D appel Replace-FunctionBodyAll"

# ---- PA12 - L garde-fou doublon + rapport de position ----
 $AV12 = @'
  if ($nbPublier -ne 1 -or $nbPdfQr -ne 1) {
    Write-Host ""
    Write-Host ("  [!] FONCTIONS EN DOUBLON : publierCvActuel x{0}, pdfQrDepuisBase x{1}." -f $nbPublier, $nbPdfQr) -ForegroundColor Red
    Write-Host "  Aucune ecriture effectuee." -ForegroundColor Yellow
    exit 2
  }
'@
 $AP12 = @'
  if ($nbPublier -ne 1 -or $nbPdfQr -ne 1) {
    Write-Host ""
    Write-Host ("  [!] FONCTIONS EN DOUBLON : publierCvActuel x{0}, pdfQrDepuisBase x{1}." -f $nbPublier, $nbPdfQr) -ForegroundColor Red
    Write-Host "  Rapport de position (diagnostic v2) :"
    Show-Occurrences $editorText "function publierCvActuel" "publierCvActuel"
    Show-Occurrences $editorText "function pdfQrDepuisBase" "pdfQrDepuisBase"
    Show-Occurrences $editorText $ancre1 "ancre handlePublishPublicCv"
    Write-Host "  Aucune ecriture effectuee. Copiez TOUTE cette sortie et renvoyez-la." -ForegroundColor Yellow
    exit 2
  }
'@
 $texte = Apply-Un $texte $AV12 $AP12 "PA12 - L garde-fou doublon + rapport de position"

# ---- PA13 - M protocole T9 (idempotence) ----
 $AV13 = @'
Write-Host "  T8. Relancez ce script sans -SkipTsc : l'etape [5/6] doit montrer"
Write-Host "      PublicResume en forme 'builder' avec le nom/titre a jour."
Write-Host ""
'@
 $AP13 = @'
Write-Host "  T8. Relancez ce script sans -SkipTsc : l'etape [5/6] doit montrer"
Write-Host "      PublicResume en forme 'builder' avec le nom/titre a jour."
Write-Host "  T9. Relancez ce script une 2e fois : toutes les etapes doivent"
Write-Host "      afficher [=] deja present (idempotent, aucune 2e insertion)."
Write-Host ""
'@
 $texte = Apply-Un $texte $AV13 $AP13 "PA13 - M protocole T9 (idempotence)"

# --- controle final par empreinte (garantie du contenu v2 exact) ---
if (-not $texte.EndsWith("`n")) { $texte += "`n" }
 $Utf8Bom = New-Object System.Text.UTF8Encoding($true)
 $octetsFin = $Utf8Bom.GetBytes($texte)
 $sha = [System.Security.Cryptography.SHA256]::Create()
 $hash = ([System.BitConverter]::ToString($sha.ComputeHash($octetsFin))).Replace("-", "").ToLowerInvariant()
if ($hash -ne "30d034f7671434ff54d4d50f09bae080c742b7fa4c57e1524f3cbb1edcde376e") {
  Write-Host ""
  Write-Host "  [!] RESULTAT INATTENDU (empreinte differente de la v2 de reference)." -ForegroundColor Red
  Write-Host "  Aucune ecriture effectuee - votre fichier est intact." -ForegroundColor Yellow
  Write-Host "  Copiez TOUTE cette sortie et renvoyez-la, ou utilisez le plan B." -ForegroundColor Yellow
  exit 2
}

 $bak = $full + ".bak-v1-" + $stamp
[System.IO.File]::WriteAllBytes($bak, $octetsOriginaux)
[System.IO.File]::WriteAllBytes($full, $octetsFin)

Write-Host ""
Write-Host ("  [BAK] sauvegarde v1 : " + $cible + ".bak-v1-" + $stamp)
Write-Host ("  [OK] v2 ecrite : " + $cible + " (UTF-8 BOM, LF) - empreinte verifiee.")
Write-Host ""
Write-Host " PROCHAINES ETAPES :"
Write-Host "  1) powershell -ExecutionPolicy Bypass -File .\sync-publication-cv.ps1 -DiagnostiqueSeul"
Write-Host "     (lecture seule : montre les occurrences de l'ancre et des handlers)"
Write-Host "  2) powershell -ExecutionPolicy Bypass -File .\sync-publication-cv.ps1"
Write-Host "  3) relancez l'etape 2 : toutes les etapes doivent afficher [=]."