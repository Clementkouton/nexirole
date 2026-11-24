import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * NexiRole — Statut IA + Base pour la page Lettres de motivation.
 *
 * GET /api/lettre/ia-status :
 *   - vérifie la présence de process.env.GROQ_API_KEY (sans jamais la renvoyer) ;
 *   - vérifie que le modèle CoverLetter est accessible en base ;
 *   - répond TOUJOURS 200 (le statut est une information, pas une erreur).
 *
 * Contrat minimal (spécification) : { ready, model }
 * Champs additionnels conservés pour compatibilité avec l'affichage existant
 * de la page /dashboard/lettres (badge « Statut IA ») : provider, ia, db.
 */

export const dynamic = "force-dynamic";

/** Modèle affiché dans l'interface (moteur Groq de la génération de lettres). */
const MODELE_AFFICHE = "llama-3.3-70b-versatile";

export async function GET() {
  const ready = Boolean(process.env.GROQ_API_KEY);

  /* Vérification base : le modèle CoverLetter doit exister (npx prisma db push). */
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

  return NextResponse.json({
    /* Contrat de la spécification */
    ready,
    model: MODELE_AFFICHE,
    /* Champs de compatibilité (badge Statut IA de la page Lettres) */
    provider: "groq",
    ia: { pret: ready, provider: "groq", model: MODELE_AFFICHE },
    db,
  });
}
