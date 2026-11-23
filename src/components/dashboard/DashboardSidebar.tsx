"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { IconCoin,
  IconClipboardList,
  IconCrown,
  IconFileText,
  IconHistory,
  IconFileDescription,
  IconLayoutDashboard,
  IconLink,
  IconPepper,
  IconRobot,
  IconWallet,
 } from "@tabler/icons-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Tableau de bord", icon: IconLayoutDashboard },
  { href: "/dashboard/tracker", label: "Suivi candidatures", icon: IconClipboardList },
  { href: "/dashboard/agent", label: "Agent IA", icon: IconRobot },
  { href: "/dashboard/dossier", label: "Dossier par lien", icon: IconLink },
  { href: "/dashboard/cv-builder", label: "Créateur de CV", icon: IconFileText },
  { href: "/dashboard/lettres", label: "Lettres de motivation", icon: IconFileDescription },
  { href: "/dashboard/negociation", label: "Coach Négociation", icon: IconCoin },
  { href: "/dashboard/historique", label: "Historique", icon: IconHistory },
  { href: "/pricing", label: "Abonnement", icon: IconWallet },
];

const PLAN_LABELS: Record<string, string> = {
  free: "Gratuit",
  boost: "Pass Boost",
  pro: "Carrière Pro",
};

function formatDate(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toLocaleDateString("fr-FR");
  }
  if (typeof value !== "string" || value.length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("fr-FR");
}

export function DashboardSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const user = session?.user ?? null;
  const planKey = (user?.plan ?? "free").toLowerCase();
  const planLabel = PLAN_LABELS[planKey] ?? PLAN_LABELS.free;
  const licenceActive = String(user?.licenseStatus ?? "").toLowerCase() === "active";
  const isPaid = planKey === "boost" || planKey === "pro";
  const expiry = formatDate(user?.expiresAt);

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between bg-[#051937] px-3 py-5 text-white md:flex">
      <div>
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FFC107] text-lg font-bold text-[#051937]">
            N
          </span>
          <span className="text-lg font-bold tracking-tight">NexiRole</span>
        </Link>

        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  isActive
                    ? "flex items-center gap-3 rounded-lg bg-white/10 px-3 py-2.5 text-sm font-semibold text-[#FFC107]"
                    : "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
                }
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bloc Plan actuel — aucune saisie manuelle de clé de licence */}
      <div className="rounded-xl bg-white/5 p-4">
        {isPaid && licenceActive ? (
          <div className="space-y-2">
            <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
              <IconCrown className="h-4 w-4" />
              {planLabel} Actif
            </span>
            {expiry ? (
              <p className="text-center text-xs text-slate-400">Expire le {expiry}</p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Plan actuel
            </p>
            <p className="text-sm font-semibold text-white">{planLabel}</p>
            <Link
              href="/pricing"
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#FFC107] px-3 py-2.5 text-sm font-semibold text-[#051937] transition hover:bg-[#e6ae00]"
            >
              <IconCrown className="h-4 w-4" />
              Passer au Pass Boost / Pro
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}

export default DashboardSidebar;
