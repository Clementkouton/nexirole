import { NextRequest, NextResponse } from "next/server";
import {
  jobScoreBatchSchema,
  searchJobsRequestSchema,
} from "@/lib/schemas";
import { generateStructured } from "@/lib/ai";
import {
  fetchArbeitnowJobs,
  fetchRemotiveJobs,
  stripHtml,
  type RawJob,
} from "@/lib/job-apis";
import { decodeBase64ToBuffer, extractPdfText } from "@/lib/pdf-extract";

export const maxDuration = 120;

const SCORING_SYSTEM_PROMPT = `Tu es NexiRole, un cabinet de recrutement technique spécialisé dans le matching candidat ↔ offre.

Pour chaque offre fournie (identifiée par son index), tu évalues la compatibilité avec le profil du candidat et tu renvoies un score de 0 à 100 :
- 80-100 : profil très aligné, candidature à envoyer immédiatement.
- 60-79 : profil solide avec quelques écarts comblables.
- 40-59 : pertinence partielle, adaptations nécessaires.
- 0-39 : faible pertinence.

Barème indicatif : adéquation des compétences techniques (50 %), séniorité/expérience requise vs candidat (25 %), secteur/domaine et contexte du poste (15 %), localisation/remote/langues (10 %).

Points forts : 2 à 4 éléments précis du profil qui répondent aux besoins de l'offre (ne cite pas la compétence seule, donne le contexte, ex: "3 ans d'expérience React demandés par l'offre").
Compétences manquantes : 1 à 4 exigences de l'annonce que le profil ne couvre pas clairement.
Conseil : une seule phrase, concrète et immédiate (ex: "Mette en avant ton projet X avec GraphQL dans le résumé du CV").
Réponds en français. Ne fabrique aucun élément absent du profil ou de l'offre.`;

interface ScoredJob extends RawJob {
  score: number;
  strengths: string[];
  missingSkills: string[];
  advice: string;
}

