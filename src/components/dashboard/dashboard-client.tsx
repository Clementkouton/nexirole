
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  IconArrowRight,
  IconCircleCheck,
  IconClock,
  IconCrown,
  IconFileText,
  IconHistory,
  IconLayoutDashboard,
  IconLoader2,
  IconLogin,
  IconRefresh,
  IconSearch,
  IconVideo,
  IconWallet,
} from "@tabler/icons-react";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";

// Routes des actions rapides : ajustez ces chemins si vos pages diffèrent.
const QUICK_ACTIONS = [
  { href: "/dashboard/recherche", label: "Nouvelle recherche", desc: "Trouvez des offres ciblées", icon: IconSearch },
  { href: "/dashboard/cv", label: "Créer un CV", desc: "CV optimisé par l'IA", icon: IconFileText },
  { href: "/dashboard/entretien", label: "Simuler un entretien", desc: "Entraînez-vous avec l'IA", icon: IconVideo },
  { href: "/dashboard/historique", label: "Historique", desc: "Vos recherches et documents", icon: IconHistory },
  { href: "/dashboard/tracker", label: "Suivi des candidatures", desc: "Votre pipeline en un coup d'oeil", icon: IconLayoutDashboard },
  { href: "/pricing", label: "Abonnement", desc: "Pass Boost ou Carrière Pro", icon: IconWallet },
];

const PLAN_LABELS: Record<string, string> = {
  free: "Gratuit",
  boost: "Pass Boost",
  pro: "Carrière Pro",
};

type HistoryItem = {
  id?: string;
  title?: string;
  query?: string;
  company?: string;
  type?: string;
  createdAt?: string;
};

function formatDate(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toLocaleDateString("fr-FR");
  }
  if (typeof value !== "string" || value.length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("fr-FR");
}

function SignInRequired() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#051937]">
          <IconLogin className="h-7 w-7 text-[#FFC107]" />
        </div>
        <h1 className="mb-2 text-xl font-bold text-[#051937]">Connexion requise</h1>
        <p className="mb-6 text-sm leading-relaxed text-slate-600">
          Connectez-vous pour accéder à votre espace candidat : recherches, CV, simulations
          d&apos;entretien et historique.
        </p>
        <div className="space-y-3">
          <Link
            href="/login"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#FFC107] px-4 py-2.5 text-sm font-semibold text-[#051937] transition hover:bg-[#e6ae00]"
          >
            <IconLogin className="h-4 w-4" />
            Se connecter
          </Link>
          <Link
            href="/register"
            className="flex w-full items-center justify-center rounded-lg border border-[#051937] px-4 py-2.5 text-sm font-semibold text-[#051937] transition hover:bg-[#051937] hover:text-white"
          >
            Créer un compte
          </Link>
        </div>
      </div>
    </div>
  );
}

