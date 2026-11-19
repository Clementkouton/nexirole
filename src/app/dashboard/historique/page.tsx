"use client";

/**
 * NexiRole — Page « Mon Historique & Suivi » (/dashboard/historique).
 *
 * PARTIE 2 de la finalisation, adaptée au tableau de bord multipages :
 *  - Dossiers générés : rechargement en un clic (pour changer de modèle),
 *    retéléchargement PDF (CV + lettre), ajout au suivi, suppression.
 *  - Suivi des candidatures : tableau interactif, changement de statut
 *    instantané (À postuler / Envoyé / Entretien / Refus / Offre).
 *  - CV analysés : sauvegarde automatique de chaque import de CV.
 *
 * Le bouton « Recharger » d'un dossier stocke l'offre puis ouvre la page
 * « Dossier & documents » (/dashboard/dossiers) pour générer un nouveau
 * dossier avec un autre modèle ATS.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { CandidateSidebar } from "@/components/dashboard/candidate-sidebar";
import { HistoryPanel } from "@/components/dashboard/history-panel";

export default function HistoriquePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userEmail = session?.user?.email ?? null;

  // « Recharger » depuis l'historique → ouvre « Dossier & documents ».
  useEffect(() => {
    const handler = () => {
      router.push("/dashboard/dossiers");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("nexirole:open-dossier", handler);
    return () => window.removeEventListener("nexirole:open-dossier", handler);
  }, [router]);

  return (
    <div className="flex w-full flex-col lg:flex-row">
      <CandidateSidebar userEmail={userEmail} />

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">
          <HistoryPanel />
        </div>
      </main>
    </div>
  );
}
