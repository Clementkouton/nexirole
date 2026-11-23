import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { statutIa } from "@/lib/ai-lettre";

/**
 * NexiRole — Statut IA + Base pour la page Lettres.
 *
 * GET /api/lettre/ia-status : indique si GROQ_API_KEY est configurée et si
 * le modèle CoverLetter existe en base. Ne renvoie JAMAIS la clé elle-même.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const ia = statutIa();

  let db = { ok: false, message: "Base de données non testée." };
  try {
    await prisma.coverLetter.count();
    db = { ok: true, message: "Modèle CoverLetter accessible." };
  } catch (error) {
    db = {
      ok: false,
      message:
        "Modèle CoverLetter inaccessible — lance « npx prisma db push » puis « npx prisma generate »." +
        (error instanceof Error ? " " + error.message.slice(0, 160) : ""),
    };
  }

  return NextResponse.json({ ia, db });
}
