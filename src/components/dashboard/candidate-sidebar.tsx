"use client";

/**
 * NexiRole — Barre latérale « Espace candidat » partagée par les pages du
 * tableau de bord (design navy / or fidèle à l'existant).
 *
 * Elle intègre :
 *  - les 5 liens du tableau de bord multipages,
 *  - le bloc licence (badge du plan, quotas du plan Découverte, bouton
 *    « Activer une clé de licence » — composant LicensePanel),
 *  - le bouton « Retour au site ».
 *
 * Mobile : la navigation devient une barre horizontale défilante.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconArrowLeft,
  IconFileCv,
  IconFolders,
  IconHistory,
  IconLayoutDashboard,
  IconRocket,
  IconRobot,
} from "@tabler/icons-react";
import { LicensePanel } from "@/components/dashboard/license-panel";

/* ⚠ Chemins des pages du tableau de bord — ajustez ici si vos routes diffèrent. */
const NAV_ITEMS = [
  { href: "/dashboard", label: "Vue d'ensemble", icon: IconLayoutDashboard, exact: true },
  { href: "/dashboard/agent", label: "Agent de recherche", icon: IconRobot, exact: false },
  { href: "/dashboard/dossiers", label: "Dossier & documents", icon: IconFolders, exact: false },
  { href: "/dashboard/historique", label: "Historique", icon: IconHistory, exact: false },
  { href: "/dashboard/cv-builder", label: "Créateur de CV", icon: IconFileCv, exact: false },
] as const;

export function CandidateSidebar({ userEmail }: { userEmail?: string | null }) {
  const pathname = usePathname();

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const renderDesktopLink = (item: (typeof NAV_ITEMS)[number]) => {
    const Icon = item.icon;
    const active = isActive(item.href, item.exact);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
          active
            ? "bg-gold text-navy shadow-md"
            : "text-slate-200 hover:bg-white/10 hover:text-white"
        }`}
      >
        <Icon
          className={`size-5 shrink-0 ${active ? "text-navy" : "text-gold/80 group-hover:text-gold"}`}
        />
        <span className="flex-1">{item.label}</span>
        {active ? <span className="size-1.5 shrink-0 rounded-full bg-navy" /> : null}
      </Link>
    );
  };

  return (
    <>
      {/* Mobile : navigation horizontale défilante */}
      <nav
        aria-label="Navigation espace candidat"
        className="flex items-center gap-2 overflow-x-auto border-b border-white/10 bg-navy px-3 py-2.5 lg:hidden"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                active ? "bg-gold text-navy" : "bg-white/10 text-slate-200"
              }`}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Desktop : barre latérale navy sous la navbar du site */}
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 flex-col overflow-y-auto bg-navy lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gold/15">
            <IconRocket className="size-5 text-gold" />
          </span>
          <div className="min-w-0">
            <p className="font-heading text-base font-bold leading-tight text-white">
              NexiRole
            </p>
            <p className="text-[11px] leading-tight text-slate-400">Espace candidat</p>
          </div>
        </div>

        <nav aria-label="Menu espace candidat" className="space-y-1 px-3">
          {NAV_ITEMS.map(renderDesktopLink)}
        </nav>

        <div className="mt-auto pb-4 pt-6">
          {/* Bloc licence : badge du plan + quotas + activation de clé */}
          <LicensePanel userEmail={userEmail} />

          <div className="px-3">
            <Link
              href="/"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/25 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <IconArrowLeft className="size-4 text-gold" />
              Retour au site
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
