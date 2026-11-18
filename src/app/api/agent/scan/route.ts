import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  extractKeywordsSchema,
  jobScoreBatchSchema,
  scanRequestSchema,
} from "@/lib/schemas";
import { generateStructured, hasGroqKey, GROQ_MODEL_ID } from "@/lib/ai";
import {
  fetchArbeitnowJobs,
  fetchRemotiveJobs,
  stripHtml,
  type RawJob,
} from "@/lib/job-apis";
import type { KeywordInsights } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/* ------------------------------------------------------------------ */
/*  Outils de texte                                                    */
/* ------------------------------------------------------------------ */

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

/** Filtre souple : garde les offres dont le titre/tags contiennent au moins un terme. */
function matchesTitleFilter(job: RawJob, terms: string[]): boolean {
  const tokens = terms.flatMap((term) =>
    normalizeFilter(term)
      .split(/[^a-z0-9+#]+/)
      .filter((t) => t.length >= 3)
  );
  if (tokens.length === 0) return true;
  const haystack = normalizeFilter(`${job.title} ${job.tags.join(" ")}`);
  return tokens.some((token) => haystack.includes(token));
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "are", "our", "this", "that", "have",
  "from", "will", "your", "all", "not", "but", "has", "was", "who", "its",
  "can", "may", "also", "more", "than", "les", "des", "une", "dans", "pour",
  "avec", "sur", "aux", "par", "est", "sont", "nous", "vous", "leur", "vos",
  "plus", "tout", "tous", "cette", "cela", "chez", "sans", "être", "avoir",
  "font", "fait", "ainsi", "alors", "jobs", "job", "team", "work",
  "experience", "recherche", "candidat", "candidats", "offre", "offres",
  "poste", "entreprise", "remote", "cdi", "cdd", "ans", "ans,", "email",
  "mail", "telephone", "ville", "profil", "compétences", "competences",
  "langues", "formation", "formations", "paris", "france",
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

/* ------------------------------------------------------------------ */
/*  Repli local : déduction de mots-clés sans IA                       */
/* ------------------------------------------------------------------ */

const TITLE_PATTERNS = [
  "full stack", "front end", "front-end", "back end", "back-end", "devops",
  "data analyst", "data scientist", "data engineer", "product manager",
  "project manager", "product owner", "ux designer", "ui designer",
  "graphic designer", "digital marketing", "community manager", "accountant",
  "financial analyst", "business analyst", "software engineer", "web developer",
  "mobile developer", "qa tester", "sysadmin", "cloud engineer",
  "développeur", "developpeur", "ingénieur", "ingenieur", "designer",
  "consultant", "commercial", "comptable", "juriste", "marketeur", "analyste",
];

const SKILL_HINTS = [
  "javascript", "typescript", "react", "next", "vue", "angular", "node",
  "python", "django", "java", "spring", "php", "laravel", "symfony",
  "wordpress", "sql", "postgresql", "mysql", "mongodb", "docker", "kubernetes",
  "aws", "azure", "git", "linux", "excel", "sap", "salesforce", "seo",
  "figma", "photoshop", "tailwind", "graphql", "rest", "ci/cd", "scrum",
  "powerbi", "tableau", "comptabilité", "paie", "sage",
];

/** Extraction heuristique (sans IA) : titre de poste + top 3 compétences. */
function extractKeywordsLocally(cvText: string): KeywordInsights {
  const head = cvText.slice(0, 1200).toLowerCase();

  let titre = "";
  for (const pattern of TITLE_PATTERNS) {
    if (head.includes(pattern)) {
      titre = pattern.replace(/(^|\s)\w/g, (m) => m.toUpperCase());
      break;
    }
  }

  const tokens = tokenize(cvText);
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  const skills = SKILL_HINTS.filter((hint) => counts.has(hint.toLowerCase()));
  // Complète avec les tokens les plus fréquents si peu de skills connues
  const extras = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token)
    .filter((t) => !skills.includes(t));
  const motsCles = [...skills, ...extras].slice(0, 3);

  return {
    titre: titre || "Professionnel",
    motsCles: motsCles.length > 0 ? motsCles : ["polyvalent", "motivé", "autonome"],
  };
}

/* ------------------------------------------------------------------ */
/*  Scoring IA (batch unique) + repli local                            */
/* ------------------------------------------------------------------ */

interface ScoreValue {
  score: number;
  strengths: string[];
  missingSkills: string[];
  advice: string;
  scoreSource: "ia" | "mots-cles";
}

interface ScoredJobLocal extends RawJob {
  score: number;
  strengths: string[];
  missingSkills: string[];
  advice: string;
  scoreSource: "ia" | "mots-cles";
}

const SCORING_SYSTEM_PROMPT = `Tu es NexiRole, un cabinet de recrutement technique spécialisé dans le matching candidat ↔ offre.

Pour chaque offre fournie (identifiée par son index), tu évalues la compatibilité avec le profil du candidat et tu renvoies un score de 0 à 100 :
- 80-100 : profil très aligné, candidature à envoyer immédiatement.
- 60-79 : profil solide avec quelques écarts comblables.
- 40-59 : pertinence partielle, adaptations nécessaires.
- 0-39 : faible pertinence.

Barème indicatif : adéquation des compétences techniques (50 %), séniorité/expérience requise vs candidat (25 %), secteur/domaine et contexte du poste (15 %), localisation/remote/langues (10 %).

Points forts : 2 à 4 éléments précis du profil qui répondent aux besoins de l'offre (ne cite pas la compétence seule, donne le contexte, ex: "3 ans d'expérience React demandés par l'offre").
Compétences manquantes : 1 à 4 exigences de l'annonce que le profil ne couvre pas clairement.
Conseil : une seule phrase, concrète et immédiate (ex: "Mettez en avant votre projet X avec GraphQL dans le résumé du CV").
Réponds en français. Ne fabrique aucun élément absent du profil ou de l'offre.`;

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

/* ------------------------------------------------------------------ */
/*  Extraction IA des mots-clés du CV                                  */
/* ------------------------------------------------------------------ */

const KEYWORDS_SYSTEM_PROMPT = `Tu es NexiRole, expert en recrutement.
À partir du CV fourni, déduis :
1. "titre_poste" : le titre de poste principal du candidat, en anglais ou français selon le CV, court et standard (ex: "Full Stack Developer", "WordPress Developer", "Data Analyst").
2. "mots_cles" : les 3 compétences ou mots-clés techniques les plus forts et différenciants du profil (ex: ["React", "Node.js", "AWS"]).
Ne fabrique rien qui ne figure pas ou ne se déduit pas clairement du CV.`;

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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

  const parsed = scanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paramètres de recherche invalides." },
      { status: 400 }
    );
  }

  const { cvText, query, region, remoteOnly } = parsed.data;
  const candidateText = cvText?.trim() ?? "";

  /* Session : la sauvegarde d'historique n'est possible que connecté ---- */
  const session = await auth();
  const userId = session?.user?.id ?? null;

  /* 1. Détermination des termes de recherche -------------------------- */
  let keywords: KeywordInsights | null = null;
  let keywordsSource: "ia" | "local" | "utilisateur" | null = null;

  const userQuery = query?.trim() ?? "";

  if (userQuery.length > 0) {
    keywords = { titre: userQuery, motsCles: [] };
    keywordsSource = "utilisateur";
  } else if (candidateText.length >= 60) {
    // RECHERCHE INTELLIGENTE : extraction du titre de poste + 3 compétences
    if (hasGroqKey()) {
      try {
        const extracted = await generateStructured({
          schema: extractKeywordsSchema,
          system: KEYWORDS_SYSTEM_PROMPT,
          prompt: clamp(candidateText, 6000),
          temperature: 0.2,
          maxOutputTokens: 400,
        });
        keywords = {
          titre: extracted.titre_poste.slice(0, 80),
          motsCles: extracted.mots_cles
            .map((k) => k.trim())
            .filter(Boolean)
            .slice(0, 3),
        };
        keywordsSource = "ia";
      } catch (error) {
        console.error("[agent-scan] extraction IA des mots-clés échouée :", error);
      }
    }
    if (!keywords) {
      keywords = extractKeywordsLocally(candidateText);
      keywordsSource = "local";
    }
  }

  const searchTerms: string[] = [];
  if (keywords) {
    if (keywords.titre) searchTerms.push(keywords.titre);
    for (const k of keywords.motsCles) searchTerms.push(k);
  }

  const primaryTerm = userQuery || keywords?.titre || "";

  /* 2. Recherche Remotive (titre + 1er mot-clé) + Arbeitnow pages 1-2 -- */
  const [remotiveMain, remotiveKeyword, arbeitnow1, arbeitnow2] = await Promise.all([
    primaryTerm ? fetchRemotiveJobs(primaryTerm, 20) : fetchRemotiveJobs("", 20),
    !userQuery && keywords && keywords.motsCles.length > 0
      ? fetchRemotiveJobs(keywords.motsCles[0], 15)
      : Promise.resolve([] as RawJob[]),
    fetchArbeitnowJobs(1),
    fetchArbeitnowJobs(2),
  ]);

  let jobs: RawJob[] = [
    ...remotiveMain,
    ...remotiveKeyword,
    ...arbeitnow1,
    ...arbeitnow2,
  ];

  const sourcesStatus = {
    remotive: remotiveMain.length + remotiveKeyword.length > 0,
    arbeitnow: arbeitnow1.length + arbeitnow2.length > 0,
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

  /* 3. Filtrage intelligent ------------------------------------------- */
  if (userQuery) {
    const filtered = jobs.filter((job) => matchesTitleFilter(job, [userQuery]));
    if (filtered.length >= 6) jobs = filtered;
  } else if (searchTerms.length > 0) {
    // Recherche intelligente : titre de poste OU l'un des mots-clés du CV
    const filtered = jobs.filter((job) => matchesTitleFilter(job, searchTerms));
    if (filtered.length >= 8) jobs = filtered;
  }
  if (remoteOnly) {
    const remoteJobs = jobs.filter(
      (job) =>
        job.source === "remotive" ||
        /remote|télétravail|home office/i.test(job.location)
    );
    if (remoteJobs.length >= 6) jobs = remoteJobs;
  }
  if (region?.trim()) {
    const locTokens = normalizeFilter(region)
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

  // Déduplication puis plafond à 15 offres scorées
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
      keywords: keywords ?? undefined,
      keywordsSource: keywordsSource ?? undefined,
      jobs: [],
      sources: sourcesStatus,
      engine: hasGroqKey() ? `groq/${GROQ_MODEL_ID}` : "moteur-secours-local",
      message:
        "Aucune offre ne correspond à ces mots-clés pour le moment. Essayez un autre badge ou élargissez la recherche.",
    });
  }

  /* 4. Scoring IA batch + repli local par mots-clés -------------------- */
  const indexedJobs = toScore.map((job, index) => ({ job, index }));
  const cvTokens = new Set(tokenize(candidateText));

  let iaScores = new Map<number, ScoreValue>();
  try {
    if (candidateText.length >= 60) {
      iaScores = await scoreJobs(indexedJobs, candidateText);
    }
  } catch (error) {
    console.error(
      "[agent-scan] scoring IA indisponible :",
      error instanceof Error ? error.message : error
    );
  }

  const scoredJobs: ScoredJobLocal[] = indexedJobs.map(({ job, index }) => {
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

  /* 5. Sauvegarde de l'historique (non bloquante) ---------------------- */
  let saved = false;
  if (userId) {
    try {
      await prisma.scanRun.create({
        data: {
          userId,
          requete: userQuery || null,
          region: region?.trim() || null,
          remoteOnly: Boolean(remoteOnly),
          motscles: keywords ? toPrismaJson(keywords) : null,
          resultats: toPrismaJson(
            scoredJobs.map((job) => ({
              ...job,
              description: job.description.slice(0, 400),
            }))
          ),
          nbOffres: scoredJobs.length,
        },
      });
      saved = true;
    } catch (error) {
      console.error("[agent-scan] sauvegarde de l'historique échouée :", error);
    }
  }

  return NextResponse.json({
    keywords: keywords ?? undefined,
    keywordsSource: keywordsSource ?? undefined,
    jobs: scoredJobs,
    sources: sourcesStatus,
    engine: hasGroqKey() ? `groq/${GROQ_MODEL_ID}` : "moteur-secours-local",
    partialScoring: iaCount < scoredJobs.length,
    saved,
    message:
      iaCount === 0 && scoredJobs.length > 0
        ? "Analyse IA momentanément indisponible — classement calculé localement par correspondance de mots-clés. Réessayez plus tard pour l'analyse détaillée."
        : undefined,
  });
}