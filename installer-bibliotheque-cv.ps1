#Requires -Version 5.1
<#
=====================================================================
 NEXIROLE - Bibliotheque de CV du createur (installation complete)
=====================================================================
 CE SCRIPT (conforme AGENTS.md - chirurgical, idempotent, sauvegardes):
   [1/6] environnement : package.json, prisma singleton, paquet qrcode
   [2/6] schema.prisma : modele CvDocument + relation User (bak),
         puis npx prisma generate (sauf -SkipGenerate)
   [3/6] deplacement du createur : src/app/dashboard/cv-builder/page.tsx
         -> createur/page.tsx (bak), puis patchs ancres :
           P1 = synchronisation base de donnees (hydratation ?cv=<id>,
                sauvegarde auto 900 ms, migration du CV local)
           P2 = entete (lien Ma bibliotheque + statut d'enregistrement)
   [4/6] ecriture de la bibliotheque : hub page.tsx, 5 routes API
         (/api/cv, [id], restore, purge, /api/public-cv/pdf), lib de
         publication, declaration de types qrcode
   [5/6] redirection du bouton PDF public : format=pdf -> /api/public-cv/pdf
   [6/6] verification (npx tsc --noEmit sauf -SkipTsc) + protocole test

 EXECUTION (PowerShell 5.1, depuis la racine du projet) :
   powershell -ExecutionPolicy Bypass -File .\installer-bibliotheque-cv.ps1

 APRES LE SCRIPT (obligatoire) : npx prisma db push  (cree la table)
 ROLLBACK : restaurer les fichiers .bak-* crees a cote des cibles.
=====================================================================
#>

param(
    [switch]$SkipTsc,
    [switch]$SkipGenerate
)

$ErrorActionPreference = "Stop"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Lf = [string][char]10
$CrLf = [string][char]13 + [string][char]10

function Write-TextFile {
  param([string]$Path, [string]$Content)
  $full = [System.IO.Path]::Combine((Get-Location).Path, $Path)
  $dir = [System.IO.Path]::GetDirectoryName($full)
  if (-not [System.IO.Directory]::Exists($dir)) {
    [System.IO.Directory]::CreateDirectory($dir) | Out-Null
  }
  [System.IO.File]::WriteAllText($full, $Content, $Utf8NoBom)
}

function Read-TextFile {
  param([string]$Path)
  return [System.IO.File]::ReadAllText((Join-Path (Get-Location).Path $Path))
}

function Backup-File {
  param([string]$Path, [string]$Tag)
  $full = [System.IO.Path]::Combine((Get-Location).Path, $Path)
  if ([System.IO.File]::Exists($full)) {
    $bak = "$Path.bak-$Tag-$stamp"
    $bakFull = [System.IO.Path]::Combine((Get-Location).Path, $bak)
    [System.IO.File]::Copy($full, $bakFull, $true)
    Write-Host ("  [BAK] " + $Path + " -> " + $bak)
    return $bak
  }
  return $null
}

function Test-Uffid {
  param([string]$Text, [string]$Label)
  if ($Text.Contains([string][char]0xFFFD)) {
    throw "Caracteres corrompus (U+FFFD) detectes dans $Label - encodage casse. Abandon."
  }
}

function Normalize-Lf {
  param([string]$Text)
  return $Text.Replace($CrLf, $Lf)
}

function Apply-Patch {
  param([string]$Text, [string]$Label, [string]$Find, [string]$Replace)
  $Find = Normalize-Lf $Find
  $Replace = Normalize-Lf $Replace
  if ($Text.Contains($Replace)) {
    Write-Host "  [=] $Label : deja applique, ignore"
    return $Text
  }
  if (-not $Text.Contains($Find)) {
    throw "ANCRE INTROUVABLE [$Label]. Le fichier a probablement derive. Abandon (aucune ecriture)."
  }
  $count = ([regex]::Matches($Text, [regex]::Escape($Find))).Count
  if ($count -ne 1) {
    throw "ANCRE NON UNIQUE [$Label] ($count occurrences). Abandon (aucune ecriture)."
  }
  Write-Host "  [+] $Label"
  return $Text.Replace($Find, $Replace)
}

$hubPage = @'
"use client";

/* ==================================================================
   NexiRole — Bibliothèque de CV (/dashboard/cv-builder)
   Hub du créateur : bouton « Générer / Créer un CV », statistiques,
   liste des CV avec actions par ligne (modifier, renommer, publier
   en ligne, copier le lien, télécharger le PDF, corbeille 30 jours
   avec restauration et suppression définitive).
   Autosauvegarde et édition : /dashboard/cv-builder/createur?cv=<id>
   Publication : réutilise /api/public-cv/builder (payload identique
   au bouton « Publier » du créateur) puis met à jour les drapeaux.
   ================================================================== */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  IconCopy,
  IconDatabase,
  IconDownload,
  IconEye,
  IconFileText,
  IconLoader2,
  IconPencil,
  IconPlus,
  IconRestore,
  IconTrash,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { buildPublishPayload } from "@/lib/cv-publish-payload";

interface CvRow {
  id: string;
  name: string;
  isPublic: boolean;
  publishedSlug: string | null;
  views: number;
  updatedAt: string;
}

interface TrashRow {
  id: string;
  name: string;
  trashedAt: string | null;
  purgeAt: string | null;
}

interface Stats {
  total: number;
  publies: number;
  corbeille: number;
  vues: number;
}

const STATS_VIDES: Stats = { total: 0, publies: 0, corbeille: 0, vues: 0 };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function joursAvantPurge(purgeAt: string | null): number | null {
  if (!purgeAt) return null;
  const date = new Date(purgeAt);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(1, Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

async function copierTexte(texte: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texte);
      return true;
    }
  } catch {
    /* repli ci-dessous */
  }
  try {
    const area = document.createElement("textarea");
    area.value = texte;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    return true;
  } catch {
    return false;
  }
}

