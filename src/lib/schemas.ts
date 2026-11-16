import { z } from "zod";

/* ------------------------------------------------------------------ */
/*  CV optimisé                                                        */
/* ------------------------------------------------------------------ */

export const optimizedCvSchema = z.object({
  title: z
    .string()
    .describe("Titre professionnel aligné sur l'intitulé exact de l'offre"),
  summary: z
    .string()
    .describe("Résumé professionnel percutant de 3 à 4 phrases, adapté à l'offre"),
  experiences: z
    .array(
      z.object({
        role: z.string().describe("Intitulé du poste"),
        company: z.string().describe("Nom de l'entreprise"),
        period: z.string().describe("Période, ex: 2022 — Aujourd'hui"),
        location: z.string().describe("Ville ou Remote"),
        achievements: z
          .array(z.string())
          .describe(
            "3 à 5 réalisations reformulées avec les mots-clés exacts de l'annonce, sans inventer de fausses expériences"
          ),
      })
    )
    .describe("Expériences professionnelles du candidat, reformulées pour l'offre"),
  education: z
    .array(
      z.object({
        degree: z.string(),
        school: z.string(),
        period: z.string(),
      })
    )
    .describe("Formations"),
  skills: z
    .array(z.string())
    .describe("Compétences triées par priorité pour cette offre (10 à 14 maximum)"),
  languages: z
    .array(z.object({ name: z.string(), level: z.string() }))
    .describe("Langues avec niveau, si présentes dans le CV source"),
  keywordsMatched: z
    .array(z.string())
    .describe("Mots-clés de l'offre trouvés et intégrés dans le CV"),
});

export type OptimizedCv = z.infer<typeof optimizedCvSchema>;

/* ------------------------------------------------------------------ */
/*  Lettre de motivation                                               */
/* ------------------------------------------------------------------ */

export const coverLetterSchema = z.object({
  subject: z.string().describe("Objet du mail / de la lettre, court et précis"),
  greeting: z.string().describe("Salutation initiale, ex: Madame, Monsieur,"),
  paragraphs: z
    .array(z.string())
    .min(3)
    .max(5)
    .describe(
      "4 paragraphes persuasifs : accroche + adéquation au poste, valeur apportée à l'entreprise, preuve concrète, conclusion engageante"
    ),
  closing: z.string().describe("Formule de politesse professionnelle"),
});

export type CoverLetter = z.infer<typeof coverLetterSchema>;

/* ------------------------------------------------------------------ */
/*  Kit de préparation entretien                                       */
/* ------------------------------------------------------------------ */

export const interviewKitSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string(),
        suggestedAnswer: z.string().describe("Meilleure réponse suggérée, structurée"),
        tip: z.string().describe("Conseil rapide pour briller sur cette question"),
      })
    )
    .length(3)
    .describe("3 questions probables en entretien pour ce poste précis"),
  outreachLinkedin: z
    .string()
    .describe("Message court d'approche LinkedIn au recruteur (600 caractères max)"),
  outreachEmail: z
    .string()
    .describe("Message court d'approche email au recruteur (600 caractères max)"),
});

export type InterviewKit = z.infer<typeof interviewKitSchema>;

/* ------------------------------------------------------------------ */
/*  Paquet complet de candidature                                      */
/* ------------------------------------------------------------------ */

export const applicationPackageSchema = z.object({
  candidate: z
    .object({
      fullName: z.string().describe("Nom complet du candidat tel qu'il figure dans le CV"),
      email: z.string().describe("Email du candidat, chaîne vide si absent du CV"),
      phone: z.string().describe("Téléphone, chaîne vide si absent"),
      location: z.string().describe("Ville / pays, chaîne vide si absent"),
      linkedin: z.string().describe("URL ou pseudo LinkedIn, chaîne vide si absent"),
    })
    .describe(
      "Coordonnées du candidat extraites du CV fourni — ne JAMAIS inventer une information absente"
    ),
  job: z.object({
    title: z.string().describe("Intitulé de l'offre"),
    company: z.string().describe("Entreprise (ou 'Non précisée')"),
    location: z.string().describe("Lieu ou Remote (ou 'Non précisé')"),
  }),
  cv: optimizedCvSchema,
  coverLetter: coverLetterSchema,
  interviewKit: interviewKitSchema,
});

export type ApplicationPackage = z.infer<typeof applicationPackageSchema>;

/* ------------------------------------------------------------------ */
/*  Scoring d'offres (Agent de recherche)                              */
/* ------------------------------------------------------------------ */

export const jobScoreBatchSchema = z.object({
  results: z
    .array(
      z.object({
        index: z.number().int().describe("Index de l'offre dans la liste fournie"),
        score: z
          .number()
          .min(0)
          .max(100)
          .describe("Score de compatibilité CV ↔ offre de 0 à 100"),
        strengths: z
          .array(z.string())
          .describe("2 à 4 points forts du profil qui correspondent à l'offre"),
        missingSkills: z
          .array(z.string())
          .describe("1 à 4 compétences ou mots-clés manquants côté candidat"),
        advice: z
          .string()
          .describe("Un conseil d'adaptation rapide et concret en une phrase"),
      })
    )
    .describe("Un résultat par offre fournie, avec son index exact"),
});

export type JobScoreBatch = z.infer<typeof jobScoreBatchSchema>;
export type JobScore = JobScoreBatch["results"][number];

/* ------------------------------------------------------------------ */
/*  Amélioration de texte (CV Builder)                                 */
/* ------------------------------------------------------------------ */

export const improvedTextSchema = z.object({
  improved: z.string().describe("Version améliorée, professionnelle et concise"),
});

/* ------------------------------------------------------------------ */
/*  API payload types                                                  */
/* ------------------------------------------------------------------ */

export const generateFromUrlRequestSchema = z.object({
  jobUrl: z.string().url().optional(),
  jobText: z.string().optional(),
  cvText: z.string().optional(),
  cvPdfBase64: z.string().optional(),
  profileText: z.string().optional(),
});

export const searchJobsRequestSchema = z.object({
  cvText: z.string().min(1).optional(),
  cvPdfBase64: z.string().optional(),
  jobTitle: z.string().optional(),
  location: z.string().optional(),
  remoteOnly: z.boolean().optional(),
});

export const downloadPdfRequestSchema = z.object({
  kind: z.enum(["cv", "cover-letter"]),
  data: z.unknown(),
});

/** Payload pour l'export PDF du CV optimisé. */
export const cvPdfPayloadSchema = z.object({
  cv: optimizedCvSchema,
  candidateName: z.string().optional(),
  contact: z
    .object({
      email: z.string().optional(),
      phone: z.string().optional(),
      location: z.string().optional(),
      linkedin: z.string().optional(),
    })
    .optional(),
});

/** Payload pour l'export PDF de la lettre de motivation. */
export const coverLetterPdfPayloadSchema = z.object({
  letter: coverLetterSchema,
  candidateName: z.string().optional(),
  jobTitle: z.string().optional(),
  company: z.string().optional(),
  contact: z
    .object({
      email: z.string().optional(),
      phone: z.string().optional(),
      location: z.string().optional(),
    })
    .optional(),
});

export const improveTextRequestSchema = z.object({
  label: z.string().describe("Nom du champ à améliorer, ex: Résumé professionnel"),
  text: z.string().min(1),
  context: z.string().optional(),
});
