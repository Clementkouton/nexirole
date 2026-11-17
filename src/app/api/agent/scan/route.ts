// src/app/api/agent/scan/route.ts
import { NextResponse } from "next/server";
import { groqJSON, mapWithConcurrency, GroqError } from "@/lib/groq";
import { fetchJsonWithRetry } from "@/lib/http";
import { clampScore, stripHtml } from "@/lib/text";
import type { JobSource, ScanResponse, ScoredJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type BaseJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: JobSource;
  description: string;
};

type RemotiveJob = {
  id: number;
  url: string;
  title: string;
  company_name: string;
  publication_date: string;
  candidate_required_location: string;
  description: string;
};

type ArbeitnowJob = {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  location: string;
  url: string | null;
  job_types: string[];
};

type RemotiveResponse = { jobs: RemotiveJob[] };
type ArbeitnowResponse = { data: ArbeitnowJob[] };

type ScanBody = {
  cvText?: string;
  cvName?: string;
  query?: string;
  region?: string;
  remoteOnly?: boolean;
};

const SCORING_SYSTEM =
  "Tu es un expert RH et recruteur technique francophone. Tu évalues la compatibilité entre un CV et une offre d'emploi. Tu réponds STRICTEMENT en JSON valide, sans aucun texte autour.";

const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "are", "not", "but", "all", "can", "out", "get", "has", "his", "her",
  "how", "its", "new", "now", "our", "was", "who", "did", "les", "des", "une", "dans", "pour", "avec", "sur",
  "par", "est", "aux", "que", "qui", "pas", "cette", "mais", "tout", "tous", "plus", "leur", "nous", "vous",
  "elle", "ils", "ont", "son", "ses", "ans", "per", "from", "will", "your", "have", "this", "that", "were",
  "their", "which", "they", "been", "also", "via", "nos", "chez", "poste", "emploi", "offre", "mission",
  "profil", "company", "location", "description", "jobs", "job", "cdi", "cdd",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+#. ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Score de secours par correspondance de mots-clés (quand l'IA est indisponible). */
function keywordScore(cvText: string, job: BaseJob): ScoredJob {
  const freq = new Map<string, number>();
  for (const t of tokenize(cvText)) freq.set(t, (freq.get(t) ?? 0) + 1);

  const keywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([t]) => t);

  const titleTokens = new Set(tokenize(job.title));
  const descTokens = new Set(tokenize(job.description));

  let weight = 0;
  let max = 0;
  for (const k of keywords) {
    max += 3;
    if (titleTokens.has(k)) weight += 3;
    else if (descTokens.has(k)) weight += 1;
  }

  const score = max === 0 ? 0 : Math.min(96, Math.round((weight / max) * 100));
  const matched = keywords.filter((k) => titleTokens.has(k) || descTokens.has(k)).slice(0, 6);

  return {
    ...job,
    score,
    aiScored: false,
    reason: `Correspondance de mots-clés : ${matched.join(", ") || "aucun mot-clé du CV retrouvé dans l'offre"}`,
  };
}

