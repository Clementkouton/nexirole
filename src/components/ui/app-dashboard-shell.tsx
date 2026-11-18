"use client";

/**
 * Coquille du Dashboard NexiRole :
 *  - sidebar rétractable (desktop fixe + drawer mobile),
 *  - 4 panneaux TOUJOURS MONTÉS (masqués en CSS) : overview / agent /
 *    dossier / historique — l'état et les écouteurs d'événements survivent
 *    à tous les changements d'onglet,
 *  - entrée « Créateur de CV » ACTIVE (redirige vers /cv-builder, badge
 *    BIENTÔT supprimé),
 *  - bascule automatique vers le Dossier quand l'Agent transmet une offre
 *    ou quand l'Historique restaure un dossier.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  IconArrowRight,
  IconFilePencil,
  IconHistory,
  IconLayoutDashboard,
  IconLogout,
  IconMenu2,
  IconRadar,
  IconSearch,
  IconTargetArrow,
  IconWand,
  IconX,
} from "@tabler/icons-react";
import { signOut } from "next-auth/react";
import { cx } from "@/lib/ui-classes";
import { AgentScanPanel } from "@/components/dashboard/agent-scan-panel";
import { DossierPanel } from "@/components/dashboard/dossier-panel";
import { HistoryPanel } from "@/components/dashboard/history-panel";

type SectionId = "overview" | "agent" | "dossier" | "historique";

const OPEN_EVENT = "nexirole:open-dossier";
const RESTORE_EVENT = "nexirole:restore-dossier";

interface AppDashboardShellProps {
  userName: string | null;
  userEmail: string | null;
}

export function AppDashboardShell({ userName, userEmail }: AppDashboardShellProps) {
  const [active, setActive] = useState<SectionId>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* Bascule automatique : Agent → Dossier, Historique → Dossier */
  useEffect(() => {
    const handler = () => {
      setActive("dossier");
      setSidebarOpen(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener(OPEN_EVENT, handler);
    window.addEventListener(RESTORE_EVENT, handler);
    return () => {
      window.removeEventListener(OPEN_EVENT, handler);
      window.removeEventListener(RESTORE_EVENT, handler);
    };
  }, []);

  function go(section: SectionId) {
    setActive(section);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const initial = (userName ?? userEmail ?? "U").trim().charAt(0).toUpperCase();

  const navItems: Array<{
    id: SectionId | "cv-builder";
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: "overview", label: "Vue d'ensemble", icon: <IconLayoutDashboard className="size-4.5" /> },
    { id: "agent", label: "Agent de Recherche", icon: <IconRadar className="size-4.5" /> },
    { id: "dossier", label: "Dossier & Documents", icon: <IconTargetArrow className="size-4.5" /> },
    { id: "historique", label: "Historique", icon: <IconHistory className="size-4.5" /> },
    {
      id: "cv-builder",
      label: "Créateur de CV",
      icon: <IconFilePencil className="size-4.5" />,
    },
  ];

  const sidebar = (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="NexiRole" className="h-8 w-auto" />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) =>
          item.id === "cv-builder" ? (
            <Link
              key={item.id}
              href="/cv-builder"
              onClick={() => setSidebarOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-gold-soft"
            >
              {item.icon}
              {item.label}
              <IconArrowRight className="ml-auto size-3.5 text-slate-300" />
            </Link>
          ) : (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id !== "cv-builder") go(item.id);
              }}
              className={cx(
                "flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors",
                active === item.id
                  ? "bg-navy text-white shadow-sm"
                  : "text-navy hover:bg-slate-100"
              )}
            >
              {item.icon}
              {item.label}
            </button>
          )
        )}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
            {initial}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-navy">
              {userName ?? "Utilisateur"}
            </span>
            <span className="block truncate text-xs text-slate-500">{userEmail}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => signOut({ redirectTo: "/" })}
          className="flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700"
        >
          <IconLogout className="size-4.5" />
          Déconnexion
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-ice">
      {/* Sidebar desktop */}
      <div className="sticky top-0 hidden h-screen lg:block">{sidebar}</div>

      {/* Drawer mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-navy/50 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 h-full shadow-2xl">{sidebar}</div>
        </div>
      )}

      {/* Contenu */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur-md lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="inline-flex size-9 items-center justify-center rounded-full text-navy transition hover:bg-slate-100 lg:hidden"
              aria-label="Ouvrir le menu"
            >
              <IconMenu2 className="size-5" />
            </button>
            <h1 className="truncate text-base font-extrabold text-navy">
              {active === "overview" && "Vue d'ensemble"}
              {active === "agent" && "Agent de recherche en direct"}
              {active === "dossier" && "Dossier & documents"}
              {active === "historique" && "Historique"}
            </h1>
          </div>
          <Link
            href="/"
            className="hidden items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy transition hover:bg-slate-50 sm:inline-flex"
          >
            Retour au site
          </Link>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 lg:px-8">
          {/* ── Vue d'ensemble ─────────────────────────────────────── */}
          <div className={active === "overview" ? "" : "hidden"}>
            <section className="rounded-2xl bg-navy p-6 text-white shadow-md">
              <p className="text-xs font-bold uppercase tracking-widest text-gold">
                Espace NexiRole
              </p>
              <h2 className="mt-1 text-2xl font-extrabold">
                Bonjour {userName ?? "!"}
              </h2>
              <p className="mt-1.5 max-w-xl text-sm text-slate-300">
                Ton assistant carrière : scanne les offres en direct, génère un
                dossier complet (CV, lettre, kit d&apos;entretien) avec 4 templates
                ATS, et retrouve tout dans ton historique.
              </p>
            </section>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    id: "agent" as SectionId,
                    title: "Agent de recherche",
                    desc: "Scan intelligent des offres Remotive & Arbeitnow à partir de ton CV.",
                    icon: <IconSearch className="size-5 text-gold" />,
                  },
                  {
                    id: "dossier" as SectionId,
                    title: "Dossier & documents",
                    desc: "CV + lettre + kit d'entretien en PDF ATS, 4 templates avec ou sans photo.",
                    icon: <IconWand className="size-5 text-gold" />,
                  },
                  {
                    id: "historique" as SectionId,
                    title: "Historique",
                    desc: "Retrouve et retélécharge tous tes dossiers et scans enregistrés.",
                    icon: <IconHistory className="size-5 text-gold" />,
                  },
                ] as const
              ).map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => go(card.id)}
                  className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-navy/40 hover:shadow-md"
                >
                  <span className="mb-2 inline-flex size-10 items-center justify-center rounded-xl bg-gold-soft">
                    {card.icon}
                  </span>
                  <p className="text-sm font-bold text-navy">{card.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{card.desc}</p>
                </button>
              ))}
              <Link
                href="/cv-builder"
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-navy/40 hover:shadow-md"
              >
                <span className="mb-2 inline-flex size-10 items-center justify-center rounded-xl bg-gold-soft">
                  <IconFilePencil className="size-5 text-gold" />
                </span>
                <p className="text-sm font-bold text-navy">Créateur de CV</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                  Rédige chaque champ manuellement, choisis un template et exporte en PDF.
                </p>
              </Link>
            </div>
          </div>

          {/* ── Panneaux TOUJOURS MONTÉS (masqués en CSS) ──────────── */}
          <div className={active === "agent" ? "" : "hidden"}>
            <AgentScanPanel />
          </div>
          <div className={active === "dossier" ? "" : "hidden"}>
            <DossierPanel />
          </div>
          <div className={active === "historique" ? "" : "hidden"}>
            <HistoryPanel />
          </div>
        </main>
      </div>
    </div>
  );
}