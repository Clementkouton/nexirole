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