export default function CvLibraryPage() {
  const [loading, setLoading] = useState(true);
  const [cvs, setCvs] = useState<CvRow[]>([]);
  const [corbeille, setCorbeille] = useState<TrashRow[]>([]);
  const [stats, setStats] = useState<Stats>(STATS_VIDES);
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmTrash, setConfirmTrash] = useState<CvRow | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<TrashRow | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cv", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | { cvs?: CvRow[]; corbeille?: TrashRow[]; stats?: Stats; error?: string }
        | null;
      if (!res.ok || !json) {
        toast.error(json?.error ?? "Chargement de la bibliothèque impossible.");
        return;
      }
      setCvs(Array.isArray(json.cvs) ? json.cvs : []);
      setCorbeille(Array.isArray(json.corbeille) ? json.corbeille : []);
      setStats({ ...STATS_VIDES, ...(json.stats ?? {}) });
    } catch {
      toast.error("Serveur injoignable. Réessayez.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  /* ── Générer / Créer un CV ── */
  async function creerCv() {
    setBusy("__nouveau__");
    try {
      const res = await fetch("/api/cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => null)) as
        | { cv?: { id?: string }; error?: string }
        | null;
      const id = json?.cv?.id;
      if (!res.ok || !id) {
        toast.error(json?.error ?? "Création du CV impossible.");
        return;
      }
      toast.success("Nouveau CV créé. Direction le créateur !");
      window.location.href = `/dashboard/cv-builder/createur?cv=${id}`;
    } catch {
      toast.error("Serveur injoignable. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  /* ── Publier en ligne (payload identique au bouton Publier du créateur) ── */
  async function publier(cv: CvRow) {
    setBusy(cv.id);
    try {
      const resCv = await fetch(`/api/cv/${cv.id}`, { cache: "no-store" });
      const jsonCv = (await resCv.json().catch(() => null)) as
        | { cv?: { data?: unknown; design?: unknown; publishedSlug?: string | null } }
        | null;
      const cvFull = jsonCv?.cv;
      if (!resCv.ok || !cvFull) {
        toast.error("Impossible de charger le contenu du CV.");
        return;
      }
      const payload = buildPublishPayload({
        data: cvFull.data,
        design: cvFull.design,
        slug: cvFull.publishedSlug ?? cv.publishedSlug,
      });
      const res = await fetch("/api/public-cv/builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as
        | { publicResume?: { slug?: string }; error?: string }
        | null;
      const slug = json?.publicResume?.slug;
      if (!res.ok || !slug) {
        toast.error(json?.error ?? "Publication en ligne impossible.");
        return;
      }
      await fetch(`/api/cv/${cv.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: true, publishedSlug: slug }),
      });
      toast.success(`CV publié en ligne : /u/${slug}`);
      await charger();
    } catch {
      toast.error("Serveur injoignable. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  /* ── Copier le lien public ── */
  async function copierLien(cv: CvRow) {
    if (!cv.publishedSlug) {
      toast.error("Publiez d'abord ce CV en ligne pour obtenir son lien.");
      return;
    }
    const url = `${window.location.origin}/u/${cv.publishedSlug}`;
    const ok = await copierTexte(url);
    if (ok) toast.success("Lien public copié !");
    else toast.error(`Copie impossible — copiez manuellement : ${url}`);
  }

  /* ── Renommer ── */
  async function validerRenommage() {
    if (!renaming) return;
    const name = renaming.name.trim();
    if (name === "") {
      toast.error("Le nom du CV ne peut pas être vide.");
      return;
    }
    setBusy(renaming.id);
    try {
      const res = await fetch(`/api/cv/${renaming.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(json?.error ?? "Renommage impossible.");
        return;
      }
      toast.success("CV renommé.");
      setRenaming(null);
      await charger();
    } catch {
      toast.error("Serveur injoignable. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  /* ── Corbeille (dépublication + 30 jours) ── */
  async function mettreCorbeille(cv: CvRow) {
    setBusy(cv.id);
    try {
      const res = await fetch(`/api/cv/${cv.id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(json?.error ?? "Mise à la corbeille impossible.");
        return;
      }
      toast.success("CV dépublié et envoyé dans la corbeille (30 jours).");
      setConfirmTrash(null);
      await charger();
    } catch {
      toast.error("Serveur injoignable. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  /* ── Restauration ── */
  async function restaurer(row: TrashRow) {
    setBusy(row.id);
    try {
      const res = await fetch(`/api/cv/${row.id}/restore`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(json?.error ?? "Restauration impossible.");
        return;
      }
      toast.success("CV restauré dans votre bibliothèque.");
      await charger();
    } catch {
      toast.error("Serveur injoignable. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  /* ── Suppression définitive ── */
  async function purger(row: TrashRow) {
    setBusy(row.id);
    try {
      const res = await fetch(`/api/cv/${row.id}/purge`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(json?.error ?? "Suppression définitive impossible.");
        return;
      }
      toast.success("CV supprimé définitivement.");
      setConfirmPurge(null);
      await charger();
    } catch {
      toast.error("Serveur injoignable. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  const statsCards: Array<{ label: string; value: number; icon: ReactNode }> = [
    { label: "CV au total", value: stats.total, icon: <IconFileText className="size-5" /> },
    { label: "CV publiés", value: stats.publies, icon: <IconWorld className="size-5" /> },
    { label: "Vues en ligne", value: stats.vues, icon: <IconEye className="size-5" /> },
    { label: "Corbeille", value: stats.corbeille, icon: <IconDatabase className="size-5" /> },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* En-tête + bouton Générer / Créer un CV */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl font-extrabold tracking-tight text-navy sm:text-2xl">
            Créateur de CV
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Votre bibliothèque de CV — chaque modification dans le créateur est enregistrée
            automatiquement dans la base de données.
          </p>
        </div>
        <button
          type="button"
          onClick={creerCv}
          disabled={busy === "__nouveau__"}
          className="inline-flex items-center gap-2 rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "__nouveau__" ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconPlus className="size-4" />
          )}
          Générer / Créer un CV
        </button>
      </div>

      {/* Statistiques */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statsCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center gap-2 text-slate-400">
              {card.icon}
              <span className="text-[11px] font-semibold uppercase tracking-wide">
                {card.label}
              </span>
            </div>
            <p className="mt-2 font-heading text-2xl font-extrabold text-navy">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Liste des CV */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-base font-extrabold text-navy">Mes CV</h2>
          <span className="text-xs text-slate-400">{cvs.length} CV actif(s)</span>
        </div>

        {loading ? (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            <IconLoader2 className="size-4 animate-spin" />
            Chargement de la bibliothèque…
          </div>
        ) : cvs.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <IconFileText className="mx-auto size-8 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-navy">Aucun CV pour le moment</p>
            <p className="mt-1 text-xs text-slate-400">
              Cliquez sur « Générer / Créer un CV » pour commencer. Votre CV en cours dans le
              créateur sera automatiquement enregistré dans la bibliothèque.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {cvs.map((cv) => (
              <div
                key={cv.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-heading text-sm font-extrabold text-navy">
                        {cv.name}
                      </p>
                      {cv.isPublic && cv.publishedSlug ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          Publié
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          Brouillon
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Modifié le {formatDate(cv.updatedAt)}
                      {cv.views > 0 ? ` · ${cv.views} vue(s)` : ""}
                      {cv.isPublic && cv.publishedSlug ? ` · /u/${cv.publishedSlug}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRenaming({ id: cv.id, name: cv.name })}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-slate-50"
                    >
                      <IconPencil className="size-3.5" />
                      Renommer
                    </button>
                    <a
                      href={`/dashboard/cv-builder/createur?cv=${cv.id}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-800"
                    >
                      <IconPencil className="size-3.5" />
                      Modifier
                    </a>
                    <a
                      href={`/api/public-cv/pdf?cv=${cv.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-slate-50"
                    >
                      <IconDownload className="size-3.5" />
                      PDF
                    </a>
                    <button
                      type="button"
                      onClick={() => void publier(cv)}
                      disabled={busy === cv.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-gold/70 bg-gold-soft px-3 py-1.5 text-xs font-bold text-accent-foreground transition-colors hover:bg-gold hover:text-navy disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busy === cv.id ? (
                        <IconLoader2 className="size-3.5 animate-spin" />
                      ) : (
                        <IconWorld className="size-3.5" />
                      )}
                      Publier en ligne
                    </button>
                    <button
                      type="button"
                      onClick={() => void copierLien(cv)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-slate-50"
                    >
                      <IconCopy className="size-3.5" />
                      Copier le lien
                    </button>
                    {cv.isPublic && cv.publishedSlug ? (
                      <a
                        href={`/u/${cv.publishedSlug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-slate-50"
                      >
                        <IconEye className="size-3.5" />
                        Voir en ligne
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setConfirmTrash(cv)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
                    >
                      <IconTrash className="size-3.5" />
                      Supprimer
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Corbeille */}
      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-base font-extrabold text-navy">
            Corbeille{" "}
            {corbeille.length > 0 ? (
              <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">
                {corbeille.length}
              </span>
            ) : null}
          </h2>
          <p className="text-[11px] text-slate-400">
            Les CV supprimés sont dépubliés puis conservés 30 jours avant suppression
            définitive.
          </p>
        </div>

        {corbeille.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-xs text-slate-400">
            La corbeille est vide.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {corbeille.map((row) => {
              const jours = joursAvantPurge(row.purgeAt);
              return (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-600">{row.name}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Supprimé le {formatDate(row.trashedAt)}
                      {jours !== null ? ` · suppression définitive dans ${jours} jour(s)` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void restaurer(row)}
                      disabled={busy === row.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-60"
                    >
                      {busy === row.id ? (
                        <IconLoader2 className="size-3.5 animate-spin" />
                      ) : (
                        <IconRestore className="size-3.5" />
                      )}
                      Restaurer
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmPurge(row)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
                    >
                      <IconTrash className="size-3.5" />
                      Supprimer définitivement
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modale : renommage */}
      {renaming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-sm font-extrabold text-navy">Renommer le CV</h3>
              <button
                type="button"
                onClick={() => setRenaming(null)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fermer"
              >
                <IconX className="size-4" />
              </button>
            </div>
            <input
              type="text"
              value={renaming.name}
              onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
              maxLength={120}
              className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-navy outline-none focus:border-gold"
              placeholder="Nom du CV"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenaming(null)}
                className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void validerRenommage()}
                disabled={busy === renaming.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-navy px-4 py-1.5 text-xs font-bold text-white hover:bg-navy-800 disabled:opacity-60"
              >
                {busy === renaming.id ? <IconLoader2 className="size-3.5 animate-spin" /> : null}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modale : confirmation corbeille */}
      {confirmTrash ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="font-heading text-sm font-extrabold text-navy">
              Mettre « {confirmTrash.name} » à la corbeille ?
            </h3>
            <p className="mt-2 text-xs text-slate-500">
              Le CV sera dépublié immédiatement (son lien public ne sera plus accessible) et
              conservé 30 jours dans la corbeille. Vous pourrez le restaurer pendant cette
              période.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmTrash(null)}
                className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void mettreCorbeille(confirmTrash)}
                disabled={busy === confirmTrash.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busy === confirmTrash.id ? (
                  <IconLoader2 className="size-3.5 animate-spin" />
                ) : (
                  <IconTrash className="size-3.5" />
                )}
                Mettre à la corbeille
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modale : confirmation suppression définitive */}
      {confirmPurge ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="font-heading text-sm font-extrabold text-navy">
              Supprimer définitivement « {confirmPurge.name} » ?
            </h3>
            <p className="mt-2 text-xs text-slate-500">
              Cette action est irréversible : le CV sera supprimé de la base de données sans
              possibilité de restauration.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmPurge(null)}
                className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void purger(confirmPurge)}
                disabled={busy === confirmPurge.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busy === confirmPurge.id ? (
                  <IconLoader2 className="size-3.5 animate-spin" />
                ) : (
                  <IconTrash className="size-3.5" />
                )}
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
'@

$routeCv = @'
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/* ==================================================================
   NexiRole — Bibliothèque de CV du créateur
   GET  /api/cv → { cvs, corbeille, stats }
        Liste des CV de l'utilisateur connecté + corbeille (30 jours)
        + statistiques. Purge automatique des CV corbeillés depuis
        plus de 30 jours (rétention garantie sans tâche planifiée).
   POST /api/cv → { cv }
        Création d'un CV (bouton « Générer / Créer un CV » et
        migration automatique du créateur). Corps optionnel :
        { name?, data?, design?, step? }.
   ================================================================== */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const CORBEILLE_DELAI_JOURS = 30;

/* Stratégie JWT next-auth v5 : id s'il existe, sinon repli par email. */
async function requireUserId(): Promise<string | null> {
  const session = await auth();
  const sessionUser = (session?.user ?? null) as unknown as
    | { id?: string; email?: string | null }
    | null;

  const directId = typeof sessionUser?.id === "string" ? sessionUser.id.trim() : "";
  if (directId !== "") return directId;

  const email = typeof sessionUser?.email === "string" ? sessionUser.email.trim() : "";
  if (email !== "") {
    try {
      const found = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      return found?.id ?? null;
    } catch (error) {
      console.error("[api/cv] Résolution utilisateur par email impossible :", error);
      return null;
    }
  }
  return null;
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Session invalide. Reconnectez-vous puis réessayez." },
    { status: 401 }
  );
}

function dateIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return null;
}

/* ─────────── GET : liste + corbeille + statistiques ─────────── */

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  try {
    const cutoff = new Date(Date.now() - CORBEILLE_DELAI_JOURS * 24 * 60 * 60 * 1000);

    // Purge définitive des CV corbeillés depuis plus de 30 jours.
    await prisma.cvDocument.deleteMany({
      where: { userId, trashedAt: { not: null, lt: cutoff } },
    });

    const rows = await prisma.cvDocument.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        isPublic: true,
        publishedSlug: true,
        trashedAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const actifs = rows.filter((r) => r.trashedAt === null);
    const corbeilles = rows.filter((r) => r.trashedAt !== null);

    // Vues par CV : jointure sur les pages publiques correspondantes.
    const slugs = Array.from(
      new Set(
        actifs
          .map((r) => r.publishedSlug)
          .filter((s): s is string => typeof s === "string" && s !== "")
      )
    );
    const publis = slugs.length
      ? await prisma.publicResume.findMany({
          where: { slug: { in: slugs } },
          select: { slug: true, viewsCount: true },
        })
      : [];
    const vuesParSlug = new Map<string, number>(
      publis.map((p) => [p.slug, typeof p.viewsCount === "number" ? p.viewsCount : 0])
    );

    const cvs = actifs.map((r) => ({
      id: r.id,
      name: r.name,
      isPublic: r.isPublic,
      publishedSlug: r.publishedSlug,
      views: vuesParSlug.get(r.publishedSlug ?? "") ?? 0,
      updatedAt: dateIso(r.updatedAt) ?? new Date().toISOString(),
    }));

    const corbeille = corbeilles.map((r) => {
      const trashedAt = r.trashedAt as Date;
      const purgeAt = new Date(trashedAt.getTime() + CORBEILLE_DELAI_JOURS * 24 * 60 * 60 * 1000);
      return {
        id: r.id,
        name: r.name,
        trashedAt: dateIso(trashedAt),
        purgeAt: dateIso(purgeAt),
      };
    });

    return NextResponse.json({
      cvs,
      corbeille,
      stats: {
        total: cvs.length,
        publies: cvs.filter((c) => c.isPublic && typeof c.publishedSlug === "string" && c.publishedSlug !== "").length,
        corbeille: corbeille.length,
        vues: cvs.reduce((acc, c) => acc + (c.views ?? 0), 0),
      },
    });
  } catch (error) {
    console.error("[api/cv][GET]", error);
    return NextResponse.json(
      { error: "Impossible de charger la bibliothèque de CV." },
      { status: 500 }
    );
  }
}

/* ─────────── POST : création d'un CV ─────────── */

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  let body: Record<string, unknown> = {};
  try {
    const raw: unknown = await request.json();
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      body = raw as Record<string, unknown>;
    }
  } catch {
    body = {}; // corps vide accepté : création d'un CV vierge
  }

  const dataValue =
    body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data : {};
  const designValue =
    body.design && typeof body.design === "object" && !Array.isArray(body.design) ? body.design : {};
  const stepValue =
    typeof body.step === "number" && Number.isFinite(body.step) && body.step >= 0 && body.step <= 5
      ? Math.floor(body.step)
      : 0;

  let name = typeof body.name === "string" ? body.name.trim() : "";
  if (name === "") {
    const dataRecord = (dataValue ?? {}) as Record<string, unknown>;
    const personal =
      dataRecord.personal && typeof dataRecord.personal === "object"
        ? (dataRecord.personal as Record<string, unknown>)
        : null;
    const fullName = personal && typeof personal.fullName === "string" ? personal.fullName.trim() : "";
    name = fullName !== "" ? `${fullName} — CV` : "Mon CV";
  }
  if (name.length > 120) name = name.slice(0, 120);

  try {
    const row = await prisma.cvDocument.create({
      data: {
        userId,
        name,
        data: JSON.parse(JSON.stringify(dataValue)),
        design: JSON.parse(JSON.stringify(designValue)),
        step: stepValue,
      },
    });

    return NextResponse.json(
      {
        cv: {
          id: row.id,
          name: row.name,
          isPublic: row.isPublic,
          publishedSlug: row.publishedSlug,
          updatedAt: row.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[api/cv][POST]", error);
    return NextResponse.json({ error: "Création du CV impossible." }, { status: 500 });
  }
}
'@

$routeCvId = @'
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/* ==================================================================
   NexiRole — CV individuel (bibliothèque du créateur)
   GET    /api/cv/[id] → { cv }             contenu complet (créateur)
   PATCH  /api/cv/[id] → { ok, cv }         autosauvegarde, renommage,
                                            état de publication
          corps : { name?, data?, design?, step?, isPublic?, publishedSlug? }
   DELETE /api/cv/[id] → { ok }             corbeille (soft delete 30 j),
                                            dépublication de la page publique
   Next.js 16 : params est une Promise (await obligatoire).
   ================================================================== */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  const sessionUser = (session?.user ?? null) as unknown as
    | { id?: string; email?: string | null }
    | null;

  const directId = typeof sessionUser?.id === "string" ? sessionUser.id.trim() : "";
  if (directId !== "") return directId;

  const email = typeof sessionUser?.email === "string" ? sessionUser.email.trim() : "";
  if (email !== "") {
    try {
      const found = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      return found?.id ?? null;
    } catch (error) {
      console.error("[api/cv/[id]] Résolution utilisateur par email impossible :", error);
      return null;
    }
  }
  return null;
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Session invalide. Reconnectez-vous puis réessayez." },
    { status: 401 }
  );
}

type RouteContext = { params: Promise<{ id: string }> };

async function loadOwnedCv(id: string, userId: string) {
  if (typeof id !== "string" || id.trim() === "" || id.length > 64) return null;
  const row = await prisma.cvDocument.findUnique({ where: { id } });
  if (!row || row.userId !== userId) return null;
  return row;
}

function readJsonBodySync(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function serializeCv(row: NonNullable<Awaited<ReturnType<typeof loadOwnedCv>>>) {
  return {
    id: row.id,
    name: row.name,
    data: row.data ?? {},
    design: row.design ?? {},
    step: row.step,
    isPublic: row.isPublic,
    publishedSlug: row.publishedSlug,
    trashedAt:
      row.trashedAt instanceof Date && !Number.isNaN(row.trashedAt.getTime())
        ? row.trashedAt.toISOString()
        : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/* ─────────── GET : contenu complet d'un CV ─────────── */

export async function GET(_request: NextRequest, context: RouteContext) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const { id } = await context.params;

  try {
    const row = await loadOwnedCv(id, userId);
    if (!row) {
      return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
    }
    return NextResponse.json({ cv: serializeCv(row) });
  } catch (error) {
    console.error("[api/cv/[id]][GET]", error);
    return NextResponse.json({ error: "Lecture du CV impossible." }, { status: 500 });
  }
}

/* ─────────── PATCH : autosauvegarde / renommage / publication ─────────── */

export async function PATCH(request: NextRequest, context: RouteContext) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const { id } = await context.params;

  let bodyRaw: unknown = null;
  try {
    bodyRaw = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const body = readJsonBodySync(bodyRaw);
  if (!body) {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }

  try {
    const row = await loadOwnedCv(id, userId);
    if (!row) {
      return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
    }
    if (row.trashedAt) {
      return NextResponse.json(
        { error: "Ce CV est dans la corbeille. Restaurez-le avant de le modifier." },
        { status: 409 }
      );
    }

    const data: {
      name?: string;
      data?: unknown;
      design?: unknown;
      step?: number;
      isPublic?: boolean;
      publishedSlug?: string | null;
    } = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (name === "") {
        return NextResponse.json({ error: "Le nom du CV ne peut pas être vide." }, { status: 400 });
      }
      data.name = name.slice(0, 120);
    }
    if (body.data !== undefined) {
      if (body.data === null || typeof body.data !== "object" || Array.isArray(body.data)) {
        return NextResponse.json({ error: "Champ data invalide (objet attendu)." }, { status: 400 });
      }
      data.data = JSON.parse(JSON.stringify(body.data));
    }
    if (body.design !== undefined) {
      if (body.design === null || typeof body.design !== "object" || Array.isArray(body.design)) {
        return NextResponse.json({ error: "Champ design invalide (objet attendu)." }, { status: 400 });
      }
      data.design = JSON.parse(JSON.stringify(body.design));
    }
    if (body.step !== undefined) {
      if (typeof body.step !== "number" || !Number.isFinite(body.step) || body.step < 0 || body.step > 5) {
        return NextResponse.json({ error: "Champ step invalide (0 à 5 attendu)." }, { status: 400 });
      }
      data.step = Math.floor(body.step);
    }
    if (body.isPublic !== undefined) {
      if (typeof body.isPublic !== "boolean") {
        return NextResponse.json({ error: "Champ isPublic invalide (booléen attendu)." }, { status: 400 });
      }
      data.isPublic = body.isPublic;
    }
    if (body.publishedSlug !== undefined) {
      if (body.publishedSlug !== null && typeof body.publishedSlug !== "string") {
        return NextResponse.json({ error: "Champ publishedSlug invalide." }, { status: 400 });
      }
      const slug = typeof body.publishedSlug === "string" ? body.publishedSlug.trim() : "";
      data.publishedSlug = slug === "" ? null : slug.slice(0, 80);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Aucun champ à mettre à jour (name, data, design, step, isPublic ou publishedSlug attendu)." },
        { status: 400 }
      );
    }

    const updated = await prisma.cvDocument.update({ where: { id: row.id }, data });
    return NextResponse.json({ ok: true, cv: serializeCv(updated) });
  } catch (error) {
    console.error("[api/cv/[id]][PATCH]", error);
    return NextResponse.json({ error: "Enregistrement du CV impossible." }, { status: 500 });
  }
}

/* ─────────── DELETE : mise à la corbeille (30 jours) ─────────── */

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const { id } = await context.params;

  try {
    const row = await loadOwnedCv(id, userId);
    if (!row) {
      return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
    }
    if (row.trashedAt) {
      return NextResponse.json({ ok: true, alreadyTrashed: true });
    }

    // Soft delete : dépublié + conservé 30 jours avant purge définitive.
    const updated = await prisma.cvDocument.update({
      where: { id: row.id },
      data: { trashedAt: new Date(), isPublic: false },
    });

    // Dépublication de la page publique si ce CV était en ligne.
    if (typeof row.publishedSlug === "string" && row.publishedSlug !== "") {
      try {
        await prisma.publicResume.updateMany({
          where: { slug: row.publishedSlug },
          data: { isPublic: false },
        });
      } catch (error) {
        console.error("[api/cv/[id]][DELETE] Dépublication publique impossible :", error);
      }
    }

    return NextResponse.json({
      ok: true,
      cv: {
        id: updated.id,
        name: updated.name,
        trashedAt: updated.trashedAt ? updated.trashedAt.toISOString() : null,
      },
    });
  } catch (error) {
    console.error("[api/cv/[id]][DELETE]", error);
    return NextResponse.json({ error: "Mise à la corbeille impossible." }, { status: 500 });
  }
}
'@

$routeRestore = @'
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/* ==================================================================
   NexiRole — Restauration depuis la corbeille
   POST /api/cv/[id]/restore → { ok }
   Remet le CV corbeillé dans la bibliothèque active. Le CV reste
   dépublié : la remise en ligne se fait depuis le bouton
   « Publier en ligne » (choix explicite de l'utilisateur).
   ================================================================== */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  const sessionUser = (session?.user ?? null) as unknown as
    | { id?: string; email?: string | null }
    | null;

  const directId = typeof sessionUser?.id === "string" ? sessionUser.id.trim() : "";
  if (directId !== "") return directId;

  const email = typeof sessionUser?.email === "string" ? sessionUser.email.trim() : "";
  if (email !== "") {
    try {
      const found = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      return found?.id ?? null;
    } catch (error) {
      console.error("[api/cv/[id]/restore] Résolution utilisateur par email impossible :", error);
      return null;
    }
  }
  return null;
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Session invalide. Reconnectez-vous puis réessayez." },
    { status: 401 }
  );
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const { id } = await context.params;

  try {
    if (typeof id !== "string" || id.trim() === "" || id.length > 64) {
      return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
    }
    const row = await prisma.cvDocument.findUnique({ where: { id } });
    if (!row || row.userId !== userId) {
      return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
    }
    if (!row.trashedAt) {
      return NextResponse.json({ ok: true, alreadyActive: true });
    }

    await prisma.cvDocument.update({
      where: { id: row.id },
      data: { trashedAt: null },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/cv/[id]/restore][POST]", error);
    return NextResponse.json({ error: "Restauration impossible." }, { status: 500 });
  }
}
'@

$routePurge = @'
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/* ==================================================================
   NexiRole — Suppression définitive depuis la corbeille
   DELETE /api/cv/[id]/purge → { ok }
   Supprime définitivement la ligne CvDocument. Si le CV avait un
   lien public, la page publique correspondante est dépubliée par
   cohérence (aucune donnée du CV ne reste servie).
   ================================================================== */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  const sessionUser = (session?.user ?? null) as unknown as
    | { id?: string; email?: string | null }
    | null;

  const directId = typeof sessionUser?.id === "string" ? sessionUser.id.trim() : "";
  if (directId !== "") return directId;

  const email = typeof sessionUser?.email === "string" ? sessionUser.email.trim() : "";
  if (email !== "") {
    try {
      const found = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      return found?.id ?? null;
    } catch (error) {
      console.error("[api/cv/[id]/purge] Résolution utilisateur par email impossible :", error);
      return null;
    }
  }
  return null;
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Session invalide. Reconnectez-vous puis réessayez." },
    { status: 401 }
  );
}

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const { id } = await context.params;

  try {
    if (typeof id !== "string" || id.trim() === "" || id.length > 64) {
      return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
    }
    const row = await prisma.cvDocument.findUnique({ where: { id } });
    if (!row || row.userId !== userId) {
      return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
    }

    if (typeof row.publishedSlug === "string" && row.publishedSlug !== "") {
      try {
        await prisma.publicResume.updateMany({
          where: { slug: row.publishedSlug },
          data: { isPublic: false },
        });
      } catch (error) {
        console.error("[api/cv/[id]/purge][DELETE] Dépublication publique impossible :", error);
      }
    }

    await prisma.cvDocument.delete({ where: { id: row.id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/cv/[id]/purge][DELETE]", error);
    return NextResponse.json({ error: "Suppression définitive impossible." }, { status: 500 });
  }
}
'@

$routePdf = @'
import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CvPdfDocument, type DossierData } from "@/components/pdf/CvPdfDocument";
import { mapDesignTemplate } from "@/lib/cv-publish-payload";

/* ==================================================================
   NexiRole — PDF public du CV (avec QR code), nouvelle route dédiée
   GET /api/public-cv/pdf?slug=<slug>  → accès public (CV publié)
   GET /api/public-cv/pdf?cv=<id>      → propriétaire connecté (aperçu
                                         téléchargeable même non publié)
   Remplace l'appel historique /api/public-cv?slug=...&format=pdf qui
   renvoyait « Erreur interne du serveur. » : cette route est
   autonome (QR serveur via qrcode, rendu via @react-pdf/renderer,
   patterns identiques à /api/download-pdf déjà en production).
   ================================================================== */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const TEMPLATE_IDS = ["modern-accent", "sleek-executive", "bold-minimalism", "clean-ats"] as const;
type TemplateIdSafe = (typeof TEMPLATE_IDS)[number];

function safeTemplateId(value: unknown): TemplateIdSafe {
  const v = typeof value === "string" ? value.trim() : "";
  return (TEMPLATE_IDS as readonly string[]).includes(v) ? (v as TemplateIdSafe) : "modern-accent";
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

/** Convertit le cvData stocké (builder ou publication) en DossierData PDF. */
function toDossier(cv: Record<string, unknown>): DossierData {
  const personal = asRecord(cv.personal);
  const experiences = asArray(cv.experiences);
  const education = asArray(cv.education);
  const skills = Array.isArray(cv.skills) ? cv.skills : [];
  const languages = asArray(cv.languages);

  return {
    identite: {
      nom_complet: str(personal.fullName) || "Candidat",
      email: str(personal.email),
      telephone: str(personal.phone),
      ville: str(personal.location),
      linkedin: str(personal.linkedin),
    },
    titre: str(personal.title) || "Candidat",
    resume: str(cv.summary),
    experiences: experiences
      .filter((e) => str(e.role) !== "" || str(e.company) !== "")
      .map((e) => ({
        poste: str(e.role) || "Poste",
        periode: str(e.period),
        entreprise: str(e.company) || "Entreprise",
        lieu: str(e.location),
        missions: asArray(e.achievements)
          .map((m) => (typeof m === "string" ? m.trim() : ""))
          .filter(Boolean),
      })),
    formations: education
      .filter((e) => str(e.degree) !== "" || str(e.school) !== "")
      .map((e) => ({
        diplome: str(e.degree) || "Diplôme",
        periode: str(e.period),
        etablissement: str(e.school),
      })),
    competences: skills
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter(Boolean),
    langues: languages
      .filter((l) => str(l.name) !== "")
      .map((l) => ({ nom: str(l.name), niveau: str(l.level) || "Courant" })),
  };
}

function sanitizeFilename(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return cleaned.length > 0 ? cleaned : "document";
}

async function renderPdfBuffer(element: React.ReactElement): Promise<Buffer> {
  return renderToBuffer(element as unknown as React.ReactElement<DocumentProps>);
}

function originFrom(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (configured.trim() !== "") return configured.trim().replace(/\/+$/, "");
  return new URL(request.url).origin;
}

/** QR code serveur pointant vers la page publique. */
async function qrDataUrlFor(publicUrl: string): Promise<string | null> {
  try {
    const mod = (await import("qrcode")) as unknown as {
      default: { toDataURL: (text: string, options?: Record<string, unknown>) => Promise<string> };
    };
    return await mod.default.toDataURL(publicUrl, {
      color: { dark: "#051937", light: "#FFFFFF" },
      width: 512,
      margin: 1,
    });
  } catch (error) {
    console.error("[api/public-cv/pdf] QR code indisponible :", error);
    return null; // le PDF reste généré, sans QR
  }
}

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  const sessionUser = (session?.user ?? null) as unknown as
    | { id?: string; email?: string | null }
    | null;

  const directId = typeof sessionUser?.id === "string" ? sessionUser.id.trim() : "";
  if (directId !== "") return directId;

  const email = typeof sessionUser?.email === "string" ? sessionUser.email.trim() : "";
  if (email !== "") {
    try {
      const found = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      return found?.id ?? null;
    } catch (error) {
      console.error("[api/public-cv/pdf] Résolution utilisateur par email impossible :", error);
      return null;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const slug = (params.get("slug") ?? "").trim();
  const cvId = (params.get("cv") ?? "").trim();

  try {
    if (slug !== "") {
      // Mode public : le CV publié doit exister et être visible.
      const row = await prisma.publicResume.findUnique({ where: { slug } });
      if (!row || !row.isPublic) {
        return NextResponse.json({ error: "CV public introuvable ou privé." }, { status: 404 });
      }
      const cv = asRecord(row.cvData);
      const theme = asRecord(cv.theme);
      const publicUrl = `${originFrom(request)}/u/${row.slug}`;
      const nomComplet = str(asRecord(cv.personal).fullName) || "Candidat";
      const photo = typeof cv.photo === "string" && cv.photo.length > 0 ? cv.photo : null;
      const qr = await qrDataUrlFor(publicUrl);
      const buffer = await renderPdfBuffer(
        React.createElement(CvPdfDocument, {
          data: toDossier(cv),
          templateId: safeTemplateId(theme.webTemplate),
          photo,
          qrDataUrl: qr,
          onlineUrl: publicUrl,
        })
      );
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${sanitizeFilename(nomComplet)}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (cvId !== "") {
      // Mode bibliothèque : propriétaire connecté uniquement.
      const userId = await requireUserId();
      if (!userId) {
        return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
      }
      if (cvId.length > 64) {
        return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
      }
      const row = await prisma.cvDocument.findUnique({ where: { id: cvId } });
      if (!row || row.userId !== userId) {
        return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
      }
      if (row.trashedAt) {
        return NextResponse.json(
          { error: "Ce CV est dans la corbeille : restaurez-le pour télécharger son PDF." },
          { status: 409 }
        );
      }
      const cv = asRecord(row.data);
      const design = asRecord(row.design);

      // Photo + lien public repris de la publication existante si disponible.
      let photo: string | null = null;
      let publicUrl: string | null = null;
      if (typeof row.publishedSlug === "string" && row.publishedSlug !== "") {
        try {
          const pub = await prisma.publicResume.findUnique({ where: { slug: row.publishedSlug } });
          const pubCv = asRecord(pub?.cvData);
          if (typeof pubCv.photo === "string" && pubCv.photo.length > 0) photo = pubCv.photo;
          if (pub?.isPublic) publicUrl = `${originFrom(request)}/u/${row.publishedSlug}`;
        } catch (error) {
          console.error("[api/public-cv/pdf] Publication existante illisible :", error);
        }
      }

      const qr = publicUrl ? await qrDataUrlFor(publicUrl) : null;
      const nomComplet = str(asRecord(cv.personal).fullName) || "Candidat";
      const buffer = await renderPdfBuffer(
        React.createElement(CvPdfDocument, {
          data: toDossier(cv),
          templateId: safeTemplateId(mapDesignTemplate(str(design.template))),
          photo,
          qrDataUrl: qr,
          onlineUrl: publicUrl,
        })
      );
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${sanitizeFilename(nomComplet)}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json(
      { error: "Paramètre attendu : slug (public) ou cv (bibliothèque)." },
      { status: 400 }
    );
  } catch (error) {
    console.error("[api/public-cv/pdf][GET]", error);
    return NextResponse.json(
      { error: "La génération du PDF a échoué. Réessayez." },
      { status: 500 }
    );
  }
}
'@

$libPayload = @'
/* ==================================================================
   NexiRole — Utilitaires de publication du CV Builder
   Utilisé par la bibliothèque de CV (/dashboard/cv-builder) et la
   route PDF publique (/api/public-cv/pdf). Le payload produit est
   STRICTEMENT identique à celui du bouton « Publier » du créateur,
   consommé par /api/public-cv/builder (schéma zod existant).
   Aucun effet de bord : fonctions pures.
   ================================================================== */

/** Mapping design du builder -> templateId public/PDF (logique du créateur). */
export function mapDesignTemplate(id: string): string {
  if (id === "sleek") return "sleek-executive";
  if (id === "bold") return "bold-minimalism";
  if (id === "clean") return "clean-ats";
  return "modern-accent";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strList(value: unknown, max = 40): string[] {
  return asArray(value)
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, max);
}

export interface PublishPayload {
  slug?: string;
  theme: {
    webTemplate: string;
    accentColor: string;
    qrTemplate: string;
  };
  data: {
    personal: {
      fullName: string;
      title: string;
      email: string;
      phone: string;
      location: string;
      linkedin: string;
    };
    summary: string;
    experiences: Array<{
      role: string;
      company: string;
      period: string;
      location: string;
      achievements: string[];
    }>;
    education: Array<{
      degree: string;
      school: string;
      period: string;
    }>;
    skills: string[];
    languages: Array<{ name: string; level: string }>;
  };
}

/**
 * Construit le corps de POST /api/public-cv/builder depuis les champs
 * stockés d'un CvDocument (data = CvBuilderData, design = CvDesign).
 * Champs vides filtrés exactement comme le créateur le fait.
 */
export function buildPublishPayload(input: {
  data: unknown;
  design: unknown;
  slug?: string | null;
}): PublishPayload {
  const data = asRecord(input.data);
  const design = asRecord(input.design);
  const personal = asRecord(data.personal);

  const slugRaw = str(input.slug ?? "");
  const accent = (str(design.accent) || "#0F172A").slice(0, 20);

  const payload: PublishPayload = {
    ...(slugRaw !== "" ? { slug: slugRaw } : {}),
    theme: {
      webTemplate: mapDesignTemplate(str(design.template)),
      accentColor: accent,
      qrTemplate: "executif",
    },
    data: {
      personal: {
        fullName: str(personal.fullName).slice(0, 120),
        title: str(personal.title).slice(0, 160),
        email: str(personal.email).slice(0, 160),
        phone: str(personal.phone).slice(0, 40),
        location: str(personal.location).slice(0, 120),
        linkedin: str(personal.linkedin).slice(0, 200),
      },
      summary: str(data.summary).slice(0, 4000),
      experiences: asArray(data.experiences)
        .filter(
          (e) => str(e.role) !== "" || str(e.company) !== "" || asArray(e.achievements).length > 0
        )
        .slice(0, 15)
        .map((e) => ({
          role: str(e.role).slice(0, 160),
          company: str(e.company).slice(0, 160),
          period: str(e.period).slice(0, 80),
          location: str(e.location).slice(0, 120),
          achievements: strList(e.achievements, 12),
        })),
      education: asArray(data.education)
        .filter((e) => str(e.degree) !== "" || str(e.school) !== "")
        .slice(0, 15)
        .map((e) => ({
          degree: str(e.degree).slice(0, 160),
          school: str(e.school).slice(0, 160),
          period: str(e.period).slice(0, 80),
        })),
      skills: strList(data.skills),
      languages: asArray(data.languages)
        .filter((l) => str(l.name) !== "")
        .slice(0, 12)
        .map((l) => ({
          name: str(l.name).slice(0, 60),
          level: str(l.level).slice(0, 60) || "Courant",
        })),
    },
  };

  return payload;
}
'@

$typesQrcode = @'
/* ==================================================================
   NexiRole — Déclaration minimale du module "qrcode"
   Le paquet npm "qrcode" n'expose pas de types TypeScript et
   @types/qrcode n'est pas installé : le créateur de CV l'importe
   déjà dynamiquement (export PDF avec QR), la route PDF publique
   l'utilise côté serveur. Si @types/qrcode est installé un jour,
   ce fichier peut être supprimé sans autre modification.
   ================================================================== */

declare module "qrcode" {
  interface QRCodeToDataURLOptions {
    type?: "image/png" | "image/jpeg" | "image/webp";
    width?: number;
    margin?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  }

  const QRCode: {
    toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
  };

  export default QRCode;
}
'@

$modelBlock = @'
// ── Bibliothèque de CV du créateur (PARTIE CV BUILDER) ──────
// Un CvDocument = un CV de la bibliothèque : contenu (data),
// design, étape courante, état de publication et corbeille 30 j.
model CvDocument {
  id            String    @id @default(cuid())
  userId        String
  name          String    @default("Mon CV")
  data          Json      // contenu complet du CV (CvBuilderData)
  design        Json      // design du CV (CvDesign)
  step          Int       @default(0) // étape courante du créateur (0-5)
  isPublic      Boolean   @default(false) // CV actuellement en ligne
  publishedSlug String?   // slug de la page /u/<slug> quand publié
  trashedAt     DateTime? // corbeille : date de suppression (purge à 30 jours)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("cv_documents")
}
'@

$p1Block = @'

  /* ================================================================
     Bibliothèque de CV — synchronisation base de données
     - ?cv=<id> dans l'URL : hydratation depuis la base puis
       sauvegarde automatique (900 ms) après chaque modification
       (formulaires, design, étape, améliorations IA).
     - sans ?cv : migration automatique du CV local vers la base
       (une seule fois par session navigateur).
     ================================================================ */
  const [cvId, setCvId] = useState<string | null>(null);
  const [dbState, setDbState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [dbSavedAt, setDbSavedAt] = useState<Date | null>(null);
  const cvHydratedRef = useRef(false);
  const cvMigrationRef = useRef(false);
  const cvSaveTimerRef = useRef<number | null>(null);

  /* 1 - Hydratation depuis la base quand ?cv=<id> est présent. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const asked = params.get("cv");
    if (!asked) {
      cvHydratedRef.current = true;
      return;
    }
    setCvId(asked);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/cv/${asked}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as
          | { cv?: { data?: unknown; design?: unknown; step?: number } | null }
          | null;
        if (cancelled || !json?.cv) return;
        setData(sanitizeData(json.cv.data));
        setDesign(sanitizeDesign(json.cv.design));
        if (typeof json.cv.step === "number" && json.cv.step >= 0 && json.cv.step <= 5) {
          setStep(json.cv.step);
        }
      } catch {
        /* réseau indisponible : on garde le contenu local */
      } finally {
        if (!cancelled) cvHydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* 2 - Migration automatique : CV local (sans ?cv) -> base de données. */
  useEffect(() => {
    if (!loaded || cvId !== null || cvMigrationRef.current) return;
    if (window.sessionStorage.getItem("nexirole-cv-migration-done") === "1") {
      cvHydratedRef.current = true;
      return;
    }
    const hasContent =
      data.personal.fullName.trim() !== "" ||
      data.summary.trim() !== "" ||
      data.experiences.some((e) => e.role.trim() !== "" || e.company.trim() !== "") ||
      data.education.some((e) => e.degree.trim() !== "" || e.school.trim() !== "");
    if (!hasContent) return;
    cvMigrationRef.current = true;
    const [payloadData, payloadDesign, payloadStep] = [data, design, step];
    (async () => {
      try {
        const res = await fetch("/api/cv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: payloadData, design: payloadDesign, step: payloadStep }),
        });
        const json = (await res.json().catch(() => null)) as
          | { cv?: { id?: string } | null }
          | null;
        const newId = json?.cv?.id;
        if (!res.ok || !newId) {
          cvMigrationRef.current = false;
          return;
        }
        window.sessionStorage.setItem("nexirole-cv-migration-done", "1");
        setCvId(newId);
        const url = new URL(window.location.href);
        url.searchParams.set("cv", newId);
        window.history.replaceState(null, "", url.toString());
        toast.success("CV enregistré dans votre bibliothèque.");
      } catch {
        cvMigrationRef.current = false;
      }
    })();
  }, [loaded, cvId, data, design, step]);

  /* 3 - Sauvegarde automatique en base (debounce 900 ms). */
  useEffect(() => {
    if (!loaded || cvId === null || !cvHydratedRef.current) return;
    if (cvSaveTimerRef.current !== null) {
      window.clearTimeout(cvSaveTimerRef.current);
    }
    setDbState("saving");
    cvSaveTimerRef.current = window.setTimeout(() => {
      cvSaveTimerRef.current = null;
      const idAtSave = cvId;
      (async () => {
        try {
          const res = await fetch(`/api/cv/${idAtSave}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data, design, step }),
          });
          if (!res.ok) throw new Error("échec de l'enregistrement en base");
          setDbState("saved");
          setDbSavedAt(new Date());
        } catch {
          setDbState("error");
        }
      })();
    }, 900);
    return () => {
      if (cvSaveTimerRef.current !== null) {
        window.clearTimeout(cvSaveTimerRef.current);
        cvSaveTimerRef.current = null;
      }
    };
  }, [data, design, step, loaded, cvId]);
'@

$p2aBlock = @'

          <Link
            href="/dashboard/cv-builder"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-slate-50"
          >
            <IconDeviceFloppy className="size-3.5" />
            <span className="hidden sm:inline">Ma bibliothèque</span>
            <span className="sm:hidden">Bibliothèque</span>
          </Link>
'@

$p2bBlock = @'

            <p className="truncate text-[11px] text-slate-400">
              Étape {step + 1}/{STEPS.length} · {saveLabel}
              {cvId !== null && dbState === "saving" ? " · Enregistrement en base…" : null}
              {cvId !== null && dbState === "error" ? " · Échec enregistrement en base" : null}
              {cvId !== null && dbState === "saved" && dbSavedAt
                ? ` · Base enregistrée à ${dbSavedAt.toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : null}
            </p>
'@

Write-Host "=============================================================="
Write-Host " NEXIROLE - Installation bibliotheque de CV"
Write-Host "=============================================================="

# ============================ [1/6] ============================
Write-Host ""
Write-Host "[1/6] Environnement..."
if (-not [System.IO.File]::Exists((Join-Path (Get-Location).Path "package.json"))) {
  throw "Lancez ce script depuis la racine du projet (package.json introuvable)."
}
if (-not [System.IO.File]::Exists((Join-Path (Get-Location).Path "src\lib\prisma.ts"))) {
  throw "Fichier introuvable : src\lib\prisma.ts"
}
$builderRoot = "src/app/dashboard/cv-builder/page.tsx"
$createurPath = "src/app/dashboard/cv-builder/createur/page.tsx"
$qrcodePkg = Join-Path (Get-Location).Path "node_modules\qrcode\package.json"
if ([System.IO.File]::Exists($qrcodePkg)) {
  Write-Host "  [OK] paquet qrcode present"
} else {
  Write-Host "  [!] paquet qrcode ABSENT : lancez 'npm install qrcode' avant de tester le PDF"
}

# ============================ [2/6] ============================
Write-Host ""
Write-Host "[2/6] schema.prisma - modele CvDocument..."
$schemaPath = "prisma/schema.prisma"
if (-not [System.IO.File]::Exists((Join-Path (Get-Location).Path $schemaPath))) {
  throw "Fichier introuvable : $schemaPath"
}
$schema = Normalize-Lf (Read-TextFile $schemaPath)
Test-Uffid $schema $schemaPath
if ($schema.Contains("model CvDocument")) {
  Write-Host "  [=] modele CvDocument deja present, ignore"
} else {
  $null = Backup-File $schemaPath "cvdoc"
  $relationFind = "  savedResumes          SavedResume[]"
  $relationLine = "  cvDocuments          CvDocument[]"
  try {
    $schema = Apply-Patch -Text $schema -Label "relation User cvDocuments" -Find $relationFind -Replace ($relationFind + $Lf + $relationLine)
  } catch {
    $lignesSchema = $schema -split $Lf
    $indexExistant = -1
    for ($i = 0; $i -lt $lignesSchema.Count; $i++) {
      if ($lignesSchema[$i].Contains("savedResumes") -and $lignesSchema[$i].Contains("SavedResume[]")) { $indexExistant = $i; break }
    }
    if ($indexExistant -lt 0) { throw "ANCRE INTROUVABLE [relation User savedResumes]. Abandon (aucune ecriture)." }
    Write-Host "  [+] relation User cvDocuments (repli par ligne)"
    $lignesSchema = $lignesSchema[0..$indexExistant] + $relationLine + $lignesSchema[($indexExistant + 1)..($lignesSchema.Count - 1)]
    $schema = [string]::Join($Lf, $lignesSchema)
  }
  $schema = $schema.TrimEnd() + $Lf + $Lf + (Normalize-Lf $modelBlock) + $Lf
  Write-TextFile $schemaPath $schema
  Write-Host "  [OK] modele CvDocument ajoute"
}
if (-not $SkipGenerate) {
  Write-Host "  [..] npx prisma generate (peut prendre 30-60 s)..."
  try {
    $out = & npx prisma generate 2>&1
    if ($LASTEXITCODE -ne 0) {
      Write-Host "  [!] prisma generate a echoue (code $LASTEXITCODE) :"
      $out | Select-Object -First 8 | ForEach-Object { Write-Host ("      " + $_) }
      Write-Host "      -> corrigez puis relancez : npx prisma generate"
    } else {
      Write-Host "  [OK] client Prisma regenere (CvDocument disponible)"
    }
  } catch {
    Write-Host "  [!] prisma generate indisponible ici : lancez manuellement 'npx prisma generate'"
  }
} else {
  Write-Host "  [=] -SkipGenerate : generation du client ignoree"
}

# ============================ [3/6] ============================
Write-Host ""
Write-Host "[3/6] Createur deplacer + patchs..."
$builderRootFull = [System.IO.Path]::Combine((Get-Location).Path, $builderRoot)
$createurFull = [System.IO.Path]::Combine((Get-Location).Path, $createurPath)
if ([System.IO.File]::Exists($builderRootFull)) {
  $contenuRacine = Normalize-Lf (Read-TextFile $builderRoot)
  Test-Uffid $contenuRacine $builderRoot
  if ($contenuRacine.Contains("CvLibraryPage")) {
    Write-Host "  [=] bibliotheque deja en place a la racine cv-builder"
  } elseif ([System.IO.File]::Exists($createurFull)) {
    throw "Etat ambigu : page.tsx (racine) ET createur/page.tsx existent. Deplacez ou supprimez page.tsx puis relancez."
  } else {
    $null = Backup-File $builderRoot "biblio-move"
    $dirCreateur = [System.IO.Path]::Combine((Get-Location).Path, "src/app/dashboard/cv-builder/createur")
    if (-not [System.IO.Directory]::Exists($dirCreateur)) {
      [System.IO.Directory]::CreateDirectory($dirCreateur) | Out-Null
    }
    [System.IO.File]::Move($builderRootFull, $createurFull)
    Write-Host "  [OK] createur deplace vers src/app/dashboard/cv-builder/createur/page.tsx"
  }
} else {
  Write-Host "  [=] pas de page.tsx a la racine cv-builder (deplacement deja fait ?)"
}
if (-not [System.IO.File]::Exists($createurFull)) {
  throw "createur/page.tsx introuvable : installez d'abord le createur de CV."
}
$createur = Normalize-Lf (Read-TextFile $createurPath)
Test-Uffid $createur $createurPath
$null = Backup-File $createurPath "biblio-patch"

$findMounted = "  useEffect(() => setMounted(true), []);"
$createurAvant = $createur
$p1Ok = $true
try {
  $createur = Apply-Patch -Text $createur -Label "P1 synchronisation base de donnees" -Find $findMounted -Replace ($findMounted + $Lf + $Lf + $p1Block)
} catch {
  $p1Ok = $false
  $createur = $createurAvant
  Write-Host "  [!] P1 (sync base de donnees) NON APPLIQUE :"
  Write-Host ("      " + $_.Exception.Message)
}

$findRetour = '            <span className="sm:hidden">Retour</span>' + $Lf + '          </Link>'
try {
  $createur = Apply-Patch -Text $createur -Label "P2a lien Ma bibliotheque" -Find $findRetour -Replace ($findRetour + $Lf + $Lf + $p2aBlock)
} catch {
  Write-Host "  [=] P2a (lien bibliothèque) non applique : lien ergonomique, sans impact fonctionnel"
}

$findSousTitre = '            <p className="truncate text-[11px] text-slate-400">' + $Lf + '              Étape {step + 1}/{STEPS.length} · {saveLabel}' + $Lf + '            </p>'
try {
  $createur = Apply-Patch -Text $createur -Label "P2b statut enregistrement en base" -Find $findSousTitre -Replace $p2bBlock
} catch {
  Write-Host "  [=] P2b (statut base) non applique : indicateur ergonomique, sans impact fonctionnel"
}

if ($createur -ne $createurAvant) {
  Write-TextFile $createurPath $createur
  Write-Host "  [OK] createur patche"
} else {
  Write-Host "  [=] createur deja a jour (aucun patch necessaire)"
}

# ============================ [4/6] ============================
Write-Host ""
Write-Host "[4/6] Ecriture de la bibliotheque + routes API..."
$null = Backup-File $builderRoot "biblio-hub"
Write-TextFile $builderRoot (Normalize-Lf $hubPage)
Write-Host "  [OK] hub : src/app/dashboard/cv-builder/page.tsx"
Write-TextFile "src/app/api/cv/route.ts" (Normalize-Lf $routeCv)
Write-Host "  [OK] route : src/app/api/cv/route.ts"
Write-TextFile "src/app/api/cv/[id]/route.ts" (Normalize-Lf $routeCvId)
Write-Host "  [OK] route : src/app/api/cv/[id]/route.ts"
Write-TextFile "src/app/api/cv/[id]/restore/route.ts" (Normalize-Lf $routeRestore)
Write-Host "  [OK] route : src/app/api/cv/[id]/restore/route.ts"
Write-TextFile "src/app/api/cv/[id]/purge/route.ts" (Normalize-Lf $routePurge)
Write-Host "  [OK] route : src/app/api/cv/[id]/purge/route.ts"
Write-TextFile "src/app/api/public-cv/pdf/route.ts" (Normalize-Lf $routePdf)
Write-Host "  [OK] route : src/app/api/public-cv/pdf/route.ts"
Write-TextFile "src/lib/cv-publish-payload.ts" (Normalize-Lf $libPayload)
Write-Host "  [OK] lib   : src/lib/cv-publish-payload.ts"
Write-TextFile "src/types/qrcode.d.ts" (Normalize-Lf $typesQrcode)
Write-Host "  [OK] types : src/types/qrcode.d.ts"

# ============================ [5/6] ============================
Write-Host ""
Write-Host "[5/6] Redirection du PDF public (format=pdf -> /api/public-cv/pdf)..."
$pageU = $null
$texteU = $null
$relatifU = $null
$pages = Get-ChildItem -Path "src/app" -Recurse -Filter "page.tsx" -File
foreach ($p in $pages) {
  try { $t = Normalize-Lf (Read-TextFile $p.FullName) } catch { continue }
  if ($t.Contains("format=pdf")) { $pageU = $p; $texteU = $t; break }
}
if ($pageU -and $texteU) {
  $relatifU = $pageU.FullName.Substring((Get-Location).Path.Length).TrimStart([char]92).TrimStart([char]47)
  $nouveau = [regex]::Replace($texteU, '/api/public-cv\?([^"\x27\x60]*?)&format=pdf', '/api/public-cv/pdf?$1')
  $nouveau = [regex]::Replace($nouveau, '/api/public-cv\?format=pdf&?', '/api/public-cv/pdf?')
  if ($nouveau -ne $texteU) {
    $null = Backup-File $relatifU "pdf-repoint"
    Write-TextFile $relatifU $nouveau
    Write-Host "  [OK] bouton PDF public redirige (fichier : $relatifU)"
  } else {
    Write-Host "  [=] aucune URL format=pdf trouvable - redirection non necessaire"
  }
} else {
  Write-Host "  [=] aucun page.tsx contenant format=pdf - redirection non necessaire"
}

# ============================ [6/6] ============================
Write-Host ""
Write-Host "[6/6] Verification..."
$hubVerif = Read-TextFile $builderRoot
if (-not $hubVerif.Contains("CvLibraryPage")) {
  throw "VERIFICATION : le hub ne contient pas CvLibraryPage - installation incomplete."
}
$creVerif = Read-TextFile $createurPath
if ($p1Ok -and -not $creVerif.Contains("cvHydratedRef")) {
  throw "VERIFICATION : le createur ne contient pas la synchronisation DB (P1)."
}
if (-not $p1Ok) {
  Write-Host "  [!] AVERTISSEMENT : la synchronisation DB du createur (P1) est inactive."
  Write-Host "      Copiez le message d'ancre ci-dessus et envoyez-le a l'assistant."
}
$routesAttendues = @(
  "src/app/api/cv/route.ts",
  "src/app/api/cv/[id]/route.ts",
  "src/app/api/cv/[id]/restore/route.ts",
  "src/app/api/cv/[id]/purge/route.ts",
  "src/app/api/public-cv/pdf/route.ts",
  "src/lib/cv-publish-payload.ts",
  "src/types/qrcode.d.ts"
)
foreach ($r in $routesAttendues) {
  if (-not [System.IO.File]::Exists((Join-Path (Get-Location).Path $r))) {
    throw "VERIFICATION : fichier manquant : $r"
  }
}
Write-Host "  [OK] tous les fichiers de la bibliotheque sont en place"

if (-not $SkipTsc) {
  if ([System.IO.Directory]::Exists((Join-Path (Get-Location).Path "node_modules"))) {
    Write-Host "  [..] npx tsc --noEmit (1-2 min)..."
    $outTsc = & npx tsc --noEmit 2>&1
    if ($LASTEXITCODE -ne 0) {
      Write-Host "  [!] tsc signale des erreurs (codes affiches ci-dessous) :"
      $outTsc | Select-Object -First 20 | ForEach-Object { Write-Host ("      " + $_) }
      Write-Host "      -> envoyez ces lignes a l'assistant si elles concernent les nouveaux fichiers."
    } else {
      Write-Host "  [OK] tsc : aucune erreur de type"
    }
  } else {
    Write-Host "  [=] node_modules absent : lancez 'npm install' avant tsc"
  }
} else {
  Write-Host "  [=] -SkipTsc : verification de types ignoree"
}

Write-Host ""
Write-Host "=============================================================="
Write-Host " VERDICT + PROTOCOLE DE TEST localhost:3000"
Write-Host "=============================================================="
Write-Host " [1] OBLIGATOIRE - creez la table :  npx prisma db push"
Write-Host "     (ajout additif d'une table : aucune donnee existante perdue)"
Write-Host " [2] Redemarrez le serveur : Ctrl+C puis 'npm run dev'"
Write-Host " [3] Ouvrez http://localhost:3000/dashboard/cv-builder"
Write-Host "     -> hub : statistiques + liste + bouton Generer / Creer un CV"
Write-Host " [4] Cliquez 'Generer / Creer un CV' -> createur ?cv=<id> ;"
Write-Host "     modifiez un champ : statut 'Base enregistree a HH:MM' dans l'entete"
Write-Host " [5] De retour sur le hub : le CV apparaît, actions par ligne :"
Write-Host "     Renommer / Modifier / PDF / Publier en ligne / Copier le lien /"
Write-Host "     Supprimer (corbeille 30 jours, restauration possible)"
Write-Host " [6] PDF public : http://localhost:3000/u/kouton-clement puis 'PDF avec QR'"
Write-Host "     (desormais servi par /api/public-cv/pdf?slug=...)"
Write-Host " [7] Le CV local existant est migre automatiquement : ouvrez une fois"
Write-Host "     http://localhost:3000/dashboard/cv-builder/createur puis le hub."
Write-Host ""
Write-Host " Git : ne commitez pas les fichiers .bak (regle 1.4 AGENTS.md)."
exit 0
