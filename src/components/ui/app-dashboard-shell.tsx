"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  IconArrowDown,
  IconArrowUp,
  IconBriefcase,
  IconChartAreaLine,
  IconChevronLeft,
  IconChevronRight,
  IconCircleCheck,
  IconClock,
  IconExternalLink,
  IconFileDescription,
  IconFileText,
  IconFolders,
  IconHome,
  IconLayoutDashboard,
  IconMenu2,
  IconRadar,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconStar,
  IconTable,
  IconTargetArrow,
  IconUpload,
  IconWand,
  IconX,
} from "@tabler/icons-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { CvUpload } from "@/components/dashboard/cv-upload";
import {
  GenerateMode,
  type PrefillPayload,
} from "@/components/dashboard/generate-mode";
import { SearchMode } from "@/components/dashboard/search-mode";
import { cx } from "@/lib/ui-classes";
import type {
  ApplicationResponse,
  CvFileValue,
  ScoredJob,
  SearchJobsResponse,
} from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ViewId = "overview" | "generate" | "agent";

interface ShellUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface RankedJob {
  job: ScoredJob;
  rank: number;
}

type IconType = React.ComponentType<{ className?: string }>;

interface AppDashboardShellProps {
  user: ShellUser;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Réduit une série à ~14 points pour les sparklines. */
function downsample(values: number[], maxPoints = 14): number[] {
  if (values.length === 0) return [];
  if (values.length <= maxPoints) return values;
  const step = (values.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => values[Math.round(i * step)]);
}

function scoreBadgeStyle(score: number): { pill: string; label: string } {
  if (score >= 80)
    return {
      pill: "bg-gold-soft text-accent-foreground border border-gold/50",
      label: "Excellente",
    };
  if (score >= 60)
    return { pill: "bg-navy-50 text-navy border border-navy/10", label: "Bonne" };
  if (score >= 40)
    return { pill: "bg-slate-100 text-slate-600 border border-slate-200", label: "Partielle" };
  return { pill: "bg-slate-100 text-slate-400 border border-slate-200", label: "Faible" };
}

/* ------------------------------------------------------------------ */
/*  Sparkline SVG (mini-courbe des cartes KPI)                         */
/* ------------------------------------------------------------------ */

function Sparkline({
  data,
  stroke,
  gradientId,
}: {
  data: number[];
  stroke: string;
  gradientId: string;
}) {
  const W = 120;
  const H = 42;
  const pad = 4;
  const ready = data.length >= 2;
  const max = ready ? Math.max(...data) : 1;
  const min = ready ? Math.min(...data) : 0;
  const span = max - min || 1;
  const pts = ready
    ? data.map(
        (v, i) =>
          [
            pad + (i / (data.length - 1)) * (W - 2 * pad),
            H - pad - ((v - min) / span) * (H - 2 * pad),
          ] as const
      )
    : [];
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  const area = ready
    ? `${line} L${pts[pts.length - 1][0].toFixed(1)} ${H - pad} L${pts[0][0].toFixed(1)} ${H - pad} Z`
    : "";
  const last = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[42px] w-[120px] shrink-0" aria-hidden="true">
      {ready ? (
        <>
          <defs>
            <linearGradient id={`spark-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#spark-${gradientId})`} />
          <path d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={last[0]} cy={last[1]} r={3} fill={stroke} />
        </>
      ) : (
        <line x1={pad} y1={H / 2} x2={W - pad} y2={H / 2} stroke="#e2e8f0" strokeWidth={2} strokeDasharray="4 4" />
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Carte KPI                                                          */
/* ------------------------------------------------------------------ */

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  spark,
  sparkId,
  goldSpark = false,
  children,
}: {
  icon: IconType;
  label: string;
  value: string;
  sub: string;
  spark: number[];
  sparkId: string;
  goldSpark?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-navy">
          <Icon className="size-5 text-gold" />
        </span>
        <Sparkline
          data={spark}
          stroke={goldSpark ? "#ffc107" : "#051937"}
          gradientId={sparkId}
        />
      </div>
      <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 font-heading text-3xl font-extrabold tabular-nums text-navy">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Graphique répartition des scores par source (SVG, sans dépendance) */
/* ------------------------------------------------------------------ */

function SourceAreaChart({
  remotive,
  arbeitnow,
}: {
  remotive: number[];
  arbeitnow: number[];
}) {
  const W = 660;
  const H = 250;
  const padL = 38;
  const padR = 14;
  const padT = 16;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const hasData = remotive.length + arbeitnow.length > 0;

  if (!hasData) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-ice px-6 py-12 text-center">
        <IconChartAreaLine className="mx-auto size-8 text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-navy">
          Aucune donnée à visualiser
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Lancez un scan dans l&apos;Agent Recherche : la courbe comparera les
          scores Remotive (marine) et Arbeitnow (or).
        </p>
      </div>
    );
  }

  const yFor = (score: number) =>
    padT + (1 - Math.min(100, Math.max(0, score)) / 100) * innerH;

  const buildPath = (data: number[]) => {
    if (data.length === 0) return { line: "", area: "" };
    const pts = data.map((v, i) => {
      const x =
        data.length === 1
          ? padL + innerW / 2
          : padL + (i / (data.length - 1)) * innerW;
      return [x, yFor(v)] as const;
    });
    const line = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
      .join(" ");
    const bottom = (padT + innerH).toFixed(1);
    const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${bottom} L${pts[0][0].toFixed(1)} ${bottom} Z`;
    return { line, area };
  };

  const r = buildPath(remotive);
  const a = buildPath(arbeitnow);
  const n = Math.max(remotive.length, arbeitnow.length);
  const tickStep = Math.max(1, Math.ceil(n / 8));
  const ticks = Array.from({ length: n }, (_, i) => i).filter(
    (i) => i % tickStep === 0 || i === n - 1
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs font-bold text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-navy" /> Remotive
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-gold" /> Arbeitnow
        </span>
        <span className="ml-auto text-[10px] font-medium text-slate-400">
          Axe horizontal : rang par score décroissant · axe vertical : score %
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" aria-hidden="true">
        <defs>
          <linearGradient id="area-navy" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#051937" stopOpacity={0.16} />
            <stop offset="100%" stopColor="#051937" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="area-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffc107" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#ffc107" stopOpacity={0} />
          </linearGradient>
        </defs>

        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line
              x1={padL}
              y1={yFor(v)}
              x2={W - padR}
              y2={yFor(v)}
              stroke={v === 0 ? "#cbd5e1" : "#e2e8f0"}
              strokeWidth={1}
            />
            <text
              x={padL - 8}
              y={yFor(v) + 3}
              textAnchor="end"
              fontSize={10}
              fill="#94a3b8"
            >
              {v}
            </text>
          </g>
        ))}

        {ticks.map((i) => (
          <text
            key={i}
            x={
              n === 1
                ? padL + innerW / 2
                : padL + (i / (n - 1)) * innerW
            }
            y={H - 8}
            textAnchor="middle"
            fontSize={10}
            fill="#94a3b8"
          >
            {i + 1}
          </text>
        ))}

        {a.area && <path d={a.area} fill="url(#area-gold)" />}
        {a.line && (
          <path d={a.line} fill="none" stroke="#ffc107" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {r.area && <path d={r.area} fill="url(#area-navy)" />}
        {r.line && (
          <path d={r.line} fill="none" stroke="#051937" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Vue tableau du graphique : synthèse par source                     */
/* ------------------------------------------------------------------ */

function SourceSummaryTable({ ranked }: { ranked: RankedJob[] }) {
  const remotive = ranked.filter((r) => r.job.source === "remotive");
  const arbeitnow = ranked.filter((r) => r.job.source === "arbeitnow");

  function row(label: string, dotClass: string, rows: RankedJob[]) {
    const count = rows.length;
    const avg = count
      ? Math.round(rows.reduce((s, r) => s + r.job.score, 0) / count)
      : 0;
    const best = count ? Math.max(...rows.map((r) => r.job.score)) : 0;
    const high = rows.filter((r) => r.job.score >= 80).length;
    const dates = rows
      .map((r) => r.job.postedAt)
      .filter((d): d is string => Boolean(d))
      .sort();
    const latest = dates.length > 0 ? dates[dates.length - 1] : "—";
    return (
      <tr className="border-b border-slate-100 last:border-0">
        <td className="px-4 py-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-navy">
            <span className={cx("size-2.5 rounded-full", dotClass)} />
            {label}
          </span>
        </td>
        <td className="px-4 py-3 text-xs font-semibold tabular-nums text-navy">{count}</td>
        <td className="px-4 py-3 text-xs font-semibold tabular-nums text-navy">
          {count ? `${avg} %` : "—"}
        </td>
        <td className="px-4 py-3 text-xs font-semibold tabular-nums text-navy">
          {count ? `${best} %` : "—"}
        </td>
        <td className="px-4 py-3 text-xs font-semibold tabular-nums text-navy">{high}</td>
        <td className="px-4 py-3 text-xs text-slate-500">{latest}</td>
      </tr>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left">
        <thead>
          <tr className="border-b border-slate-200 bg-ice text-[11px] uppercase tracking-wider text-slate-500">
            <th className="px-4 py-3 font-bold">Source</th>
            <th className="px-4 py-3 font-bold">Offres</th>
            <th className="px-4 py-3 font-bold">Score moyen</th>
            <th className="px-4 py-3 font-bold">Meilleur score</th>
            <th className="px-4 py-3 font-bold">Haute pertinence (&gt;80 %)</th>
            <th className="px-4 py-3 font-bold">Dernière publication</th>
          </tr>
        </thead>
        <tbody>
          {row("Remotive", "bg-navy", remotive)}
          {row("Arbeitnow", "bg-gold", arbeitnow)}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shell principal                                                    */
/* ------------------------------------------------------------------ */

const NAV_ITEMS: Array<{
  id: ViewId;
  label: string;
  hint?: string;
  icon: IconType;
}> = [
  { id: "overview", label: "Vue d'ensemble & Scores", icon: IconLayoutDashboard },
  { id: "generate", label: "CV & Lettre par Lien d'offre", icon: IconFileText },
  {
    id: "agent",
    label: "Agent Recherche en Direct",
    hint: "Remotive + Arbeitnow",
    icon: IconRadar,
  },
];

export function AppDashboardShell({ user }: AppDashboardShellProps) {
  /* État navigation */
  const [view, setView] = useState<ViewId>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  /* État candidat (partagé entre toutes les vues) */
  const [cvFile, setCvFile] = useState<CvFileValue | null>(null);
  const [profileText, setProfileText] = useState("");

  /* État données du dashboard */
  const [scan, setScan] = useState<SearchJobsResponse | null>(null);
  const [scannedAt, setScannedAt] = useState<Date | null>(null);
  const [prefill, setPrefill] = useState<PrefillPayload | null>(null);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [generatedIds, setGeneratedIds] = useState<string[]>([]);
  const [dossierCount, setDossierCount] = useState(0);
  const [dossierHistory, setDossierHistory] = useState<number[]>([0]);

  /* État tableau : recherche, filtre source, tri */
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "remotive" | "arbeitnow">("all");
  const [sortKey, setSortKey] = useState<"rank" | "score" | "date">("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [chartMode, setChartMode] = useState<"chart" | "table">("chart");

  const searchRef = useRef<HTMLInputElement>(null);

  /* Raccourci Ctrl/Cmd + K : focus sur la recherche rapide */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const firstName = user.name?.trim().split(/\s+/)[0] || "cher utilisateur";
  const initial = firstName.charAt(0).toUpperCase();
  const ranked: RankedJob[] = scan?.jobs.map((job, i) => ({ job, rank: i + 1 })) ?? [];
  const scores = ranked.map((r) => r.job.score);
  const total = ranked.length;
  const avgScore = total
    ? Math.round(scores.reduce((s, v) => s + v, 0) / total)
    : 0;
  const highCount = scores.filter((v) => v >= 80).length;
  const remotiveScores = ranked
    .filter((r) => r.job.source === "remotive")
    .map((r) => r.job.score);
  const arbeitnowScores = ranked
    .filter((r) => r.job.source === "arbeitnow")
    .map((r) => r.job.score);

  /* Séries des sparklines */
  const sparkOffres = downsample(scores.map((_, i) => i + 1));
  const sparkScore = downsample(
    scores.map((_, i) => {
      const w = scores.slice(Math.max(0, i - 2), i + 1);
      return Math.round(w.reduce((s, v) => s + v, 0) / w.length);
    })
  );
  let highAcc = 0;
  const sparkHigh = downsample(scores.map((v) => (v >= 80 ? ++highAcc : highAcc)));
  const sparkDossiers = dossierHistory;

  /* Tableau : filtres + recherche instantanée + tri */
  const visibleJobs: RankedJob[] = (() => {
    let list = ranked;
    if (sourceFilter !== "all") {
      list = list.filter((r) => r.job.source === sourceFilter);
    }
    const q = normalize(query.trim());
    if (q.length >= 2) {
      const tokens = q.split(/\s+/).filter(Boolean);
      list = list.filter((r) => {
        const hay = normalize(
          `${r.job.title} ${r.job.company} ${r.job.location} ${r.job.tags.join(" ")}`
        );
        return tokens.every((t) => hay.includes(t));
      });
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "score") return (a.job.score - b.job.score) * dir;
      if (sortKey === "date") {
        const da = a.job.postedAt ? Date.parse(a.job.postedAt) : 0;
        const db = b.job.postedAt ? Date.parse(b.job.postedAt) : 0;
        return (da - db) * dir;
      }
      return (a.rank - b.rank) * dir;
    });
  })();

  function toggleSort(key: "rank" | "score" | "date") {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "rank" ? "asc" : "desc");
    }
  }

  /* Flux : scan réussi (Agent Recherche) → alimente KPIs, graphique et tableau */
  function handleScanResults(results: SearchJobsResponse) {
    setScan(results);
    setScannedAt(new Date());
  }

  /* Flux : génération demandée depuis une offre (agent ou tableau) */
  function handleGenerateForJob(job: ScoredJob) {
    setPrefill({ jobUrl: job.url, jobLabel: `${job.title} — ${job.company}` });
    setPendingJobId(job.id);
    setView("generate");
    setMobileOpen(false);
  }

  /* Flux : dossier généré → KPI « Dossiers » + statut « CV généré » */
  function handleGenerated(_result: ApplicationResponse) {
    setDossierCount((c) => c + 1);
    setDossierHistory((h) => [...h, h[h.length - 1] + 1]);
    if (pendingJobId) {
      setGeneratedIds((ids) =>
        ids.includes(pendingJobId) ? ids : [...ids, pendingJobId]
      );
    }
    setPendingJobId(null);
  }

  /* -------- Navigation latérale (partagée desktop / tiroir mobile) ---- */
  function renderNavItems(isCollapsed: boolean) {
    return (
      <>
        <p
          className={cx(
            "px-3 pb-1.5 pt-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400",
            isCollapsed && "text-center px-0"
          )}
        >
          {isCollapsed ? "•" : "Menu"}
        </p>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setView(item.id);
                setMobileOpen(false);
              }}
              title={isCollapsed ? item.label : undefined}
              aria-current={active ? "page" : undefined}
              className={cx(
                "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                isCollapsed && "justify-center px-2",
                active
                  ? "bg-navy text-white shadow-[0_8px_20px_-8px_rgba(5,25,55,0.55)]"
                  : "text-slate-600 hover:bg-navy-50 hover:text-navy"
              )}
            >
              <Icon
                className={cx(
                  "size-5 shrink-0",
                  active ? "text-gold" : "text-slate-400 group-hover:text-navy-600"
                )}
              />
              {!isCollapsed && (
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate">{item.label}</span>
                  {item.hint && (
                    <span
                      className={cx(
                        "block text-[10px] font-medium",
                        active ? "text-white/60" : "text-slate-400"
                      )}
                    >
                      {item.hint}
                    </span>
                  )}
                </span>
              )}
              {!isCollapsed && active && (
                <span className="size-1.5 shrink-0 rounded-full bg-gold" />
              )}
            </button>
          );
        })}

        <p
          className={cx(
            "px-3 pb-1.5 pt-4 text-[10px] font-extrabold uppercase tracking-widest text-slate-400",
            isCollapsed && "text-center px-0"
          )}
        >
          {isCollapsed ? "•" : "Outils"}
        </p>

        <Link
          href="/cv-builder"
          title={isCollapsed ? "Créateur de CV PDF" : undefined}
          className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-navy-50 hover:text-navy"
        >
          <IconFileDescription className="size-5 shrink-0 text-slate-400 group-hover:text-navy-600" />
          {!isCollapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate">Créateur de CV PDF</span>
              <span className="block text-[10px] font-medium text-slate-400">
                Formulaire guidé + export PDF
              </span>
            </span>
          )}
        </Link>

        <Link
          href="/"
          title={isCollapsed ? "Retour au site" : undefined}
          className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-navy-50 hover:text-navy"
        >
          <IconHome className="size-5 shrink-0 text-slate-400 group-hover:text-navy-600" />
          {!isCollapsed && <span className="truncate">Retour au site</span>}
        </Link>
      </>
    );
  }

  function renderSidebarFooter(isCollapsed: boolean) {
    if (isCollapsed) {
      return (
        <div className="border-t border-slate-200 p-3">
          <span
            className="mx-auto flex size-9 items-center justify-center rounded-full bg-navy font-heading text-sm font-bold text-gold"
            title={user.email ?? "Compte NexiRole"}
          >
            {initial}
          </span>
        </div>
      );
    }
    return (
      <div className="border-t border-slate-200 p-3">
        <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-ice p-2.5">
          {user.image ? (
            <img
              src={user.image}
              alt=""
              className="size-9 rounded-full object-cover"
            />
          ) : (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy font-heading text-sm font-bold text-gold">
              {initial}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-navy">{user.name ?? "Utilisateur"}</p>
            <p className="truncate text-[11px] text-slate-500">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SignOutButton />
        </div>
      </div>
    );
  }

  const logoBlock = (isCollapsed: boolean) => (
    <div
      className={cx(
        "flex items-center gap-2.5 border-b border-slate-200 px-4 py-4",
        isCollapsed && "justify-center px-2"
      )}
    >
      <img
        src="/logo.png"
        alt="Logo NexiRole"
        className="size-10 rounded-xl object-cover"
      />
      {!isCollapsed && (
        <div className="min-w-0">
          <p className="font-heading text-base font-extrabold text-navy">NexiRole</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gold-dark">
            Assistant carrière IA
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-ice">
      {/* ── Sidebar desktop rétractable ─────────────────────────── */}
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-200 bg-white transition-all duration-300 md:flex",
          collapsed ? "w-[76px]" : "w-72"
        )}
      >
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Déplier la barre latérale" : "Replier la barre latérale"}
          className="absolute -right-3 top-16 z-10 hidden size-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition hover:text-navy md:flex"
        >
          {collapsed ? <IconChevronRight className="size-3.5" /> : <IconChevronLeft className="size-3.5" />}
        </button>

        {logoBlock(collapsed)}

        <nav className="nice-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {renderNavItems(collapsed)}
        </nav>

        {renderSidebarFooter(collapsed)}
      </aside>

      {/* ── Tiroir mobile ───────────────────────────────────────── */}
      <div
        className={cx(
          "fixed inset-0 z-50 md:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          onClick={() => setMobileOpen(false)}
          className={cx(
            "absolute inset-0 bg-navy/50 backdrop-blur-sm transition-opacity duration-300",
            mobileOpen ? "opacity-100" : "opacity-0"
          )}
        />
        <aside
          className={cx(
            "absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-2xl transition-transform duration-300",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="relative">
            {logoBlock(false)}
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Fermer le menu"
              className="absolute right-3 top-3.5 inline-flex size-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-navy"
            >
              <IconX className="size-4.5" />
            </button>
          </div>
          <nav className="nice-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-4">
            {renderNavItems(false)}
          </nav>
          {renderSidebarFooter(false)}
        </aside>
      </div>

      {/* ── Colonne principale ──────────────────────────────────── */}
      <div className={cx("transition-all duration-300", collapsed ? "md:pl-[76px]" : "md:pl-72")}>
        {/* Header : recherche rapide Ctrl/Cmd+K + import CV */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Ouvrir le menu"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-navy transition hover:bg-slate-50 md:hidden"
            >
              <IconMenu2 className="size-5" />
            </button>

            <div className="relative min-w-0 max-w-xl flex-1">
              <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (view !== "overview") setView("overview");
                }}
                placeholder="Filtrer les offres : poste, entreprise, ville…"
                className="h-10 w-full rounded-full border border-slate-200 bg-ice pl-10 pr-16 text-sm text-navy placeholder:text-slate-400 focus:border-navy/30 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy/10"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Effacer la recherche"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-navy"
                >
                  <IconX className="size-4" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-400 sm:flex">
                  Ctrl K
                </kbd>
              )}
            </div>

            {/* Import rapide de CV PDF */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setImportOpen((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white transition hover:bg-navy-800"
              >
                <IconUpload className="size-4 text-gold" />
                <span className="hidden sm:inline">
                  {cvFile ? "CV importé" : "Importer CV"}
                </span>
                {cvFile && <span className="size-2 rounded-full bg-emerald-400" />}
              </button>

              {importOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setImportOpen(false)} />
                  <div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-extrabold uppercase tracking-wider text-navy">
                        CV PDF — base du scoring IA
                      </p>
                      <button
                        type="button"
                        onClick={() => setImportOpen(false)}
                        aria-label="Fermer"
                        className="text-slate-400 hover:text-navy"
                      >
                        <IconX className="size-4" />
                      </button>
                    </div>
                    <div className="mt-3">
                      <CvUpload value={cvFile} onChange={setCvFile} />
                    </div>
                    <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                      Ce CV alimente l&apos;Agent Recherche (scores de
                      compatibilité) et le Générateur CV &amp; Lettre.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          {/* ═══ VUE : OVERVIEW ═══ */}
          {view === "overview" && (
            <div className="space-y-6">
              {/* Bandeau bienvenue */}
              <section className="rounded-3xl bg-navy px-6 py-8 text-white sm:px-8">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-gold">
                      <IconSparkles className="size-3.5" />
                      Espace carrière IA
                    </span>
                    <h1 className="mt-3 font-heading text-2xl font-bold sm:text-3xl">
                      Bonjour, {firstName}
                    </h1>
                    <p className="mt-1.5 max-w-xl text-sm text-white/70">
                      {total > 0
                        ? `${total} offres analysées en direct${scannedAt ? ` à ${scannedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}. Filtrez, comparez les scores et générez vos dossiers.`
                        : "Importez votre CV puis lancez l'agent de recherche : les offres Remotive et Arbeitnow seront classées ici par score de compatibilité."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setView("agent")}
                    className="inline-flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-bold text-navy transition hover:brightness-95"
                  >
                    <IconRefresh className="size-4" />
                    {total > 0 ? "Nouveau scan" : "Lancer le premier scan"}
                  </button>
                </div>
              </section>

              {/* 4 cartes KPI */}
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  icon={IconRadar}
                  label="Offres analysées en direct"
                  value={total > 0 ? String(total) : "—"}
                  sub="Remotive + Arbeitnow, scan en temps réel"
                  spark={sparkOffres}
                  sparkId="offres"
                >
                  {scan && (
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold">
                      <span
                        className={cx(
                          "rounded-full px-2 py-0.5",
                          scan.sources.remotive
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-slate-100 text-slate-400"
                        )}
                      >
                        Remotive {scan.sources.remotive ? "connecté" : "hors ligne"}
                      </span>
                      <span
                        className={cx(
                          "rounded-full px-2 py-0.5",
                          scan.sources.arbeitnow
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-slate-100 text-slate-400"
                        )}
                      >
                        Arbeitnow {scan.sources.arbeitnow ? "connecté" : "hors ligne"}
                      </span>
                    </div>
                  )}
                </KpiCard>

                <KpiCard
                  icon={IconTargetArrow}
                  label="Score moyen de compatibilité"
                  value={total > 0 ? `${avgScore} %` : "—"}
                  sub="Sur votre dernier CV importé"
                  spark={sparkScore}
                  sparkId="score"
                />

                <KpiCard
                  icon={IconStar}
                  label="Offres haute pertinence"
                  value={total > 0 ? String(highCount) : "—"}
                  sub="Score supérieur à 80 %"
                  spark={sparkHigh}
                  sparkId="haute"
                  goldSpark
                />

                <KpiCard
                  icon={IconFolders}
                  label="Dossiers (CV + Lettres) générés"
                  value={String(dossierCount)}
                  sub="CV, lettre et kit entretien — session en cours"
                  spark={sparkDossiers}
                  sparkId="dossiers"
                />
              </section>

              {/* Graphique répartition + bascule vue graphique/tableau */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-heading text-base font-bold text-navy">
                      Répartition des scores par source
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Comparaison des scores de compatibilité Remotive vs Arbeitnow
                    </p>
                  </div>
                  <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-ice p-1">
                    <button
                      type="button"
                      onClick={() => setChartMode("chart")}
                      className={cx(
                        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition",
                        chartMode === "chart" ? "bg-navy text-white" : "text-slate-500 hover:text-navy"
                      )}
                    >
                      <IconChartAreaLine className="size-4" />
                      Vue graphique
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartMode("table")}
                      className={cx(
                        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition",
                        chartMode === "table" ? "bg-navy text-white" : "text-slate-500 hover:text-navy"
                      )}
                    >
                      <IconTable className="size-4" />
                      Vue tableau
                    </button>
                  </div>
                </div>

                <div className="mt-5">
                  {chartMode === "chart" ? (
                    <SourceAreaChart remotive={remotiveScores} arbeitnow={arbeitnowScores} />
                  ) : (
                    <SourceSummaryTable ranked={ranked} />
                  )}
                </div>
              </section>

              {/* Tableau des offres classées */}
              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
                  <div>
                    <h2 className="font-heading text-base font-bold text-navy">
                      Offres classées par score
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {total > 0
                        ? `${visibleJobs.length} offre(s) affichée(s) sur ${total}`
                        : "Le classement apparaîtra après votre premier scan"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-ice p-1">
                    {(["all", "remotive", "arbeitnow"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSourceFilter(s)}
                        className={cx(
                          "rounded-full px-3 py-1.5 text-xs font-bold transition",
                          sourceFilter === s ? "bg-navy text-white" : "text-slate-500 hover:text-navy"
                        )}
                      >
                        {s === "all" ? "Toutes" : s === "remotive" ? "Remotive" : "Arbeitnow"}
                      </button>
                    ))}
                  </div>
                </div>

                {total === 0 ? (
                  <div className="px-6 py-14 text-center">
                    <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-navy-50">
                      <IconRadar className="size-7 text-navy" />
                    </span>
                    <p className="mt-4 font-heading text-base font-bold text-navy">
                      Aucune offre analysée pour l&apos;instant
                    </p>
                    <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-500">
                      Importez votre CV (bouton « Importer CV » en haut à droite)
                      puis lancez l&apos;Agent Recherche : chaque offre recevra un
                      score de compatibilité de 0 à 100 %.
                    </p>
                    <button
                      type="button"
                      onClick={() => setView("agent")}
                      className="mt-5 inline-flex items-center gap-2 rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-white transition hover:bg-navy-800"
                    >
                      <IconRadar className="size-4 text-gold" />
                      Lancer l&apos;Agent Recherche
                    </button>
                  </div>
                ) : visibleJobs.length === 0 ? (
                  <div className="px-6 py-10 text-center">
                    <IconSearch className="mx-auto size-7 text-slate-300" />
                    <p className="mt-3 text-sm font-semibold text-navy">
                      Aucune offre ne correspond à ces filtres
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Ajustez la recherche ou le filtre de source.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-ice text-[11px] uppercase tracking-wider text-slate-500">
                          <th className="px-4 py-3 font-bold">#</th>
                          <th className="px-4 py-3 font-bold">Poste &amp; Entreprise</th>
                          <th className="px-4 py-3 font-bold">Source</th>
                          <th className="px-4 py-3 font-bold">
                            <button
                              type="button"
                              onClick={() => toggleSort("score")}
                              className={cx(
                                "inline-flex items-center gap-1 uppercase tracking-wider transition",
                                sortKey === "score" ? "text-navy" : "hover:text-navy"
                              )}
                            >
                              Score
                              {sortKey === "score" &&
                                (sortDir === "asc" ? (
                                  <IconArrowUp className="size-3.5" />
                                ) : (
                                  <IconArrowDown className="size-3.5" />
                                ))}
                            </button>
                          </th>
                          <th className="px-4 py-3 font-bold">
                            <button
                              type="button"
                              onClick={() => toggleSort("date")}
                              className={cx(
                                "inline-flex items-center gap-1 uppercase tracking-wider transition",
                                sortKey === "date" ? "text-navy" : "hover:text-navy"
                              )}
                            >
                              Publiée
                              {sortKey === "date" &&
                                (sortDir === "asc" ? (
                                  <IconArrowUp className="size-3.5" />
                                ) : (
                                  <IconArrowDown className="size-3.5" />
                                ))}
                            </button>
                          </th>
                          <th className="px-4 py-3 font-bold">Statut</th>
                          <th className="px-4 py-3 text-right font-bold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleJobs.map(({ job, rank }) => {
                          const badge = scoreBadgeStyle(job.score);
                          const generated = generatedIds.includes(job.id);
                          return (
                            <tr key={job.id} className="transition hover:bg-ice/70">
                              <td className="px-4 py-3">
                                <span className="flex size-7 items-center justify-center rounded-lg bg-navy font-heading text-xs font-extrabold text-gold">
                                  {rank}
                                </span>
                              </td>
                              <td className="max-w-[280px] px-4 py-3">
                                <p className="truncate font-heading text-sm font-bold text-navy">
                                  {job.title}
                                </p>
                                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                                  <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
                                    <IconBriefcase className="size-3.5" />
                                    {job.company}
                                  </span>
                                  <span className="truncate">{job.location}</span>
                                </p>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={cx(
                                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
                                    job.source === "remotive"
                                      ? "bg-navy-50 text-navy"
                                      : "bg-gold-soft text-accent-foreground"
                                  )}
                                >
                                  <IconRadar className="size-3.5" />
                                  {job.source === "remotive" ? "Remotive" : "Arbeitnow"}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={cx(
                                    "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums",
                                    badge.pill
                                  )}
                                >
                                  {job.score} % · {badge.label}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500">
                                {job.postedAt ?? "—"}
                              </td>
                              <td className="px-4 py-3">
                                {generated ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-bold text-accent-foreground">
                                    <IconCircleCheck className="size-3.5 text-gold-dark" />
                                    CV généré
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                                    <IconClock className="size-3.5" />
                                    Prêt à postuler
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleGenerateForJob(job)}
                                    className="inline-flex items-center gap-1.5 rounded-full bg-navy px-3.5 py-2 text-xs font-bold text-white transition hover:bg-navy-800"
                                  >
                                    <IconWand className="size-3.5 text-gold" />
                                    Générer CV + Lettre
                                  </button>
                                  <a
                                    href={job.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label={`Voir l'annonce : ${job.title}`}
                                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-gold hover:text-navy"
                                  >
                                    <IconExternalLink className="size-4" />
                                  </a>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {scan && total > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-3 text-[11px] text-slate-400">
                    <span>Moteur d&apos;analyse : {scan.engine ?? "local"}</span>
                    {scan.partialScoring && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-600">
                        Scoring IA partiel — certains scores proviennent du moteur de repli mots-clés
                      </span>
                    )}
                    {scannedAt && (
                      <span>
                        Dernier scan :{" "}
                        {scannedAt.toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ═══ VUE : CV & LETTRE PAR LIEN D'OFFRE ═══ */}
          {view === "generate" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="font-heading text-xl font-bold text-navy">
                    CV &amp; Lettre par Lien d&apos;offre
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Collez l&apos;URL de l&apos;annonce : NexiRole rédige votre CV
                    optimisé, la lettre et le kit entretien.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setView("overview")}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-navy transition hover:bg-slate-50"
                >
                  <IconArrowUp className="size-4 rotate-[-90deg]" />
                  Retour aux scores
                </button>
              </div>

              <GenerateMode
                cvFile={cvFile}
                onCvFileChange={setCvFile}
                profileText={profileText}
                onProfileTextChange={setProfileText}
                prefill={prefill}
                onGenerated={handleGenerated}
              />
            </div>
          )}

          {/* ═══ VUE : AGENT RECHERCHE EN DIRECT ═══ */}
          {view === "agent" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="font-heading text-xl font-bold text-navy">
                    Agent Recherche en Direct
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Scan en direct Remotive + Arbeitnow, scoring IA de chaque
                    offre contre votre CV.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setView("overview")}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-navy transition hover:bg-slate-50"
                >
                  <IconArrowUp className="size-4 rotate-[-90deg]" />
                  Retour aux scores
                </button>
              </div>

              <SearchMode
                cvFile={cvFile}
                onCvFileChange={setCvFile}
                profileText={profileText}
                onResults={handleScanResults}
                onGenerateForJob={handleGenerateForJob}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}