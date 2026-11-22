import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/* ==================================================================
   NexiRole — Suppression définitive depuis la corbeille
   DELETE /api/cv/[id]/purge → { ok }
   Supprime définitivement la ligne CvDocument. Si le CV avait un
   lien public, la page publique correspondante est dépubliée par
   cohérence (aucune donnée du CV ne reste servie).
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
      console.error("[api/cv/[id]/purge] Résolution utilisateur par email impossible :", error);
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

export async function DELETE(_request: NextRequest, context: RouteContext) {
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

    if (typeof row.publishedSlug === "string" && row.publishedSlug !== "") {
      try {
        await prisma.publicResume.updateMany({
          where: { slug: row.publishedSlug },
          data: { isPublic: false },
        });
      } catch (error) {
        console.error("[api/cv/[id]/purge][DELETE] Dépublication publique impossible :", error);
      }
    }

    await prisma.cvDocument.delete({ where: { id: row.id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/cv/[id]/purge][DELETE]", error);
    return NextResponse.json({ error: "Suppression définitive impossible." }, { status: 500 });
  }
}