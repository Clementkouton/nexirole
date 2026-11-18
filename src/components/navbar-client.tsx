"use client";

/**
 * Navbar publique interactive — exclusivement @tabler/icons-react.
 * Connecté    : « Tableau de bord » + avatar + « Déconnexion ».
 * Non connecté : « Connexion » + « Lancer l'Assistant ».
 * Les ancres pointent vers les ids réels de la landing :
 * #fonctionnalites, #generateur-lien, #agent-recherche, #comment-ca-marche.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import {
  IconArrowRight,
  IconLayoutDashboard,
  IconLogout,
  IconMenu2,
  IconX,
} from "@tabler/icons-react";

const NAV_LINKS = [
  { href: "/#fonctionnalites", label: "Fonctionnalités" },
  { href: "/#generateur-lien", label: "Générateur par Lien" },
  { href: "/#agent-recherche", label: "Agent de Recherche" },
  { href: "/#comment-ca-marche", label: "Comment ça marche" },
];

export interface NavbarUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export function NavbarClient({ user }: { user: NavbarUser | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  const initial = (user?.name ?? user?.email ?? "U")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/90 backdrop-blur-md">
      <nav className="mx-auto flex h-16 items-center justify-between px-4 sm:px-6 md:px-12 lg:px-18">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          onClick={close}
          aria-label="NexiRole — Accueil"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Logo NexiRole"
            className="h-9 w-auto"
          />
        </Link>

        {/* Liens centraux — desktop */}
        <div className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 hover:text-navy"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Actions — desktop */}
        <div className="hidden items-center gap-3 lg:flex">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-navy transition-colors hover:bg-slate-50"
              >
                <IconLayoutDashboard className="size-4" />
                Tableau de bord
              </Link>
              <span
                className="flex size-9 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm"
                title={user.email ?? undefined}
              >
                {user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.image}
                    alt=""
                    className="size-9 object-cover"
                  />
                ) : (
                  <span className="text-xs font-bold text-navy">{initial}</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => signOut({ redirectTo: "/" })}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                aria-label="Se déconnecter"
              >
                <IconLogout className="size-4" />
                Déconnexion
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-navy transition-colors hover:bg-slate-50"
              >
                Connexion
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-navy px-5 text-sm font-semibold text-white transition-colors hover:bg-navy/90"
              >
                Lancer l&apos;Assistant
                <IconArrowRight className="size-4" />
              </Link>
            </>
          )}
        </div>

        {/* Burger — mobile */}
        <button
          className="inline-flex size-10 items-center justify-center rounded-full text-navy transition-colors hover:bg-slate-100 lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={open}
        >
          {open ? <IconX className="size-5" /> : <IconMenu2 className="size-5" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-slate-200 bg-white px-4 pb-6 pt-3 lg:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={close}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-navy"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2">
              {user ? (
                <>
                  <Link
                    href="/dashboard"
                    onClick={close}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-slate-300 px-5 text-sm font-semibold text-navy"
                  >
                    <IconLayoutDashboard className="size-4" />
                    Tableau de bord
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      signOut({ redirectTo: "/" });
                    }}
                    className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-800 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                  >
                    <IconLogout className="size-4" />
                    Déconnexion
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={close}
                    className="inline-flex h-10 w-full items-center justify-center rounded-full border border-slate-300 px-5 text-sm font-semibold text-navy"
                  >
                    Connexion
                  </Link>
                  <Link
                    href="/dashboard"
                    onClick={close}
                    className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-navy px-5 text-sm font-semibold text-white"
                  >
                    Lancer l&apos;Assistant
                    <IconArrowRight className="size-4" />
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}