"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  IconArrowRight,
  IconMenu2,
  IconX,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "/#fonctionnalites", label: "Fonctionnalités" },
  { href: "/#generateur-lien", label: "Générateur par Lien" },
  { href: "/#agent-recherche", label: "Agent de Recherche" },
  { href: "/#comment-ca-marche", label: "Comment ça marche" },
];

export function SiteNavbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

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
          <Button
            asChild
            className="rounded-full bg-navy px-5 text-white hover:bg-navy-800"
          >
            <Link href="/dashboard">
              Lancer l&apos;Assistant
              <IconArrowRight className="ml-1.5 size-4" />
            </Link>
          </Button>
        </div>

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
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-navy"
              >
                {link.label}
              </Link>
            ))}
            <Button
              asChild
              className="mt-3 w-full rounded-full bg-navy text-white hover:bg-navy-800"
              onClick={() => setOpen(false)}
            >
              <Link href="/dashboard">
                Lancer l&apos;Assistant
                <IconArrowRight className="ml-1.5 size-4" />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
