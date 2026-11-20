"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  IconCircleCheck,
  IconCrown,
  IconLoader2,
  IconRocket,
  IconShieldCheck,
  IconX,
} from "@tabler/icons-react";

type PlanId = "boost" | "pro";

interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  durationLabel: string;
  checkoutUrl: string | undefined;
  features: string[];
  highlight: boolean;
}

const PLANS: PlanDefinition[] = [
  {
    id: "boost",
    name: "Pass Boost",
    tagline: "Pour accélérer une recherche d'emploi ciblée.",
    durationLabel: "Validité 30 jours",
    checkoutUrl: process.env.NEXT_PUBLIC_CHARIOW_BOOST_URL,
    features: [
      "Activation automatique dès la confirmation du paiement",
      "Accès à toutes les fonctions de la formule Boost",
      "Compteurs de recherche et de génération remis à zéro",
      "Sans engagement, aucune clé manuelle à saisir",
    ],
    highlight: false,
  },
  {
    id: "pro",
    name: "Carrière Pro",
    tagline: "Pour une recherche complète et un suivi long durée.",
    durationLabel: "Validité 90 jours",
    checkoutUrl: process.env.NEXT_PUBLIC_CHARIOW_PRO_URL,
    features: [
      "Activation automatique dès la confirmation du paiement",
      "Accès à toutes les fonctions de la formule Pro",
      "Compteurs de recherche et de génération remis à zéro",
      "Sans engagement, aucune clé manuelle à saisir",
    ],
    highlight: true,
  },
];

function buildCheckoutUrl(checkoutUrl: string, email: string): string {
  try {
    const url = new URL(checkoutUrl);
    url.searchParams.set("email", email);
    return url.toString();
  } catch {
    const separator = checkoutUrl.includes("?") ? "&" : "?";
    return `${checkoutUrl}${separator}email=${encodeURIComponent(email)}`;
  }
}

interface PaymentModalProps {
  plan: PlanDefinition;
  email: string;
  alreadyActive: boolean;
  checking: boolean;
  onClose: () => void;
  onManualCheck: () => void;
}

