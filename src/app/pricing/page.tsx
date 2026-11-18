import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PricingClient } from "@/components/pricing/pricing-client";

export const metadata: Metadata = {
  title: "Tarifs — Pass Boost & Carrière Pro",
  description:
    "Choisissez votre plan NexiRole : Découverte gratuit, Pass Boost 30 jours (4 500 FCFA / 9,90 $) ou Carrière Pro 90 jours (11 000 FCFA / 24,90 $). Paiement sécurisé via Chariow.",
};

export default async function PricingPage() {
  // L'email de l'utilisateur connecté est pré-rempli dans le checkout Chariow,
  // et son plan actuel est mis en avant sur la carte correspondante.
  const session = await auth();
  const email = session?.user?.email ?? null;

  let currentPlan: "FREE" | "BOOST" | "PRO" | null = null;
  if (email) {
    try {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { plan: true, licenseStatus: true },
      });
      if (user && user.licenseStatus === "ACTIVE") {
        currentPlan = (["FREE", "BOOST", "PRO"] as const).includes(
          user.plan as "FREE" | "BOOST" | "PRO"
        )
          ? (user.plan as "FREE" | "BOOST" | "PRO")
          : null;
      }
    } catch {
      // La page tarifs reste consultable même sans base accessible
    }
  }

  return <PricingClient email={email} currentPlan={currentPlan} />;
}
