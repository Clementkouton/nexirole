"use client";

import { useEffect } from "react";
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Dashboard] Erreur :", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
          <IconAlertTriangle className="h-7 w-7 text-red-600" />
        </div>
        <h1 className="mb-2 text-xl font-bold text-[#051937]">Une erreur est survenue</h1>
        <p className="mb-2 text-sm text-slate-600">
          Le tableau de bord n&apos;a pas pu s&apos;afficher correctement.
        </p>
        <p className="mb-6 break-words rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          {error.message}
          {error.digest ? ` (réf. ${error.digest})` : ""}
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#FFC107] px-4 py-2.5 text-sm font-semibold text-[#051937] transition hover:bg-[#e6ae00]"
        >
          <IconRefresh className="h-4 w-4" />
          Réessayer
        </button>
      </div>
    </div>
  );
}
