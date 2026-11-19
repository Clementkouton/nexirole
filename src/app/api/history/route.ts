// =============================================================
// NEXIROLE â€” Historique : dossiers gÃ©nÃ©rÃ©s + CV analysÃ©s.
// RÃ©ponse TOUJOURS en JSON (jamais de corps vide).
// =============================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non authentifiÃ©." }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 401 });
    }

    const [dossiers, cvAnalyses] = await Promise.all([
      prisma.generatedApplication.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.savedResume.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    return NextResponse.json({ ok: true, dossiers, cvAnalyses });
  } catch (error) {
    console.error("[HISTORY] Erreur :", error);
    return NextResponse.json(
      { error: "Impossible de charger l'historique. VÃ©rifiez que la base est Ã  jour (npx prisma db push)." },
      { status: 500 },
    );
  }
}