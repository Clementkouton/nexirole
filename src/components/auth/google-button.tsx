"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { IconBrandGoogle } from "@tabler/icons-react";

export function GoogleButton({ redirectTo = "/dashboard" }: { redirectTo?: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => {
        setLoading(true);
        signIn("google", { redirectTo }).catch(() => setLoading(false));
      }}
      className="flex w-full items-center justify-center gap-2.5 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-navy transition hover:bg-slate-50 disabled:opacity-60"
    >
      <IconBrandGoogle className="size-5" />
      {loading ? "Connexion à Google..." : "Continuer avec Google"}
    </button>
  );
}