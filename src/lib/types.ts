/**
 * Types partagés entre le frontend et les réponses des routes API.
 */
import type { z } from "zod";
import type {
  applicationPackageSchema,
  optimizedCvSchema,
  coverLetterSchema,
  interviewKitSchema,
  dossierSchema,
} from "@/lib/schemas";

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

export interface KeywordInsights {
  /** Titre de poste principal déduit du CV (ou saisi par l'utilisateur) */
  titre: string;
  /** 3 compétences / mots-clés techniques les plus forts */
  motsCles: string[];
}

export type KeywordsSource = "ia" | "local" | "utilisateur";

export interface SearchJobsResponse {
  jobs: ScoredJob[];
  sources: { remotive: boolean; arbeitnow: boolean };
  engine?: string;
  partialScoring?: boolean;
  message?: string;
}

/** Réponse de l'Agent de recherche (/api/agent/scan) */
export interface ScanResponse {
  keywords?: KeywordInsights;
  keywordsSource?: KeywordsSource;
  jobs: ScoredJob[];
  sources: { remotive: boolean; arbeitnow: boolean };
  engine?: string;
  partialScoring?: boolean;
  message?: string;
}

/** Réponse du générateur de dossier (/api/dossier) */
export interface DossierResponse {
  data: DossierData;
  id?: string;
  saved: boolean;
  engine?: string;
  message?: string;
}

/* Types dérivés des schémas Zod (imports type-only, zéro coût runtime) */
export type OptimizedCvType = z.infer<typeof optimizedCvSchema>;
export type CoverLetterType = z.infer<typeof coverLetterSchema>;
export type InterviewKitType = z.infer<typeof interviewKitSchema>;
export type ApplicationPackageType = z.infer<typeof applicationPackageSchema>;

/** Dossier complet structuré — consommé par les 4 templates PDF et l'aperçu HTML */
export type DossierData = z.infer<typeof dossierSchema>;

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
    target: any;
    target: any;
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

/* ------------------------------------------------------------------ */
/*  Historique utilisateur                                             */
/* ------------------------------------------------------------------ */

export interface HistoryItemDossier {
  id: string;
  offreTitre: string;
  offreUrl?: string | null;
  offreEntreprise?: string | null;
  templateId: string;
  data: DossierData;
  createdAt: string;
}

export interface HistoryItemScan {
  id: string;
  requete?: string | null;
  region?: string | null;
  remoteOnly: boolean;
  motscles: KeywordInsights | null;
  nbOffres: number;
  resultats: ScoredJob[];
  createdAt: string;
}

export interface HistoryResponse {
  dossiers: HistoryItemDossier[];
  scans: HistoryItemScan[];
}