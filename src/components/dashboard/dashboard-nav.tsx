"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconFileText,
  IconFolder,
  IconHistory,
  IconLayoutDashboard,
  IconRobot,
} from "@tabler/icons-react";

const LINKS = [
  { href: "/dashboard", label: "Vue d'ensemble", icon: IconLayoutDashboard, exact: true },
  { href: "/dashboard/agent", label: "Agent de recherche", icon: IconRobot, exact: false },
  { href: "/dashboard/dossier", label: "Dossier & documents", icon: IconFolder, exact: false },
  { href: "/dashboard/historique", label: "Historique", icon: IconHistory, exact: false },
  { href: "/dashboard/cv-builder", label: "Créateur de CV", icon: IconFileText, exact: false },
] as const;

export default function DashboardNav({ variant = "sidebar" }: { variant?: "sidebar" | "mobile" }) {
  const pathname = usePathname();

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  if (variant === "mobile") {
    return (
      <nav className="flex gap-2 overflow-x-auto px-4 pb-3">
        {LINKS.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold transition ${
                active
                  ? "bg-[#FFC107] text-[#051937]"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Icon size={16} stroke={2} />
              <span className="whitespace-nowrap">{label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex flex-1 flex-col gap-1.5 px-4">
      {LINKS.map(({ href, label, icon: Icon, exact }) => {
        const active = isActive(href, exact);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-bold transition ${
              active
                ? "bg-[#FFC107] text-[#051937] shadow-sm"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon size={20} stroke={1.8} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}