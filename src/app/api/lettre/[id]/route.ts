/* =====================================================================
   NexiRole - API Lettre (une lettre precise)
   GET    /api/lettre/[id] : detail
   PUT    /api/lettre/[id] : mise a jour (titre, contenu, parametres)
   DELETE /api/lettre/[id] : suppression
   Toutes les operations sont limitees au proprietaire de la lettre.
   ===================================================================== */

import { NextResponse } from "next/server";
import { getUserId, getPrisma } from "@/lib/nr-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Non authentifie. Reconnecte-toi." }, { status: 401 });
    }
    const lettre = await getPrisma().coverLetter.findFirst({ where: { id, userId } });
    if (!lettre) {
      return NextResponse.json({ error: "Lettre introuvable." }, { status: 404 });
    }
    return NextResponse.json({ lettre });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Non authentifie. Reconnecte-toi." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const data: Record<string, string> = {};
    for (const champ of ["title", "content", "company", "position", "tone", "language", "jobOffer", "cvText"]) {
      const v = body[champ];
      if (typeof v === "string") data[champ] = v;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Rien a mettre a jour." }, { status: 400 });
    }

    const prisma = getPrisma();
    const existante = await prisma.coverLetter.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existante) {
      return NextResponse.json({ error: "Lettre introuvable." }, { status: 404 });
    }

    const lettre = await prisma.coverLetter.update({ where: { id }, data });
    return NextResponse.json({ lettre });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Non authentifie. Reconnecte-toi." }, { status: 401 });
    }

    const prisma = getPrisma();
    const existante = await prisma.coverLetter.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existante) {
      return NextResponse.json({ error: "Lettre introuvable." }, { status: 404 });
    }

    await prisma.coverLetter.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
