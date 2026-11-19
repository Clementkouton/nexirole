// =============================================================
// NEXIROLE â€” Profil courant, lu DIRECTEMENT en base de donnÃ©es.
// Correctif A1 : le plan affichÃ© n'est plus celui du JWT (qui peut
// Ãªtre pÃ©rimÃ© aprÃ¨s un paiement), mais celui de la source de vÃ©ritÃ©.
// =============================================================

import { NextResponse } from "next/server";
import getServerSession from "next-auth";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non authentifiÃ©." }, { status: 401 });
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
      { error: "Base de donnÃ©es indisponible. ExÃ©cutez Â« npx prisma db push Â»." },
      { status: 500 },
    );
  }
}