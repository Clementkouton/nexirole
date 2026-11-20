import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";

// Rendu dynamique : la session est lue côté client, aucune génération statique.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Espace candidat",
  description:
    "Votre tableau de bord NexiRole : agent IA, dossier par lien, créateur de CV, historique et licence.",
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardClient />
    </Suspense>
  );
}
