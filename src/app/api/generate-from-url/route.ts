import { NextRequest, NextResponse } from "next/server";
import {
  applicationPackageSchema,
  generateFromUrlRequestSchema,
} from "@/lib/schemas";
import { generateStructured } from "@/lib/ai";
import {
  fetchJobPageFromUrl,
  JobScrapeError,
} from "@/lib/job-apis";
import { decodeBase64ToBuffer, extractPdfText } from "@/lib/pdf-extract";
import { requireAiAccess } from "@/lib/ai-guard";
import { sanitizeExtractedText, validatePdfBuffer } from "@/lib/file-security";
import { prisma } from "@/lib/prisma";

export const maxDuration = 120;

const SYSTEM_PROMPT = `Tu es NexiRole, un expert senior du recrutement et du personal branding avec 15 ans d'expérience dans le sourcing de talents et la rédaction de candidatures.

Ta mission : analyser une offre d'emploi et le profil d'un candidat pour produire un dossier de candidature complet, prêt à envoyer, en français.

RÈGLES ABSOLUES :
1. N'invente JAMAIS d'expérience professionnelle, de diplôme, de certification, d'entreprise ou de date qui ne figure pas dans le profil du candidat. Tu réorganises et reformules uniquement ce qui existe déjà.
2. Utilise les mots-clés EXACTS de l'annonce (technologies, outils, soft skills) dans le résumé, les réalisations et les compétences, mais uniquement si le candidat possède réellement la compétence correspondante ou un équivalent direct démontré.
3. Le CV doit être compatible ATS : formulations claires, verbes d'action, réalisations quantifiées quand les données existent.
4. La lettre de motivation doit être humaine, persuasive, non générique : accroche forte, adéquation précise avec les besoins de l'annonce, valeur apportée à l'entreprise, conclusion engageante. Jamais de "Je me permets de vous adresser..." banal.
5. Le kit d'entretien contient 3 questions réellement probables pour CE poste précis, avec des réponses suggérées structurées (méthode STAR quand pertinent) et un conseil actionnable chacune.
6. Les messages d'approche LinkedIn et email doivent être courts, personnalisés (nom du poste + entreprise), et se terminer par une question ouverte simple.
7. Écris tout en français professionnel, sauf les termes techniques qui restent en anglais si l'annonce les utilise ainsi.`;

