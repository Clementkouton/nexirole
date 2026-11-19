// =============================================================
// NEXIROLE â€” Suivi des candidatures (JobApplicationTracker)
// RÃ©ponse TOUJOURS en JSON (jamais de corps vide).
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TRACKER_STATUSES = ["A_POSTULER", "ENVOYE", "ENTRETIEN", "REFUS", "OFFRE"] as const;

const createSchema = z.object({
  jobTitle: z.string().trim().min(1, "Le poste est obligatoire.").max(200),
  companyName: z.string().trim().max(200).optional(),
  jobUrl: z.string().trim().url("Lien de l'offre invalide.").max(500).optional(),
  status: z.enum(TRACKER_STATUSES).default("A_POSTULER"),
  followUpAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de suivi invalide.").optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(TRACKER_STATUSES).optional(),
  followUpAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de suivi invalide.").optional(),
});

function parseFollowUp(value?: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (!value) return null;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  return user?.id ?? null;
}

// GET â€” liste des candidatures suivies
export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Non authentifiÃ©." }, { status: 401 });

  try {
    const candidatures = await prisma.jobApplicationTracker.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ ok: true, candidatures });
  } catch (error) {
    console.error("[TRACKER][GET] Erreur :", error);
    return NextResponse.json(
      { error: "Suivi indisponible. VÃ©rifiez que la base est Ã  jour (npx prisma db push)." },
      { status: 500 },
    );
  }
}

// POST â€” ajouter une candidature
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Non authentifiÃ©." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requÃªte invalide." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "DonnÃ©es invalides.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const candidature = await prisma.jobApplicationTracker.create({
      data: {
        userId,
        jobTitle: parsed.data.jobTitle,
        companyName: parsed.data.companyName ?? "",
        jobUrl: parsed.data.jobUrl || null,
        status: parsed.data.status,
        followUpAt: parseFollowUp(parsed.data.followUpAt) ?? null,
      },
    });
    return NextResponse.json({ ok: true, candidature }, { status: 201 });
  } catch (error) {
    console.error("[TRACKER][POST] Erreur :", error);
    return NextResponse.json(
      { error: "Enregistrement impossible. VÃ©rifiez que la base est Ã  jour (npx prisma db push)." },
      { status: 500 },
    );
  }
}

// PATCH â€” mettre Ã  jour le statut / la date de suivi
export async function PATCH(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Non authentifiÃ©." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requÃªte invalide." }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "DonnÃ©es invalides.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const existing = await prisma.jobApplicationTracker.findFirst({
      where: { id: parsed.data.id, userId },
    });
    if (!existing) return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 });

    const followUp = parseFollowUp(parsed.data.followUpAt);
    const updated = await prisma.jobApplicationTracker.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
        ...(followUp !== undefined ? { followUpAt: followUp } : {}),
      },
    });
    return NextResponse.json({ ok: true, candidature: updated });
  } catch (error) {
    console.error("[TRACKER][PATCH] Erreur :", error);
    return NextResponse.json({ error: "Mise Ã  jour impossible." }, { status: 500 });
  }
}

// DELETE â€” supprimer une candidature (?id=â€¦)
export async function DELETE(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Non authentifiÃ©." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });

  try {
    const existing = await prisma.jobApplicationTracker.findFirst({ where: { id, userId } });
    if (!existing) return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 });
    await prisma.jobApplicationTracker.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[TRACKER][DELETE] Erreur :", error);
    return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });
  }
}