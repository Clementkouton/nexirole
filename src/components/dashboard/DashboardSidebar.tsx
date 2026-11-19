"use client";

// =============================================================
// NEXIROLE — Sidebar UNIQUE de l'espace candidat.
// Ce menu remplace TOUS les autres menus du Dashboard et s'affiche
// sur toutes les pages /dashboard/* (géré par dashboard/layout.tsx).
// =============================================================

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconCircleCheck,
  IconFileText,
  IconFolders,
  IconHistory,
  IconKey,
  IconLayoutDashboard,
  IconLoader2,
  IconLogout,
  IconMenu2,
  IconRocket,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { fetchJson, postJson } from "@/lib/fetch-json";

type Plan = "FREE" | "BOOST" | "PRO";

interface MeResponse {
  ok: boolean;
  user: {
    name: string | null;
    email: string | null;
    plan: string;
    licenseStatus: string;
    expiresAt: string | null;
    searchesUsed: number;
    generationsUsed: number;
  };
}

interface ActivateResponse {
  ok: boolean;
  plan?: string;
  message?: string;
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Vue d'ensemble", Icon: IconLayoutDashboard },
  { href: "/dashboard/agent", label: "Agent de recherche", Icon: IconSearch },
  { href: "/dashboard/documents", label: "Dossier & documents", Icon: IconFolders },
  { href: "/dashboard/historique", label: "Historique", Icon: IconHistory },
  { href: "/dashboard/cv-builder", label: "Créateur de CV", Icon: IconFileText },
] as const;

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(
      new Date(value),
    );
  } catch {
    return value;
  }
}

export default function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [me, setMe] = useState<MeResponse["user"] | null>(null);
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [licenseKey, setLicenseKey] = useState("");
  const [activating, setActivating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadMe = useCallback(async () => {
    const result = await fetchJson<MeResponse>("/api/me", { cache: "no-store" });
    if (result.ok && result.data?.user) setMe(result.data.user);
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const plan = (me?.plan as Plan | undefined) ?? "FREE";
  const planLabel = plan === "PRO" ? "Pro" : plan === "BOOST" ? "Boost" : "Gratuit";
  const planBadgeClass =
    plan === "PRO"
      ? "rounded-full bg-[#FFC107] px-2.5 py-0.5 text-xs font-bold text-[#051937]"
      : plan === "BOOST"
        ? "rounded-full bg-amber-400/90 px-2.5 py-0.5 text-xs font-bold text-[#051937]"
        : "rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-slate-200";

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(`${href}/`);

  async function handleActivate(event: FormEvent) {
    event.preventDefault();
    setActivating(true);
    setFeedback(null);

    const result = await postJson<ActivateResponse>("/api/license/activate", {
      licenseKey: licenseKey.trim(),
    });

    setActivating(false);
    if (result.ok && result.data?.ok) {
      setFeedback({ type: "success", message: `Licence ${result.data.plan ?? ""} activée.` });
      setLicenseKey("");
      setShowKeyForm(false);
      await loadMe();
      router.refresh();
    } else {
      setFeedback({ type: "error", message: result.error ?? "Activation impossible." });
    }
  }

  const sidebarContent = (
    <div className="flex h-full flex-col overflow-y-auto bg-[#051937] text-white">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFC107] text-[#051937]">
          <IconRocket size={22} stroke={1.8} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold tracking-tight">NexiRole</p>
          <p className="truncate text-xs text-slate-400">Votre copilote carrière</p>
        </div>
      </div>

      {/* Profil */}
      <div className="border-b border-white/10 px-6 py-4">
        <p className="truncate text-sm font-semibold">{me?.name ?? "Mon espace"}</p>
        <p className="truncate text-xs text-slate-400">{me?.email ?? ""}</p>
      </div>

      {/* Navigation principale */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-[#FFC107] font-semibold text-[#051937]"
                  : "text-slate-200 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon size={20} stroke={1.8} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Plan + activation de licence */}
      <div className="space-y-3 border-t border-white/10 px-4 py-4">
        <div className="rounded-xl bg-white/5 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Plan actuel</span>
            <span className={planBadgeClass}>{planLabel}</span>
          </div>
          {me?.expiresAt && plan !== "FREE" && (
            <p className="mt-1 text-xs text-slate-400">Expire le {formatDate(me.expiresAt)}</p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            Recherches : {me?.searchesUsed ?? 0} · Documents : {me?.generationsUsed ?? 0}
          </p>
        </div>

        {feedback && (
          <div
            className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
              feedback.type === "success" ? "bg-emerald-500/15 text-emerald-200" : "bg-red-500/15 text-red-200"
            }`}
          >
            {feedback.type === "success" ? (
              <IconCircleCheck size={16} className="mt-0.5 shrink-0" />
            ) : (
              <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {showKeyForm ? (
          <form onSubmit={handleActivate} className="space-y-2">
            <input
              value={licenseKey}
              onChange={(event) => setLicenseKey(event.target.value)}
              placeholder="Collez votre clé de licence"
              className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-[#FFC107] focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={activating || licenseKey.trim().length < 6}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#FFC107] px-3 py-2 text-sm font-semibold text-[#051937] transition-opacity disabled:opacity-50"
              >
                {activating && <IconLoader2 size={16} className="animate-spin" />}
                Activer
              </button>
              <button
                type="button"
                onClick={() => setShowKeyForm(false)}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
              >
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowKeyForm(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10"
          >
            <IconKey size={16} />
            Activer une clé de licence
          </button>
        )}
      </div>

      {/* Liens bas de sidebar */}
      <div className="space-y-1 px-4 pb-5">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white"
        >
          <IconArrowBackUp size={18} />
          Retour au site
        </Link>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white"
        >
          <IconLogout size={18} />
          Déconnexion
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Sidebar desktop : enfant direct du conteneur flex du layout */}
      <aside className="sticky top-0 hidden h-screen w-[280px] shrink-0 lg:block">{sidebarContent}</aside>

      {/* Barre mobile */}
      <div className="fixed inset-x-0 top-0 z-40 lg:hidden">
        <div className="flex items-center justify-between bg-[#051937] px-4 py-3 text-white">
          <span className="flex items-center gap-2 text-lg font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFC107] text-[#051937]">
              <IconRocket size={18} />
            </span>
            NexiRole
          </span>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu de navigation"
            className="rounded-lg p-1.5 hover:bg-white/10"
          >
            <IconMenu2 size={22} />
          </button>
        </div>
      </div>

      {/* Sidebar mobile (superposition) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/60"
          />
          <aside className="absolute inset-y-0 left-0 w-[280px] shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Fermer"
              className="absolute right-3 top-4 z-10 rounded-lg p-1 text-slate-300 hover:bg-white/10"
            >
              <IconX size={22} />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}