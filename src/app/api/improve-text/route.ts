import { NextRequest, NextResponse } from "next/server";
import { improvedTextSchema, improveTextRequestSchema } from "@/lib/schemas";
import { generateStructured } from "@/lib/ai";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête JSON invalide." },
      { status: 400 }
    );
  }

  const parsed = improveTextRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paramètres d'amélioration invalides." },
      { status: 400 }
    );
  }

  const { label, text, context } = parsed.data;

  if (text.trim().length < 5) {
    return NextResponse.json(
      { error: "Le texte à améliorer est trop court." },
      { status: 400 }
    );
  }

  try {
    const result = await generateStructured({
      schema: improvedTextSchema,
      system:
        "Tu es un coach carrière expert en rédaction professionnelle. Tu améliores un champ de CV en français, sans inventer d'information absente du texte fourni : formulations plus percutantes, verbes d'action, résultats quantifiés si des chiffres existent déjà, concision maximale. Conserve la même langue que le texte fourni.",
      prompt: [
        `Champ à améliorer : ${label}`,
        context ? `Contexte (poste cible / offre) : ${context}` : "",
        "",
        "Texte actuel :",
        text,
      ]
        .filter(Boolean)
        .join("\n"),
      temperature: 0.4,
      maxOutputTokens: 1200,
    });

    return NextResponse.json({ improved: result.improved });
  } catch (error) {
    console.error("[improve-text]", error);
    return NextResponse.json(
      { error: "L'amélioration IA a échoué. Réessayez." },
      { status: 502 }
    );
  }
}
