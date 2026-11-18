"use client";

/**
 * Panneau Historique : dossiers générés + scans enregistrés en base
 * (tables GeneratedDossier et ScanRun). Actions :
 *  - restaurer un dossier dans le panneau Dossier (localStorage + CustomEvent),
 *  - télécharger les PDF à nouveau,
 *  - supprimer un élément.
 * TOUJOURS monté : le chargement démarre dès l'ouverture du dashboard.
 */

import { useCallback, useEffect, useState } from "react";
import {
  IconAlertCircle,
  IconFileText,
  IconHistory,
  IconLoader2,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconTrash,
  IconWand,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { cx } from "@/lib/ui-classes";
import type { HistoryResponse } from "@/lib/types";
import type { TemplateId } from "@/lib/cv-templates";
import { isTemplateId } from "@/lib/cv-templates";
import {
  downloadCvPdf,
  downloadKitPdf,
  downloadLetterPdf,
} from "@/lib/pdf-client";

const RESTORE_STORAGE_KEY = "nexirole:restore-dossier";
const RESTORE_EVENT = "nexirole:restore-dossier";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistoryPanel() {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/history", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | (HistoryResponse & { error?: string })
        | null;
      if (res.status === 401) {
        setError("Connectez-vous pour consulter votre historique.");
        return;
      }
      if (!res.ok || !json) {
        throw new Error(json?.error ?? "Chargement impossible.");
      }
      setData({ dossiers: json.dossiers ?? [], scans: json.scans ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(type: "dossier" | "scan", id: string) {
    try {
      const res = await fetch(`/api/history?type=${type}&id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setData((prev) =>
        prev
          ? {
              dossiers:
                type === "dossier"
                  ? prev.dossiers.filter((d) => d.id !== id)
                  : prev.dossiers,
              scans:
                type === "scan" ? prev.scans.filter((s) => s.id !== id) : prev.scans,
            }
          : prev
      );
      toast.success("Élément supprimé");
    } catch {
      toast.error("Suppression impossible");
    }
  }

  function restoreDossier(index: number) {
    const item = data?.dossiers[index];
    if (!item) return;
    window.localStorage.setItem(
      RESTORE_STORAGE_KEY,
      JSON.stringify({ data: item.data })
    );
    window.dispatchEvent(new CustomEvent(RESTORE_EVENT));
    toast.success("Dossier ouvert dans le générateur");
  }

  async function download(
    key: string,
    fn: () => Promise<void>
  ) {
    setDownloading(key);
    try {
      await fn();
      toast.success("PDF téléchargé");
    } catch {
      toast.error("La génération du PDF a échoué");
    } finally {
      setDownloading(null);
    }
  }

  /* ── Rendu ─────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500 shadow-sm">
        <IconLoader2 className="size-4 animate-spin text-navy" />
        Chargement de votre historique…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
        <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
        {error}
      </div>
    );
  }

  const dossiers = data?.dossiers ?? [];
  const scans = data?.scans ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-navy">
            <IconHistory className="size-5 text-gold" />
            Votre historique
          </h2>
          <p className="text-sm text-slate-500">
            Tous vos dossiers générés et scans d&apos;offres, enregistrés automatiquement.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-navy transition hover:bg-slate-50"
        >
          <IconRefresh className="size-3.5" />
          Actualiser
        </button>
      </div>

      {/* ── Dossiers générés ──────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-navy">
          <IconWand className="size-4.5 text-gold" />
          Dossiers générés ({dossiers.length})
        </h3>
        {dossiers.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
            Aucun dossier pour le moment — génère ton premier dossier dans
            l&apos;onglet Dossier.
          </p>
        ) : (
          <div className="space-y-2.5">
            {dossiers.map((item, index) => {
              const templateId: TemplateId = isTemplateId(item.templateId)
                ? item.templateId
                : "modern-accent";
              const key = `dossier-${item.id}`;
              return (
                <article
                  key={item.id}
                  className="rounded-xl border border-slate-200 p-3 transition hover:border-navy/30"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-navy">
                        {item.offreTitre}
                        {item.offreEntreprise ? (
                          <span className="font-medium text-slate-500"> — {item.offreEntreprise}</span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {formatDate(item.createdAt)} ·{" "}
                        {item.data?.kit_entretien?.score !== undefined
                          ? `compatibilité ${item.data.kit_entretien.score}%`
                          : "CV générique"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => restoreDossier(index)}
                        className="inline-flex items-center gap-1 rounded-full bg-navy px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-navy/90"
                      >
                        <IconFileText className="size-3.5" />
                        Ouvrir
                      </button>
                      <button
                        type="button"
                        disabled={downloading !== null}
                        onClick={() =>
                          void download(key + "-cv", () =>
                            downloadCvPdf(item.data, templateId, null)
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-navy transition hover:bg-slate-50 disabled:opacity-60"
                      >
                        {downloading === key + "-cv" ? (
                          <IconLoader2 className="size-3.5 animate-spin" />
                        ) : (
                          <IconFileText className="size-3.5" />
                        )}
                        CV
                      </button>
                      <button
                        type="button"
                        disabled={downloading !== null}
                        onClick={() =>
                          void download(key + "-lettre", () =>
                            downloadLetterPdf(item.data, templateId)
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-navy transition hover:bg-slate-50 disabled:opacity-60"
                      >
                        Lettre
                      </button>
                      {item.data?.kit_entretien && (
                        <button
                          type="button"
                          disabled={downloading !== null}
                          onClick={() =>
                            void download(key + "-kit", () =>
                              downloadKitPdf(item.data, templateId)
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-full bg-gold px-3 py-1.5 text-[11px] font-bold text-navy transition hover:brightness-105 disabled:opacity-60"
                        >
                          <IconSparkles className="size-3.5" />
                          Kit
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void remove("dossier", item.id)}
                        className="inline-flex size-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        aria-label="Supprimer ce dossier"
                      >
                        <IconTrash className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Scans enregistrés ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-navy">
          <IconSearch className="size-4.5 text-gold" />
          Scans de l&apos;Agent ({scans.length})
        </h3>
        {scans.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
            Aucun scan pour le moment — lance ta première recherche dans
            l&apos;onglet Agent.
          </p>
        ) : (
          <div className="space-y-2">
            {scans.map((scan) => (
              <article
                key={scan.id}
                className={cx(
                  "flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 transition hover:border-navy/30"
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-navy">
                    {scan.requete ? `« ${scan.requete} »` : "Recherche intelligente (mots-clés du CV)"}
                    {scan.remoteOnly ? " · remote uniquement" : ""}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {formatDate(scan.createdAt)} · {scan.nbOffres} offres
                    {scan.motscles?.titre ? ` · métier : ${scan.motscles.titre}` : ""}
                    {scan.motscles?.motsCles?.length
                      ? ` · ${scan.motscles.motsCles.join(", ")}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void remove("scan", scan.id)}
                  className="inline-flex size-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  aria-label="Supprimer ce scan"
                >
                  <IconTrash className="size-3.5" />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}