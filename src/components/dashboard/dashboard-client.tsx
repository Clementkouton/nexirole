"use client";

import {
  Component,
  Suspense,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  IconCircleCheck,
  IconClock,
  IconCrown,
  IconExternalLink,
  IconFileText,
  IconHistory,
  IconLicense,
  IconLink,
  IconLoader2,
  IconLogin,
  IconRobot,
  IconSearch,
} from "@tabler/icons-react";

// Panneaux existants : import par espace de noms — compile quel que soit
// le nom d'export (default ou nommé) utilisé dans chaque fichier.
import * as HistoryPanelModule from "@/components/dashboard/history-panel";
import * as LicensePanelModule from "@/components/dashboard/license-panel";
import * as DossierPanelModule from "@/components/dashboard/dossier-panel";
import * as TemplateSelectorModule from "@/components/dashboard/template-selector";

type PanelModule = Record<string, unknown>;

function resolvePanelComponent(panelModule: PanelModule): ComponentType | null {
  const defaultExport = panelModule.default;
  if (typeof defaultExport === "function") {
    return defaultExport as unknown as ComponentType;
  }
  const namedExport = Object.values(panelModule).find(
    (value) => typeof value === "function"
  );
  return typeof namedExport === "function"
    ? (namedExport as unknown as ComponentType)
    : null;
}

type TabId = "agent" | "dossier" | "cv" | "historique" | "licence";

interface TabDefinition {
  id: TabId;
  label: string;
  icon: typeof IconRobot;
  href: string;
  ctaLabel: string;
  description: string;
  panelModule?: PanelModule;
}

const TABS: TabDefinition[] = [
  {
    id: "agent",
    label: "Agent",
    icon: IconRobot,
    href: "/dashboard/agent",
    ctaLabel: "Ouvrir l'agent",
    description: "Recherche d'offres, analyse de CV et simulations d'entretien avec l'IA NexiRole.",
  },
  {
    id: "dossier",
    label: "Dossier par lien",
    icon: IconLink,
    href: "/dashboard/dossier",
    ctaLabel: "Ouvrir le dossier",
    description: "Créez un dossier de candidature partageable via un simple lien.",
    panelModule: DossierPanelModule,
  },
  {
    id: "cv",
    label: "Créateur de CV",
    icon: IconFileText,
    href: "/dashboard/cv-builder",
    ctaLabel: "Ouvrir le créateur de CV",
    description: "Choisissez un modèle et générez un CV optimisé pour chaque offre.",
    panelModule: TemplateSelectorModule,
  },
  {
    id: "historique",
    label: "Historique",
    icon: IconHistory,
    href: "/dashboard/historique",
    ctaLabel: "Ouvrir l'historique",
    description: "Retrouvez toutes vos recherches et documents générés.",
    panelModule: HistoryPanelModule,
  },
  {
    id: "licence",
    label: "Licence",
    icon: IconLicense,
    href: "/pricing",
    ctaLabel: "Voir les formules",
    description: "Gérez votre licence, activez une clé ou passez à Carrière Pro.",
    panelModule: LicensePanelModule,
  },
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

interface PanelBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface PanelBoundaryState {
  hasError: boolean;
}

// Un panneau qui plante ne peut JAMAIS vider la page : il affiche la carte de secours.
class PanelBoundary extends Component<PanelBoundaryProps, PanelBoundaryState> {
  state: PanelBoundaryState = { hasError: false };

  static getDerivedStateFromError(): PanelBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("[Dashboard] Panneau en échec :", error);
  }

  render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function SectionCard({
  icon: Icon,
  title,
  description,
  href,
  ctaLabel,
}: {
  icon: typeof IconRobot;
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#051937]">
        <Icon className="h-6 w-6 text-[#FFC107]" />
      </div>
      <p className="font-semibold text-[#051937]">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-slate-600">
        {description}
      </p>
      <Link
        href={href}
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-4 py-2 text-sm font-semibold text-[#051937] transition hover:bg-[#e6ae00]"
      >
        {ctaLabel}
        <IconExternalLink className="h-4 w-4" />
      </Link>
    </div>
  );
}

function PanelLoading() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
      <IconLoader2 className="h-4 w-4 animate-spin" />
      Chargement du module...
    </div>
  );
}

