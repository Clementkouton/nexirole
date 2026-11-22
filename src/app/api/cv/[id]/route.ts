import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/* ==================================================================
   NexiRole — CV individuel (bibliothèque du créateur)
   GET    /api/cv/[id] → { cv }             contenu complet (créateur)
   PATCH  /api/cv/[id] → { ok, cv }         autosauvegarde, renommage,
                                            état de publication
          corps : { name?, data?, design?, step?, isPublic?, publishedSlug? }
   DELETE /api/cv/[id] → { ok }             corbeille (soft delete 30 j),
                                            dépublication de la page publique
   Next.js 16 : params est une Promise (await obligatoire).
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
      console.error("[api/cv/[id]] Résolution utilisateur par email impossible :", error);
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

async function loadOwnedCv(id: string, userId: string) {
  if (typeof id !== "string" || id.trim() === "" || id.length > 64) return null;
  const row = await prisma.cvDocument.findUnique({ where: { id } });
  if (!row || row.userId !== userId) return null;
  return row;
}

function readJsonBodySync(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function serializeCv(row: NonNullable<Awaited<ReturnType<typeof loadOwnedCv>>>) {
  return {
    id: row.id,
    name: row.name,
    data: row.data ?? {},
    design: row.design ?? {},
    step: row.step,
    isPublic: row.isPublic,
    publishedSlug: row.publishedSlug,
    trashedAt:
      row.trashedAt instanceof Date && !Number.isNaN(row.trashedAt.getTime())
        ? row.trashedAt.toISOString()
        : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/* ─────────── GET : contenu complet d'un CV ─────────── */

export async function GET(_request: NextRequest, context: RouteContext) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const { id } = await context.params;

  try {
    const row = await loadOwnedCv(id, userId);
    if (!row) {
      return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
    }
    return NextResponse.json({ cv: serializeCv(row) });
  } catch (error) {
    console.error("[api/cv/[id]][GET]", error);
    return NextResponse.json({ error: "Lecture du CV impossible." }, { status: 500 });
  }
}

/* ─────────── PATCH : autosauvegarde / renommage / publication ─────────── */

export async function PATCH(request: NextRequest, context: RouteContext) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const { id } = await context.params;

  let bodyRaw: unknown = null;
  try {
    bodyRaw = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  const body = readJsonBodySync(bodyRaw);
  if (!body) {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }

  try {
    const row = await loadOwnedCv(id, userId);
    if (!row) {
      return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
    }
    if (row.trashedAt) {
      return NextResponse.json(
        { error: "Ce CV est dans la corbeille. Restaurez-le avant de le modifier." },
        { status: 409 }
      );
    }

    const data: {
      name?: string;
      data?: unknown;
      design?: unknown;
      step?: number;
      isPublic?: boolean;
      publishedSlug?: string | null;
    } = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (name === "") {
        return NextResponse.json({ error: "Le nom du CV ne peut pas être vide." }, { status: 400 });
      }
      data.name = name.slice(0, 120);
    }
    if (body.data !== undefined) {
      if (body.data === null || typeof body.data !== "object" || Array.isArray(body.data)) {
        return NextResponse.json({ error: "Champ data invalide (objet attendu)." }, { status: 400 });
      }
      data.data = JSON.parse(JSON.stringify(body.data));
    }
    if (body.design !== undefined) {
      if (body.design === null || typeof body.design !== "object" || Array.isArray(body.design)) {
        return NextResponse.json({ error: "Champ design invalide (objet attendu)." }, { status: 400 });
      }
      data.design = JSON.parse(JSON.stringify(body.design));
    }
    if (body.step !== undefined) {
      if (typeof body.step !== "number" || !Number.isFinite(body.step) || body.step < 0 || body.step > 5) {
        return NextResponse.json({ error: "Champ step invalide (0 à 5 attendu)." }, { status: 400 });
      }
      data.step = Math.floor(body.step);
    }
    if (body.isPublic !== undefined) {
      if (typeof body.isPublic !== "boolean") {
        return NextResponse.json({ error: "Champ isPublic invalide (booléen attendu)." }, { status: 400 });
      }
      data.isPublic = body.isPublic;
    }
    if (body.publishedSlug !== undefined) {
      if (body.publishedSlug !== null && typeof body.publishedSlug !== "string") {
        return NextResponse.json({ error: "Champ publishedSlug invalide." }, { status: 400 });
      }
      const slug = typeof body.publishedSlug === "string" ? body.publishedSlug.trim() : "";
      data.publishedSlug = slug === "" ? null : slug.slice(0, 80);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Aucun champ à mettre à jour (name, data, design, step, isPublic ou publishedSlug attendu)." },
        { status: 400 }
      );
    }

    const updated = await prisma.cvDocument.update({ where: { id: row.id }, data });
    return NextResponse.json({ ok: true, cv: serializeCv(updated) });
  } catch (error) {
    console.error("[api/cv/[id]][PATCH]", error);
    return NextResponse.json({ error: "Enregistrement du CV impossible." }, { status: 500 });
  }
}

/* ─────────── DELETE : mise à la corbeille (30 jours) ─────────── */

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const { id } = await context.params;

  try {
    const row = await loadOwnedCv(id, userId);
    if (!row) {
      return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
    }
    if (row.trashedAt) {
      return NextResponse.json({ ok: true, alreadyTrashed: true });
    }

    // Soft delete : dépublié + conservé 30 jours avant purge définitive.
    const updated = await prisma.cvDocument.update({
      where: { id: row.id },
      data: { trashedAt: new Date(), isPublic: false },
    });

    // Dépublication de la page publique si ce CV était en ligne.
    if (typeof row.publishedSlug === "string" && row.publishedSlug !== "") {
      try {
        await prisma.publicResume.updateMany({
          where: { slug: row.publishedSlug },
          data: { isPublic: false },
        });
      } catch (error) {
        console.error("[api/cv/[id]][DELETE] Dépublication publique impossible :", error);
      }
    }

    return NextResponse.json({
      ok: true,
      cv: {
        id: updated.id,
        name: updated.name,
        trashedAt: updated.trashedAt ? updated.trashedAt.toISOString() : null,
      },
    });
  } catch (error) {
    console.error("[api/cv/[id]][DELETE]", error);
    return NextResponse.json({ error: "Mise à la corbeille impossible." }, { status: 500 });
  }
}