import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { statutIa } from "@/lib/ai-lettre";

/**
 * NexiRole — Statut IA + Base pour la page Lettres.
 *
 * GET /api/lettre/ia-status : indique si GROQ_API_KEY est configurée et si
 * la table cover_letters est accessible. Ne renvoie JAMAIS la clé elle-même.
 *
 * Cette route ne doit JAMAIS planter : tout est capturé et la page affiche
 * ses badges en conséquence (IA prête / Base à initialiser).
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const ia = statutIa();

  let db = { ok: false, message: "Base de données non testée." };
  try {
    await prisma.coverLetter.count();
    db = { ok: true, message: "Table cover_letters accessible." };
  } catch (error) {
    const code = (error as { code?: string })?.code ?? "";
    if (code === "P2021") {
      db = {
        ok: false,
        message:
          "Table cover_letters absente — lance « npx prisma db push » puis redémarre le serveur (Ctrl+C puis npm run dev).",
      };
    } else {
      const detail =
        error instanceof Error ? " " + error.message.slice(0, 120) : "";
      db = {
        ok: false,
        message: "Base inaccessible (" + (code || "erreur") + ")." + detail,
      };
    }
  }

  return NextResponse.json({ ia, db });
}
