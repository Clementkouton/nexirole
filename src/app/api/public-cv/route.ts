import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
// Type JSON de Prisma — si VS Code signale ce chemin, remplacez-le par le chemin
// utilisé à la 1re ligne de src/lib/prisma.ts (import du client généré).
import type { Prisma } from "@/generated/prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// CONTRAT D'API — CV EN LIGNE PARTAGEABLE
// GET   /api/public-cv  → { publicResume | null }  (config de l'utilisateur connecté)
// POST  /api/public-cv  → publie / met à jour le CV public
//                         corps : { cvData, slug?, isPublic?, templateId? }
//                         → slug auto-propre depuis le nom, unicité vérifiée,
//                           renvoie publicUrl complète
// PATCH /api/public-cv  → { isPublic?, templateId? } (bascule rapide sans renvoyer cvData)
//
// NB : le drapeau « showQrOnPdf » (affichage du QR code sur le PDF) transite À
// L'INTÉRIEUR de cvData — le modèle PublicResume reste conforme à la spec.
// ─────────────────────────────────────────────────────────────────────────────

interface PublicResumeRow {
  id: string;
  userId: string;
  slug: string;
  isPublic: boolean;
  templateId: string;
  cvData: unknown;
  viewsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// Stratégie JWT de next-auth v5 : session.user ne contient par défaut que
// name/email/image — PAS d'id. Id s'il existe, sinon repli par email.
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
      console.error("[api/public-cv] Résolution utilisateur par email impossible :", error);
      return null;
    }
  }
  return null;
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Session invalide. Reconnectez-vous puis réessayez." },
    { status: 401 },
  );
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function readStringField(record: Record<string, unknown> | null, keys: string[]): string {
  if (!record) return "";
  for (const key of keys) {
    const value: unknown = record[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

function getOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (configured.trim() !== "") return configured.trim().replace(/\/+$/, "");
  return new URL(request.url).origin;
}

/** Slug propre : minuscules, sans accents, tirets uniques, max 60 caractères. */
function sanitizeSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Génère un slug unique : base, puis base-2, base-3… puis filet horodaté. */
async function generateUniqueSlug(base: string): Promise<string> {
  const cleaned = sanitizeSlug(base);
  const clean = cleaned !== "" ? cleaned : "candidat";
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const candidate = attempt === 1 ? clean : `${clean}-${attempt}`;
    const clash = await prisma.publicResume.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  return `${clean}-${Date.now().toString(36)}`;
}

function serializePublicResume(row: PublicResumeRow, origin: string) {
  const updatedAt =
    row.updatedAt instanceof Date && !Number.isNaN(row.updatedAt.getTime())
      ? row.updatedAt.toISOString()
      : new Date().toISOString();
  return {
    id: row.id,
    slug: row.slug,
    isPublic: row.isPublic,
    templateId: row.templateId,
    viewsCount: row.viewsCount,
    publicUrl: `${origin}/u/${row.slug}`,
    cvData: row.cvData ?? null,
    updatedAt,
  };
}

/* ─────────── GET : configuration du CV public de l'utilisateur connecté ─────────── */

export async function GET(request: Request) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  try {
    const row = await prisma.publicResume.findUnique({ where: { userId } });
    return NextResponse.json({
      publicResume: row ? serializePublicResume(row, getOrigin(request)) : null,
    });
  } catch (error) {
    console.error("[api/public-cv][GET]", error);
    return NextResponse.json(
      { error: "Impossible de charger la configuration du CV public." },
      { status: 500 },
    );
  }
}

/* ─────────── POST : publication / mise à jour du CV public ─────────── */

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const body = await readJsonBody(request);
  if (!body) return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });

  const cvDataValue: unknown = body.cvData;
  if (cvDataValue === null || typeof cvDataValue !== "object" || Array.isArray(cvDataValue)) {
    return NextResponse.json(
      { error: "Le champ cvData (objet du CV structuré) est obligatoire." },
      { status: 400 },
    );
  }

  try {
    const [userRow, existing] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      prisma.publicResume.findUnique({ where: { userId } }),
    ]);

    const requestedSlug = sanitizeSlug(readStringField(body, ["slug"]));
    let slug: string;

    if (requestedSlug !== "") {
      const clash = await prisma.publicResume.findUnique({
        where: { slug: requestedSlug },
        select: { userId: true },
      });
      if (clash && clash.userId !== userId) {
        return NextResponse.json(
          { error: "Ce lien public est déjà utilisé par un autre profil. Choisissez un autre identifiant." },
          { status: 409 },
        );
      }
      slug = requestedSlug;
    } else if (existing) {
      slug = existing.slug;
    } else {
      slug = await generateUniqueSlug(userRow?.name ?? "");
    }

    const isPublic = typeof body.isPublic === "boolean" ? body.isPublic : existing?.isPublic ?? true;
    const templateId = readStringField(body, ["templateId"]) || existing?.templateId || "modern-accent";

    const row = await prisma.publicResume.upsert({
      where: { userId },
      update: { slug, isPublic, templateId, cvData: toJsonInput(cvDataValue) },
      create: { userId, slug, isPublic, templateId, cvData: toJsonInput(cvDataValue) },
    });

    return NextResponse.json(
      { publicResume: serializePublicResume(row, getOrigin(request)) },
      { status: existing ? 200 : 201 },
    );
  } catch (error) {
    console.error("[api/public-cv][POST]", error);
    return NextResponse.json({ error: "La publication du CV en ligne a échoué." }, { status: 500 });
  }
}

/* ─────────── PATCH : bascule rapide (visibilité / template) ─────────── */

export async function PATCH(request: Request) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const body = await readJsonBody(request);
  if (!body) return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });

  try {
    const existing = await prisma.publicResume.findUnique({ where: { userId } });
    if (!existing) {
      return NextResponse.json(
        { error: "Aucun CV public enregistré. Publiez d'abord votre CV." },
        { status: 404 },
      );
    }

    const data: { isPublic?: boolean; templateId?: string } = {};
    if (typeof body.isPublic === "boolean") data.isPublic = body.isPublic;
    const templateId = readStringField(body, ["templateId"]);
    if (templateId !== "") data.templateId = templateId;
    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Aucun champ à mettre à jour (isPublic ou templateId attendu)." },
        { status: 400 },
      );
    }

    const updated = await prisma.publicResume.update({ where: { userId }, data });
    return NextResponse.json({ publicResume: serializePublicResume(updated, getOrigin(request)) });
  } catch (error) {
    console.error("[api/public-cv][PATCH]", error);
    return NextResponse.json({ error: "La mise à jour du CV public a échoué." }, { status: 500 });
  }
}