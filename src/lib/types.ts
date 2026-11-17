/**
 * Types partagés entre le frontend et les réponses des routes API.
 */
// src/lib/types.ts

export type JobSource = "Remotive" | "Arbeitnow";

export type ScoredJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: JobSource;
  score: number; // 0-100
  reason: string; // justification courte
  aiScored: boolean; // true = score IA, false = fallback mots-clés
  description: string;
};

export type ScanResponse = {
  jobs: ScoredJob[];
  warnings: string[];
  aiAvailable: boolean;
  cvName: string | null;
  totalFound: number;
  totalKept: number;
};

export type DossierResponse = {
  cv: string;
  lettre: string;
  score: number | null;
  conseils: string[];
  warnings: string[];
};


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