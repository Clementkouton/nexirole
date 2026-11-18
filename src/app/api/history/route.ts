import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * PARTIE 2 — Historique complet de l'utilisateur.
 *
 * GET  /api/history?type=applications|resumes&limit=50
 * POST /api/history            → enregistre un dossier généré
 * DELETE /api/history?type=...&id=... → supprime un élément
 *
 * Le POST est aussi appelé AUTOMATIQUEMENT par /api/generate-from-url :
 * c'est ce qui corrige le bug « les dossiers générés ne sont pas stockés
 * dans les historiques ».
 */

export const runtime = "nodejs";

const saveSchema = z.object({
  jobTitle: z.string().trim().min(1).max(200),
  companyName: z.string().trim().min(1).max(200),
  jobUrl: z.string().url().max(2000).optional().nullable(),
  templateId: z.string().trim().max(40).optional(),
  withPhoto: z.boolean().optional(),
  cv: z.unknown(), // structure optimCvSchema (stocké en Json)
  coverLetter: z.unknown(), // structure coverLetterSchema (sérialisée)
  interviewKit: z.unknown().optional().nullable(),
  candidate: z.unknown().optional().nullable(),
  initialScore: z.number().int().min(0).max(100).optional().nullable(),
  optimizedScore: z.number().int().min(0).max(100).optional().nullable(),
});

const APPLICATION_TYPES = new Set(["applications", "dossiers"]);
const RESUME_TYPES = new Set(["resumes", "cv"]);

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function GET(request: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const type = request.nextUrl.searchParams.get("type") ?? "applications";
  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.trunc(limitParam), 1), 100)
    : 50;

  if (APPLICATION_TYPES.has(type)) {
    const items = await prisma.generatedApplication.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return NextResponse.json({ type: "applications", items });
  }

  if (RESUME_TYPES.has(type)) {
    const items = await prisma.savedResume.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return NextResponse.json({ type: "resumes", items });
  }

  return NextResponse.json(
    { error: "Type d'historique inconnu. Utilisez applications ou resumes." },
    { status: 400 }
  );
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

  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données du dossier invalides." },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const item = await prisma.generatedApplication.create({
    data: {
      userId,
      jobTitle: data.jobTitle,
      companyName: data.companyName,
      jobUrl: data.jobUrl ?? null,
      templateId: data.templateId?.trim() || "moderne",
      withPhoto: data.withPhoto ?? false,
      cvJson: (data.cv ?? {}) as import("@/generated/prisma/client").Prisma.InputJsonValue,
      coverLetter: JSON.stringify(data.coverLetter ?? {}),
      interviewKitJson: (data.interviewKit ?? null) as
        | import("@/generated/prisma/client").Prisma.InputJsonValue
        | undefined,
      candidateJson: (data.candidate ?? null) as
        | import("@/generated/prisma/client").Prisma.InputJsonValue
        | undefined,
      initialScore: data.initialScore ?? null,
      optimizedScore: data.optimizedScore ?? null,
    },
  });

  return NextResponse.json({ ok: true, id: item.id }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  const type = request.nextUrl.searchParams.get("type") ?? "applications";
  if (!id) {
    return NextResponse.json({ error: "Paramètre id manquant." }, { status: 400 });
  }

  if (APPLICATION_TYPES.has(type)) {
    const deleted = await prisma.generatedApplication.deleteMany({
      where: { id, userId }, // userId : jamais supprimer le dossier d'un autre
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  if (RESUME_TYPES.has(type)) {
    const deleted = await prisma.savedResume.deleteMany({ where: { id, userId } });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Type d'historique inconnu." }, { status: 400 });
}
