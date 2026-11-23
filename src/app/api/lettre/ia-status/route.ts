/* =====================================================================
   NexiRole - Statut IA + Base pour la page Lettres
   GET /api/lettre/ia-status : dit si la cle IA est detectee et si le
   modele CoverLetter existe en base. Ne renvoie JAMAIS la cle elle-meme.
   ===================================================================== */

import { NextResponse } from "next/server";
import { getAiStatus } from "@/lib/ai-client";
import { getPrisma } from "@/lib/nr-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const ai = getAiStatus();

  let db = { ok: false, message: "Base de donnees non testee." };
  try {
    await getPrisma().coverLetter.count();
    db = { ok: true, message: "Modele CoverLetter accessible." };
  } catch (e) {
    db = {
      ok: false,
      message:
        "Modele CoverLetter inaccessible - lance « npx prisma db push » puis « npx prisma generate ». " +
        (e instanceof Error ? e.message.slice(0, 160) : ""),
    };
  }

  return NextResponse.json({ ai, db });
}
