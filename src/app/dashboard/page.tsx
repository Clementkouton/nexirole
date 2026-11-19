"use client";

import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import {
  IconChevronRight,
  IconFileText,
  IconFolder,
  IconRefresh,
  IconRobot,
  IconTarget,
} from "@tabler/icons-react";
import { fetchHistory, formatDateFr, type HistoryData } from "@/lib/dashboard-client";
import { Suspense } from "react";
import { PaymentSuccessBanner, LicenseOverviewCard } from "@/components/dashboard/payment-banner";


type Activite = {
  kind: "dossier" | "scan";
  id: string;
  date: string;
  titre: string;
  meta?: string;
};

export default function VueEnsemblePage() {
  const [userName, setUserName] = useState<string | null>(null);
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchHistory());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void charger();
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((session) => {
        const nom = session?.user?.name ?? session?.user?.email?.split("@")[0] ?? null;
        setUserName(typeof nom === "string" && nom.trim().length > 0 ? nom : null);
      })
      .catch(() => {
        /* session indisponible : accueil neutre */
      });
  }, [charger]);

  const dossiers = data?.dossiers ?? [];
  const scans = data?.scans ?? [];
  const offresDetectees = scans.reduce((total, scan) => total + (scan.offres ?? 0), 0);

  const activite: Activite[] = [
    ...dossiers.map((dossier) => ({
      kind: "dossier" as const,
      id: dossier.id,
      date: dossier.createdAt,
      titre: dossier.titre,
      meta: dossier.entreprise ?? undefined,
    })),
    ...scans.map((scan) => ({
      kind: "scan" as const,
      id: scan.id,
      date: scan.createdAt,
      titre: scan.titre,
      meta: scan.offres ? `${scan.offres} offres détectées` : scan.metier,
    })),
  ]
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 6);

  return (
    <div className="space-y-8">
      <Suspense fallback={null}><PaymentSuccessBanner /></Suspense>
      <LicenseOverviewCard />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#051937] md:text-3xl">Vue d&apos;ensemble</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {userName ? `Bonjour ${userName} — ` : ""}ta recherche d&apos;emploi pilotée par l&apos;IA, au même endroit.
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

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<IconFolder size={22} stroke={1.8} />} label="Dossiers générés" value={dossiers.length} href="/dashboard/historique" />
        <StatCard icon={<IconRobot size={22} stroke={1.8} />} label="Scans de l'agent" value={scans.length} href="/dashboard/historique" />
        <StatCard icon={<IconTarget size={22} stroke={1.8} />} label="Offres détectées" value={scans.length > 0 ? offresDetectees : null} href="/dashboard/agent" />
      </div>

      <div>
        <h2 className="mb-3 text-base font-extrabold text-[#051937]">Actions rapides</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <ActionCard
            href="/dashboard/agent"
            icon={IconRobot}
            titre="Agent de recherche en direct"
            texte="Lance une recherche en direct sur Remotive et Arbeitnow avec tes mots-clés."
          />
          <ActionCard
            href="/dashboard/dossier"
            icon={IconFolder}
            titre="Dossier & documents"
            texte="Génère CV, lettre de motivation et kit d'entretien pour une offre ciblée."
          />
          <ActionCard
            href="/dashboard/cv-builder"
            icon={IconFileText}
            titre="Créateur de CV"
            texte="Construis et adapte ton CV avec les modèles ATS."
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-[#051937]">Activité récente</h2>
          <Link href="/dashboard/historique" className="text-xs font-bold text-amber-600 hover:text-amber-700">
            Voir l&apos;historique
          </Link>
        </div>

        {loading ? (
          <p className="text-sm font-medium text-slate-400">Chargement de l&apos;historique…</p>
        ) : activite.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
            <p className="text-sm font-semibold text-slate-500">Aucune activité pour le moment.</p>
            <Link
              href="/dashboard/agent"
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#051937] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#0A2A5C]"
            >
              Lancer ma première recherche
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {activite.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex items-center gap-3 py-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    item.kind === "dossier" ? "bg-[#051937]/10 text-[#051937]" : "bg-[#FFC107]/25 text-[#7A5C00]"
                  }`}
                >
                  {item.kind === "dossier" ? <IconFolder size={18} stroke={1.8} /> : <IconRobot size={18} stroke={1.8} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[#051937]">{item.titre}</p>
                  <p className="truncate text-xs font-medium text-slate-500">
                    {item.kind === "dossier" ? "Dossier généré" : "Scan de l'agent"}
                    {item.meta ? ` — ${item.meta}` : ""} — {formatDateFr(item.date)}
                  </p>
                </div>
                <IconChevronRight size={16} stroke={2} className="shrink-0 text-slate-300" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  href,
}: {
  icon: ReactNode;
  label: string;
  value: number | null;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#FFC107]"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#051937]/10 text-[#051937]">{icon}</span>
        <IconChevronRight size={16} stroke={2} className="text-slate-300 transition group-hover:translate-x-0.5" />
      </div>
      <p className="mt-3 text-2xl font-extrabold text-[#051937]">{value === null ? "—" : value}</p>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
    </Link>
  );
}

function ActionCard({
  href,
  icon: Icon,
  titre,
  texte,
}: {
  href: string;
  icon: ComponentType<{ size?: number; stroke?: number; className?: string }>;
  titre: string;
  texte: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#FFC107]"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFC107]/25 text-[#7A5C00]">
          <Icon size={20} stroke={1.8} />
        </span>
        <IconChevronRight size={16} stroke={2} className="text-slate-300 transition group-hover:translate-x-0.5" />
      </div>
      <p className="mt-3 text-sm font-extrabold text-[#051937]">{titre}</p>
      <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{texte}</p>
    </Link>
  );
}