import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildPublishPayload } from "@/lib/cv-publish-payload";

/* ==================================================================
   NexiRole - Publication ATOMIQUE d'un CV de la bibliotheque
   POST /api/cv/[id]/publier
     corps optionnel : { data?, design?, step? }
     1. enregistre l'etat exact du createur dans CvDocument (source
        unique de verite - supprime la course avec l'autosauvegarde) ;
     2. relit le CV depuis la base et construit le payload publie via
        buildPublishPayload (memes regles que le hub) ;
     3. ecrit LA ligne PublicResume de l'utilisateur (cvData forme
        builder + theme + photo conservee) : les donnees de test ou
        perimees sont ecrasees a chaque publication ;
     4. met a jour isPublic/publishedSlug du CV et depublie les
        autres CV de l'utilisateur.
   GET /api/cv/[id]/publier
     etat publie reel : { ok, published, slug, publicUrl, viewsCount }
   ================================================================== */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

function slugifyNom(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function originFrom(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (configured.trim() !== "") return configured.trim().replace(/\/+$/, "");
  return new URL(request.url).origin;
}

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
      console.error("[api/cv/[id]/publier] Resolution utilisateur par email impossible :", error);
      return null;
    }
  }
  return null;
}

/* Slug unique : base, puis base-2, base-3... */
async function slugUnique(base: string, ownRowId: string | null): Promise<string> {
  const clean = slugifyNom(base);
  const prefix = clean.length >= 2 ? clean : "candidat";
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const candidate = attempt === 1 ? prefix : `${prefix}-${attempt}`;
    const clash = await prisma.publicResume.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!clash || clash.id === ownRowId) return candidate;
  }
  return `${prefix}-${Date.now().toString(36)}`;
}

function resumeJson(row: { slug: string; viewsCount: number }, origin: string) {
  return {
    slug: row.slug,
    publicUrl: `${origin}/u/${row.slug}`,
    viewsCount: typeof row.viewsCount === "number" ? row.viewsCount : 0,
  };
}

/* ------------------------ GET : etat publie reel ------------------------ */

export async function GET(request: NextRequest, context: RouteContext) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    const row = await prisma.cvDocument.findUnique({ where: { id } });
    if (!row || row.userId !== userId) {
      return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
    }
    const origin = originFrom(request);
    const slug = typeof row.publishedSlug === "string" ? row.publishedSlug.trim() : "";
    if (slug === "" || !SLUG_RE.test(slug)) {
      return NextResponse.json({
        ok: true,
        published: false,
        slug: null,
        publicUrl: null,
        viewsCount: null,
      });
    }
    const pub = await prisma.publicResume.findUnique({ where: { slug } });
    if (!pub || !pub.isPublic) {
      return NextResponse.json({
        ok: true,
        published: false,
        slug: null,
        publicUrl: null,
        viewsCount: null,
      });
    }
    return NextResponse.json({ ok: true, published: true, ...resumeJson(pub, origin) });
  } catch (error) {
    console.error("[api/cv/[id]/publier][GET]", error);
    return NextResponse.json(
      { error: "Lecture de l'etat de publication impossible." },
      { status: 500 }
    );
  }
}

/* --------------- POST : sauvegarde + publication atomiques --------------- */