function matchesQuery(job: BaseJob, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = `${job.title} ${job.company} ${job.description.slice(0, 2000)}`.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

function matchesRegion(location: string, region: string): boolean {
  if (!region.trim()) return true;
  const r = region.trim().toLowerCase();
  const l = location.toLowerCase();
  if (l.includes(r)) return true;
  // Les offres "Worldwide / Europe / EMEA" sont accessibles depuis la plupart des pays
  return /(worldwide|anywhere|europe|emea|european union|union europeenne)/.test(l);
}

function isRemoteFriendly(job: BaseJob): boolean {
  if (job.source === "Remotive") return true;
  const hay = `${job.location} ${job.description.slice(0, 800)}`.toLowerCase();
  return /remote|teletravail|télétravail|work from home/.test(hay);
}

export async function POST(req: Request) {
  let body: ScanBody;
  try {
    body = (await req.json()) as ScanBody;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const cvText = (body.cvText ?? "").trim();
  if (cvText.length < 50) {
    return NextResponse.json(
      { error: "Ajoute ton CV (PDF ou texte) avant de lancer le scan — il sert de base au scoring." },
      { status: 400 }
    );
  }

  const query = (body.query ?? "").trim();
  const region = (body.region ?? "").trim();
  const remoteOnly = Boolean(body.remoteOnly);

  // 1) Récupération des deux sources en parallèle, avec dégradation gracieuse
  const warnings: string[] = [];
  let remotive: BaseJob[] = [];
  let arbeitnow: BaseJob[] = [];

  const [remotiveOk, arbeitnowOk] = await Promise.all([
    fetchJsonWithRetry<RemotiveResponse>("https://remotive.com/api/remote-jobs?limit=60", { retries: 1 })
      .then((data) => {
        remotive = (data.jobs ?? []).map((j) => ({
          id: `remotive-${j.id}`,
          title: j.title ?? "Offre sans titre",
          company: j.company_name ?? "Entreprise inconnue",
          location: j.candidate_required_location || "Remote",
          url: j.url,
          source: "Remotive" as JobSource,
          description: stripHtml(j.description ?? "").slice(0, 6000),
        }));
        return true;
      })
      .catch(() => false),
    fetchJsonWithRetry<ArbeitnowResponse>("https://www.arbeitnow.com/api/job-board-api?page=1", { retries: 1 })
      .then((data) => {
        arbeitnow = (data.data ?? []).map((j) => ({
          id: `arbeitnow-${j.slug}`,
          title: j.title ?? "Offre sans titre",
          company: j.company_name ?? "Entreprise inconnue",
          location: j.location || "—",
          url: j.url || `https://www.arbeitnow.com/jobs/${j.slug}`,
          source: "Arbeitnow" as JobSource,
          description: stripHtml(j.description ?? "").slice(0, 6000),
        }));
        return true;
      })
      .catch(() => false),
  ]);

  if (!remotiveOk) {
    warnings.push("Remotive est momentanément indisponible — résultats fournis par Arbeitnow uniquement. Réessaie dans quelques minutes.");
  }
  if (!arbeitnowOk) {
    warnings.push("Arbeitnow est momentanément indisponible — résultats fournis par Remotive uniquement.");
  }

  // 2) Fusion, déduplication, filtres
  const seen = new Set<string>();
  const merged = [...remotive, ...arbeitnow].filter((j) => {
    const key = j.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const filtered = merged.filter((j) => {
    if (remoteOnly && !isRemoteFriendly(j)) return false;
    if (region && !matchesRegion(j.location, region)) return false;
    if (query && !matchesQuery(j, query)) return false;
    return true;
  });

  if (filtered.length === 0 && merged.length > 0) {
    warnings.push("Aucune offre ne correspond à tes filtres — élargis la recherche, change de région ou désactive « Remote uniquement ».");
  }

  const candidates = filtered.slice(0, 40);

  // 3) Scoring IA par lots de 3 (respect des quotas), fallback mots-clés par offre
  let aiFatalError: string | null = null;
  let aiCount = 0;

  const scored: ScoredJob[] = await mapWithConcurrency(candidates, 3, async (job) => {
    if (aiFatalError) return keywordScore(cvText, job);

    try {
      const r = await groqJSON<{ score: number; reasons: string }>({
        system: SCORING_SYSTEM,
        user: [
          "CV du candidat :",
          `"""${cvText.slice(0, 6000)}"""`,
          "",
          "Offre d'emploi :",
          `Titre : ${job.title}`,
          `Entreprise : ${job.company}`,
          `Lieu : ${job.location}`,
          "Description :",
          `"""${job.description.slice(0, 5000)}"""`,
          "",
          'Évalue la compatibilité CV/offre et renvoie UNIQUEMENT ce JSON : {"score": <nombre entre 0 et 100>, "reasons": "<justification en français, 1 à 2 phrases>"}',
        ].join("\n"),
        maxTokens: 250,
        temperature: 0.2,
      });

      aiCount += 1;
      return {
        ...job,
        score: clampScore(r.score),
        reason: (r.reasons ?? "").slice(0, 300) || "Analyse IA effectuée.",
        aiScored: true,
      };
    } catch (err) {
      if (
        err instanceof GroqError &&
        (err.code === "GROQ_NO_KEY" || err.code === "GROQ_AUTH" || err.code === "GROQ_NETWORK")
      ) {
        aiFatalError ??= err.message;
      }
      return keywordScore(cvText, job);
    }
  });

  scored.sort((a, b) => b.score - a.score);

  const aiScoredCount = scored.filter((j) => j.aiScored).length;
  if (scored.length > 0 && aiScoredCount === 0) {
    warnings.push(
      `Analyse IA momentanément indisponible${aiFatalError ? ` (${aiFatalError})` : ""} — classement calculé localement par correspondance de mots-clés. Réessayez plus tard pour l'analyse détaillée.`
    );
  } else if (scored.length > 0 && aiScoredCount < scored.length) {
    warnings.push(`Analyse IA partielle : ${aiScoredCount} offres notées par IA, les autres par correspondance de mots-clés.`);
  }

  const response: ScanResponse = {
    jobs: scored.map((j) => ({ ...j, description: j.description.slice(0, 1500) })),
    warnings,
    aiAvailable: aiScoredCount > 0,
    cvName: body.cvName ?? null,
    totalFound: merged.length,
    totalKept: filtered.length,
  };

  return NextResponse.json(response);
}