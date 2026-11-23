/* =====================================================================
   NexiRole - API Lettres de motivation
   GET  /api/lettre  : liste des lettres de l'utilisateur connecte
   POST /api/lettre  : genere une lettre avec l'IA puis l'enregistre
   ===================================================================== */

import { NextResponse } from "next/server";
import { getUserId, getPrisma } from "@/lib/nr-auth";
import { generateText } from "@/lib/ai-client";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = [
  "Tu es un redacteur expert de lettres de motivation, ancien recruteur et coach carriere.",
  "Regles imperatives :",
  "- Reponds UNIQUEMENT avec le texte de la lettre, pret a envoyer. Aucun commentaire, aucune explication, aucun markdown (pas de #, pas d'asterisques, pas de blocs de code).",
  "- Structure attendue : en-tete expediteur avec placeholders ([Prenom Nom], [Adresse], [Telephone], [E-mail]), lieu et date, bloc destinataire (entreprise et contact si connus), ligne Objet, salutation, 3 a 4 paragraphes, formule de politesse, signature [Prenom Nom].",
  "- Contenu : relie les experiences du candidat aux besoins precis de l'offre, montre la valeur apportee, evite les generalites vides et la repetition mot a mot du CV. Phrases courtes et concretes.",
  "- Longueur : 250 a 350 mots environ pour le corps de la lettre.",
  "- Si une information manque, utilise un placeholder court entre crochets, ex. [Nom du responsable].",
  "- Respecte strictement la langue demandee pour TOUTE la lettre.",
].join("\n");

function construirePrompt(p: {
  company: string;
  position: string;
  tone: string;
  language: string;
  jobOffer: string;
  cvText: string;
}): string {
  const langue = p.language === "en" ? "anglais" : "francais";
  const tons: Record<string, string> = {
    professionnel: "professionnel et pose",
    enthousiaste: "enthousiaste et dynamique",
    direct: "direct et efficace",
    creatif: "creatif mais credible",
  };
  const lignes = [
    "Redige une lettre de motivation en " + langue + ", ton " + (tons[p.tone] || p.tone) + ".",
    p.position ? "Poste vise : " + p.position + "." : "",
    p.company ? "Entreprise : " + p.company + "." : "",
    p.jobOffer ? "--- OFFRE D'EMPLOI ---\n" + p.jobOffer.slice(0, 6000) : "",
    p.cvText ? "--- CV DU CANDIDAT ---\n" + p.cvText.slice(0, 6000) : "",
    "Genere maintenant la lettre complete.",
  ];
  return lignes.filter(Boolean).join("\n\n");
}

export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Non authentifie. Reconnecte-toi." }, { status: 401 });
    }
    const lettres = await getPrisma().coverLetter.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        company: true,
        position: true,
        tone: true,
        language: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ lettres });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur.";
    return NextResponse.json(
      { error: "Base de donnees : " + message + " (Si le modele CoverLetter est absent, lance : npx prisma db push)" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Non authentifie. Reconnecte-toi." }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Requete invalide." }, { status: 400 });
    }

    const str = (k: string): string => (typeof body[k] === "string" ? (body[k] as string) : "");
    const company = str("company").slice(0, 200);
    const position = str("position").slice(0, 200);
    const tone = str("tone") || "professionnel";
    const language = str("language") || "fr";
    const jobOffer = str("jobOffer");
    const cvText = str("cvText");

    if (!jobOffer.trim() && !cvText.trim()) {
      return NextResponse.json(
        { error: "Ajoute au moins l'offre d'emploi ou le texte de ton CV." },
        { status: 400 }
      );
    }

    let contenu = "";
    try {
      const r = await generateText({
        system: SYSTEM_PROMPT,
        user: construirePrompt({ company, position, tone, language, jobOffer, cvText }),
        temperature: 0.75,
        maxTokens: 1800,
      });
      contenu = r.text;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur IA inconnue.";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const titreBase = position && company ? position + " - " + company : position || company || "";
    const title = (titreBase || "Lettre du " + new Date().toLocaleDateString("fr-FR")).slice(0, 120);

    const lettre = await getPrisma().coverLetter.create({
      data: { userId, title, company, position, tone, language, jobOffer, cvText, content: contenu },
    });

    return NextResponse.json({ lettre }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