function PanelSlot({ tab }: { tab: TabDefinition }) {
  const fallback = (
    <SectionCard
      icon={tab.icon}
      title={tab.label}
      description={tab.description}
      href={tab.href}
      ctaLabel={tab.ctaLabel}
    />
  );

  if (!tab.panelModule) return fallback;

  const Panel = resolvePanelComponent(tab.panelModule);
  if (!Panel) return fallback;

  return (
    <PanelBoundary fallback={fallback}>
      <Suspense fallback={<PanelLoading />}>
        <Panel />
      </Suspense>
    </PanelBoundary>
  );
}

// useSearchParams strictement isolé ici, enveloppé dans Suspense côté parent.
function PaymentSuccessWatcher() {
  const searchParams = useSearchParams();
  const { update } = useSession();
  const paymentSuccess = searchParams.get("payment") === "success";

  useEffect(() => {
    if (paymentSuccess) void update();
  }, [paymentSuccess, update]);

  if (!paymentSuccess) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-[#FFC107] bg-[#FFC107]/10 p-4">
      <IconCircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#051937]" />
      <div>
        <p className="font-semibold text-[#051937]">Paiement confirmé, merci !</p>
        <p className="text-sm text-slate-700">
          Votre formule est désormais active sur votre compte.
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
  icon: typeof IconRobot;
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
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<TabId>("agent");

  const user = session?.user ?? null;
  const planKey = (user?.plan ?? "free").toLowerCase();
  const planLabel = PLAN_LABELS[planKey] ?? PLAN_LABELS.free;
  const licenceActive = user?.licenseStatus === "active";
  const searchesUsed = typeof user?.searchesUsed === "number" ? user.searchesUsed : 0;
  const generationsUsed = typeof user?.generationsUsed === "number" ? user.generationsUsed : 0;
  const expiry = formatDate(user?.expiresAt);
  const activeTabDefinition =
    TABS.find((tab) => tab.id === activeTab) ?? (TABS[0] as TabDefinition);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6 lg:p-8">
      <Suspense fallback={null}>
        <PaymentSuccessWatcher />
      </Suspense>

      {/* En-tête — toujours rendu, session présente ou non */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#051937]">
            {user?.name ? `Bonjour ${user.name}` : "Espace candidat"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Bienvenue dans votre espace candidat NexiRole.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status === "loading" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500">
              <IconLoader2 className="h-4 w-4 animate-spin" />
              Session en cours...
            </span>
          ) : null}
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
          {status === "unauthenticated" ? (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-3 py-1.5 text-xs font-semibold text-[#051937] transition hover:bg-[#e6ae00]"
            >
              <IconLogin className="h-4 w-4" />
              Se connecter
            </Link>
          ) : null}
        </div>
      </header>

      {/* Onglets */}
      <nav className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {TABS.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={
                isActive
                  ? "inline-flex items-center gap-1.5 rounded-lg bg-[#051937] px-3.5 py-2 text-sm font-semibold text-white transition"
                  : "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              }
            >
              <TabIcon className={isActive ? "h-4 w-4 text-[#FFC107]" : "h-4 w-4"} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Contenu de l'onglet actif */}
      {activeTab === "agent" ? (
        <section className="space-y-6">
          <SectionCard
            icon={IconRobot}
            title="Votre agent IA de carrière"
            description="Lancez une recherche d'offres, analysez une annonce ou préparez un entretien avec l'IA NexiRole."
            href="/dashboard/agent"
            ctaLabel="Ouvrir l'agent"
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard icon={IconSearch} label="Recherches effectuées" value={String(searchesUsed)} />
            <StatCard icon={IconFileText} label="Documents générés" value={String(generationsUsed)} />
            <StatCard icon={IconClock} label="Expiration" value={expiry ?? "—"} />
          </div>
        </section>
      ) : (
        <section>
          <PanelSlot tab={activeTabDefinition} />
        </section>
      )}
    </div>
  );
}
