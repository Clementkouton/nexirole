"use client";

/**
 * Menu utilisateur navbar : nom + déconnexion sécurisée si connecté,
 * lien « Connexion » sinon. États de chargement avec squelette.
 */
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { IconLogout } from "@tabler/icons-react";
import { cx } from "@/lib/ui-classes";

export function UserMenu({ mobile = false }: { mobile?: boolean }) {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div className={cx("animate-pulse rounded-full bg-slate-200", mobile ? "h-10 w-40" : "h-10 w-28")} />;
  }

  if (!session?.user) {
    return (
      <Link
        href="/login"
        className={cx(
          "inline-flex items-center justify-center rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-navy transition-colors hover:bg-slate-50",
          mobile && "w-full py-2.5"
        )}
      >
        Connexion
      </Link>
    );
  }

  const initial = (session.user.name ?? session.user.email ?? "U")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <div className={cx("flex items-center gap-2", mobile && "w-full")}>
      <span
        className={cx(
          "inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-1.5 pr-3 shadow-sm",
          mobile && "flex-1 justify-start"
        )}
        title={session.user.email ?? undefined}
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-navy text-xs font-bold text-white" aria-hidden>
          {initial}
        </span>
        <span className="max-w-[140px] truncate text-sm font-semibold text-navy">
          {session.user.name ?? session.user.email}
        </span>
      </span>
      <button
        type="button"
                onClick={() => signOut({ redirectTo: "/" })}
        className={cx(
          "inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700",
          mobile && "flex-1 justify-center"
        )}
        aria-label="Se déconnecter"
      >
        <IconLogout className="size-4" aria-hidden />
        Déconnexion
      </button>
    </div>
  );
}
