"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  IconExternalLink,
  IconFolder,
  IconRefresh,
  IconRobot,
  IconTrash,
} from "@tabler/icons-react";
import {
  fetchHistory,
  formatDateFr,
  removeLocalDossier,
  type HistoryData,
} from "@/lib/dashboard-client";

export default function HistoriquePage() {
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enSuppression, setEnSuppression] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setErreur(null);
    try {
      setData(await fetchHistory());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const supprimer = async (id: string) => {
    setEnSuppression(id);
    setErreur(null);
    try {
      if (id.startsWith("local-")) {
        removeLocalDossier(id);
      } else {
        let ok = false;
        try {
          const reponse1 = await fetch(`/api/history?id=${encodeURIComponent(id)}`, { method: "DELETE" });
          ok = reponse1.ok;
        } catch {
          /* on tente l'autre forme d'endpoint */
        }
        if (!ok) {
          try {
            const reponse2 = await fetch(`/api/history/${encodeURIComponent(id)}`, { method: "DELETE" });
            ok = reponse2.ok;
          } catch {
            /* échec final géré ci-dessous */
          }
        }
        if (!ok) setErreur("La suppression a échoué côté serveur — vérifie le log du terminal.");
      }
    } finally {
      setEnSuppression(null);
      void charger();
    }
  };

  const dossiers = data?.dossiers ?? [];
  const scans = data?.scans ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#051937] md:text-3xl">Historique</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Tes dossiers générés et tes scans de l&apos;agent, enregistrés automatiquement.
          </p>
        </div>
        <button
          onClick={() => void charger()}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-[#051937] shadow-sm transition hover:border-[#FFC107] disabled:opacity-60"
        >
          <IconRefresh size={18} stroke={1.8} className={loading ? "animate-spin" : undefined} />
          Actualiser
        </button>
      </div>

      {erreur && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">{erreur}</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm font-medium text-slate-400">Chargement de l&apos;historique…</p>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <h2 className="mb-4 text-base font-extrabold text-[#051937]">
              Dossiers générés <span className="text-slate-400">({dossiers.length})</span>
            </h2>
            {dossiers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                <p className="text-sm font-semibold text-slate-500">
                  Aucun dossier pour l&apos;instant — génère ton premier dossier depuis l&apos;Agent.
                </p>
                <Link
                  href="/dashboard/agent"
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#051937] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#0A2A5C]"
                >
                  Lancer l&apos;Agent de recherche
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {dossiers.map((dossier) => (
                  <li key={dossier.id} className="flex items-center gap-3 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#051937]/10 text-[#051937]">
                      <IconFolder size={18} stroke={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-bold text-[#051937]">{dossier.titre}</p>
                        {dossier.source === "local" && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            local
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs font-medium text-slate-500">
                        {dossier.entreprise ? `${dossier.entreprise} — ` : ""}
                        {formatDateFr(dossier.createdAt)}
                      </p>
                    </div>
                    {dossier.url && (
                      <a
                        href={dossier.url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:text-[#051937]"
                        title="Voir l'offre"
                      >
                        <IconExternalLink size={16} stroke={1.8} />
                      </a>
                    )}
                    <button
                      onClick={() => void supprimer(dossier.id)}
                      disabled={enSuppression === dossier.id}
                      className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:text-red-600 disabled:opacity-50"
                      title="Supprimer"
                    >
                      <IconTrash size={16} stroke={1.8} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <h2 className="mb-4 text-base font-extrabold text-[#051937]">
              Scans de l&apos;Agent <span className="text-slate-400">({scans.length})</span>
            </h2>
            {scans.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                <p className="text-sm font-semibold text-slate-500">Aucun scan pour l&apos;instant.</p>
                <Link
                  href="/dashboard/agent"
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#FFC107] px-4 py-2.5 text-sm font-bold text-[#051937] transition hover:bg-[#FFD54F]"
                >
                  Lancer une recherche en direct
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {scans.map((scan) => (
                  <li key={scan.id} className="flex items-start gap-3 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFC107]/25 text-[#7A5C00]">
                      <IconRobot size={18} stroke={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[#051937]">{scan.titre}</p>
                      <p className="truncate text-xs font-medium text-slate-500">
                        {scan.metier ? `${scan.metier} — ` : ""}
                        {scan.offres ? `${scan.offres} offres — ` : ""}
                        {formatDateFr(scan.createdAt)}
                      </p>
                      {scan.keywords.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {scan.keywords.map((mot, index) => (
                            <span
                              key={`${mot}-${index}`}
                              className="rounded-full bg-[#051937]/5 px-2.5 py-1 text-xs font-bold text-[#051937]"
                            >
                              {mot}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => void supprimer(scan.id)}
                      disabled={enSuppression === scan.id}
                      className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:text-red-600 disabled:opacity-50"
                      title="Supprimer"
                    >
                      <IconTrash size={16} stroke={1.8} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}