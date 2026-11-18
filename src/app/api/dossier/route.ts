import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applicationPackageSchema } from "@/lib/schemas";
import { generateStructured } from "@/lib/ai";
import { fetchJobPageFromUrl, JobScrapeError } from "@/lib/job-apis";
import { requireAiAccess } from "@/lib/ai-guard";
import { sanitizeExtractedText } from "@/lib/file-security";
import { prisma } from "@/lib/prisma";
import type { CandidateInfo } from "@/lib/types";

/**
 * PARTIE 2 — Route « CV & Lettre par offre » utilisée par DossierPanel.
 *
 * Cette route était ABSENTE du dépôt (appel POST /api/dossier sans handler) :
 * c'est exactement la cause du bug « les dossiers générés ne sont pas stockés
 * dans les historiques ». Elle est désormais complète :
 *  - génération du dossier complet (CV optimisé, lettre, kit entretien),
 *  - calcul du score de compatibilité offre ↔ CV,
 *  - rendu Markdown prêt à l'affichage (contrat du panneau),
 *  - SAUVEGARDE AUTOMATIQUE dans l'historique (GeneratedApplication),
 *  - quotas de licence + anti-abus (PARTIE 3).
 */

export const maxDuration = 120;

const bodySchema = z.object({
  offerUrl: z.string().url().optional().or(z.literal("")),
  offerTitle: z.string().trim().min(2, "Titre de l'offre trop court.").max(200),
  offerDescription: z.string().max(20_000).optional().default(""),
  cvText: z.string().min(80, "Le texte du CV est trop court.").max(24_000),
});

const SYSTEM_PROMPT = `Tu es NexiRole, un expert senior du recrutement et du personal branding avec 15 ans d'expérience dans le sourcing de talents et la rédaction de candidatures.

Ta mission : analyser une offre d'emploi et le profil d'un candidat pour produire un dossier de candidature complet, prêt à envoyer, en français.

RÈGLES ABSOLUES :
1. N'invente JAMAIS d'expérience, de diplôme, de certification, d'entreprise ou de date absents du profil. Tu réorganises et reformules uniquement ce qui existe déjà.
2. Utilise les mots-clés EXACTS de l'annonce (technologies, outils, soft skills) dans le résumé, les réalisations et les compétences, uniquement si le candidat possède la compétence ou un équivalent démontré.
3. Le CV doit être compatible ATS : formulations claires, verbes d'action, réalisations quantifiées quand les données existent.
4. La lettre de motivation doit être humaine, persuasive, non générique.
5. Le kit d'entretien contient 3 questions réellement probables pour CE poste, avec réponses structurées (méthode STAR) et un conseil actionnable chacune.
6. Les messages d'approche LinkedIn et email doivent être courts, personnalisés, terminés par une question ouverte.
7. Écris tout en français professionnel, sauf les termes techniques utilisés en anglais dans l'annonce.`;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "are", "our", "this", "that", "have",
  "from", "will", "your", "all", "not", "but", "has", "was", "who", "its",
  "can", "may", "also", "more", "than", "les", "des", "une", "dans", "pour",
  "avec", "sur", "aux", "par", "est", "sont", "nous", "vous", "leur", "vos",
  "plus", "tout", "tous", "cette", "cela", "chez", "sans", "jobs", "job",
  "team", "work", "experience", "recherche", "candidat", "offre", "poste",
  "entreprise", "remote", "cdi", "cdd", "ans", "h/f",
]);

