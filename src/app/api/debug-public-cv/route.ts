// =============================================================================
// src/app/api/debug-public-cv/route.ts - NexiRole (DIAGNOSTIC TEMPORAIRE)
// Renvoie le cvData brut enregistre en base pour un slug public donne.
// N'expose QUE les donnees deja publiques (isPublic = true), les memes que
// la page /u/[slug] affiche deja. A supprimer apres le diagnostic.
// =============================================================================
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug) {
    return NextResponse.json(
      { error: "Parametre slug requis. Exemple : /api/debug-public-cv?slug=kouton-clement" },
      { status: 400 }
    );
  }
  try {
    const record = await prisma.publicResume.findUnique({ where: { slug } });
    if (!record || !record.isPublic) {
      return NextResponse.json(
        { error: "CV public introuvable ou prive pour ce slug" },
        { status: 404 }
      );
    }
    const cvData = (record.cvData ?? {}) as unknown as Record<string, unknown>;
    const personal = (cvData["personal"] ?? {}) as unknown as Record<string, unknown>;
    return NextResponse.json({
      slug: record.slug,
      isPublic: record.isPublic,
      templateId: record.templateId,
      viewsCount: record.viewsCount,
      updatedAt: record.updatedAt,
      topKeys: Object.keys(cvData),
      personalKeys: Object.keys(personal),
      raw: cvData,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}