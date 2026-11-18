import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { DossierData, HistoryResponse, ScoredJob } from "@/lib/types";
import { isTemplateId } from "@/lib/cv-templates";

export const runtime = "nodejs";
export const maxDuration = 30;

/** GET /api/history — les 30 derniers dossiers + 30 derniers scans de l'utilisateur. */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      { error: "Connectez-vous pour consulter votre historique." },
      { status: 401 }
    );
  }

  try {
    const [dossiers, scans] = await Promise.all([
      prisma.generatedDossier.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.scanRun.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);

    const response: HistoryResponse = {
      dossiers: dossiers.map((d) => ({
        id: d.id,
        offreTitre: d.offreTitre,
        offreUrl: d.offreUrl,
        offreEntreprise: d.offreEntreprise,
        templateId: isTemplateId(d.templateId) ? d.templateId : "modern-accent",
        data: d.data as unknown as DossierData,
        createdAt: d.createdAt.toISOString(),
      })),
      scans: scans.map((s) => ({
        id: s.id,
        requete: s.requete,
        region: s.region,
        remoteOnly: s.remoteOnly,
        motscles: (s.motscles as unknown as HistoryResponse["scans"][number]["motscles"]) ?? null,
        nbOffres: s.nbOffres,
        resultats: (s.resultats as unknown as ScoredJob[]) ?? [],
        createdAt: s.createdAt.toISOString(),
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[history] lecture échouée :", error);
    return NextResponse.json(
      { error: "Impossible de charger l'historique pour le moment." },
      { status: 500 }
    );
  }
}

/** DELETE /api/history?type=dossier|scan&id=... */
export async function DELETE(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const id = searchParams.get("id");

  if (!id || (type !== "dossier" && type !== "scan")) {
    return NextResponse.json(
      { error: "Paramètres invalides (type=dossier|scan et id requis)." },
      { status: 400 }
    );
  }

  try {
    if (type === "dossier") {
      await prisma.generatedDossier.deleteMany({ where: { id, userId } });
    } else {
      await prisma.scanRun.deleteMany({ where: { id, userId } });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[history] suppression échouée :", error);
    return NextResponse.json(
      { error: "Suppression impossible pour le moment." },
      { status: 500 }
    );
  }
}