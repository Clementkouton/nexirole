// =============================================================
// NEXIROLE — Layout UNIQUE de l'espace candidat (/dashboard/*).
// UNE SEULE navigation : <DashboardSidebar />.
// La navbar et le footer du site public n'apparaissent plus ici
// (ils sont masqués par src/components/HideOnDashboard.tsx).
// =============================================================

import type { ReactNode } from "react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Espace candidat — NexiRole",
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="flex">
        <DashboardSidebar />
        <main className="min-w-0 flex-1 px-4 pb-10 pt-20 sm:px-8 lg:pt-10">{children}</main>
      </div>
    </div>
  );
}