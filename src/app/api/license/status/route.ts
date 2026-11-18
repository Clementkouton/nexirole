import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getFreshLicenseState } from "@/lib/license";

/**
 * PARTIE 1 — Statut de licence de l'utilisateur connecté.
 * Utilisé par le dashboard : badge de plan, bannière « payment=success »,
 * modale d'activation et affichage des quotas restants.
 */

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const state = await getFreshLicenseState(userId);

  return NextResponse.json({
    plan: state.plan,
    licenseStatus: state.licenseStatus,
    licenseKey: state.licenseKey,
    expiresAt: state.expiresAt,
    isActive: state.isActive,
    daysRemaining: state.daysRemaining,
    searchesUsed: state.searchesUsed,
    generationsUsed: state.generationsUsed,
    limits: state.limits,
  });
}
