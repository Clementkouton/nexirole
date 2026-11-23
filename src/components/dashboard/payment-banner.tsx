"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconConfetti,
  IconX,
} from "@tabler/icons-react";

/**
 * PARTIE 1 — Gestion du retour de paiement Chariow (`/dashboard?payment=success`).
 * La page détecte le paramètre URL, rafraîchit immédiatement le statut de la
 * licence depuis la base de données et affiche une bannière de félicitations
 * confirmant l'activation automatique du plan.
 */

const DISMISS_KEY = "nexirole:payment-banner-dismissed";
const LICENSE_REFRESH_EVENT = "nexirole:license-refresh";

type LicenseStatus = {
  isActive: boolean;
  plan: string;
  expiresAt: string | null;
  limits: {
    searches: number;
    generations: number;
  };
};

export function PaymentSuccessBanner() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  const isPaymentReturn = searchParams.get("payment") === "success";

  useEffect(() => {
    if (!isPaymentReturn) return;
    try {
      if (window.sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // sessionStorage indisponible : on affiche quand même
    }
    setDismissed(false);
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/license/status", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as LicenseStatus;
          setStatus(data);
          // Le badge de la sidebar se rafraîchit aussi
          window.dispatchEvent(new Event(LICENSE_REFRESH_EVENT));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [isPaymentReturn]);

  if (!isPaymentReturn || dismissed) return null;

  const close = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  };

  const activePlan = status?.isActive
    ? status.plan === "PRO"
      ? "Carrière Pro"
      : "Pass Boost"
    : null;

  return (
    <div
      role="status"
      className={`relative rounded-2xl border p-4 sm:p-5 ${
        activePlan
          ? "border-emerald-200 bg-emerald-50"
          : "border-amber-200 bg-amber-50"
      }`}
    >
      <button
        type="button"
        onClick={close}
        aria-label="Fermer la bannière"
        className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 transition hover:bg-white/60"
      >
        <IconX className="size-4" />
      </button>

      <div className="flex items-start gap-3 pr-8">
        {activePlan ? (
          <IconConfetti className="mt-0.5 size-6 shrink-0 text-emerald-600" />
        ) : (
          <IconAlertTriangle className="mt-0.5 size-6 shrink-0 text-amber-600" />
        )}
        <div className="text-sm">
          {loading ? (
            <p className="font-medium text-slate-700">
              Vérification de votre licence…
            </p>
          ) : activePlan ? (
            <>
              <p className="font-bold text-emerald-800">
                Félicitations, votre plan {activePlan} est activé !
              </p>
              <p className="mt-1 text-emerald-700">
                Activation automatique confirmée depuis votre paiement Chariow.
                {status?.expiresAt
                  ? ` Valide jusqu'au ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(status.expiresAt))}.`
                  : ""}
              </p>
            </>
          ) : (
            <>
              <p className="font-bold text-amber-800">
                Paiement reçu — activation en cours
              </p>
              <p className="mt-1 text-amber-700">
                Votre plan n&apos;est pas encore visible sur ce compte. Il s&apos;activera
                automatiquement si vous vous êtes inscrit avec l&apos;email utilisé lors
                de l&apos;achat. Sinon, activez votre clé manuellement ou rendez-vous
                sur les{" "}
                <Link href="/pricing" className="font-bold underline underline-offset-2">
                  tarifs
                </Link>
                .
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Petite carte d'état de licence réutilisable dans la vue d'ensemble. */
export function LicenseOverviewCard() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/license/status", { cache: "no-store" });
        if (res.ok) setStatus((await res.json()) as LicenseStatus);
      } catch {
        // ignore
      }
    };
    void load();
    const onRefresh = () => void load();
    window.addEventListener(LICENSE_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(LICENSE_REFRESH_EVENT, onRefresh);
  }, []);

  if (!status) return null;

  const planLabel =
    status.plan === "PRO"
      ? "Carrière Pro"
      : status.plan === "BOOST"
        ? "Pass Boost"
        : "Découverte (gratuit)";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <IconCircleCheck
          className={`size-6 ${status.isActive ? "text-emerald-600" : "text-slate-400"}`}
        />
        <div className="text-sm">
          <p className="font-semibold text-navy">Plan actif : {planLabel}</p>
          <p className="text-slate-500">
            {status.isActive
              ? `Licence active${status.expiresAt ? ` — expire le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(status.expiresAt))}` : ""}`
              : `${status.limits.searches} recherches et ${status.limits.generations} dossiers par mois. Passez au supérieur à tout moment.`}
          </p>
        </div>
      </div>
      <Link
        href="/pricing"
        className="inline-flex h-9 items-center rounded-full bg-navy px-4 text-xs font-semibold text-white transition hover:bg-navy-800"
        onClick={() => toast.message("Comparez les plans Pass Boost et Carrière Pro")}
      >
        {status.isActive ? "Prolonger" : "Améliorer mon plan"}
      </Link>
    </div>
  );
}
