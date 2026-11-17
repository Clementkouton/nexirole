"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { signOut } from "next-auth/react";
import {
  IconMenu2,
  IconX,
  IconLogout,
  IconLayoutDashboard,
  IconSparkles,
} from "@tabler/icons-react";

type SessionUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

const NAV_LINKS = [
  { label: "Fonctionnalités", href: "/#fonctionnalites" },
  { label: "Lien generator", href: "/#lien-generator" },
  { label: "Agent de recherche", href: "/#agent-recherche" },
  { label: "Mode d'emploi", href: "/#mode-emploi" },
];

export function NavbarClient({ user }: { user: SessionUser | null }) {
  const [open, setOpen] = useState(false);
  const closeMenu = () => setOpen(false);

  const displayName = user?.name ?? user?.email ?? "Utilisateur";
  const initials = displayName.trim().charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5" onClick={closeMenu}>
          <Image
            src="/logo.png"
            alt="Logo NexiRole"
            width={36}
            height={36}
            className="rounded-xl"
            priority
          />
          <span className="text-lg font-extrabold tracking-tight text-navy">
            Nexi<span className="text-gold">Role</span>
          </span>
        </Link>

        {/* Liens principaux (desktop) */}
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigation principale">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-navy"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Zone authentification (desktop) */}
        {user ? (
          <div className="hidden items-center gap-3 lg:flex">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-navy/90"
            >
              <IconLayoutDashboard className="size-4" />
              Tableau de bord
            </Link>

            <div
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3"
              title={user.email ?? displayName}
            >
              {user.image ? (
                <Image
                  src={user.image}
                  alt={displayName}
                  width={28}
                  height={28}
                  unoptimized
                  className="size-7 rounded-full object-cover"
                />
              ) : (
                <span className="flex size-7 items-center justify-center rounded-full bg-navy text-xs font-bold text-gold">
                  {initials}
                </span>
              )}
              <span className="max-w-[160px] truncate text-sm font-semibold text-slate-700">
                {displayName}
              </span>
            </div>

            <button
              type="button"
              onClick={() => signOut({ redirectTo: "/" })}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <IconLogout className="size-4" />
              Déconnexion
            </button>
          </div>
        ) : (
          <div className="hidden items-center gap-2 lg:flex">
            <Link
              href="/login"
              className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-navy"
            >
              Connexion
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-navy/90"
            >
              <IconSparkles className="size-4 text-gold" />
              Lancer l&apos;Assistant
            </Link>
          </div>
        )}

        {/* Burger (mobile) */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          className="inline-flex size-10 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-slate-100 hover:text-navy lg:hidden"
        >
          {open ? <IconX className="size-5" /> : <IconMenu2 className="size-5" />}
        </button>
      </div>

      {/* Menu mobile */}
      {open && (
        <div className="border-t border-slate-200 bg-white lg:hidden">
          <div className="mx-auto max-w-7xl space-y-1 px-4 py-4 sm:px-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-navy"
              >
                {link.label}
              </Link>
            ))}

            <div className="my-3 h-px bg-slate-200" />

            {user ? (
              <div className="space-y-1">
                <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                  {user.image ? (
                    <Image
                      src={user.image}
                      alt={displayName}
                      width={36}
                      height={36}
                      unoptimized
                      className="size-9 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex size-9 items-center justify-center rounded-full bg-navy text-sm font-bold text-gold">
                      {initials}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-navy">{displayName}</p>
                    {user.email ? (
                      <p className="truncate text-xs text-slate-500">{user.email}</p>
                    ) : null}
                  </div>
                </div>

                <Link
                  href="/dashboard"
                  onClick={closeMenu}
                  className="flex items-center gap-2 rounded-lg bg-navy px-3 py-2.5 text-sm font-semibold text-white"
                >
                  <IconLayoutDashboard className="size-4" />
                  Tableau de bord
                </Link>

                <button
                  type="button"
                  onClick={() => {
                    closeMenu();
                    signOut({ redirectTo: "/" });
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                >
                  <IconLogout className="size-4" />
                  Déconnexion
                </button>
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <Link
                  href="/login"
                  onClick={closeMenu}
                  className="block rounded-lg border border-slate-200 px-3 py-2.5 text-center text-sm font-semibold text-navy transition-colors hover:bg-slate-50"
                >
                  Connexion
                </Link>
                <Link
                  href="/register"
                  onClick={closeMenu}
                  className="block rounded-lg bg-navy px-3 py-2.5 text-center text-sm font-semibold text-white"
                >
                  Lancer l&apos;Assistant
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}