function clamp(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

export async function POST(request: NextRequest) {
  /* 0. Anti-abus + quotas de licence (PARTIE 3)
        - visiteur anonyme : 5 requêtes/h par IP (429)
        - plan Découverte : 2 dossiers/mois (403 QUOTA_EXCEEDED)            */
  const access = await requireAiAccess(request, "generation", "generate-from-url");
  if (!access.ok) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête JSON invalide." },
      { status: 400 }
    );
  }

  const parsed = generateFromUrlRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paramètres de génération invalides." },
      { status: 400 }
    );
  }

  const { jobUrl, jobText, cvText, cvPdfBase64, profileText } = parsed.data;

  /* 1. Contenu de l'offre : URL scrapée ou texte collé ---------------- */
  let offerText = jobText?.trim() ?? "";
  let jobSource = "texte collé";

  if (!offerText && jobUrl) {
    try {
      const scraped = await fetchJobPageFromUrl(jobUrl);
      offerText = scraped.text;
    } catch (error) {
      if (error instanceof JobScrapeError) {
        return NextResponse.json(
          {
            error: error.message,
            code: "SCRAPING_BLOCKED",
          },
          { status: 422 }
        );
      }
      return NextResponse.json(
        {
          error:
            "La récupération de l'offre a échoué. Collez le texte de l'annonce manuellement.",
          code: "SCRAPING_BLOCKED",
        },
        { status: 422 }
      );
    }
  } else if (offerText && jobUrl) {
    try {
      // L'utilisateur a fourni les deux : on préfère le contenu réel de la page si accessible.
      const scraped = await fetchJobPageFromUrl(jobUrl);
      if (scraped.text.length > offerText.length) {
        offerText = scraped.text;
        jobSource = "URL analysée";
      }
    } catch {
      // Le scraping échoue : on garde le texte collé sans bloquer l'utilisateur.
      jobSource = "texte collé";
    }
  }

  if (offerText && jobUrl) {
    jobSource = "URL analysée";
  }

  if (!offerText || offerText.length < 80) {
    return NextResponse.json(
      {
        error:
          "Aucun contenu d'offre exploitable. Collez une URL valide ou le texte complet de l'annonce.",
        code: "NO_JOB_CONTENT",
      },
      { status: 400 }
    );
  }

  // Nettoyage anti-injection de prompt + plafond de contexte (PARTIE 3)
  offerText = sanitizeExtractedText(offerText, 6000);

  /* 2. Profil du candidat : CV PDF ou texte rapide ------------------- */
  let candidateText = "";

  if (cvPdfBase64) {
    try {
      const buffer = decodeBase64ToBuffer(cvPdfBase64);
      // Sécurité : 5 Mo max, MIME application/pdf, octets magiques %PDF-
      const check = validatePdfBuffer(buffer, "application/pdf");
      if (!check.ok) {
        return NextResponse.json(
          { error: check.error, code: "PDF_REJECTED" },
          { status: check.status }
        );
      }
      candidateText = await extractPdfText(buffer);
    } catch {
      return NextResponse.json(
        {
          error:
            "La lecture du PDF a échoué. Vérifiez que le fichier est un PDF texte (non scanné) ou utilisez le profil rapide.",
          code: "PDF_PARSE_FAILED",
        },
        { status: 422 }
      );
    }
  } else if (cvText?.trim()) {
    candidateText = cvText.trim();
  } else if (profileText?.trim()) {
    candidateText = profileText.trim();
  }

  candidateText = sanitizeExtractedText(candidateText, 10_000);

  if (candidateText.length < 60) {
    return NextResponse.json(
      {
        error:
          "Profil du candidat trop court. Importez votre CV PDF ou renseignez votre profil rapide (experiences, compétences, formation).",
        code: "NO_CANDIDATE_CONTENT",
      },
      { status: 400 }
    );
  }

  /* 3. Génération du dossier complet via le moteur IA ---------------- */
  const prompt = [
    "## OFFRE D'EMPLOI (source : " + jobSource + ")",
    clamp(offerText, 6000),
    "",
    "## PROFIL DU CANDIDAT",
    clamp(candidateText, 8000),
    "",
    "## TA PRODUCTION",
    "Génère le dossier de candidature complet : coordonnées du candidat extraites du CV (n'invente jamais une coordonnée absente), CV optimisé pour cette offre, lettre de motivation sur mesure et kit de préparation entretien (3 questions + réponses + messages d'approche LinkedIn et email).",
  ].join("\n");

  try {
    const pkg = await generateStructured({
      schema: applicationPackageSchema,
      system: SYSTEM_PROMPT,
      prompt,
      temperature: 0.45,
      maxOutputTokens: 8000,
    });

    /* 4. Historique : sauvegarde AUTOMATIQUE du dossier (PARTIE 2).
          Correctif du bug « les dossiers générés ne sont pas stockés
          dans les historiques ». La sauvegarde ne bloque jamais
          l'affichage du dossier à l'utilisateur.                       */
    let savedId: string | null = null;
    if (access.ctx.userId) {
      const pkgData = pkg as {
        candidate?: unknown;
        job?: { title?: string; company?: string };
        cv?: unknown;
        coverLetter?: unknown;
        interviewKit?: unknown;
      };
      try {
        const saved = await prisma.generatedApplication.create({
          data: {
            userId: access.ctx.userId,
            jobTitle: pkgData.job?.title?.trim() || jobUrl || "Offre sans titre",
            companyName: pkgData.job?.company?.trim() || "Non précisée",
            jobUrl: jobUrl ?? null,
            templateId: "moderne",
            withPhoto: false,
            cvJson: (pkgData.cv ?? {}) as import("@/generated/prisma/client").Prisma.InputJsonValue,
            coverLetter: JSON.stringify(pkgData.coverLetter ?? {}),
            interviewKitJson: (pkgData.interviewKit ?? null) as import("@/generated/prisma/client").Prisma.InputJsonValue,
            candidateJson: (pkgData.candidate ?? null) as import("@/generated/prisma/client").Prisma.InputJsonValue,
          },
        });
        savedId = saved.id;
      } catch (error) {
        console.error("[generate-from-url] sauvegarde historique échouée :", error);
      }
    }

    return NextResponse.json({
      candidate: (pkg as { candidate?: unknown }).candidate,
      job: (pkg as { job?: unknown }).job,
      cv: (pkg as { cv?: unknown }).cv,
      coverLetter: (pkg as { coverLetter?: unknown }).coverLetter,
      interviewKit: (pkg as { interviewKit?: unknown }).interviewKit,
      meta: {
        jobSource,
        engine: process.env.GROQ_API_KEY
          ? "groq/llama-3.3-70b-versatile"
          : "moteur-secours-local",
        generatedAt: new Date().toISOString(),
      },
      savedId,
      saved: Boolean(savedId),
    });
  } catch (error) {
    console.error("[generate-from-url]", error);
    return NextResponse.json(
      {
        error:
          "Le moteur IA n'a pas réussi à produire le dossier. Réessayez — si le problème persiste, vérifiez la configuration de GROQ_API_KEY.",
        code: "AI_GENERATION_FAILED",
      },
      { status: 502 }
    );
  }
}