function PaymentBanner({ planLabel }: { planLabel: string }) {
  return (
    <div className="mb-8 flex items-start gap-3 rounded-xl border border-[#FFC107] bg-[#FFC107]/10 p-4">
      <IconCircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#051937]" />
      <div>
        <p className="font-semibold text-[#051937]">Paiement confirmé, merci !</p>
        <p className="text-sm text-slate-700">
          Votre formule <span className="font-semibold text-[#051937]">{planLabel}</span> est
          désormais active sur votre compte.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof IconSearch;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#051937]">
        <Icon className="h-5 w-5 text-[#FFC107]" />
      </div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-[#051937]">{value}</p>
    </div>
  );
}

export function DashboardClient() {
  const { data: session, status, update } = useSession();
  const searchParams = useSearchParams();
  const paymentSuccess = searchParams.get("payment") === "success";

  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [sessionRefreshed, setSessionRefreshed] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryError(null);
    setHistory(null);
    try {
      const res = await fetch("/api/history", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();
      let items: HistoryItem[] = [];
      if (Array.isArray(json)) {
        items = json as HistoryItem[];
      } else if (json && typeof json === "object") {
        const record = json as Record<string, unknown>;
        const candidate = record.history ?? record.items ?? record.data;
        if (Array.isArray(candidate)) items = candidate as HistoryItem[];
      }
      setHistory(items.slice(0, 5));
    } catch {
      setHistoryError("Impossible de charger l'historique. Vérifiez votre connexion puis réessayez.");
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") void loadHistory();
  }, [status, loadHistory]);

  // Après un paiement : relit plan/licence à jour depuis la base (token JWT).
  useEffect(() => {
    if (paymentSuccess && status === "authenticated" && !sessionRefreshed) {
      setSessionRefreshed(true);
      void update();
    }
  }, [paymentSuccess, status, sessionRefreshed, update]);

  if (status === "loading") return <DashboardSkeleton />;
  if (status === "unauthenticated" || !session?.user) return <SignInRequired />;

  const user = session.user;
  const planKey = (user.plan ?? "free").toLowerCase();
  const planLabel = PLAN_LABELS[planKey] ?? PLAN_LABELS.free;
  const licenceActive = user.licenseStatus === "active";
  const expiry = formatDate(user.expiresAt);
  const searchesUsed = typeof user.searchesUsed === "number" ? user.searchesUsed : 0;
  const generationsUsed = typeof user.generationsUsed === "number" ? user.generationsUsed : 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-6 lg:p-8">
      {paymentSuccess ? <PaymentBanner planLabel={planLabel} /> : null}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#051937]">
            Bonjour {user.name ?? "candidat"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Bienvenue dans votre espace candidat NexiRole.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#051937] px-3 py-1.5 text-xs font-semibold text-[#FFC107]">
            <IconCrown className="h-4 w-4" />
            {planLabel}
          </span>
          {licenceActive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              <IconCircleCheck className="h-4 w-4" />
              Licence active
            </span>
          ) : null}
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={IconSearch} label="Recherches effectuées" value={String(searchesUsed)} />
        <StatCard icon={IconFileText} label="Documents générés" value={String(generationsUsed)} />
        <StatCard icon={IconClock} label="Expiration" value={expiry ?? "—"} />
        <StatCard
          icon={IconLayoutDashboard}
          label="Statut du compte"
          value={licenceActive ? "Actif" : "Gratuit"}
        />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold text-[#051937]">Actions rapides</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#FFC107] hover:shadow-md"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#051937] transition group-hover:bg-[#FFC107]">
                <action.icon className="h-5 w-5 text-[#FFC107] transition group-hover:text-[#051937]" />
              </div>
              <p className="font-semibold text-[#051937]">{action.label}</p>
              <p className="mt-0.5 text-sm text-slate-600">{action.desc}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#051937]">
                Ouvrir
                <IconArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#051937]">Historique récent</h2>
          <Link
            href="/dashboard/historique"
            className="inline-flex items-center gap-1 text-sm font-semibold text-[#051937] hover:underline"
          >
            Tout voir
            <IconArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {historyError ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{historyError}</p>
            <button
              onClick={() => void loadHistory()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#051937] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90"
            >
              <IconRefresh className="h-4 w-4" />
              Réessayer
            </button>
          </div>
        ) : null}

        {history === null && !historyError ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
            <IconLoader2 className="h-4 w-4 animate-spin" />
            Chargement de l&apos;historique...
          </div>
        ) : null}

        {history !== null && history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
            <IconHistory className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            <p className="font-semibold text-[#051937]">Aucune recherche pour le moment</p>
            <p className="mt-1 text-sm text-slate-600">
              Lancez votre première recherche pour la voir apparaître ici.
            </p>
          </div>
        ) : null}

        {history !== null && history.length > 0 ? (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {history.map((item, index) => (
              <li
                key={item.id ?? `history-${index}`}
                className="flex items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#051937]">
                    {item.title ?? item.query ?? "Recherche sans titre"}
                  </p>
                  {item.company ? (
                    <p className="truncate text-sm text-slate-500">{item.company}</p>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs text-slate-400">
                  {formatDate(item.createdAt) ?? ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}