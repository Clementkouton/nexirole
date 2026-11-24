import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateStructured } from "@/lib/ai";
import { fetchArbeitnowJobs, fetchRemotiveJobs, type RawJob } from "@/lib/job-apis";
import { hasGroqKey, requireAiAccess } from "@/lib/ai-guard";
import { prisma } from "@/lib/prisma";
import { resoudreUtilisateur } from "@/lib/utilisateur-actuel";

/**
 * Agent de recherche en direct :
 * 1. Recherche Remotive (recherche par métier) + Arbeitnow (pages 1 et 2).
 * 2. Filtres métier / lieu, déduplication, plafond à 15 offres.
 * 3. Scoring IA en un seul appel (score 0-100 + raison + forces + lacunes),
 *    avec repli local par mots-clés si l'IA est indisponible.
 * PARTIE 3 : quota plan Découverte (3 recherches/mois) + 5 requêtes/h/IP
 * pour les visiteurs anonymes (403 QUOTA_EXCEEDED ou 429 RATE_LIMITED).
 *
 * PERSISTANCE (règle d'or) : chaque scan est enregistré automatiquement en
 * base (modèle AgentScanHistory) pour l'utilisateur connecté, puis réaffiché
 * via GET /api/agent/scan et supprimable via DELETE /api/agent/scan?id=...
 */

export const maxDuration = 120;

/* ------------------------------------------------------------------ */
/*  Validation des entrées                                             */
/* ------------------------------------------------------------------ */

const bodySchema = z.object({
  metier: z.string().max(120).default(""),
  lieu: z.string().max(120).default(""),
  competences: z.array(z.string().max(80)).max(15).default([]),
});

const jobScoreSchema = z.object({
  index: z.number().int().min(0),
  score: z.number().min(0).max(100),
  reason: z.string().max(400),
  strengths: z.array(z.string()).max(4).default([]),
  missingSkills: z.array(z.string()).max(4).default([]),
});

const batchSchema = z.object({
  results: z.array(jobScoreSchema).min(1),
});

/* ------------------------------------------------------------------ */
/*  Utilitaires                                                        */
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