function clamp(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

function normalizeFilter(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Filtre souple : garde les offres dont le titre contient au moins un mot-clé du filtre. */
function matchesTitleFilter(job: RawJob, filter: string): boolean {
  const tokens = normalizeFilter(filter)
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return true;
  const haystack = normalizeFilter(`${job.title} ${job.tags.join(" ")}`);
  return tokens.some((token) => haystack.includes(token));
}

interface ScoreValue {
  score: number;
  strengths: string[];
  missingSkills: string[];
  advice: string;
  scoreSource: "ia" | "mots-cles";
}

interface ScoredJob extends RawJob {
  score: number;
  strengths: string[];
  missingSkills: string[];
  advice: string;
  scoreSource: "ia" | "mots-cles";
}

const STOPWORDS = new Set([
  "the","and","for","with","you","are","our","this","that","have","from","will","your","all","not","but","has","was","who","its","can","may","also","more","than","les","des","une","dans","pour","avec","sur","aux","par","est","sont","nous","vous","leur","vos","plus","tout","tous","cette","cela","chez","sans","être","avoir","font","fait","ainsi","alors","jobs","job","team","work","experience","experience","recherche","candidat","candidats","offre","offres","poste","entreprise","remote","cdi","cdd","h/f","ans"
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

/**
 * Score de repli calculé localement : recouvrement de mots-clés CV ↔ offre.
 * Utilisé quand le moteur IA est indisponible ou saturé, pour conserver
 * un classement pertinent plutôt que des scores nuls.
 */
function localKeywordScore(job: RawJob, cvTokens: Set<string>): number {
  const jobTokens = new Set(
    tokenize(`${job.title} ${job.tags.join(" ")} ${job.description.slice(0, 900)}`)
  );
  if (jobTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of jobTokens) {
    if (cvTokens.has(token)) overlap++;
  }
  const ratio = overlap / jobTokens.size;
  return Math.min(95, Math.round(ratio * 170));
}

/** Scoring de toutes les offres en un seul appel IA (payload compact). */
async function scoreJobs(
  jobList: Array<{ job: RawJob; index: number }>,
  cvText: string
): Promise<Map<number, ScoreValue>> {
  const compactList = jobList
    .map(
      ({ job, index }) =>
        [
          `### OFFRE index=${index}`,
          `Titre : ${job.title}`,
          `Entreprise : ${job.company}`,
          `Lieu : ${job.location}`,
          `Tags : ${job.tags.join(", ") || "aucun"}`,
          `Description : ${clamp(job.description, 700)}`,
        ].join("\n")
    )
    .join("\n\n");

  const result = await generateStructured({
    schema: jobScoreBatchSchema,
    system: SCORING_SYSTEM_PROMPT,
    prompt: [
      "## PROFIL DU CANDIDAT (extrait du CV)",
      clamp(cvText, 4000),
      "",
      "## OFFRES À ÉVALUER",
      compactList,
      "",
      "Évalue chaque offre et renvoie exactement un résultat par index fourni (" +
        jobList.map((b) => b.index).join(", ") +
        "). Reste synthétique : forces et lacunes en 5 mots maximum chacun, conseil en une phrase.",
    ].join("\n"),
    temperature: 0.2,
    maxOutputTokens: 4000,
  });

  const map = new Map<number, ScoreValue>();
  for (const item of result.results) {
    map.set(item.index, {
      score: Math.round(item.score),
      strengths: item.strengths,
      missingSkills: item.missingSkills,
      advice: item.advice,
      scoreSource: "ia",
    });
  }
  return map;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête JSON invalide." },
      { status: 400 }
    );
  }

  const parsed = searchJobsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paramètres de recherche invalides." },
      { status: 400 }
    );
  }

  const { cvText, cvPdfBase64, jobTitle, location, remoteOnly } = parsed.data;

  /* 1. Profil du candidat -------------------------------------------- */
  let candidateText = "";
  if (cvPdfBase64) {
    try {
      const buffer = decodeBase64ToBuffer(cvPdfBase64);
      if (buffer.length > 10 * 1024 * 1024) {
        return NextResponse.json(
          { error: "Le CV PDF dépasse la taille maximale de 10 Mo." },
          { status: 413 }
        );
      }
      candidateText = await extractPdfText(buffer);
    } catch {
      return NextResponse.json(
        {
          error:
            "La lecture du CV PDF a échoué. Vérifiez que le fichier est un PDF texte (non scanné).",
          code: "PDF_PARSE_FAILED",
        },
        { status: 422 }
      );
    }
  } else if (cvText?.trim()) {
    candidateText = cvText.trim();
  }

  if (candidateText.length < 60) {
    return NextResponse.json(
      {
        error:
          "Importez d'abord votre CV PDF (ou un profil texte suffisant) pour activer le scoring.",
        code: "NO_CANDIDATE_CONTENT",
      },
      { status: 400 }
    );
  }

  /* 2. Recherche en parallèle : Remotive + Arbeitnow ------------------ */
  const searchQuery = jobTitle?.trim() ?? "";
  const [remotiveResult, arbeitnowPage1, arbeitnowPage2] = await Promise.all([
    fetchRemotiveJobs(searchQuery, 20),
    fetchArbeitnowJobs(1),
    fetchArbeitnowJobs(2),
  ]);

  let jobs: RawJob[] = [
    ...remotiveResult,
    ...arbeitnowPage1,
    ...arbeitnowPage2,
  ];

  const sourcesStatus = {
    remotive: remotiveResult.length > 0,
    arbeitnow: arbeitnowPage1.length + arbeitnowPage2.length > 0,
  };

  if (!sourcesStatus.remotive && !sourcesStatus.arbeitnow) {
    return NextResponse.json(
      {
        error:
          "Les deux sources d'offres sont injoignables pour le moment. Réessayez dans quelques instants.",
        code: "SOURCES_UNAVAILABLE",
      },
      { status: 502 }
    );
  }

  /* 3. Application des filtres ---------------------------------------- */
  if (searchQuery) {
    const filtered = jobs.filter((job) => matchesTitleFilter(job, searchQuery));
    if (filtered.length >= 6) jobs = filtered;
  }
  if (remoteOnly) {
    const remoteJobs = jobs.filter(
      (job) =>
        job.source === "remotive" ||
        /remote|télétravail|home office/i.test(job.location)
    );
    if (remoteJobs.length >= 6) jobs = remoteJobs;
  }
  if (location?.trim()) {
    const locTokens = normalizeFilter(location)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4);
    if (locTokens.length > 0) {
      const locJobs = jobs.filter((job) => {
        const hay = normalizeFilter(job.location);
        return locTokens.some((t) => hay.includes(t));
      });
      if (locJobs.length >= 6) jobs = locJobs;
    }
  }

  // Déduplication par titre + entreprise, puis plafond à 15 offres à scorer.
  const seen = new Set<string>();
  const deduped: RawJob[] = [];
  for (const job of jobs) {
    const key = `${job.title.toLowerCase().slice(0, 60)}|${job.company.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(job);
  }
  const toScore = deduped.slice(0, 15);

  if (toScore.length === 0) {
    return NextResponse.json({
      jobs: [],
      sources: sourcesStatus,
      message:
        "Aucune offre ne correspond à vos filtres pour le moment. Élargissez la recherche et réessayez.",
    });
  }

  /* 4. Scoring : 1 appel IA unique + repli local par mots-clés --------- */
  const indexedJobs = toScore.map((job, index) => ({ job, index }));
  const cvTokens = new Set(tokenize(candidateText));

  let iaScores = new Map<number, ScoreValue>();
  let iaError: string | null = null;
  try {
    iaScores = await scoreJobs(indexedJobs, candidateText);
  } catch (error) {
    iaError = error instanceof Error ? error.message : "scoring IA échoué";
    console.error("[search-jobs] scoring IA indisponible :", iaError);
  }

  const scoredJobs: ScoredJob[] = indexedJobs.map(({ job, index }) => {
    const ia = iaScores.get(index);
    if (ia) {
      return {
        ...job,
        description: stripHtml(job.description).slice(0, 1800),
        score: ia.score,
        strengths: ia.strengths,
        missingSkills: ia.missingSkills,
        advice: ia.advice,
        scoreSource: "ia" as const,
      };
    }
    return {
      ...job,
      description: stripHtml(job.description).slice(0, 1800),
      score: localKeywordScore(job, cvTokens),
      strengths: [],
      missingSkills: [],
      advice: "",
      scoreSource: "mots-cles" as const,
    };
  });

  scoredJobs.sort((a, b) => b.score - a.score);

  const iaCount = scoredJobs.filter((j) => j.scoreSource === "ia").length;

  return NextResponse.json({
    jobs: scoredJobs,
    sources: sourcesStatus,
    engine: process.env.GROQ_API_KEY
      ? "groq/llama-3.3-70b-versatile"
      : "moteur-secours-local",
    partialScoring: iaCount < scoredJobs.length,
    message:
      iaCount === 0 && scoredJobs.length > 0
        ? "Analyse IA momentanément indisponible — classement calculé localement par correspondance de mots-clés. Réessayez plus tard pour l'analyse détaillée."
        : scoredJobs.length > 0
          ? undefined
          : "Le scoring IA n'a pas abouti. Réessayez dans quelques instants.",
  });
}
