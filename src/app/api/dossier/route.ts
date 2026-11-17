// src/app/api/dossier/route.ts
import { NextResponse } from "next/server";
import { groqChat, groqJSON, GroqError } from "@/lib/groq";
import { clampScore, stripHtml } from "@/lib/text";
import type { DossierResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const CV_SYSTEM =
  "Tu es un expert de la rédaction de CV et du recrutement francophone. Tu réécris un CV existant pour viser une offre précise. Tu réponds UNIQUEMENT avec le contenu du CV en Markdown, sans commentaire avant ou après. Tu n'inventes JAMAIS d'expérience, de diplôme, de certification, de date ou de chiffre absent du CV fourni. Tu réponds en français.";

const LETTRE_SYSTEM =
  "Tu es un expert des lettres de motivation percutantes et naturelles. Tu réponds UNIQUEMENT avec le texte de la lettre, en français, sans balise Markdown et sans titre. Tu n'inventes aucune expérience absente du CV. Si une information manque (nom du recruteur, adresse), rédige naturellement sans la mentionner et sans utiliser de crochets.";

const SCORE_SYSTEM =
  "Tu es un expert RH francophone. Tu réponds STRICTEMENT en JSON valide, sans aucun texte autour.";

type DossierBody = {
  offerUrl?: string;
  offerTitle?: string;
  offerDescription?: string;
  cvText?: string;
};

async function fetchOfferText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "NexiRole/1.0 (+https://nexirole.vercel.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const html = await res.text();
    return stripHtml(html).slice(0, 8000);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: DossierBody;
  try {
    body = (await req.json()) as DossierBody;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const offerTitle = (body.offerTitle ?? "").trim();
  const offerUrl = (body.offerUrl ?? "").trim();
  const cvText = (body.cvText ?? "").trim();

  if (!offerTitle) {
    return NextResponse.json({ error: "Indique le titre de l'offre visée." }, { status: 400 });
  }
  if (cvText.length < 80) {
    return NextResponse.json(
      { error: "Ton profil est trop court — importe ton CV (PDF) ou rédige une présentation de quelques lignes." },
      { status: 400 }
    );
  }

  const warnings: string[] = [];

  // 1) Texte de l'offre : description fournie, sinon lecture de l'URL, sinon avertissement
  let offerText = (body.offerDescription ?? "").trim();
  if (offerText) {
    offerText = stripHtml(offerText).slice(0, 8000);
  } else if (offerUrl) {
    const fetched = await fetchOfferText(offerUrl);
    if (fetched && fetched.length > 200) {
      offerText = fetched;
    } else {
      warnings.push(
        "Impossible de lire l'annonce en ligne (site protégé ou indisponible) — la génération s'appuie sur le titre et ton profil. Colle le texte de l'offre pour un résultat plus précis."
      );
    }
  } else {
    warnings.push("Aucune description d'offre fournie — la génération s'appuie sur le titre de l'offre et ton profil.");
  }

  const offerBlock = [
    "Offre visée :",
    `Titre : ${offerTitle}`,
    offerUrl ? `Lien : ${offerUrl}` : "",
    offerText ? `Description :\n"""${offerText.slice(0, 6000)}"""` : "(description non disponible)",
  ]
    .filter(Boolean)
    .join("\n");

  const cvPrompt = [
    "Voici mon CV actuel :",
    `"""${cvText.slice(0, 8000)}"""`,
    "",
    offerBlock,
    "",
    "Réécris et optimise ce CV pour viser exactement cette offre :",
    "- Titre professionnel aligné avec l'intitulé de l'offre ;",
    "- Résumé percutant (3-4 lignes) reprenant les mots-clés essentiels de l'offre ;",
    "- Expériences reformulées pour mettre en avant ce qui correspond à l'offre, sans rien inventer ;",
    "- Compétences réorganisées par pertinence pour l'offre ;",
    "- Une section finale « Atouts pour cette offre ».",
    "",
    "Structure Markdown attendue :",
    "# Prénom NOM",
    "## Titre professionnel",
    "### Profil",
    "### Expériences professionnelles",
    "### Compétences",
    "### Formation",
    "### Atouts pour cette offre",
  ].join("\n");

  const lettrePrompt = [
    "Voici mon CV :",
    `"""${cvText.slice(0, 5000)}"""`,
    "",
    offerBlock,
    "",
    "Rédige ma lettre de motivation pour cette offre : 250 à 350 mots,",
    "- Accroche liée à l'offre et à l'entreprise ;",
    "- Un paragraphe sur l'adéquation de mes compétences avec les besoins, avec des exemples tirés de mon CV ;",
    "- Un paragraphe sur ma motivation pour ce rôle précis ;",
    "- Conclusion avec demande d'entretien ;",
    "- Signature avec le nom présent dans le CV si disponible.",
  ].join("\n");

  // 2) Génération CV + lettre en parallèle, puis score et conseils (optionnels)
  try {
    const [cv, lettre] = await Promise.all([
      groqChat({ system: CV_SYSTEM, user: cvPrompt, maxTokens: 4000, temperature: 0.5 }),
      groqChat({ system: LETTRE_SYSTEM, user: lettrePrompt, maxTokens: 2000, temperature: 0.6 }),
    ]);

    let score: number | null = null;
    let conseils: string[] = [];
    try {
      const r = await groqJSON<{ score: number; conseils: string[] }>({
        system: SCORE_SYSTEM,
        user: `CV du candidat :\n"""${cvText.slice(0, 5000)}"""\n\n${offerBlock}\n\nÉvalue la compatibilité et renvoie UNIQUEMENT ce JSON : {"score": <nombre entre 0 et 100>, "conseils": ["<conseil 1>", "<conseil 2>", "<conseil 3>"]}`,
        maxTokens: 300,
        temperature: 0.2,
      });
      score = clampScore(r.score);
      conseils = Array.isArray(r.conseils) ? r.conseils.slice(0, 3) : [];
    } catch {
      // Le score est un plus : ne fait jamais échouer la génération
    }

    const response: DossierResponse = { cv, lettre, score, conseils, warnings };
    return NextResponse.json(response);
  } catch (err) {
    const code = err instanceof GroqError ? err.code : "UNKNOWN";
    const message = err instanceof Error ? err.message : "La génération n'a pas abouti";
    return NextResponse.json({ error: message, code }, { status: 502 });
  }
}