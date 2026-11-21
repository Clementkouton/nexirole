#Requires -Version 5.1
<#
=====================================================================
 NEXIROLE — Restauration du CV Builder ORIGINAL + intégration du bloc
 « Lien Web Public & QR Code » (100 % additif, non destructif)
=====================================================================
 Contexte : le commit 84c499b a remplacé le contenu de 2 fichiers et a
 supprimé l'aperçu temps réel, les 6 étapes et les 4 modèles du CV
 Builder. Ce script :
   [1/4] restaure EXACTEMENT ces 2 fichiers depuis l'historique git
         (commit fc3eb9b = votre version d'origine) — repli auto sur
         les sauvegardes .bak-builder / .bak-pdf ;
   [2/4] réintègre le bloc « Lien Web Public & QR Code » SANS toucher
         au reste (étapes, modèles, aperçu live, impression) ;
   [3/4] ajoute dans CvPdfDocument.tsx : QR optionnel + mention
         « Version en ligne » + DOUBLE EXPORT (nommé + default) +
         type DossierData local (corrige TS2305 dans ce fichier) ;
   [4/4] étend le normaliseur de /u/[slug]/page.tsx à la structure
         du builder (cv / candidateName / contact / achievements).
 Garanties :
   - chaque patch vérifie son ancre (unique) AVANT d'écrire ;
   - écriture UTF-8 SANS BOM, fins de ligne LF ;
   - ancre manquante ou dérive du fichier => ABANDON immédiat.
 Exécution (PowerShell 5.1, depuis la racine du projet) :
   .\restaurer-et-integrer-cv-public.ps1
=====================================================================
#>

$ErrorActionPreference = "Stop"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-TextFile {
  param([string]$Path, [string]$Content)
  [System.IO.File]::WriteAllText((Join-Path (Get-Location).Path $Path), $Content, $Utf8NoBom)
}

function Read-TextFile {
  param([string]$Path)
  return [System.IO.File]::ReadAllText((Join-Path (Get-Location).Path $Path))
}

function Test-Uffid {
  param([string]$Text, [string]$Label)
  if ($Text.Contains([string][char]0xFFFD)) {
    throw "Caracteres corrompus (U+FFFD) detectes dans $Label - encodage casse. Abandon."
  }
}

function Apply-Patch {
  param([string]$Text, [string]$Label, [string]$Find, [string]$Replace)
  $Find = $Find.Replace("`r`n", "`n")
  $Replace = $Replace.Replace("`r`n", "`n")
  if ($Replace -ne "" -and $Text.Contains($Replace)) {
    Write-Host "  [=] $Label : deja applique, ignore"
    return $Text
  }
  if (-not $Text.Contains($Find)) {
    throw "ANCRE INTROUVABLE [$Label]. Le fichier a probablement derive. Abandon."
  }
  $count = ([regex]::Matches($Text, [regex]::Escape($Find))).Count
  if ($count -ne 1) {
    throw "ANCRE NON UNIQUE [$Label] ($count occurrences). Abandon."
  }
  Write-Host "  [+] $Label"
  return $Text.Replace($Find, $Replace)
}

function Restore-FromGit {
  param([string]$RelPath, [string]$BakFile, [string]$Marker)
  $content = $null
  try {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "git"
    $psi.Arguments = "show fc3eb9b:$RelPath"
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $proc = [System.Diagnostics.Process]::Start($psi)
    $out = $proc.StandardOutput.ReadToEnd()
    $null = $proc.StandardError.ReadToEnd()
    $proc.WaitForExit()
    if ($proc.ExitCode -eq 0 -and $out.Length -gt 5000) { $content = $out }
    else { Write-Host "  [!] git show fc3eb9b:$RelPath indisponible" }
  } catch {
    Write-Host "  [!] git indisponible : $($_.Exception.Message)"
  }
  if ($null -eq $content -and (Test-Path -LiteralPath $BakFile)) {
    Write-Host "  [i] Repli sur la sauvegarde $BakFile"
    $content = Read-TextFile $BakFile
  }
  if ($null -eq $content) {
    throw "RESTAURATION IMPOSSIBLE pour $RelPath (ni git fc3eb9b ni $BakFile)."
  }
  $content = $content.Replace("`r`n", "`n")
  Test-Uffid $content $RelPath
  if (-not $content.Contains($Marker)) {
    throw "Contenu inattendu dans $RelPath (marqueur absent). Abandon."
  }
  Write-TextFile $RelPath $content
  Write-Host ("  [OK] restaure : " + $RelPath + " (" + $content.Length + " caracteres)")
  return $content
}

function Assert-Contains {
  param([string]$Text, [string]$Needle, [string]$Label)
  if (-not $Text.Contains($Needle)) { throw "VERIFICATION ECHOUEE : $Label" }
}

Write-Host "=============================================================="
Write-Host " NEXIROLE - Restauration CV Builder original + bloc CV public"
Write-Host "=============================================================="

if (-not (Test-Path -LiteralPath "package.json")) {
  throw "Lancez ce script depuis la racine du projet (package.json introuvable)."
}

Write-Host "`n[1/4] Lecture des fichiers (builder + CvPdfDocument restaures depuis fc3eb9b)…"
$builder = Restore-FromGit "src/app/dashboard/cv-builder/page.tsx" "src/app/dashboard/cv-builder/page.tsx.bak-builder" "Design & modèle"
$pdfDoc = Restore-FromGit "src/components/pdf/CvPdfDocument.tsx" "src/components/pdf/CvPdfDocument.tsx.bak-pdf" "headerVariant"

$uSlugPath = "src/app/u/[slug]/page.tsx"
$uSlug = Read-TextFile $uSlugPath
$uSlug = $uSlug.Replace("`r`n", "`n")
Test-Uffid $uSlug $uSlugPath
if (-not $uSlug.Contains("normalizeCvData")) {
  throw "Contenu inattendu dans $uSlugPath (normaliseur absent). Abandon."
}
Write-Host "  [OK] lu : $uSlugPath"

Write-Host "`n[2/4] CvPdfDocument.tsx - QR optionnel + double export (nomme + default)…"
$__f = @'
import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { DossierData } from "@/lib/types";
import { getTemplate, type TemplateId } from "@/lib/cv-templates";
'@
$__r = @'
import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { getTemplate, type TemplateId } from "@/lib/cv-templates";

/* Résistance aux imports — DossierData défini LOCALEMENT et réexporté.
   L'import historique depuis "@/lib/types" (champ absent de ce module,
   erreur TS2305) est remplacé par cette définition structurellement
   identique : le fichier compile même si @/lib/types change ou n'exporte
   jamais ce type. */
export interface DossierData {
  identite: {
    nom_complet: string;
    email: string;
    telephone: string;
    ville: string;
    linkedin: string;
  };
  titre: string;
  resume: string;
  experiences: Array<{
    poste: string;
    periode: string;
    entreprise: string;
    lieu: string;
    missions: string[];
  }>;
  formations: Array<{
    diplome: string;
    periode: string;
    etablissement: string;
  }>;
  competences: string[];
  langues: Array<{ nom: string; niveau: string }>;
}
'@
$pdfDoc = Apply-Patch $pdfDoc "imports propres + interface DossierData locale + réexport" $__f $__r
$__f = @'
interface CvPdfDocumentProps {
  data: DossierData;
  templateId: TemplateId;
  photo?: string | null;
}
'@
$__r = @'
export interface CvPdfDocumentProps {
  data: DossierData;
  templateId: TemplateId;
  photo?: string | null;
  /** Data URL du QR code pointant vers la page publique (/u/<slug>). */
  qrDataUrl?: string | null;
  /** URL publique affichée sous le QR code (optionnelle). */
  onlineUrl?: string | null;
}
'@
$pdfDoc = Apply-Patch $pdfDoc "props étendues (qrDataUrl, onlineUrl) exportées" $__f $__r
$__f = @'
export function CvPdfDocument({ data, templateId, photo }: CvPdfDocumentProps) {
'@
$__r = @'
export function CvPdfDocument({
  data,
  templateId,
  photo,
  qrDataUrl,
  onlineUrl,
}: CvPdfDocumentProps) {
'@
$pdfDoc = Apply-Patch $pdfDoc "signature du composant" $__f $__r
$__f = @'
    langLine: { fontSize: 9.2, color: t.text, marginBottom: 2 },
  });
'@
$__r = @'
    langLine: { fontSize: 9.2, color: t.text, marginBottom: 2 },
    /* QR « Version en ligne » */
    qrRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginBottom: 12,
    },
    qrCard: {
      alignItems: "center",
      padding: 6,
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: 6,
      backgroundColor: "#ffffff",
    },
    qrImage: { width: 56, height: 56 },
    qrText: { fontSize: 6.5, color: t.navy, marginTop: 4, fontWeight: "bold" },
    qrUrl: { fontSize: 5.5, color: t.muted, marginTop: 1 },
  });
