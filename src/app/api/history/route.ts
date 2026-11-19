// =============================================================
// NEXIROLE — Historique : dossiers générés + CV analysés.
// Réponse TOUJOURS en JSON (jamais de corps vide).
// =============================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
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
      { error: "Impossible de charger l'historique. Vérifiez que la base est à jour (npx prisma db push)." },
      { status: 500 },
    );
  }
}