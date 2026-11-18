import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CvBuilderWorkbench } from "@/components/cv-builder/cv-builder-workbench";

export const metadata = { title: "Créateur de CV — NexiRole" };

/**
 * Créateur de CV — ACTIVÉ (le badge BIENTÔT a été retiré de la sidebar).
 * Page serveur : vérifie la session puis monte l'atelier client.
 */
export default async function CvBuilderPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-ice">
      <CvBuilderWorkbench userName={session.user.name ?? null} />
    </div>
  );
}