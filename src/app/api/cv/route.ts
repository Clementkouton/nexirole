import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/* ==================================================================
   NexiRole — Bibliothèque de CV du créateur
   GET  /api/cv → { cvs, corbeille, stats }
        Liste des CV de l'utilisateur connecté + corbeille (30 jours)
        + statistiques. Purge automatique des CV corbeillés depuis
        plus de 30 jours (rétention garantie sans tâche planifiée).
   POST /api/cv → { cv }
        Création d'un CV (bouton « Générer / Créer un CV » et
        migration automatique du créateur). Corps optionnel :
        { name?, data?, design?, step? }.
   ================================================================== */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const CORBEILLE_DELAI_JOURS = 30;

/* Stratégie JWT next-auth v5 : id s'il existe, sinon repli par email. */
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
      console.error("[api/cv] Résolution utilisateur par email impossible :", error);
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

function dateIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return null;
}

/* ─────────── GET : liste + corbeille + statistiques ─────────── */

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  try {
    const cutoff = new Date(Date.now() - CORBEILLE_DELAI_JOURS * 24 * 60 * 60 * 1000);

    // Purge définitive des CV corbeillés depuis plus de 30 jours.
    await prisma.cvDocument.deleteMany({
      where: { userId, trashedAt: { not: null, lt: cutoff } },
    });

    const rows = await prisma.cvDocument.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        isPublic: true,
        publishedSlug: true,
        trashedAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const actifs = rows.filter((r) => r.trashedAt === null);
    const corbeilles = rows.filter((r) => r.trashedAt !== null);

    // Vues par CV : jointure sur les pages publiques correspondantes.
    const slugs = Array.from(
      new Set(
        actifs
          .map((r) => r.publishedSlug)
          .filter((s): s is string => typeof s === "string" && s !== "")
      )
    );
    const publis = slugs.length
      ? await prisma.publicResume.findMany({
          where: { slug: { in: slugs } },
          select: { slug: true, viewsCount: true },
        })
      : [];
    const vuesParSlug = new Map<string, number>(
      publis.map((p) => [p.slug, typeof p.viewsCount === "number" ? p.viewsCount : 0])
    );

    const cvs = actifs.map((r) => ({
      id: r.id,
      name: r.name,
      isPublic: r.isPublic,
      publishedSlug: r.publishedSlug,
      views: vuesParSlug.get(r.publishedSlug ?? "") ?? 0,
      updatedAt: dateIso(r.updatedAt) ?? new Date().toISOString(),
    }));

    const corbeille = corbeilles.map((r) => {
      const trashedAt = r.trashedAt as Date;
      const purgeAt = new Date(trashedAt.getTime() + CORBEILLE_DELAI_JOURS * 24 * 60 * 60 * 1000);
      return {
        id: r.id,
        name: r.name,
        trashedAt: dateIso(trashedAt),
        purgeAt: dateIso(purgeAt),
      };
    });

    return NextResponse.json({
      cvs,
      corbeille,
      stats: {
        total: cvs.length,
        publies: cvs.filter((c) => c.isPublic && typeof c.publishedSlug === "string" && c.publishedSlug !== "").length,
        corbeille: corbeille.length,
        vues: cvs.reduce((acc, c) => acc + (c.views ?? 0), 0),
      },
    });
  } catch (error) {
    console.error("[api/cv][GET]", error);
    return NextResponse.json(
      { error: "Impossible de charger la bibliothèque de CV." },
      { status: 500 }
    );
  }
}

/* ─────────── POST : création d'un CV ─────────── */

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  let body: Record<string, unknown> = {};
  try {
    const raw: unknown = await request.json();
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      body = raw as Record<string, unknown>;
    }
  } catch {
    body = {}; // corps vide accepté : création d'un CV vierge
  }

  const dataValue =
    body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data : {};
  const designValue =
    body.design && typeof body.design === "object" && !Array.isArray(body.design) ? body.design : {};
  const stepValue =
    typeof body.step === "number" && Number.isFinite(body.step) && body.step >= 0 && body.step <= 5
      ? Math.floor(body.step)
      : 0;

  let name = typeof body.name === "string" ? body.name.trim() : "";
  if (name === "") {
    const dataRecord = (dataValue ?? {}) as Record<string, unknown>;
    const personal =
      dataRecord.personal && typeof dataRecord.personal === "object"
        ? (dataRecord.personal as Record<string, unknown>)
        : null;
    const fullName = personal && typeof personal.fullName === "string" ? personal.fullName.trim() : "";
    name = fullName !== "" ? `${fullName} — CV` : "Mon CV";
  }
  if (name.length > 120) name = name.slice(0, 120);

  try {
    const row = await prisma.cvDocument.create({
      data: {
        userId,
        name,
        data: JSON.parse(JSON.stringify(dataValue)),
        design: JSON.parse(JSON.stringify(designValue)),
        step: stepValue,
      },
    });

    return NextResponse.json(
      {
        cv: {
          id: row.id,
          name: row.name,
          isPublic: row.isPublic,
          publishedSlug: row.publishedSlug,
          updatedAt: row.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[api/cv][POST]", error);
    return NextResponse.json({ error: "Création du CV impossible." }, { status: 500 });
  }
}