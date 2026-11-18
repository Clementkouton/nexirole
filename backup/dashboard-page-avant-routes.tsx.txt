import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppDashboardShell } from "@/components/ui/app-dashboard-shell";

export const metadata: Metadata = { title: "Tableau de bord" };

export default async function DashboardPage() {
  // Double protection : le proxy filtre déjà, ici ceinture et bretelles
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <AppDashboardShell
      userName={session.user.name ?? null}
      userEmail={session.user.email ?? null}
    />
  );
}