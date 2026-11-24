import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { resoudreUtilisateur } from "@/lib/utilisateur-actuel";

// =============================================================
// NEXIROLE — Historique : dossiers générés + CV analysés.
// Réponse TOUJOURS en JSON (jamais de corps vide).
//
// CONTRAT D'API (étendu) :
// GET    /api/history                    → { ok, dossiers, cvAnalyses }
//                                          (page /dashboard/historique)
// GET    /api/history?type=applications  → { items: [...] } (dossiers)
// GET    /api/history?type=resumes       → { items: [...] } (CV analysés)
// POST   /api/history                    → enregistre un dossier → 201 { item }
//         Corps accepté : { jobTitle|titre, companyName|entreprise,
//         jobUrl|url, cvJson?, coverLetter?, interviewKitJson?,
//         candidateJson?, initialScore?, optimizedScore?, templateId? }
// PATCH  /api/history                    → { id, ...champs } (édition)
// DELETE /api/history?id=...&type=applications|resumes → { ok: true }
//
// Identité : résolution tolérante (session.id → session.email → cookie JWT)
// via src/lib/utilisateur-actuel.ts — plus aucune erreur 401 injustifiée.
// =============================================================

export const dynamic = "force-dynamic";

type JsonValue = import("@/generated/prisma/client").Prisma.InputJsonValue;

function pickString(...valeurs: unknown[]): string {
  for (const valeur of valeurs) {
    if (typeof valeur === "string" && valeur.trim() !== "") return valeur.trim();
  }
  return "";
}

function pickJson(value: unknown): JsonValue | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as JsonValue) : null;
    } catch {
      return null;
    }
  }
  return typeof value === "object" ? (value as JsonValue) : null;
}

function pickNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

/** Convertit texte ou objet en chaîne (la colonne coverLetter est un String). */
function pickTexte(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  return null;
}

function reponseNonAuthentifie(diagnostic: string): NextResponse {
  return NextResponse.json(
    {
      error: "Non authentifié — reconnecte-toi puis recharge la page.",
      diagnostic,
    },
    { status: 401 }
  );
}

/* ─────────────── GET : liste complète ou filtrée ─────────────── */

