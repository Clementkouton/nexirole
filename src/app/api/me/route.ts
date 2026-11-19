// =============================================================
// NEXIROLE — Profil courant, lu DIRECTEMENT en base de données.
// Correctif A1 : le plan affiché n'est plus celui du JWT (qui peut
// être périmé après un paiement), mais celui de la source de vérité.
// =============================================================

import { NextResponse } from "next/server";
import getServerSession from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        name: true,
        email: true,
        image: true,
        plan: true,
        licenseStatus: true,
        expiresAt: true,
        searchesUsed: true,
        generationsUsed: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 401 });
    }

    return NextResponse.json({ ok: true, user });
  } catch (error) {
    console.error("[ME] Erreur :", error);
    return NextResponse.json(
      { error: "Base de données indisponible. Exécutez « npx prisma db push »." },
      { status: 500 },
    );
  }
}