'@
$pdfDoc = Apply-Patch $pdfDoc "styles QR" $__f $__r
$__f = @'
        {data.resume ? (
'@
$__r = @'
        {/* QR « Version en ligne » — optionnel (qrDataUrl) */}
        {qrDataUrl ? (
          <View style={styles.qrRow} wrap={false}>
            <View style={styles.qrCard}>
              <Image src={qrDataUrl} style={styles.qrImage} />
              <Text style={styles.qrText}>Version en ligne</Text>
              {onlineUrl ? (
                <Text style={styles.qrUrl}>
                  {onlineUrl.replace(/^https?:\/\//, "").slice(0, 40)}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {data.resume ? (
'@
$pdfDoc = Apply-Patch $pdfDoc "rendu QR avant la section Résumé" $__f $__r
if (-not $pdfDoc.Contains("export default CvPdfDocument")) {
  $__r = @'

/* Résistance aux imports — double export : le composant est disponible en
   nommé (import { CvPdfDocument }) ET par défaut (import CvPdfDocument),
   quel que soit le style des fichiers appelants (pdf-client, builder…). */
export default CvPdfDocument;

'@
  $pdfDoc = $pdfDoc.TrimEnd() + "`n" + $__r
  Write-Host "  [+] double export par défaut"
}

Write-Host "`n[3/4] cv-builder - bloc « Lien Web Public & QR Code » (additif)…"
$__f = @'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
'@
$__r = @'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from "react";
'@
$builder = Apply-Patch $builder "import react + ComponentType" $__f $__r
$__f = @'
  IconCirclePlus,
  IconDeviceFloppy,
'@
$__r = @'
  IconCirclePlus,
  IconCopy,
  IconDeviceFloppy,
'@
$builder = Apply-Patch $builder "icône IconCopy" $__f $__r
$__f = @'
  IconDownload,
  IconId,
'@
$__r = @'
  IconDownload,
  IconEye,
  IconId,
'@
$builder = Apply-Patch $builder "icône IconEye" $__f $__r
$__f = @'
  IconLanguage,
  IconLoader2,
'@
$__r = @'
  IconLanguage,
  IconLink,
  IconLoader2,
'@
$builder = Apply-Patch $builder "icône IconLink" $__f $__r
$__f = @'
  IconPrinter,
  IconSchool,
'@
$__r = @'
  IconPrinter,
  IconQrcode,
  IconSchool,
'@
$builder = Apply-Patch $builder "icône IconQrcode" $__f $__r
$__f = @'
  IconWand,
  IconX,
'@
$__r = @'
  IconWand,
  IconWorld,
  IconX,
'@
$builder = Apply-Patch $builder "icône IconWorld" $__f $__r
$__f = @'
      setDownloading(false);
    }
  }
'@
$__r = @'
      setDownloading(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  CV public partageable — lien web + QR code (bloc additif)         */
  /* ---------------------------------------------------------------- */

  const [siteOrigin, setSiteOrigin] = useState("");
  const [pubSlug, setPubSlug] = useState<string | null>(null);
  const [pubUrl, setPubUrl] = useState<string | null>(null);
  const [pubViews, setPubViews] = useState<number | null>(null);
  const [pubLoading, setPubLoading] = useState(false);
  const [pubError, setPubError] = useState<string | null>(null);
  const [pubCopied, setPubCopied] = useState(false);
  const [showQrOnPdf, setShowQrOnPdf] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrDownloading, setQrDownloading] = useState(false);

  /* Origine du site (client uniquement — évite tout écart d'hydratation). */
  useEffect(() => {
    setSiteOrigin(window.location.origin.replace(/\/+$/, ""));
  }, []);

  /* Configuration existante (slug, lien, vues) au chargement de la page. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/public-cv", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as
          | {
              publicResume?: {
                slug?: string;
                viewsCount?: number;
                publicUrl?: string;
              } | null;
            }
          | null;
        if (cancelled || !json?.publicResume?.slug) return;
        setPubSlug(json.publicResume.slug);
        setPubUrl(json.publicResume.publicUrl ?? null);
        setPubViews(
          typeof json.publicResume.viewsCount === "number"
            ? json.publicResume.viewsCount
            : 0
        );
      } catch {
        /* serveur injoignable : le bloc reste en mode « non publié » */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Bascule QR persistée dans localStorage. */
  useEffect(() => {
    try {
      if (window.localStorage.getItem("nexirole-cv-qr-toggle") === "1") {
        setShowQrOnPdf(true);
      }
    } catch {
      /* stockage indisponible : on ignore */
    }
  }, []);

  /* Génération locale du QR (data URL navy #051937 / blanc). */
  useEffect(() => {
    if (!showQrOnPdf || !pubSlug) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const QRCode = (await import("qrcode")).default;
        const url = pubUrl ?? `${window.location.origin}/u/${pubSlug}`;
        const dataUrl = await QRCode.toDataURL(url, {
          color: { dark: "#051937", light: "#FFFFFF" },
          width: 512,
          margin: 1,
        });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch {
        if (!cancelled) setQrDataUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showQrOnPdf, pubSlug, pubUrl]);

  function toggleShowQrOnPdf() {
    setShowQrOnPdf((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("nexirole-cv-qr-toggle", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  /* Design du builder → templateId de la base PublicResume. */
  function mapDesignTemplate(id: "modern" | "sleek" | "bold" | "clean"): string {
    if (id === "sleek") return "sleek-executive";
    if (id === "bold") return "bold-minimalism";
    if (id === "clean") return "clean-ats";
    return "modern-accent";
  }

  /* Charge utile publiée : même structure que l'export ATS serveur. */
  function buildPublicCvPayload(): Record<string, unknown> {
    return {
      cv: {
        title: data.personal.title.trim() || "Candidat",
        summary: data.summary.trim(),
        experiences: data.experiences
          .filter((e) => e.role.trim() || e.company.trim())
          .map((e) => ({
            role: e.role.trim() || "Poste",
            company: e.company.trim() || "Entreprise",
            period: e.period.trim(),
            location: e.location.trim(),
            achievements: e.achievements.map((a) => a.trim()).filter(Boolean),
          })),
        education: data.education
          .filter((e) => e.degree.trim() || e.school.trim())
          .map((e) => ({
            degree: e.degree.trim() || "Diplôme",
            school: e.school.trim(),
            period: e.period.trim(),
          })),
        skills: data.skills,
        languages: data.languages
          .filter((l) => l.name.trim())
          .map((l) => ({ name: l.name.trim(), level: l.level.trim() || "Courant" })),
        keywordsMatched: [],
      },
      candidateName: data.personal.fullName.trim(),
      contact: {
        email: data.personal.email.trim(),
        phone: data.personal.phone.trim(),
        location: data.personal.location.trim(),
        linkedin: data.personal.linkedin.trim(),
      },
      showQrOnPdf,
    };
  }

  async function handlePublishPublicCv() {
    if (!data.personal.fullName.trim()) {
      toast.error("Renseignez votre nom complet (étape 1) avant la publication.");
      setStep(0);
      return;
    }
    setPubLoading(true);
    setPubError(null);
    try {
      const res = await fetch("/api/public-cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cvData: buildPublicCvPayload(),
          templateId: mapDesignTemplate(design.template),
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | {
            publicResume?: { slug?: string; viewsCount?: number; publicUrl?: string };
            error?: string;
          }
        | null;
      if (!res.ok || !json?.publicResume?.slug) {
        const message =
          json?.error ?? `Publication impossible (code ${res.status}). Réessayez.`;
        setPubError(message);
        toast.error(message);
        return;
      }
      setPubSlug(json.publicResume.slug);
      setPubUrl(json.publicResume.publicUrl ?? null);
      setPubViews(
        typeof json.publicResume.viewsCount === "number"
          ? json.publicResume.viewsCount
          : 0
      );
      toast.success("CV publié en ligne ! Le lien est copiable ci-dessous.");
    } catch {
      const message =
        "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.";
      setPubError(message);
      toast.error(message);
    } finally {
      setPubLoading(false);
    }
  }

  async function handleCopyPublicLink() {
    if (!pubSlug) return;
    const url = pubUrl ?? `${siteOrigin || window.location.origin}/u/${pubSlug}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const area = document.createElement("textarea");
        area.value = url;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      setPubCopied(true);
      toast.success("Lien public copié !");
      window.setTimeout(() => setPubCopied(false), 2500);
    } catch {
      toast.error(`Copie impossible — copiez manuellement : ${url}`);
    }
  }

  /* Données au format attendu par CvPdfDocument (@react-pdf/renderer). */
  function buildDossierForCvPdf(): {
    identite: {
      nom_complet: string;
      email: string;
      telephone: string;
      ville: string;
      linkedin: string;
    };
    titre: string;
    resume: string;
    experiences: Array<{
      poste: string;
      periode: string;
      entreprise: string;
      lieu: string;
      missions: string[];
    }>;
    formations: Array<{
      diplome: string;
      periode: string;
      etablissement: string;
    }>;
    competences: string[];
    langues: Array<{ nom: string; niveau: string }>;
  } {
    return {
      identite: {
        nom_complet: data.personal.fullName.trim() || "Candidat",
        email: data.personal.email.trim(),
        telephone: data.personal.phone.trim(),
        ville: data.personal.location.trim(),
        linkedin: data.personal.linkedin.trim(),
      },
      titre: data.personal.title.trim() || "Candidat",
      resume: data.summary.trim(),
      experiences: data.experiences
        .filter((e) => e.role.trim() || e.company.trim())
        .map((e) => ({
          poste: e.role.trim() || "Poste",
          periode: e.period.trim(),
          entreprise: e.company.trim() || "Entreprise",
          lieu: e.location.trim(),
          missions: e.achievements.map((a) => a.trim()).filter(Boolean),
        })),
      formations: data.education
        .filter((e) => e.degree.trim() || e.school.trim())
        .map((e) => ({
          diplome: e.degree.trim() || "Diplôme",
          periode: e.period.trim(),
          etablissement: e.school.trim(),
        })),
      competences: data.skills.filter((s) => s.trim() !== ""),
      langues: data.languages
        .filter((l) => l.name.trim() !== "")
        .map((l) => ({ nom: l.name.trim(), niveau: l.level.trim() || "Courant" })),
    };
  }

  /* PDF @react-pdf/renderer AVEC QR code — imports dynamiques résilients :
     accepte l'export nommé OU l'export par défaut du module. */
  async function handleDownloadPdfWithQr() {
    if (!data.personal.fullName.trim()) {
      toast.error("Renseignez votre nom complet (étape 1) avant l'export.");
      setStep(0);
      return;
    }
    if (!pubSlug) {
      toast.error("Publiez d'abord votre CV en ligne : le QR code pointera vers cette page.");
      return;
    }
    setQrDownloading(true);
    try {
      const publicUrl = pubUrl ?? `${window.location.origin}/u/${pubSlug}`;
      const QRCode = (await import("qrcode")).default;
      const qr = await QRCode.toDataURL(publicUrl, {
        color: { dark: "#051937", light: "#FFFFFF" },
        width: 512,
        margin: 1,
      });
      const [{ pdf }, docModule] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/pdf/CvPdfDocument"),
      ]);
      type DocProps = {
        data: Record<string, unknown>;
        templateId: string;
        photo?: string | null;
        qrDataUrl?: string | null;
        onlineUrl?: string | null;
      };
      const candidates = docModule as unknown as {
        CvPdfDocument?: ComponentType<DocProps>;
        default?: ComponentType<DocProps>;
      };
      const DocComponent = candidates.CvPdfDocument ?? candidates.default ?? null;
      if (!DocComponent) {
        throw new Error("Composant PDF introuvable (ni export nommé ni export par défaut).");
      }
      const blob = await pdf(
        (
          <DocComponent
            data={buildDossierForCvPdf()}
            templateId={mapDesignTemplate(design.template)}
            photo={null}
            qrDataUrl={qr}
            onlineUrl={publicUrl}
          />
        ) as unknown as Parameters<typeof pdf>[0]
      ).toBlob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `CV-NexiRole-QR-${
        data.personal.fullName.trim().replace(/[^a-zA-Z0-9]+/g, "-") || "NexiRole"
      }.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      toast.success("PDF avec QR code téléchargé.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "La génération du PDF avec QR a échoué."
      );
    } finally {
      setQrDownloading(false);
    }
  }
'@
$builder = Apply-Patch $builder "bloc état + gestionnaires CV public" $__f $__r
$__f = @'
            </div>
          </div>

          {/* Colonne aperçu */}
'@
$__r = @'
            </div>

            {/* CV public partageable — lien web + QR code (bloc additif, ne touche à rien d'autre) */}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gold-soft text-accent-foreground">
                    <IconLink className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-navy">
                      Lien Web Public &amp; QR Code
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      Publiez votre CV sur une page web NexiRole, QR code inclus.
                    </p>
                  </div>
                </div>
                {pubSlug !== null && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    En ligne
                  </span>
                )}
              </div>

              {pubError !== null && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
                  <IconAlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  <span className="flex-1">{pubError}</span>
                </div>
              )}

              {pubSlug === null ? (
                <Button
                  type="button"
                  onClick={handlePublishPublicCv}
                  disabled={pubLoading}
                  className="mt-3 h-10 w-full rounded-xl bg-gold px-4 text-sm font-bold text-navy hover:bg-gold-dark disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pubLoading ? (
                    <IconLoader2 className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <IconWorld className="mr-1.5 size-4" />
                  )}
                  {pubLoading ? "Publication en cours…" : "Publier mon CV en ligne"}
                </Button>
              ) : (
                <>
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <code className="min-w-0 flex-1 truncate text-xs font-semibold text-navy">
                      {pubUrl ??
                        (siteOrigin !== "" ? `${siteOrigin}/u/${pubSlug}` : `/u/${pubSlug}`)}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyPublicLink}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-navy px-2.5 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-navy-800"
                      title="Copier le lien public"
                    >
                      {pubCopied ? (
                        <IconCheck className="size-3.5 text-gold" />
                      ) : (
                        <IconCopy className="size-3.5 text-gold" />
                      )}
                      {pubCopied ? "Copié" : "Copier"}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <IconEye className="size-3.5 text-gold-dark" />
                      {pubViews ?? 0} vue{(pubViews ?? 0) > 1 ? "s" : ""}
                    </span>
                    <a
                      href={`/u/${pubSlug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-navy underline decoration-gold decoration-2 underline-offset-4"
                    >
                      Ouvrir ma page publique
                    </a>
                  </div>
                </>
              )}

              <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-navy/40">
                <span className="flex items-center gap-2">
                  <IconQrcode className="size-4 text-navy" />
                  <span className="text-xs font-semibold text-navy">
                    Afficher le QR Code sur mon PDF
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={showQrOnPdf}
                  onChange={toggleShowQrOnPdf}
                  className="size-4 accent-[#FFC107]"
                  aria-label="Afficher le QR Code sur mon PDF"
                />
              </label>

              {showQrOnPdf && pubSlug === null && (
                <p className="mt-1.5 px-1 text-[11px] text-amber-700">
                  Publiez d&apos;abord votre CV : le QR code pointera vers votre page publique.
                </p>
              )}

              {showQrOnPdf && pubSlug !== null && (
                <Button
                  type="button"
                  onClick={handleDownloadPdfWithQr}
                  disabled={qrDownloading}
                  className="mt-2 h-10 w-full rounded-xl border border-gold bg-white px-4 text-sm font-bold text-navy hover:bg-gold-soft disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {qrDownloading ? (
                    <IconLoader2 className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <IconQrcode className="mr-1.5 size-4 text-accent-foreground" />
                  )}
                  {qrDownloading ? "Génération du PDF…" : "Télécharger le PDF avec QR code"}
                </Button>
              )}

              <p className="mt-2 px-1 text-[10px] leading-relaxed text-slate-400">
                Le lien ci-dessus fonctionne en local comme en production
                (nexirole.vercel.app/u/…). Le QR code du PDF ouvre cette page sur mobile.
              </p>
            </div>
          </div>

          {/* Colonne aperçu */}
'@
$builder = Apply-Patch $builder "carte Lien Web Public & QR Code" $__f $__r
$__f = @'
                background: "#ffffff",
              }}
            >
              <CvSheet data={data} design={design} />
'@
$__r = @'
                background: "#ffffff",
                position: "relative",
              }}
            >
              <CvSheet data={data} design={design} />
              {showQrOnPdf && qrDataUrl !== null && (
                /* QR « Version en ligne » imprimé en haut à droite — posé sur le
                   conteneur d'impression : aucun modèle de CV n'est modifié. */
                <div
                  style={{
                    position: "absolute",
                    top: "8mm",
                    right: "8mm",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "1.2mm",
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "1.5mm",
                    padding: "1.8mm",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrDataUrl}
                    alt="QR code — version en ligne du CV"
                    style={{ width: "20mm", height: "20mm", display: "block" }}
                  />
                  <span
                    style={{
                      fontSize: "6.5px",
                      fontWeight: 700,
                      color: "#051937",
                      letterSpacing: "0.05em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Version en ligne
                  </span>
                </div>
              )}
'@
$builder = Apply-Patch $builder "QR imprimé dans le portail d'impression" $__f $__r

Write-Host "`n[4/4] /u/[slug]/page.tsx - normaliseur etendu au format builder…"
$__f = @'
  const record = asRecord(raw) ?? {};
'@
$__r = @'
  const record = asRecord(raw) ?? {};
  /* Enveloppe du CV Builder : { cv: {...}, candidateName, contact } */
  const root = asRecord(record.cv) ?? record;
'@
$uSlug = Apply-Patch $uSlug "enveloppe cv/candidateName/contact (root)" $__f $__r
$__f = @'
asRecord(record.identite) ?? asRecord(record.identity) ?? asRecord(record.contact) ?? record;
'@
$__r = @'
asRecord(root.identite) ?? asRecord(root.identity) ?? asRecord(root.contact) ?? root;
'@
$uSlug = Apply-Patch $uSlug "chaîne identité sur root" $__f $__r
$__f = @'
["fullName", "nomComplet", "nom", "name", "fullname"]
'@
$__r = @'
["fullName", "nomComplet", "nom_complet", "nom", "name", "fullname"]
'@
$uSlug = Apply-Patch $uSlug "clé nom_complet reconnue" $__f $__r
$__f = @'
    fullName = [prenom, nom].filter(Boolean).join(" ").trim();
  }
'@
$__r = @'
    fullName = [prenom, nom].filter(Boolean).join(" ").trim();
  }
  if (fullName === "") {
    /* Enveloppe du builder : le nom complet peut venir de candidateName. */
    fullName = pickString(record, ["candidateName", "nomCandidat"]);
  }
'@
$uSlug = Apply-Patch $uSlug "repli candidateName pour le nom complet" $__f $__r
$__f = @'
  const contact = asRecord(identity.contact) ?? identity;
'@
$__r = @'
  const contact = asRecord(identity.contact) ?? asRecord(record.contact) ?? identity;
'@
$uSlug = Apply-Patch $uSlug "contact au niveau racine de l'enveloppe" $__f $__r
$__f = @'
const summary = pickString(record, ["resume", "résumé", "summary", "profil", "about", "resumePro"]);
'@
$__r = @'
const summary = pickString(root, ["resume", "résumé", "summary", "profil", "about", "resumePro"]);
'@
$uSlug = Apply-Patch $uSlug "résumé lu sur root" $__f $__r
$__f = @'
    record.experiences ?? record.experience ?? record.experiencesPro,
'@
$__r = @'
    root.experiences ?? root.experience ?? record.experiencesPro,
'@
$uSlug = Apply-Patch $uSlug "expériences lues sur root" $__f $__r
$__f = @'
description: asTextOrList(entry.description ?? entry.details ?? entry.detail),
'@
$__r = @'
description: asTextOrList(
        entry.description ??
          entry.details ??
          entry.detail ??
          entry.achievements ??
          entry.missions,
      ),
'@
$uSlug = Apply-Patch $uSlug "réalisations/missions reconnues comme description" $__f $__r
$__f = @'
asArray(record.formations ?? record.education ?? record.etudes)
'@
$__r = @'
asArray(root.formations ?? root.education ?? record.etudes)
'@
$uSlug = Apply-Patch $uSlug "formations lues sur root" $__f $__r
$__f = @'
  const rawCompetences = record.competences ?? record.skills ?? record.competencesCles ?? [];
'@
$__r = @'
  const rawCompetences = root.competences ?? root.skills ?? record.competencesCles ?? [];
'@
$uSlug = Apply-Patch $uSlug "compétences lues sur root" $__f $__r
$__f = @'
  const langues: LangueNorm[] = asArray(record.langues ?? record.languages)
'@
$__r = @'
  const langues: LangueNorm[] = asArray(root.langues ?? root.languages)
'@
$uSlug = Apply-Patch $uSlug "langues lues sur root" $__f $__r

# ------------------------------------------------------------------
# Verifications finales (avant ecriture)
# ------------------------------------------------------------------
Assert-Contains $pdfDoc "export function CvPdfDocument" "export nomme present"
Assert-Contains $pdfDoc "export default CvPdfDocument" "export default present"
Assert-Contains $pdfDoc "export interface DossierData" "type DossierData local present"
Assert-Contains $pdfDoc "qrDataUrl" "prop QR presente"
Assert-Contains $pdfDoc "Version en ligne" "mention Version en ligne presente"
Assert-Contains $builder "Lien Web Public" "bloc public present"
Assert-Contains $builder "handlePublishPublicCv" "gestionnaire publication present"
Assert-Contains $builder "handleDownloadPdfWithQr" "gestionnaire PDF+QR present"
Assert-Contains $builder "IconQrcode" "icones QR presentes"
Assert-Contains $builder "Design & modèle" "etape 6 Design & modele intacte"
Assert-Contains $builder "Aperçu temps réel" "apercu temps reel intact"
Assert-Contains $builder "handlePrint" "impression navigateur intacte"
Assert-Contains $builder "renderStep" "etapes du formulaire intactes"
Assert-Contains $builder "TemplateSleek" "modeles intactes"
Assert-Contains $builder "createPortal" "portail d'impression intact"
Assert-Contains $uSlug "candidateName" "normaliseur etendu (candidateName)"
Assert-Contains $uSlug "root.experiences" "normaliseur etendu (root)"
Assert-Contains $uSlug "nom_complet" "normaliseur etendu (nom_complet)"

Write-TextFile "src/components/pdf/CvPdfDocument.tsx" $pdfDoc
Write-TextFile "src/app/dashboard/cv-builder/page.tsx" $builder
Write-TextFile $uSlugPath $uSlug

Write-Host "`n=============================================================="
Write-Host " TERMINE - 3 fichiers mis a jour, contenu original preserve."
Write-Host "=============================================================="
Write-Host "`nChangements (git diff --stat) :"
git diff --stat
Write-Host ""
Write-Host "Prochaines etapes :"
Write-Host "  1) npx prisma db push     <- CREE LA TABLE PublicResume DANS NEON"
Write-Host "     (cause probable de l'erreur precedente « Echec de la publication »)"
Write-Host "  2) npx prisma generate"
Write-Host "  3) Redemarrez le serveur : Ctrl+C puis npm run dev"
Write-Host "  4) Testez http://localhost:3000/dashboard/cv-builder"
