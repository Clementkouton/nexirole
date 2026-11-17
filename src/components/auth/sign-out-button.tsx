"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { IconLogout } from "@tabler/icons-react";

export function SignOutButton() {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setPending(true);
        signOut({ redirectTo: "/" });
      }}
      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-navy transition hover:border-red-200 hover:text-red-600 disabled:opacity-60"
    >
      <IconLogout className="size-4.5" />
      {pending ? "Déconnexion..." : "Se déconnecter"}
    </button>
  );
}