export async function POST(request: NextRequest, context: RouteContext) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Connexion requise. Reconnectez-vous puis reessayez." },
      { status: 401 }
    );
  }
  const { id } = await context.params;

  let body: Record<string, unknown> = {};
  try {
    const raw: unknown = await request.json();
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      body = raw as Record<string, unknown>;
    }
  } catch {
    body = {}; /* corps vide accepte : publication depuis l'etat en base */
  }

  try {
    const row = await prisma.cvDocument.findUnique({ where: { id } });
    if (!row || row.userId !== userId) {
      return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
    }
    if (row.trashedAt) {
      return NextResponse.json(
        { error: "Ce CV est dans la corbeille : restaurez-le avant de le publier." },
        { status: 409 }
      );
    }

    /* 1) Sauvegarde de l'etat EXACT envoye par le createur (anti-course). */
    const patch: { data?: unknown; design?: unknown; step?: number } = {};
    if (
      body.data !== undefined && body.data !== null &&
      typeof body.data === "object" && !Array.isArray(body.data)
    ) {
      patch.data = JSON.parse(JSON.stringify(body.data));
    }
    if (
      body.design !== undefined && body.design !== null &&
      typeof body.design === "object" && !Array.isArray(body.design)
    ) {
      patch.design = JSON.parse(JSON.stringify(body.design));
    }
    if (
      typeof body.step === "number" &&
      Number.isFinite(body.step) && body.step >= 0 && body.step <= 5
    ) {
      patch.step = Math.floor(body.step);
    }
    const saved =
      Object.keys(patch).length > 0
        ? await prisma.cvDocument.update({ where: { id: row.id }, data: patch })
        : row;

    /* 2) Payload construit DEPUIS LA BASE (jamais depuis un etat client). */
    const payload = buildPublishPayload({
      data: saved.data,
      design: saved.design,
      slug: saved.publishedSlug,
    });
    if (payload.data.personal.fullName === "") {
      return NextResponse.json(
        { error: "Renseignez votre nom complet (etape 1) avant la publication." },
        { status: 400 }
      );
    }

    /* 3) Cible = LA ligne publique de l'utilisateur ; slug stable. */
    const ownRows = await prisma.publicResume.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
    const ownRow = ownRows.length > 0 ? ownRows[0] : null;

    let targetSlug = typeof saved.publishedSlug === "string" ? saved.publishedSlug.trim() : "";
    if (targetSlug === "" || !SLUG_RE.test(targetSlug)) {
      targetSlug = slugifyNom(payload.data.personal.fullName);
    }
    if (!SLUG_RE.test(targetSlug)) {
      targetSlug = await slugUnique(payload.data.personal.fullName, ownRow?.id ?? null);
    } else if (ownRow === null || ownRow.slug !== targetSlug) {
      const clash = await prisma.publicResume.findUnique({
        where: { slug: targetSlug },
        select: { id: true, userId: true },
      });
      const clashOwner = clash ? (clash as unknown as { userId?: string | null }).userId : null;
      if (clash && clashOwner !== null && clashOwner !== userId) {
        targetSlug = await slugUnique(payload.data.personal.fullName, ownRow?.id ?? null);
      }
    }

    /* Photo conservee depuis la ligne deja en ligne (publication ou apercu). */
    const photoSource =
      ownRow ?? (await prisma.publicResume.findUnique({ where: { slug: targetSlug } }));
    const photoCv = asRecord(photoSource?.cvData);
    const photo = typeof photoCv.photo === "string" && photoCv.photo !== "" ? photoCv.photo : null;

    const cvDataJson = JSON.parse(
      JSON.stringify({
        ...payload.data,
        theme: payload.theme,
        ...(photo !== null ? { photo } : {}),
      })
    );

    let published: { slug: string; viewsCount: number };
    if (ownRow) {
      published = await prisma.publicResume.update({
        where: { id: ownRow.id },
        data: { slug: targetSlug, cvData: cvDataJson, isPublic: true },
      });
    } else {
      const slugRow = await prisma.publicResume.findUnique({ where: { slug: targetSlug } });
      const slugOwner = slugRow ? (slugRow as unknown as { userId?: string | null }).userId : null;
      if (slugRow && (slugOwner === null || slugOwner === userId)) {
        published = await prisma.publicResume.update({
          where: { id: slugRow.id },
          data: {
            cvData: cvDataJson,
            isPublic: true,
            ...(slugOwner === null ? { userId } : {}),
          },
        });
      } else {
        try {
          published = await prisma.publicResume.create({
            data: { userId, slug: targetSlug, cvData: cvDataJson, isPublic: true, viewsCount: 0 },
          });
        } catch (createError) {
          /* Repli : schema sans colonne userId obligatoire ou contrainte inattendue. */
          const retry = await prisma.publicResume
            .create({ data: { slug: targetSlug, cvData: cvDataJson, isPublic: true, viewsCount: 0 } })
            .catch(() => null);
          if (!retry) throw createError;
          published = retry;
        }
      }
    }

    /* 4) Drapeaux du CV + un seul CV publie a la fois pour cet utilisateur. */
    await prisma.cvDocument.update({
      where: { id: saved.id },
      data: { isPublic: true, publishedSlug: targetSlug },
    });
    await prisma.cvDocument.updateMany({
      where: { userId, id: { not: saved.id }, isPublic: true },
      data: { isPublic: false },
    });

    const origin = originFrom(request);
    return NextResponse.json({ ok: true, published: true, ...resumeJson(published, origin) });
  } catch (error) {
    console.error("[api/cv/[id]/publier][POST]", error);
    return NextResponse.json(
      { error: "La publication a echoue. Reessayez - le contenu du createur est conserve." },
      { status: 500 }
    );
  }
}