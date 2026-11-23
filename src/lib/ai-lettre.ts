/**
 * NexiRole — Génération de LETTRES de motivation par IA.
 *
 * Même moteur que le reste de l'application (src/lib/ai.ts) :
 * Groq `llama-3.3-70b-versatile` via le Vercel AI SDK et
 * `process.env.GROQ_API_KEY` — aucune nouvelle configuration.
 *
 * Différence avec ai.ts : ici on génère du TEXTE libre (lettre complète),
 * pas du JSON structuré — on utilise donc `generateText` du même SDK.
 */

import { generateText } from "ai";
import { createGroq } from "@ai-sdk/groq";

export const MODELE_LETTRE = "llama-3.3-70b-versatile";

/** Statut IA à afficher dans la page (ne renvoie JAMAIS la clé). */
export function statutIa(): { pret: boolean; provider: string; model: string } {
  const pret = Boolean(
    process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.length > 10
  );
  return { pret, provider: "groq", model: MODELE_LETTRE };
}

/** Supprime d'éventuels blocs de code markdown autour de la réponse. */
function nettoyer(texte: string): string {
  let s = texte.trim();
  s = s.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
  return s;
}

export interface OptionsLettre {
  system: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

/** Génère le texte complet de la lettre (erreur explicite si clé absente). */
export async function genererLettre(opts: OptionsLettre): Promise<string> {
  if (!statutIa().pret) {
    throw new Error(
      "GROQ_API_KEY absente. Créez une clé gratuite sur https://console.groq.com puis ajoutez-la dans .env.local (dev) et dans Vercel → Settings → Environment Variables (production), puis redéployez."
    );
  }

  const groq = createGroq({ apiKey: process.env.GROQ_API_KEY! });
  const result = await generateText({
    model: groq(MODELE_LETTRE),
    system: opts.system,
    prompt: opts.prompt,
    temperature: opts.temperature ?? 0.75,
    maxOutputTokens: opts.maxOutputTokens ?? 2000,
  });

  const texte = nettoyer(result.text);
  if (!texte) {
    throw new Error("La réponse de l'IA est vide. Réessayez dans quelques instants.");
  }
  return texte;
}
