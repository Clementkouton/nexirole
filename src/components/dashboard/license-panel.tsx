"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  IconCircleCheck,
  IconClock,
  IconCrown,
  IconLoader2,
  IconShieldCheck,
  IconWallet,
} from "@tabler/icons-react";

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

export function LicensePanel() {
  const { data: session, status } = useSession();
  const user = session?.user ?? null;
  const planKey = (user?.plan ?? "free").toLowerCase();
  const planLabel = PLAN_LABELS[planKey] ?? PLAN_LABELS.free;
  const licenceActive = String(user?.licenseStatus ?? "").toLowerCase() === "active";
  const isPaid = planKey === "boost" || planKey === "pro";
  const expiry = formatDate(user?.expiresAt);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#051937]">
              <IconCrown className="h-6 w-6 text-[#FFC107]" />
            </div>
            <div>
              <p className="font-bold text-[#051937]">Votre licence</p>
              <p className="text-xs text-slate-500">Formule {planLabel}</p>
            </div>
          </div>
          {licenceActive && isPaid ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              <IconCircleCheck className="h-4 w-4" />
              Actif
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">
              Inactif
            </span>
          )}
        </div>

        {licenceActive && isPaid ? (
          <div className="space-y-2 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="flex items-center gap-2 font-semibold">
              <IconCircleCheck className="h-4 w-4" />
              {planLabel} Actif
            </p>
            {expiry ? (
              <p className="flex items-center gap-2 text-emerald-700">
                <IconClock className="h-4 w-4" />
                Expire le {expiry}
              </p>
            ) : null}
            <p className="text-emerald-700">
              Activation automatique après paiement : aucune clé manuelle n&apos;est nécessaire.
            </p>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border border-dashed border-slate-300 p-4">
            <p className="text-sm text-slate-600">
              Aucune licence active sur votre compte. Choisissez une formule sur la page
              Abonnement : le paiement active automatiquement votre plan en quelques secondes,
              sans clé à saisir.
            </p>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-4 py-2.5 text-sm font-semibold text-[#051937] transition hover:bg-[#e6ae00]"
            >
              <IconCrown className="h-4 w-4" />
              Passer au Pass Boost / Pro
            </Link>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-4 font-bold text-[#051937]">Comment ça marche</p>
        <ul className="space-y-3 text-sm text-slate-700">
          <li className="flex items-start gap-3">
            <IconWallet className="mt-0.5 h-5 w-5 shrink-0 text-[#051937]" />
            Choisissez Pass Boost ou Carrière Pro sur la page Abonnement.
          </li>
          <li className="flex items-start gap-3">
            <IconShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#051937]" />
            Payez dans la fenêtre de paiement intégrée, sans quitter NexiRole.
          </li>
          <li className="flex items-start gap-3">
            <IconCircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#051937]" />
            Le webhook Chariow active votre plan automatiquement ; votre espace se met à jour.
          </li>
        </ul>
      </div>

      {status === "loading" ? (
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
          Chargement de la session...
        </p>
      ) : null}
    </div>
  );
}

export default LicensePanel;
