import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * NexiRole — API LETTRE (une lettre précise).
 *
 * GET    /api/lettre/[id] : détail complet.
 * PUT    /api/lettre/[id] : mise à jour (titre, contenu) — appelée par
 *                           la sauvegarde automatique de l'éditeur.
 * DELETE /api/lettre/[id] : suppression.
 *
 * Toutes les opérations sont limitées au propriétaire de la lettre.
 */

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  title: z.string().max(160).optional(),
  content: z.string().max(60000).optional(),
  company: z.string().max(200).optional(),
  position: z.string().max(200).optional(),
});

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json(
        { error: "Non authentifié. Reconnecte-toi." },
        { status: 401 }
      );
    }

    const lettre = await prisma.coverLetter.findFirst({
      where: { id, userId },
    });
    if (!lettre) {
      return NextResponse.json(
        { error: "Lettre introuvable." },
        { status: 404 }
      );
    }
    return NextResponse.json({ lettre });
  } catch (error) {
    console.error("[lettre/[id]:GET]", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json(
        { error: "Non authentifié. Reconnecte-toi." },
        { status: 401 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Corps de requête JSON invalide." },
        { status: 400 }
      );
    }

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Champs de mise à jour invalides." },
        { status: 400 }
      );
    }

    const data: Record<string, string> = {};
    for (const [cle, valeur] of Object.entries(parsed.data)) {
      if (typeof valeur === "string") data[cle] = valeur;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 });
    }

    const existante = await prisma.coverLetter.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existante) {
      return NextResponse.json(
        { error: "Lettre introuvable." },
        { status: 404 }
      );
    }

    const lettre = await prisma.coverLetter.update({ where: { id }, data });
    return NextResponse.json({ lettre });
  } catch (error) {
    console.error("[lettre/[id]:PUT]", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json(
        { error: "Non authentifié. Reconnecte-toi." },
        { status: 401 }
      );
    }

    const existante = await prisma.coverLetter.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existante) {
      return NextResponse.json(
        { error: "Lettre introuvable." },
        { status: 404 }
      );
    }

    await prisma.coverLetter.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[lettre/[id]:DELETE]", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
