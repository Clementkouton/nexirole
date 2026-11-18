import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import DashboardNav from "@/components/dashboard/dashboard-nav";

export const metadata: Metadata = {
  title: "Tableau de bord — NexiRole",
  description: "Pilote ta recherche d'emploi avec l'IA NexiRole : scans en direct, dossiers complets et historique.",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto flex w-full max-w-[1440px]">
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col bg-[#051937] md:flex">
          <div className="flex items-center gap-3 px-6 pb-6 pt-7">
            <Image src="/logo.png" alt="Logo NexiRole" width={42} height={42} className="rounded-xl" />
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold tracking-tight text-white">NexiRole</p>
              <p className="text-xs font-semibold text-slate-400">Espace candidat</p>
            </div>
          </div>

          <DashboardNav />

          <div className="px-4 pb-6 pt-4">
            <Link
              href="/"
              className="flex items-center justify-center rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:border-[#FFC107] hover:text-[#FFC107]"
            >
              Retour au site
            </Link>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-slate-200 bg-white md:hidden">
            <div className="flex items-center justify-between px-4 pb-3 pt-4">
              <div className="flex items-center gap-2.5">
                <Image src="/logo.png" alt="Logo NexiRole" width={34} height={34} className="rounded-lg" />
                <p className="text-base font-extrabold tracking-tight text-[#051937]">NexiRole</p>
              </div>
              <Link href="/" className="text-xs font-bold text-amber-600 hover:text-amber-700">
                Retour au site
              </Link>
            </div>
            <DashboardNav variant="mobile" />
          </header>

          <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}