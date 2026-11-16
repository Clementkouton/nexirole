import { NextRequest, NextResponse } from "next/server";
import { groq } from "@ai-sdk/groq";
import { generateObject } from "ai";
import { z } from "zod";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

// Schéma strict du rapport classé
const RankingSchema = z.object({
  profil_resume: z.string(),
  competences_detectees: z.array(z.string()),
  offres_classees: z.array(
    z.object({
      id: z.string(),
      titre: z.string(),
      entreprise: z.string(),
      lieu: z.string(),
      source: z.enum(["Remotive", "Arbeitnow"]),
      url: z.string(),
      score_pertinence: z.number().min(0).max(100),
      points_forts: z.array(z.string()),
      competences_manquantes: z.array(z.string()),
      conseil_adaptation: z.string(),
    })
  ),
});

type RemotiveJob = {
  id?: string | number;
  title?: string;
  company_name?: string;
  candidate_required_location?: string;
  url?: string;
  description?: string;
};

type ArbeitnowJob = {
  slug?: string;
  title?: string;
  company_name?: string;
  location?: string;
  url?: string;
  description?: string;
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const targetRole = (formData.get("targetRole") as string) || "";

    if (!file) {
      return NextResponse.json({ error: "Aucun CV fourni." }, { status: 400 });
    }

    // 1. Extraction du texte du CV PDF
    const arrayBuffer = await file.arrayBuffer();
    const pdfData = await pdf(Buffer.from(arrayBuffer));
    const cvText = pdfData.text.slice(0, 6000); // Limite pour rester rapide

    // 2. Récupération des offres en direct (Remotive + Arbeitnow sans clé API)
    const searchQuery = encodeURIComponent(targetRole);
    const [remotiveRes, arbeitnowRes] = await Promise.all([
      fetch(`https://remotive.com{searchQuery}&limit=10`),
      fetch(`https://arbeitnow.com`),
    ]);

    const remotiveJson = remotiveRes.ok ? await remotiveRes.json() : { jobs: [] };
    const arbeitnowJson = arbeitnowRes.ok ? await arbeitnowRes.json() : { data: [] };

    // Normalisation des 15 meilleures offres brutes
    const remotiveJobs = (remotiveJson.jobs || []).slice(0, 8).map((j: any) => ({
      id: `rem-${j.id}`,
      titre: j.title,
      entreprise: j.company_name,
      lieu: j.candidate_required_location || "Remote",
      source: "Remotive",
      url: j.url,
      description: j.description?.replace(/<[^>]*>?/gm, "").slice(0, 600),
    }));

    const arbeitnowJobs = (arbeitnowJson.data || []).slice(0, 7).map((j: any) => ({
      id: `arb-${j.slug}`,
      titre: j.title,
      entreprise: j.company_name,
      lieu: j.location || "Europe / Remote",
      source: "Arbeitnow",
      url: j.url,
      description: j.description?.replace(/<[^>]*>?/gm, "").slice(0, 600),
    }));

    const allJobs = [...remotiveJobs, ...arbeitnowJobs];

    // 3. Comparaison et classement par l'IA gratuite (Groq Llama 3.3)
    const { object } = await generateObject({
      model: groq("llama-3.3-70b-versatile"),
      schema: RankingSchema,
      prompt: `Tu es NexiRole, un expert en recrutement. Analyse le CV suivant et compare-le à la liste d'offres d'emploi en direct.
      Calcule un score de pertinence honnête sur 100 pour chaque offre, identifie les points forts du candidat, les compétences manquantes et donne un conseil court.
      Trie obligatoirement 'offres_classees' du score le plus élevé au plus faible.

      CV DU CANDIDAT :
      ${cvText}

      OFFRES EN DIRECT :
      ${JSON.stringify(allJobs)}`,
    });

    // Tri de sécurité par score décroissant
    object.offres_classees.sort((a, b) => b.score_pertinence - a.score_pertinence);

    return NextResponse.json(object);
  } catch (error) {
    console.error("Erreur NexiRole Agent:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'analyse du CV ou de la recherche." },
      { status: 500 }
    );
  }
}