function PaymentModal({ plan, email, alreadyActive, checking, onClose, onManualCheck }: PaymentModalProps) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#051937]/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 bg-[#051937] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <IconShieldCheck className="h-5 w-5 shrink-0 text-[#FFC107]" />
            <div>
              <p className="text-sm font-bold text-white">Paiement sécurisé — {plan.name}</p>
              <p className="text-xs text-slate-300">
                Activation automatique sur {email} dès la confirmation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        {alreadyActive ? (
          <div className="p-8 text-center">
            <IconCrown className="mx-auto mb-4 h-10 w-10 text-[#FFC107]" />
            <p className="font-bold text-[#051937]">Votre formule payante est déjà active</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
              Aucun nouveau paiement n&apos;est nécessaire. Vous pouvez retourner à votre espace
              candidat à tout moment.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-4 py-2.5 text-sm font-semibold text-[#051937] transition hover:bg-[#e6ae00]"
            >
              Fermer
            </button>
          </div>
        ) : (
          <>
            <iframe
              src={buildCheckoutUrl(plan.checkoutUrl ?? "", email)}
              title={`Paiement ${plan.name}`}
              className="h-[65vh] min-h-[420px] w-full border-0"
              allow="payment"
            />
            <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <IconLoader2 className="h-4 w-4 animate-spin text-[#051937]" />
                Vérification automatique de l&apos;activation toutes les 3 secondes...
              </p>
              <button
                type="button"
                onClick={onManualCheck}
                disabled={checking}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#051937] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {checking ? (
                  <IconLoader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <IconShieldCheck className="h-4 w-4" />
                )}
                J&apos;ai finalisé mon paiement, vérifier maintenant
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function PricingClient() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const [modalPlan, setModalPlan] = useState<PlanDefinition | null>(null);
  const [alreadyActive, setAlreadyActive] = useState(false);
  const [checking, setChecking] = useState(false);

  const email = session?.user?.email ?? null;
  const currentPlan = String(session?.user?.plan ?? "free").toLowerCase();
  const licenceActive = String(session?.user?.licenseStatus ?? "").toLowerCase() === "active";

  const checkLicense = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/license/status", { cache: "no-store" });
      if (!res.ok) return false;
      const data = (await res.json()) as { plan?: string; licenseStatus?: string };
      const plan = String(data.plan ?? "free").toLowerCase();
      const licenseStatus = String(data.licenseStatus ?? "").toLowerCase();
      const activated = (plan === "boost" || plan === "pro") && licenseStatus === "active";
      if (activated) {
        setModalPlan(null);
        setAlreadyActive(false);
        try {
          await update();
        } catch {
          // Le rafraîchissement JWT est best-effort ; le redirect relit tout.
        }
        router.push("/dashboard?payment=success");
      }
      return activated;
    } catch {
      return false;
    }
  }, [router, update]);

  // Polling automatique toutes les 3 secondes tant que la modale est ouverte
  useEffect(() => {
    if (!modalPlan || alreadyActive) return;
    const interval = setInterval(() => {
      void checkLicense();
    }, 3000);
    return () => clearInterval(interval);
  }, [modalPlan, alreadyActive, checkLicense]);

  const manualCheck = async () => {
    setChecking(true);
    await checkLicense();
    setChecking(false);
  };

  const openCheckout = (plan: PlanDefinition) => {
    if (!email) {
      router.push("/login?callbackUrl=" + encodeURIComponent("/pricing"));
      return;
    }
    if (licenceActive && (currentPlan === "boost" || currentPlan === "pro")) {
      setAlreadyActive(true);
      setModalPlan(plan);
      return;
    }
    if (!plan.checkoutUrl) return;
    setAlreadyActive(false);
    setModalPlan(plan);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold text-[#051937]">Choisissez votre formule</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
          Paiement intégré : vous restez sur NexiRole et votre licence s&apos;active
          automatiquement dès la confirmation du paiement.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {PLANS.map((plan) => {
          const PlanIcon = plan.highlight ? IconCrown : IconRocket;
          const isCurrent = currentPlan === plan.id && licenceActive;
          return (
            <div
              key={plan.id}
              className={
                plan.highlight
                  ? "relative flex flex-col rounded-2xl border-2 border-[#FFC107] bg-white p-6 shadow-lg"
                  : "relative flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              }
            >
              {plan.highlight ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#051937] px-3 py-1 text-xs font-semibold text-[#FFC107]">
                  Recommandé
                </span>
              ) : null}
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#051937]">
                  <PlanIcon className="h-6 w-6 text-[#FFC107]" />
                </div>
                <div>
                  <p className="text-lg font-bold text-[#051937]">{plan.name}</p>
                  <p className="text-xs text-slate-500">{plan.durationLabel}</p>
                </div>
              </div>
              <p className="mb-4 text-sm text-slate-600">{plan.tagline}</p>
              <ul className="mb-6 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-slate-700">
                    <IconCircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#FFC107]" />
                    {feature}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <span className="mt-auto inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
                  <IconCircleCheck className="h-4 w-4" />
                  Formule actuelle
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => openCheckout(plan)}
                  disabled={status === "loading"}
                  className="mt-auto inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#FFC107] px-4 py-3 text-sm font-semibold text-[#051937] transition hover:bg-[#e6ae00] disabled:opacity-60"
                >
                  <IconCrown className="h-4 w-4" />
                  Choisir {plan.name}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {modalPlan && email ? (
        <PaymentModal
          plan={modalPlan}
          email={email}
          alreadyActive={alreadyActive}
          checking={checking}
          onClose={() => {
            setModalPlan(null);
            setAlreadyActive(false);
          }}
          onManualCheck={() => {
            void manualCheck();
          }}
        />
      ) : null}
    </div>
  );
}

export default PricingClient;