export async function GET(request: NextRequest) {
  const { utilisateur, diagnostic } = await resoudreUtilisateur();
  if (!utilisateur) return reponseNonAuthentifie(diagnostic);

  const type = new URL(request.url).searchParams.get("type");

  try {
    if (type === "applications") {
      /* Format « items » attendu par le panneau historique du tableau de bord. */
      const dossiers = await prisma.generatedApplication.findMany({
        where: { userId: utilisateur.userId },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return NextResponse.json({ items: dossiers });
    }

    if (type === "resumes") {
      const cvAnalyses = await prisma.savedResume.findMany({
        where: { userId: utilisateur.userId },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return NextResponse.json({ items: cvAnalyses });
    }

    /* Format historique complet (page /dashboard/historique). */
    const [dossiers, cvAnalyses] = await Promise.all([
      prisma.generatedApplication.findMany({
        where: { userId: utilisateur.userId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.savedResume.findMany({
        where: { userId: utilisateur.userId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    return NextResponse.json({ ok: true, dossiers, cvAnalyses });
  } catch (error) {
    console.error("[HISTORY:GET] Erreur :", error);
    return NextResponse.json(
      {
        error:
          "Impossible de charger l'historique. Vérifiez que la base est à jour (npx prisma db push).",
      },
      { status: 500 }
    );
  }
}

/* ─────────────── POST : enregistrement d'un dossier ─────────────── */

export async function POST(request: NextRequest) {
  const { utilisateur, diagnostic } = await resoudreUtilisateur();
  if (!utilisateur) return reponseNonAuthentifie(diagnostic);

  let body: Record<string, unknown>;
  try {
    const brut: unknown = await request.json();
    body = brut && typeof brut === "object" ? (brut as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json(
      { error: "Corps de requête JSON invalide." },
      { status: 400 }
    );
  }

  const jobTitle = pickString(body.jobTitle, body.titre, body.title, body.poste);
  if (!jobTitle) {
    return NextResponse.json(
      { error: "L'intitulé du poste (jobTitle) est obligatoire." },
      { status: 400 }
    );
  }

  try {
    const item = await prisma.generatedApplication.create({
      data: {
        userId: utilisateur.userId,
        jobTitle: jobTitle.slice(0, 160),
        companyName: (
          pickString(body.companyName, body.entreprise, body.company, body.societe) ||
          "Non précisée"
        ).slice(0, 160),
        jobUrl:
          pickString(body.jobUrl, body.url, body.lien, body.link).slice(0, 500) || null,
        templateId: pickString(body.templateId) || "moderne",
        cvJson: pickJson(body.cvJson) ?? {},
        coverLetter: pickTexte(body.coverLetter) ?? "",
        interviewKitJson: pickJson(body.interviewKitJson) ?? Prisma.JsonNull,
        candidateJson: pickJson(body.candidateJson) ?? Prisma.JsonNull,
        initialScore: pickNumber(body.initialScore),
        optimizedScore: pickNumber(body.optimizedScore),
      },
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("[HISTORY:POST] Erreur :", error);
    return NextResponse.json(
      { error: "Enregistrement du dossier impossible (base indisponible ?)." },
      { status: 500 }
    );
  }
}

/* ─────────────── PATCH : édition d'un dossier ─────────────── */

export async function PATCH(request: NextRequest) {
  const { utilisateur, diagnostic } = await resoudreUtilisateur();
  if (!utilisateur) return reponseNonAuthentifie(diagnostic);

  let body: Record<string, unknown>;
  try {
    const brut: unknown = await request.json();
    body = brut && typeof brut === "object" ? (brut as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json(
      { error: "Corps de requête JSON invalide." },
      { status: 400 }
    );
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json(
      { error: "Identifiant du dossier manquant." },
      { status: 400 }
    );
  }

  const data: {
    jobTitle?: string;
    companyName?: string;
    jobUrl?: string | null;
    templateId?: string;
    cvJson?: JsonValue;
    coverLetter?: string;
    interviewKitJson?: JsonValue | Prisma.NullableJsonNullValueInput;
    candidateJson?: JsonValue | Prisma.NullableJsonNullValueInput;
    initialScore?: number | null;
    optimizedScore?: number | null;
  } = {};

  const titre = pickString(body.jobTitle, body.titre);
  if (titre) data.jobTitle = titre.slice(0, 160);
  const entreprise = pickString(body.companyName, body.entreprise);
  if (entreprise) data.companyName = entreprise.slice(0, 160);
  if (body.jobUrl !== undefined) {
    data.jobUrl = pickString(body.jobUrl, body.url).slice(0, 500) || null;
  }
  const template = pickString(body.templateId);
  if (template) data.templateId = template;
  const cvJson = pickJson(body.cvJson);
  if (cvJson !== null) data.cvJson = cvJson;
  const coverLetter = pickTexte(body.coverLetter);
  if (coverLetter !== null) data.coverLetter = coverLetter.slice(0, 60000);
  if (body.interviewKitJson !== undefined) {
    data.interviewKitJson = pickJson(body.interviewKitJson) ?? Prisma.JsonNull;
  }
  if (body.candidateJson !== undefined) {
    data.candidateJson = pickJson(body.candidateJson) ?? Prisma.JsonNull;
  }
  if (body.initialScore !== undefined) data.initialScore = pickNumber(body.initialScore);
  if (body.optimizedScore !== undefined) {
    data.optimizedScore = pickNumber(body.optimizedScore);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 });
  }

  try {
    const existing = await prisma.generatedApplication.findFirst({
      where: { id, userId: utilisateur.userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
    }
    const item = await prisma.generatedApplication.update({ where: { id }, data });
    return NextResponse.json({ item });
  } catch (error) {
    console.error("[HISTORY:PATCH] Erreur :", error);
    return NextResponse.json(
      { error: "La mise à jour du dossier a échoué." },
      { status: 500 }
    );
  }
}

/* ─────────────── DELETE : suppression (dossier ou CV analysé) ─────────────── */

export async function DELETE(request: NextRequest) {
  const { utilisateur, diagnostic } = await resoudreUtilisateur();
  if (!utilisateur) return reponseNonAuthentifie(diagnostic);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
  }
  const type = searchParams.get("type") ?? "applications";

  try {
    if (type === "resumes") {
      const existing = await prisma.savedResume.findFirst({
        where: { id, userId: utilisateur.userId },
        select: { id: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Analyse de CV introuvable." }, { status: 404 });
      }
      await prisma.savedResume.delete({ where: { id: existing.id } });
    } else {
      const existing = await prisma.generatedApplication.findFirst({
        where: { id, userId: utilisateur.userId },
        select: { id: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
      }
      await prisma.generatedApplication.delete({ where: { id: existing.id } });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[HISTORY:DELETE] Erreur :", error);
    return NextResponse.json({ error: "La suppression a échoué." }, { status: 500 });
  }
}
