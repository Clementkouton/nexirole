import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/* ==================================================================
   NexiRole — Restauration depuis la corbeille
   POST /api/cv/[id]/restore → { ok }
   Remet le CV corbeillé dans la bibliothèque active. Le CV reste
   dépublié : la remise en ligne se fait depuis le bouton
   « Publier en ligne » (choix explicite de l'utilisateur).
   ================================================================== */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  const sessionUser = (session?.user ?? null) as unknown as
    | { id?: string; email?: string | null }
    | null;

  const directId = typeof sessionUser?.id === "string" ? sessionUser.id.trim() : "";
  if (directId !== "") return directId;

  const email = typeof sessionUser?.email === "string" ? sessionUser.email.trim() : "";
  if (email !== "") {
    try {
      const found = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      return found?.id ?? null;
    } catch (error) {
      console.error("[api/cv/[id]/restore] Résolution utilisateur par email impossible :", error);
      return null;
    }
  }
  return null;
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Session invalide. Reconnectez-vous puis réessayez." },
    { status: 401 }
  );
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const { id } = await context.params;

  try {
    if (typeof id !== "string" || id.trim() === "" || id.length > 64) {
      return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
    }
    const row = await prisma.cvDocument.findUnique({ where: { id } });
    if (!row || row.userId !== userId) {
      return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
    }
    if (!row.trashedAt) {
      return NextResponse.json({ ok: true, alreadyActive: true });
    }

    await prisma.cvDocument.update({
      where: { id: row.id },
      data: { trashedAt: null },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/cv/[id]/restore][POST]", error);
    return NextResponse.json({ error: "Restauration impossible." }, { status: 500 });
  }
}