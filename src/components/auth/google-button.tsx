"use client";

/**
 * Bouton « Continuer avec Google » — lance le flux OAuth Auth.js.
 */
import { useState } from "react";
import { signIn } from "next-auth/react";
import { IconBrandGoogle, IconLoader2 } from "@tabler/icons-react";
import { cx } from "@/lib/ui-classes";

export function GoogleButton({
  label = "Continuer avec Google",
  callbackUrl = "/dashboard",
}: {
  label?: string;
  callbackUrl?: string;
}) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => {
        setLoading(true);
        signIn("google", { callbackUrl }).catch(() => setLoading(false));
      }}
      className={cx(
        "flex w-full items-center justify-center gap-2.5 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-navy shadow-sm transition-colors",
        "hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/30",
        "disabled:cursor-not-allowed disabled:opacity-60"
      )}
    >
      {loading ? (
        <IconLoader2 className="size-4 animate-spin" />
      ) : (
        <IconBrandGoogle className="size-4" aria-hidden />
      )}
      {loading ? "Connexion à Google…" : label}
    </button>
  );
}
