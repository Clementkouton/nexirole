/**
 * Types partagés entre le frontend et les réponses des routes API.
 */

export type JobSource = "remotive" | "arbeitnow";

export interface RawJob {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  source: JobSource;
  postedAt?: string;
  tags: string[];
}

export interface ScoredJob extends RawJob {
  score: number;
  strengths: string[];
  missingSkills: string[];
  advice: string;
  /** "ia" = analyse Groq ; "mots-cles" = score local de repli */
  scoreSource: "ia" | "mots-cles";
}

export interface ScanJob extends ScoredJob {
  /** Raison du score produite par l'IA (vide si repli local). */
  reason: string;
  /** true si le score vient de l'IA, false s'il vient du calcul local. */
  aiScored: boolean;
}

export interface ScanResponse {
  ok: boolean;
  jobs: ScanJob[];
  totalFound: number;
  totalKept: number;
  aiAvailable: boolean;
  warnings: string[];
  message?: string;
}

export interface SearchJobsResponse {
  jobs: ScoredJob[];
  sources: { remotive: boolean; arbeitnow: boolean };
  engine?: string;
  partialScoring?: boolean;
  message?: string;
}

export interface CandidateInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
}

export interface ApplicationResponse {
  candidate: CandidateInfo;
  job: { title: string; company: string; location: string };
  cv: OptimizedCvType;
  coverLetter: CoverLetterType;
  interviewKit: InterviewKitType;
  meta: {
    jobSource: string;
    engine: string;
    generatedAt: string;
  };
}

/**
 * Réponse de la route /api/dossier (« CV & Lettre par offre »).
 * `cv` et `lettre` sont des chaînes Markdown prêtes à l'affichage ;
 * `savedId` / `saved` indiquent la sauvegarde automatique dans
 * l'historique (Partie 2 — modèle GeneratedApplication).
 */
export interface DossierResponse {
  cv: string;
  lettre: string;
  score?: number;
  conseils?: string[];
  warnings?: string[];
  savedId?: string | null;
  saved?: boolean;
}

/* Types dérivés des schémas Zod (imports type-only, zéro coût runtime) */
import type { z } from "zod";
import type {
  applicationPackageSchema,
  optimizedCvSchema,
  coverLetterSchema,
  interviewKitSchema,
} from "@/lib/schemas";

export type OptimizedCvType = z.infer<typeof optimizedCvSchema>;
export type CoverLetterType = z.infer<typeof coverLetterSchema>;
export type InterviewKitType = z.infer<typeof interviewKitSchema>;
export type ApplicationPackageType = z.infer<typeof applicationPackageSchema>;

/* Données du CV Builder (formulaire guidé) */
export interface CvBuilderData {
  personal: {
    fullName: string;
    title: string;
    email: string;
    phone: string;
    location: string;
    linkedin: string;
  };
  summary: string;
  experiences: Array<{
    target: unknown;
    id: string;
    role: string;
    company: string;
    period: string;
    location: string;
    achievements: string[];
  }>;
  education: Array<{
    id: string;
    degree: string;
    school: string;
    period: string;
  }>;
  skills: string[];
  languages: Array<{ id: string; name: string; level: string }>;
}

export interface CvFileValue {
  name: string;
  size: number;
  base64: string;
}
