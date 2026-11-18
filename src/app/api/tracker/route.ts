import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * PARTIE 2 — Suivi des candidatures (tableau interactif du dashboard).
 *
 * GET    /api/tracker                  → liste triée par mise à jour récente
 * POST   /api/tracker                  → ajoute une candidature
 * PATCH  /api/tracker                  → change le statut / notes / relance
 * DELETE /api/tracker?id=...           → supprime
 */

export const runtime = "nodejs";

export const TRACKER_STATUSES = [
  "A_POSTULER",
  "ENVOYE",
  "ENTRETIEN",
  "REFUS",
  "OFFRE",
] as const;

const statusSchema = z.enum(TRACKER_STATUSES);

const createSchema = z.object({
  jobTitle: z.string().trim().min(1, "Intitulé du poste requis.").max(200),
  companyName: z.string().trim().min(1, "Entreprise requise.").max(200),
  jobUrl: z
    .string()
    .trim()
    .url("Lien de l'offre invalide.")
    .max(2000)
    .optional()
    .or(z.literal(""))
    .nullable(),
  status: statusSchema.optional(),
  notes: z.string().trim().max(4000).optional().nullable(),
  followUpDate: z.string().datetime({ offset: true }).optional().nullable(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  jobTitle: z.string().trim().max(200).optional(),
  companyName: z.string().trim().max(200).optional(),
  jobUrl: z
    .string()
    .trim()
    .url()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .nullable(),
  status: statusSchema.optional(),
  notes: z.string().trim().max(4000).optional().nullable(),
  followUpDate: z.string().datetime({ offset: true }).optional().nullable(),
});

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function GET() {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const items = await prisma.jobApplicationTracker.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const item = await prisma.jobApplicationTracker.create({
    data: {
      userId,
      jobTitle: data.jobTitle,
      companyName: data.companyName,
      jobUrl: data.jobUrl || null,
      status: data.status ?? "A_POSTULER",
      notes: data.notes ?? null,
      followUpDate: data.followUpDate ? new Date(data.followUpDate) : null,
    },
  });

  return NextResponse.json({ ok: true, item }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 }
    );
  }

  const { id, ...fields } = parsed.data;
  const data: Record<string, unknown> = {};
  if (fields.jobTitle !== undefined) data.jobTitle = fields.jobTitle;
  if (fields.companyName !== undefined) data.companyName = fields.companyName;
  if (fields.jobUrl !== undefined) data.jobUrl = fields.jobUrl || null;
  if (fields.status !== undefined) data.status = fields.status;
  if (fields.notes !== undefined) data.notes = fields.notes ?? null;
  if (fields.followUpDate !== undefined) {
    data.followUpDate = fields.followUpDate ? new Date(fields.followUpDate) : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour." }, { status: 400 });
  }

  try {
    const item = await prisma.jobApplicationTracker.update({
      where: { id },
      data,
    });
    // Sécurité : l'item doit appartenir à l'utilisateur connecté
    if (item.userId !== userId) {
      return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, item });
  } catch {
    return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 });
  }
}

export async function DELETE(request: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Paramètre id manquant." }, { status: 400 });
  }
  const deleted = await prisma.jobApplicationTracker.deleteMany({
    where: { id, userId },
  });
  if (deleted.count === 0) {
    return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