function clamp(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

/** Score de compatibilité local (recouvrement de mots-clés CV ↔ offre), 0-100. */
function compatibilityScore(cvText: string, offerText: string): number {
  const cvTokens = new Set(tokenize(cvText.slice(0, 6000)));
  const offerTokens = new Set(tokenize(offerText.slice(0, 4000)));
  if (offerTokens.size === 0 || cvTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of offerTokens) {
    if (cvTokens.has(token)) overlap++;
  }
  const ratio = overlap / offerTokens.size;
  return Math.min(95, Math.round(ratio * 170));
}

/* ------------------------------------------------------------------ */
/*  Rendu Markdown (contrat d'affichage de DossierPanel)               */
/* ------------------------------------------------------------------ */

interface CvForMarkdown {
  title: string;
  summary: string;
  experiences: Array<{
    role: string;
    company: string;
    period: string;
    location: string;
    achievements: string[];
  }>;
  education: Array<{ degree: string; school: string; period: string }>;
  skills: string[];
  languages: Array<{ name: string; level: string }>;
  keywordsMatched: string[];
}

interface LetterForMarkdown {
  subject: string;
  greeting: string;
  paragraphs: string[];
  closing: string;
}

function cvToMarkdown(
  cv: CvForMarkdown,
  candidate: CandidateInfo | null
): string {
  const lines: string[] = [];
  const name = candidate?.fullName?.trim();
  if (name) lines.push(`# ${name}`, `**${cv.title}**`, "");
  else lines.push(`# ${cv.title}`, "");

  const contacts = [
    candidate?.email,
    candidate?.phone,
    candidate?.location,
    candidate?.linkedin,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  if (contacts.length > 0) lines.push(contacts.join(" · "), "");

  lines.push("## Profil", cv.summary, "");

  if (cv.experiences.length > 0) {
    lines.push("## Expériences professionnelles");
    for (const exp of cv.experiences) {
      lines.push(
        "",
        `### ${exp.role} — ${exp.company}`,
        `_${exp.period}${exp.location ? ` · ${exp.location}` : ""}_`
      );
      for (const achievement of exp.achievements) {
        lines.push(`- ${achievement}`);
      }
    }
    lines.push("");
  }

  if (cv.education.length > 0) {
    lines.push("## Formation");
    for (const edu of cv.education) {
      lines.push(`- **${edu.degree}** — ${edu.school} (${edu.period})`);
    }
    lines.push("");
  }

  if (cv.skills.length > 0) {
    lines.push("## Compétences", cv.skills.join(", "), "");
  }

  if (cv.languages.length > 0) {
    lines.push(
      "## Langues",
      cv.languages.map((lang) => `${lang.name} (${lang.level})`).join(", "),
      ""
    );
  }

  if (cv.keywordsMatched.length > 0) {
    lines.push(
      "## Mots-clés de l'offre intégrés",
      cv.keywordsMatched.join(", ")
    );
  }

  return lines.join("\n").trim();
}

function letterToMarkdown(letter: LetterForMarkdown): string {
  return [
    `**Objet : ${letter.subject}**`,
    "",
    letter.greeting,
    "",
    ...letter.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    letter.closing,
  ]
    .join("\n")
    .trim();
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  /* 0. Anti-abus + quotas de licence (PARTIE 3) */
  const access = await requireAiAccess(request, "generation", "dossier");
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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Paramètres invalides." },
      { status: 400 }
    );
  }

  const { offerUrl, offerTitle, offerDescription, cvText } = parsed.data;

  /* 1. Contenu de l'offre : URL scrapée + champs saisis ---------------- */
  let offerText = sanitizeExtractedText(offerDescription ?? "", 6000);
  let jobSource = "saisie manuelle";

  if (offerUrl) {
    try {
      const scraped = await fetchJobPageFromUrl(offerUrl);
      const scrapedText = sanitizeExtractedText(scraped.text, 6000);
      if (scrapedText.length > offerText.length) {
        offerText = scrapedText;
      }
      jobSource = "URL analysée";
    } catch (error) {
      if (error instanceof JobScrapeError) {
        // Titre + description saisis : on continue avec eux.
        console.warn("[dossier] scraping refusé, repli sur la saisie :", error.message);
      } else {
        console.warn("[dossier] scraping échoué, repli sur la saisie");
      }
    }
  }

  const fullOfferText = [
    `Intitulé du poste : ${offerTitle}`,
    "",
    offerText || "(description non fournie — bases-toi sur l'intitulé du poste)",
  ].join("\n");

  /* 2. Profil candidat : nettoyage anti-injection ---------------------- */
  const candidateText = sanitizeExtractedText(cvText, 12_000);

  /* 3. Génération du dossier ------------------------------------------- */
  try {
    const pkg = await generateStructured({
      schema: applicationPackageSchema,
      system: SYSTEM_PROMPT,
      prompt: [
        "## OFFRE D'EMPLOI (source : " + jobSource + ")",
        clamp(fullOfferText, 6000),
        "",
        "## PROFIL DU CANDIDAT",
        clamp(candidateText, 8000),
        "",
        "## TA PRODUCTION",
        "Génère le dossier complet : coordonnées extraites du CV (n'invente jamais une coordonnée absente), CV optimisé pour cette offre, lettre de motivation sur mesure et kit d'entretien (3 questions + réponses + approches LinkedIn et email).",
      ].join("\n"),
      temperature: 0.45,
      maxOutputTokens: 8000,
    });

    const data = pkg as {
      candidate?: CandidateInfo;
      job?: { title?: string; company?: string; location?: string };
      cv?: CvForMarkdown;
      coverLetter?: LetterForMarkdown;
      interviewKit?: {
        questions: Array<{ question: string; suggestedAnswer: string; tip: string }>;
        outreachLinkedin: string;
        outreachEmail: string;
      };
    };

    if (!data.cv || !data.coverLetter) {
      throw new Error("structure du dossier incomplète");
    }

    /* 4. Score + conseils (astuces du kit d'entretien) ------------------ */
    const score = compatibilityScore(candidateText, fullOfferText);
    const conseils = (data.interviewKit?.questions ?? [])
      .map((question) => question.tip)
      .filter(Boolean)
      .slice(0, 3);

    /* 5. SAUVEGARDE AUTOMATIQUE dans l'historique (correctif du bug) ---- */
    let savedId: string | null = null;
    if (access.ctx.userId) {
      try {
        const saved = await prisma.generatedApplication.create({
          data: {
            userId: access.ctx.userId,
            jobTitle: data.job?.title?.trim() || offerTitle,
            companyName: data.job?.company?.trim() || "Non précisée",
            jobUrl: offerUrl || null,
            templateId: "moderne",
            withPhoto: false,
            cvJson: (data.cv ?? {}) as unknown as import("@/generated/prisma/client").Prisma.InputJsonValue,
            coverLetter: JSON.stringify(data.coverLetter ?? {}),
            interviewKitJson: (data.interviewKit ?? null) as import("@/generated/prisma/client").Prisma.InputJsonValue,
            candidateJson: (data.candidate ?? null) as unknown as import("@/generated/prisma/client").Prisma.InputJsonValue,
            initialScore: score,
          },
        });
        savedId = saved.id;
      } catch (error) {
        console.error("[dossier] sauvegarde historique échouée :", error);
      }
    }

    /* 6. Réponse au panneau (Markdown prêt à l'affichage) --------------- */
    return NextResponse.json({
      cv: cvToMarkdown(data.cv, data.candidate ?? null),
      lettre: letterToMarkdown(data.coverLetter),
      score,
      conseils,
      warnings: [] as string[],
      savedId,
      saved: Boolean(savedId),
    });
  } catch (error) {
    console.error("[dossier]", error);
    return NextResponse.json(
      {
        error:
          "La génération a échoué (moteur IA momentanément indisponible ?). Réessaie dans un instant.",
        code: "AI_GENERATION_FAILED",
      },
      { status: 502 }
    );
  }
}
