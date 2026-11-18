"use client";

import { useEffect, useState, type ComponentType } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { Suspense } from "react";
import {
  IconArrowRight,
  IconFileText,
  IconHistory,
  IconLayoutDashboard,
  IconLogout,
  IconMenu2,
  IconRadar,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import { AgentScanPanel } from "@/components/dashboard/agent-scan-panel";
import { DossierPanel } from "@/components/dashboard/dossier-panel";
import { HistoryPanel } from "@/components/dashboard/history-panel";
import {
  LICENSE_REFRESH_EVENT,
  LicensePanel,
  QUOTA_EXCEEDED_EVENT,
} from "@/components/dashboard/license-panel";
import {
  LicenseOverviewCard,
  PaymentSuccessBanner,
} from "@/components/dashboard/payment-banner";

type SectionId = "overview" | "dossier" | "agent" | "history";

type IconType = ComponentType<{ className?: string }>;

type NavItem = {
  id: SectionId;
  label: string;
  icon: IconType;
};

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Vue d'ensemble & Scores", icon: IconLayoutDashboard },
  { id: "dossier", label: "CV & Lettre par offre", icon: IconFileText },
  { id: "agent", label: "Agent Recherche en Direct", icon: IconRadar },
  { id: "history", label: "Mon Historique & Suivi", icon: IconHistory },
];

const STEPS = [
  {
    title: "1. Charge ton CV",
    text: "PDF ou texte : il sert de base à toutes les générations NexiRole.",
  },
  {
    title: "2. Scanne le marché",
    text: "L'Agent interroge Remotive et Arbeitnow, puis score chaque offre avec l'IA.",
  },
  {
    title: "3. Génère ton dossier",
    text: "Un CV et une lettre taillés pour l'offre choisie, prêts à envoyer.",
  },
];

/**
 * Intercepteur global des réponses API : dès qu'une route renvoie
 * { code: "QUOTA_EXCEEDED" } (plan Découverte épuisé) ou 429 RATE_LIMITED,
 * la modale d'abonnement/licence s'ouvre automatiquement (PARTIE 3).
 */
function installQuotaInterceptor(): () => void {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await originalFetch(...args);
    try {
      const url = typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url ?? "";
      if (url.includes("/api/") && (response.status === 403 || response.status === 429)) {
        const clone = response.clone();
        const data = (await clone.json()) as { code?: string; error?: string };
        if (data?.code === "QUOTA_EXCEEDED") {
          window.dispatchEvent(
            new CustomEvent(QUOTA_EXCEEDED_EVENT, { detail: { message: data.error } })
          );
        }
      }
    } catch {
      // Réponse sans JSON : rien à faire
    }
    return response;
  };
  return () => {
    window.fetch = originalFetch;
  };
}

