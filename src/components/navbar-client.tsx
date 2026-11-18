"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { signOut } from "next-auth/react";
import {
  IconArrowRight,
  IconLayoutDashboard,
  IconLogout,
  IconMenu2,
  IconX,
} from "@tabler/icons-react";

type NavbarUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

const NAV_LINKS = [
  { href: "/#fonctionnalites", label: "Fonctionnalités" },
  { href: "/#generateur-lien", label: "Générateur par Lien" },
  { href: "/#agent-recherche", label: "Agent de Recherche" },
  { href: "/#comment-ca-marche", label: "Comment ça marche" },
  { href: "/pricing", label: "Tarifs" },
];

export function NavbarClient({ user }: { user: NavbarUser | null }) {
  const [open, setOpen] = useState(false);

  const displayName =
    user?.name?.trim() || user?.email?.split("@")[0] || "";
  const initials =
    displayName
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "U";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/90 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          onClick={() => setOpen(false)}
          aria-label="NexiRole — Accueil"
        >
          <Image
            src="/logo.png"
            alt="Logo NexiRole"
            width={140}
            height={47}
            className="h-9 w-auto"
            priority
          />
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-navy"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-slate-100"
              >
                <IconLayoutDashboard className="h-4 w-4" />
                Tableau de bord
              </Link>
              <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-xs font-bold text-gold">
                  {initials}
                </span>
                <span className="max-w-[140px] truncate text-xs font-semibold text-slate-700">
                  {displayName}
                </span>
                <button
                  type="button"
                  onClick={() => signOut({ redirectTo: "/" })}
                  title="Se déconnecter"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                >
                  <IconLogout className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-slate-100"
              >
                Connexion
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex h-10 items-center rounded-full bg-navy px-5 text-sm font-semibold text-white transition hover:bg-navy-800"
              >
                Lancer l&apos;Assistant
                <IconArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-navy transition-colors hover:bg-slate-100 lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={open}
        >
          {open ? <IconX className="h-5 w-5" /> : <IconMenu2 className="h-5 w-5" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-slate-200 bg-white px-4 pb-6 pt-3 lg:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
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
                    onClick={() => setOpen(false)}
                    className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-slate-200 px-5 text-sm font-semibold text-navy transition hover:bg-slate-50"
                  >
                    <IconLayoutDashboard className="h-4 w-4" />
                    Tableau de bord
                  </Link>
                  <button
                    type="button"
                    onClick={() => signOut({ redirectTo: "/" })}
                    className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-red-200 px-5 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                  >
                    <IconLogout className="h-4 w-4" />
                    Se déconnecter
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-10 w-full items-center justify-center rounded-full border border-slate-200 px-5 text-sm font-semibold text-navy transition hover:bg-slate-50"
                  >
                    Connexion
                  </Link>
                  <Link
                    href="/dashboard"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-navy px-5 text-sm font-semibold text-white transition hover:bg-navy-800"
                  >
                    Lancer l&apos;Assistant
                    <IconArrowRight className="ml-1.5 h-4 w-4" />
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
