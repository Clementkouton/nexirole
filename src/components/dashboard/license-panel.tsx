"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  IconCrown,
  IconExternalLink,
  IconKey,
  IconLoader2,
  IconLock,
  IconRocket,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";

/**
 * PARTIE 1 — Bloc licence du tableau de bord :
 *  - badge du plan actif (Découverte / Pass Boost / Carrière Pro),
 *  - quotas restants pour le plan gratuit,
 *  - bouton « Activer une clé de licence » (modale de secours),
 *  - ouverture automatique de la modale quand l'API renvoie
 *    { code: "QUOTA_EXCEEDED" } (événement nexirole:quota-exceeded).
 */

export interface LicenseStatus {
  plan: "FREE" | "BOOST" | "PRO";
  licenseStatus: string;
  licenseKey: string | null;
  expiresAt: string | null;
  isActive: boolean;
  daysRemaining: number | null;
  searchesUsed: number;
  generationsUsed: number;
  limits: { searches: number; generations: number };
}

export const LICENSE_REFRESH_EVENT = "nexirole:license-refresh";
export const QUOTA_EXCEEDED_EVENT = "nexirole:quota-exceeded";

const PLAN_META = {
  FREE: { label: "Découverte", chip: "bg-slate-100 text-slate-600", icon: IconSparkles },
  BOOST: { label: "Pass Boost", chip: "bg-gold/20 text-amber-700", icon: IconRocket },
  PRO: { label: "Carrière Pro", chip: "bg-navy text-gold", icon: IconCrown },
} as const;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function QuotaRow({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const unlimited = limit < 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const full = !unlimited && used >= limit;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-600">{label}</span>
        <span className={full ? "font-bold text-red-600" : "font-semibold text-slate-500"}>
          {unlimited ? "Illimité" : `${used} / ${limit}`}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${
            full ? "bg-red-500" : pct > 60 ? "bg-amber-500" : "bg-emerald-500"
          }`}
          style={{ width: unlimited ? "100%" : `${Math.max(pct, used > 0 ? 8 : 0)}%` }}
        />
      </div>
    </div>
  );
}

export function LicensePanel({ userEmail }: { userEmail?: string | null }) {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [quotaAlert, setQuotaAlert] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/license/status", { cache: "no-store" });
      if (res.ok) setStatus((await res.json()) as LicenseStatus);
    } catch {
      // Silencieux : le badge restera sur son état précédent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onRefresh = () => void refresh();
    const onQuota = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setQuotaAlert(
        detail?.message ??
          "Votre quota du plan Découverte est atteint. Passez au Pass Boost ou Carrière Pro pour continuer sans limite."
      );
      setModalOpen(true);
    };
    window.addEventListener(LICENSE_REFRESH_EVENT, onRefresh);
    window.addEventListener(QUOTA_EXCEEDED_EVENT, onQuota);
    return () => {
      window.removeEventListener(LICENSE_REFRESH_EVENT, onRefresh);
      window.removeEventListener(QUOTA_EXCEEDED_EVENT, onQuota);
    };
  }, [refresh]);

  const meta = PLAN_META[status?.plan ?? "FREE"];
  const PlanIcon = meta.icon;

  return (
    <>
      {/* Badge de plan (sidebar) */}
      <div className="mx-3 mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${meta.chip}`}
          >
            <PlanIcon className="size-3.5" />
            {meta.label}
          </span>
          {status?.isActive && status.daysRemaining !== null ? (
            <span className="text-[11px] font-semibold text-slate-500">
              {status.daysRemaining} j restants
            </span>
          ) : null}
        </div>

        {status && status.plan === "FREE" ? (
          <div className="mt-3 space-y-2">
            <QuotaRow
              label="Recherches en direct"
              used={status.searchesUsed}
              limit={status.limits.searches}
            />
            <QuotaRow
              label="Dossiers générés"
              used={status.generationsUsed}
              limit={status.limits.generations}
            />
          </div>
        ) : null}

        {status?.isActive && status.expiresAt ? (
          <p className="mt-2 text-[11px] text-slate-500">
            Valide jusqu&apos;au {formatDate(status.expiresAt)}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => {
            setQuotaAlert(null);
            setModalOpen(true);
          }}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-navy px-3 py-2 text-xs font-semibold text-white transition hover:bg-navy-800"
        >
          <IconKey className="size-3.5" />
          Activer une clé de licence
        </button>

        {!status?.isActive ? (
          <Link
            href="/pricing"
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-navy transition hover:bg-slate-50"
          >
            Voir les tarifs
            <IconExternalLink className="size-3.5" />
          </Link>
        ) : null}
      </div>

      {/* Modale d'activation */}
      {modalOpen ? (
        <LicenseKeyModal
          userEmail={userEmail ?? null}
          quotaAlert={quotaAlert}
          onClose={() => {
            setModalOpen(false);
            setQuotaAlert(null);
          }}
          onActivated={async (planLabel) => {
            await refresh();
            window.dispatchEvent(new Event(LICENSE_REFRESH_EVENT));
            toast.success(`Plan ${planLabel} activé !`);
          }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Modale « Activer une clé de licence »                              */
/* ------------------------------------------------------------------ */

function LicenseKeyModal({
  userEmail,
  quotaAlert,
  onClose,
  onActivated,
}: {
  userEmail: string | null;
  quotaAlert: string | null;
  onClose: () => void;
  onActivated: (planLabel: string) => void | Promise<void>;
}) {
  const [licenseKey, setLicenseKey] = useState("");
  const [email, setEmail] = useState(userEmail ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose]);

  const submit = async () => {
    setError(null);
    const key = licenseKey.trim();
    if (key.length < 8) {
      setError("La clé doit contenir au moins 8 caractères.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Saisissez une adresse email valide.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/license/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: key, email: email.trim().toLowerCase() }),
      });
      const data = (await res.json()) as { error?: string; plan?: string; message?: string };
      if (!res.ok) {
        setError(data.error ?? "L'activation a échoué. Réessayez.");
        return;
      }
      const planLabel =
        data.plan === "PRO" ? "Carrière Pro" : data.plan === "BOOST" ? "Pass Boost" : data.plan;
      await onActivated(planLabel ?? "payant");
      onClose();
    } catch {
      setError("Connexion impossible au serveur. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Activer une clé de licence"
        className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <IconX className="size-5" />
        </button>

        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-navy text-gold">
            <IconKey className="size-5" />
          </span>
          <h2 className="font-heading text-lg font-bold text-navy">
            Activer une clé de licence
          </h2>
        </div>

        {quotaAlert ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {quotaAlert}{" "}
            <Link href="/pricing" className="font-bold underline underline-offset-2">
              Voir les tarifs
            </Link>
          </div>
        ) : null}

        <p className="mt-4 text-sm text-slate-500">
          Saisissez la clé reçue par email après votre achat sur Chariow. L&apos;activation
          est immédiate : vos compteurs sont remis à zéro.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="license-key" className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Clé de licence
            </label>
            <input
              id="license-key"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={licenseKey}
              onChange={(evt) => setLicenseKey(evt.target.value)}
              placeholder="ABCD-1234-EFGH-5678"
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 font-mono text-sm uppercase tracking-wider text-navy outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/10"
            />
          </div>
          <div>
            <label htmlFor="license-email" className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Email du compte
            </label>
            <input
              id="license-email"
              type="email"
              value={email}
              onChange={(evt) => setEmail(evt.target.value)}
              placeholder="vous@exemple.com"
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-navy outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/10"
            />
          </div>
        </div>

        {error ? (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-navy px-5 text-sm font-semibold text-white transition hover:bg-navy-800 disabled:opacity-60"
        >
          {submitting ? (
            <>
              <IconLoader2 className="size-4 animate-spin" />
              Vérification de la clé…
            </>
          ) : (
            <>
              <IconLock className="size-4" />
              Activer ma licence
            </>
          )}
        </button>
      </div>
    </div>
  );
}