export function AppDashboardShell({
  userName,
  userEmail,
}: {
  userName?: string | null;
  userEmail?: string | null;
}) {
  const router = useRouter();
  const [active, setActive] = useState<SectionId>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Quand l'Agent transmet une offre, bascule automatiquement sur « CV & Lettre par offre ».
  useEffect(() => {
    const handler = () => {
      setActive("dossier");
      setSidebarOpen(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("nexirole:open-dossier", handler);
    return () => window.removeEventListener("nexirole:open-dossier", handler);
  }, []);

  // Intercepteur quota : ouvert une seule fois pour toute la vie du shell.
  useEffect(() => installQuotaInterceptor(), []);

  // Le paiement Chariow redirige vers /dashboard?payment=success :
  // on force le rafraîchissement du badge de licence au montage.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      window.dispatchEvent(new Event(LICENSE_REFRESH_EVENT));
    }
  }, []);

  const displayName =
    userName?.trim() || userEmail?.split("@")[0] || "Utilisateur";
  const initials =
    displayName
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "U";

  const openSection = (id: SectionId) => {
    setActive(id);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const renderNav = () => (
    <nav className="space-y-1 px-3">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => openSection(item.id)}
            className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
              isActive
                ? "bg-navy text-white shadow-md"
                : "text-slate-600 hover:bg-navy-50 hover:text-navy"
            }`}
          >
            <Icon
              className={`h-5 w-5 shrink-0 ${
                isActive ? "text-gold" : "text-slate-400 group-hover:text-navy"
              }`}
            />
            <span className="flex-1">{item.label}</span>
            {isActive && <span className="h-1.5 w-1.5 rounded-full bg-gold" />}
          </button>
        );
      })}
    </nav>
  );

  const renderUserCard = () => (
    <div className="border-t border-slate-200">
      <LicensePanel userEmail={userEmail} />
      <div className="flex items-center gap-3 border-t border-slate-100 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-bold text-gold">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-navy">{displayName}</p>
          {userEmail ? (
            <p className="truncate text-xs text-slate-500">{userEmail}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => signOut({ redirectTo: "/" })}
          title="Se déconnecter"
          className="rounded-lg p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
        >
          <IconLogout className="h-5 w-5" />
        </button>
      </div>
    </div>
  );

  const renderLogo = () => (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <Image
        src="/logo.png"
        alt="Logo NexiRole"
        width={32}
        height={32}
        className="rounded-lg"
      />
      <span className="font-heading text-lg font-bold text-navy">NexiRole</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-ice">
      {/* Barre supérieure (mobile) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="Logo NexiRole"
            width={28}
            height={28}
            className="rounded-lg"
          />
          <span className="font-heading text-base font-bold text-navy">NexiRole</span>
        </div>
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Ouvrir le menu"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <IconMenu2 className="h-5 w-5" />
        </button>
      </header>

      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-slate-200 bg-white lg:flex">
        {renderLogo()}
        {renderNav()}
        <div className="mt-6 px-3">
          <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Outils
          </p>
          <button
            type="button"
            onClick={() => {
              setSidebarOpen(false);
              router.push("/dashboard/cv-builder");
            }}
            className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-600 transition hover:bg-navy-50 hover:text-navy"
          >
            <IconFileText className="h-5 w-5 shrink-0 text-slate-400 group-hover:text-navy" />
            <span className="flex-1">Créateur de CV PDF</span>
            <IconArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-navy" />
          </button>
        </div>
        <div className="mt-auto">{renderUserCard()}</div>
      </aside>

      {/* Sidebar (mobile, drawer) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/60"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col overflow-y-auto bg-white shadow-2xl">
            <div className="flex items-center justify-between pr-3">
              {renderLogo()}
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label="Fermer le menu"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <IconX className="h-5 w-5" />
              </button>
            </div>
            {renderNav()}
            <div className="mt-6 px-3">
              <button
                type="button"
                onClick={() => {
                  setSidebarOpen(false);
                  router.push("/dashboard/cv-builder");
                }}
                className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-600 transition hover:bg-navy-50 hover:text-navy"
              >
                <IconFileText className="h-5 w-5 shrink-0 text-slate-400 group-hover:text-navy" />
                <span className="flex-1">Créateur de CV PDF</span>
                <IconArrowRight className="h-4 w-4 text-slate-300" />
              </button>
            </div>
            <div className="mt-auto">{renderUserCard()}</div>
          </aside>
        </div>
      )}

      {/* Contenu : les panneaux restent montés en permanence (masqués en CSS) pour ne
          perdre ni les résultats du scan ni l'écouteur de nexirole:open-dossier. */}
      <main className="lg:pl-72">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {/* Bannière de retour de paiement Chariow (?payment=success) */}
          <Suspense fallback={null}>
            <PaymentSuccessBanner />
          </Suspense>

          <div className={active === "overview" ? "space-y-6" : "hidden"}>
            <section className="rounded-2xl bg-navy p-6 text-white shadow-lg sm:p-8">
              <div className="flex items-center gap-2 text-gold">
                <IconSparkles className="h-5 w-5" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Espace carrière NexiRole
                </span>
              </div>
              <h1 className="mt-3 font-heading text-2xl font-bold sm:text-3xl">
                Bonjour {displayName}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">
                Trouve les offres qui te correspondent, puis génère en un clic un CV et une
                lettre de motivation taillés pour chaque offre.
              </p>
            </section>

            {/* État de la licence (badge plan + quotas) */}
            <LicenseOverviewCard />

            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => openSection("dossier")}
                className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy text-gold">
                  <IconFileText className="h-6 w-6" />
                </div>
                <h2 className="mt-4 font-heading text-base font-bold text-navy">
                  CV & Lettre par offre
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Colle le lien d'une offre (ou importe-la depuis l'Agent) et génère ton
                  dossier complet.
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-navy">
                  Ouvrir
                  <IconArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </button>

              <button
                type="button"
                onClick={() => openSection("agent")}
                className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy text-gold">
                  <IconRadar className="h-6 w-6" />
                </div>
                <h2 className="mt-4 font-heading text-base font-bold text-navy">
                  Agent Recherche en Direct
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Scan en direct de Remotive et Arbeitnow, avec scoring IA de chaque offre
                  selon ton CV.
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-navy">
                  Lancer un scan
                  <IconArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {STEPS.map((step) => (
                <div
                  key={step.title}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <p className="text-sm font-bold text-navy">{step.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{step.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className={active === "dossier" ? "" : "hidden"}>
            <DossierPanel />
          </div>

          <div className={active === "agent" ? "" : "hidden"}>
            <AgentScanPanel />
          </div>

          <div className={active === "history" ? "" : "hidden"}>
            <HistoryPanel />
          </div>
        </div>
      </main>
    </div>
  );
}