function titleTokens(filter: string): string[] {
  return normalizeFilter(filter)
    .split(/[^a-z0-9+#]+/)
    .filter((token) => token.length >= 3);
}

/** Filtre souple : garde les offres dont le titre contient un mot-clé du métier. */
function matchesTitleFilter(job: RawJob, filter: string): boolean {
  const tokens = titleTokens(filter);
  if (tokens.length === 0) return true;
  const haystack = normalizeFilter(`${job.title} ${job.tags.join(" ")}`);
  return tokens.some((token) => haystack.includes(token));
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "are", "our", "this", "that", "have",
  "from", "will", "your", "all", "not", "but", "has", "was", "who", "its",
  "can", "may", "also", "more", "than", "les", "des", "une", "dans", "pour",
  "avec", "sur", "aux", "par", "est", "sont", "nous", "vous", "leur", "vos",
  "plus", "tout", "tous", "cette", "cela", "chez", "sans", "jobs", "job",
  "team", "work", "experience", "recherche", "candidat", "offre", "poste",
  "entreprise", "remote", "cdi", "cdd",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9+#.]+/)
    .map((token) => token.replace(/^\.+|\.+$/g, ""))
    .filter(
      (token) =>
        token.length >= 3 && !STOPWORDS.has(token) && !/^\d+$/.test(token)
    );
}

/** Score de repli local : recouvrement de mots-clés profil ↔ offre. */
function localKeywordScore(job: RawJob, profileTokens: Set<string>): number {
  const jobTokens = new Set(
    tokenize(`${job.title} ${job.tags.join(" ")} ${job.description.slice(0, 900)}`)
  );
  if (jobTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of jobTokens) {
    if (profileTokens.has(token)) overlap++;
  }
  const ratio = overlap / jobTokens.size;
  return Math.min(95, Math.round(ratio * 170));
}

/* ------------------------------------------------------------------ */
/*  Scoring IA                                                         */
/* ------------------------------------------------------------------ */

const SCORING_SYSTEM_PROMPT = `Tu es NexiRole, un cabinet de recrutement technique spécialisé dans le matching candidat ↔ offre.

Pour chaque offre fournie (identifiée par son index), tu évalues la compatibilité avec le profil du candidat et tu renvoies un score de 0 à 100 :
- 80-100 : profil très aligné, candidature à envoyer immédiatement.
- 60-79 : profil solide avec quelques écarts comblables.
- 40-59 : pertinence partielle, adaptations nécessaires.
- 0-39 : faible pertinence.

Barème indicatif : adéquation des compétences (50 %), séniorité (25 %), secteur/contexte (15 %), localisation/remote/langues (10 %).

"reason" : une à deux phrases en français expliquant la note et ce que le candidat devrait mettre en avant.
"strengths" : 2 à 3 correspondances concrètes profil ↔ offre (courtes).
"missingSkills" : 1 à 3 exigences de l'annonce non couvertes (courtes).
Réponds en français. Ne fabrique aucun élément absent du profil ou de l'offre.`;

interface ScoreValue {
  score: number;
  reason: string;
  strengths: string[];
  missingSkills: string[];
}

async function scoreJobs(
  jobList: Array<{ job: RawJob; index: number }>,
  profileText: string
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
    schema: batchSchema,
    system: SCORING_SYSTEM_PROMPT,
    prompt: [
      "## PROFIL DU CANDIDAT",
      clamp(profileText, 3000),
      "",
      "## OFFRES À ÉVALUER",
      compactList,
      "",
      "Évalue chaque offre et renvoie exactement un résultat par index fourni (" +
        jobList.map((b) => b.index).join(", ") +
        "). Reste synthétique.",
    ].join("\n"),
    temperature: 0.2,
    maxOutputTokens: 4000,
  });

  const map = new Map<number, ScoreValue>();
  for (const item of (result.results ?? []) as Array<{
    index: number;
    score: number;
    reason: string;
    strengths: string[];
    missingSkills: string[];
  }>) {
    map.set(item.index, {
      score: Math.round(item.score),
      reason: item.reason,
      strengths: item.strengths,
      missingSkills: item.missingSkills,
    });
  }
  return map;
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  /* 0. Anti-abus + quotas de licence (PARTIE 3) */
  const access = await requireAiAccess(request, "search", "agent-scan");
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
      { error: "Paramètres de recherche invalides." },
      { status: 400 }
    );
  }

  const { metier, lieu, competences } = parsed.data;

  if (!metier.trim() && competences.length === 0) {
    return NextResponse.json(
      { error: "Renseignez au moins un métier ou des compétences." },
      { status: 400 }
    );
  }

  const profileText = [
    `Poste visé : ${metier.trim() || "non précisé"}`,
    `Localisation souhaitée : ${lieu.trim() || "non précisée"}`,
    `Compétences clés : ${competences.join(", ") || "non précisées"}`,
  ].join("\n");

  /* 1. Recherche en parallèle : Remotive + Arbeitnow */
  const metierQuery = metier.trim();
  const searchQuery = metierQuery || competences[0] || "developer";
  const [remotiveResult, arbeitnowPage1, arbeitnowPage2] = await Promise.all([
    fetchRemotiveJobs(searchQuery, 20),
    fetchArbeitnowJobs(1),
    fetchArbeitnowJobs(2),
  ]);

  let jobs: RawJob[] = [...remotiveResult, ...arbeitnowPage1, ...arbeitnowPage2];
  const totalFound = jobs.length;

  const sourcesStatus = {
    remotive: remotiveResult.length > 0,
    arbeitnow: arbeitnowPage1.length + arbeitnowPage2.length > 0,
  };

  const warnings: string[] = [];
  if (!sourcesStatus.remotive) {
    warnings.push("Remotive est momentanément injoignable — résultats partiels.");
  }
  if (!sourcesStatus.arbeitnow) {
    warnings.push("Arbeitnow est momentanément injoignable — résultats partiels.");
  }
  if (!sourcesStatus.remotive && !sourcesStatus.arbeitnow) {
    return NextResponse.json(
      {
        error:
          "Les deux sources d'offres sont injoignables pour le moment. Réessayez dans quelques instants.",
      },
      { status: 502 }
    );
  }

  /* 2. Filtres métier et lieu */
  if (metierQuery) {
    const filtered = jobs.filter((job) => matchesTitleFilter(job, metierQuery));
    if (filtered.length >= 6) jobs = filtered;
  }
  if (lieu.trim()) {
    const locTokens = titleTokens(lieu).filter((token) => token.length >= 4);
    if (locTokens.length > 0) {
      const locJobs = jobs.filter((job) => {
        const haystack = normalizeFilter(job.location);
        return locTokens.some((token) => haystack.includes(token));
      });
      if (locJobs.length >= 6) jobs = locJobs;
    }
  }

  /* 3. Déduplication + plafond */
  const seen = new Set<string>();
  const deduped: RawJob[] = [];
  for (const job of jobs) {
    const key = `${job.title.toLowerCase().slice(0, 60)}|${job.company.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(job);
  }
  const toScore = deduped.slice(0, 15);
  const totalKept = toScore.length;

  if (toScore.length === 0) {
    return NextResponse.json({
      ok: true,
      jobs: [],
      totalFound,
      totalKept: 0,
      aiAvailable: false,
      warnings,
      message:
        "Aucune offre ne correspond à vos critères pour le moment. Élargissez la recherche et réessayez.",
    });
  }

  /* 4. Scoring IA + repli local */
  const indexedJobs = toScore.map((job, index) => ({ job, index }));
  const profileTokens = new Set(tokenize(`${profileText} ${metier}`));

  let iaScores = new Map<number, ScoreValue>();
  let aiAvailable = false;
  try {
    if (hasGroqKey()) {
      iaScores = await scoreJobs(indexedJobs, profileText);
      aiAvailable = iaScores.size > 0;
    }
  } catch (error) {
    console.error("[agent/scan] scoring IA indisponible :", error);
  }

  if (!aiAvailable) {
    warnings.push(
      "Analyse IA momentanément indisponible — classement calculé localement par correspondance de mots-clés."
    );
  }

  const scoredJobs = indexedJobs.map(({ job, index }) => {
    const ia = iaScores.get(index);
    const baseFields = {
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      url: job.url,
      source: job.source,
      postedAt: job.postedAt,
      tags: job.tags,
      description: clamp(job.description, 3000),
    };
    if (ia) {
      return {
        ...baseFields,
        score: ia.score,
        reason: ia.reason,
        strengths: ia.strengths,
        missingSkills: ia.missingSkills,
        aiScored: true,
      };
    }
    return {
      ...baseFields,
      score: localKeywordScore(job, profileTokens),
      reason: "",
      strengths: [],
      missingSkills: [],
      aiScored: false,
    };
  });

  scoredJobs.sort((a, b) => b.score - a.score);

  /* 5. PERSISTANCE (règle d'or) : enregistrement automatique du scan pour
     l'utilisateur connecté. requireAiAccess fournit ctx.userId (session.id) ;
     repli tolérant par email / cookie via utilisateur-actuel.ts. En cas
     d'échec d'enregistrement, le résultat est quand même renvoyé (non fatal). */
  const userIdSauvegarde =
    access.ctx.userId ?? (await resoudreUtilisateur()).utilisateur?.userId ?? null;

  let scanId: string | null = null;
  let persisted = false;
  if (userIdSauvegarde) {
    try {
      const saved = await Reflect.get(prisma, "agentScanHistory").create({
        data: {
          userId: userIdSauvegarde,
          targetRole: metier.trim().slice(0, 120),
          location: lieu.trim().slice(0, 120),
          keywords: competences as unknown as import("@/generated/prisma/client").Prisma.InputJsonValue,
          resultsJson: {
            jobs: scoredJobs,
            totalFound,
            totalKept,
            aiAvailable,
            warnings,
          } as unknown as import("@/generated/prisma/client").Prisma.InputJsonValue,
          bestScore: scoredJobs.length > 0 ? scoredJobs[0].score : 0,
        },
      });
      scanId = saved.id;
      persisted = true;
    } catch (error) {
      console.error("[agent/scan] sauvegarde du scan impossible :", error);
      warnings.push(
        "Scan non enregistré en base — lance « npx prisma db push » pour créer la table agent_scan_history."
      );
    }
  }

  return NextResponse.json({
    ok: true,
    jobs: scoredJobs,
    totalFound,
    totalKept,
    aiAvailable,
    warnings,
    scanId,
    persisted,
  });
}

/* ─────────────── GET : historique des scans sauvegardés ─────────────── */

export async function GET() {
  const { utilisateur, diagnostic } = await resoudreUtilisateur();
  if (!utilisateur) {
    return NextResponse.json(
      {
        error: "Session expirée — déconnecte-toi puis reconnecte-toi, et recharge la page.",
        diagnostic,
      },
      { status: 401 }
    );
  }

  try {
    const scans = await Reflect.get(prisma, "agentScanHistory").findMany({
      where: { userId: utilisateur.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ scans });
  } catch (error) {
    console.error("[agent/scan][GET]", error);
    return NextResponse.json(
      {
        error:
          "Historique des scans indisponible. Si la table est absente, lance : npx prisma db push",
      },
      { status: 500 }
    );
  }
}

/* ─────────────── DELETE : suppression d'un scan sauvegardé ─────────────── */

export async function DELETE(request: NextRequest) {
  const { utilisateur, diagnostic } = await resoudreUtilisateur();
  if (!utilisateur) {
    return NextResponse.json(
      {
        error: "Session expirée — déconnecte-toi puis reconnecte-toi, et recharge la page.",
        diagnostic,
      },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json({ error: "Identifiant du scan manquant." }, { status: 400 });
  }

  try {
    const scanHistory = Reflect.get(prisma, "agentScanHistory");
    const existing = await scanHistory.findFirst({
      where: { id, userId: utilisateur.userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Scan introuvable." }, { status: 404 });
    }
    await scanHistory.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[agent/scan][DELETE]", error);
    return NextResponse.json({ error: "La suppression du scan a échoué." }, { status: 500 });
  }
}
