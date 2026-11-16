/**
 * Accès aux APIs d'offres d'emploi gratuites (sans clé API) :
 *  - Remotive   : https://remotive.com/api/remote-jobs
 *  - Arbeitnow  : https://www.arbeitnow.com/api/job-board-api
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

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; NexiRoleBot/1.0; +https://nexirole.app) AppleWebKit/537.36",
  Accept: "application/json, text/html;q=0.9, */*;q=0.8",
  "Accept-Language": "fr,fr-FR;q=0.9,en;q=0.8",
};

/** En-têtes d'un navigateur réel : indispensable pour lire les pages d'offres
 * (beaucoup de sites refusent les requêtes sans en-têtes de navigateur). */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr,fr-FR;q=0.9,en-US;q=0.8,en;q=0.7",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
};

/* ------------------------------------------------------------------ */
/*  Nettoyage HTML                                                     */
/* ------------------------------------------------------------------ */

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  ecirc: "ê",
  ugrave: "ù",
  ocirc: "ô",
  icirc: "î",
  acirc: "â",
  ucirc: "û",
  rsquo: "'",
  lsquo: "'",
  ldquo: '"',
  rdquo: '"',
  mdash: "—",
  ndash: "–",
  hellip: "…",
  deg: "°",
  euro: "€",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCodePoint(Number(code));
      } catch {
        return "";
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
      try {
        return String.fromCodePoint(parseInt(code, 16));
      } catch {
        return "";
      }
    })
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => ENTITIES[name] ?? match);
}

export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<head[\s\S]*?<\/head>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|ul|ol)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/* ------------------------------------------------------------------ */
/*  Remotive                                                           */
/* ------------------------------------------------------------------ */

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category: string;
  job_type: string;
  candidate_required_location: string;
  salary: string;
  publication_date: string;
  description: string;
  tags: string;
}

export async function fetchRemotiveJobs(
  search: string,
  limit: number
): Promise<RawJob[]> {
  try {
    const params = new URLSearchParams({ limit: String(Math.min(limit, 30)) });
    if (search) params.set("search", search);
    const res = await fetch(
      `https://remotive.com/api/remote-jobs?${params.toString()}`,
      { headers: FETCH_HEADERS, signal: AbortSignal.timeout(15_000) }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { jobs?: RemotiveJob[] };
    return (json.jobs ?? []).slice(0, limit).map((job) => ({
      id: `remotive-${job.id}`,
      title: job.title ?? "Offre sans titre",
      company: job.company_name ?? "Entreprise inconnue",
      location: job.candidate_required_location || "Remote",
      url: job.url,
      description: stripHtml(job.description ?? "").slice(0, 2500),
      source: "remotive" as const,
      postedAt: job.publication_date?.slice(0, 10),
      tags: (job.tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8),
    }));
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Arbeitnow                                                          */
/* ------------------------------------------------------------------ */

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: number;
}

export async function fetchArbeitnowJobs(
  page = 1
): Promise<RawJob[]> {
  try {
    const res = await fetch(
      `https://www.arbeitnow.com/api/job-board-api?page=${page}`,
      { headers: FETCH_HEADERS, signal: AbortSignal.timeout(15_000) }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: ArbeitnowJob[] };
    return (json.data ?? []).map((job) => ({
      id: `arbeitnow-${job.slug}`,
      title: job.title ?? "Offre sans titre",
      company: job.company_name ?? "Entreprise inconnue",
      location: job.remote ? `Remote (${job.location || "mondial"})` : job.location || "Non précisé",
      url: job.url || `https://www.arbeitnow.com/jobs/${job.slug}`,
      description: stripHtml(job.description ?? "").slice(0, 2500),
      source: "arbeitnow" as const,
      postedAt: job.created_at
        ? new Date(job.created_at * 1000).toISOString().slice(0, 10)
        : undefined,
      tags: (job.tags ?? []).slice(0, 8),
    }));
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Scraping d'une page d'offre                                        */
/* ------------------------------------------------------------------ */

export interface ScrapedJobPage {
  text: string;
  finalUrl: string;
}

export class JobScrapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobScrapeError";
  }
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Extraction du texte d'une page HTML déjà téléchargée. */
function extractOfferText(rawHtml: string): string {
  return stripHtml(rawHtml);
}

/** Tentative directe : télécharge la page avec des en-têtes de navigateur réel. */
async function fetchJobPageDirect(url: string): Promise<ScrapedJobPage> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new JobScrapeError(
      "Impossible de joindre ce site (délai dépassé ou URL injoignable). Collez le texte de l'offre à la place."
    );
  }

  if (!res.ok) {
    throw new JobScrapeError(
      `Le site a répondu ${res.status}. Beaucoup de plateformes bloquent la lecture automatique : collez simplement le texte de l'offre.`
    );
  }

  const contentType = res.headers.get("content-type") ?? "";
  const raw = await res.text();

  if (contentType.includes("application/pdf")) {
    throw new JobScrapeError(
      "Cette URL pointe vers un PDF. Téléchargez-le et collez son texte directement."
    );
  }
  if (
    !contentType.includes("html") &&
    !contentType.includes("text/plain") &&
    contentType.length > 0
  ) {
    throw new JobScrapeError(
      "Cette URL ne renvoie pas une page d'offre lisible. Collez le texte de l'offre à la place."
    );
  }

  const text = extractOfferText(raw);
  if (text.length < 250) {
    throw new JobScrapeError(
      "Le contenu extrait de cette page est trop court pour être une offre. Collez le texte de l'offre manuellement."
    );
  }

  return { text: text.slice(0, 8000), finalUrl: res.url || url };
}

/** Repli gratuit (sans clé) : lecteur universel r.jina.ai qui contourne
 * la plupart des protections anti-robots des sites d'offres. */
async function fetchJobPageViaReader(url: string): Promise<ScrapedJobPage> {
  const readerUrl = `https://r.jina.ai/${url}`;
  const res = await fetch(readerUrl, {
    headers: {
      "User-Agent": BROWSER_HEADERS["User-Agent"],
      Accept: "text/plain",
      "X-Return-Format": "text",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new JobScrapeError(
      `Lecture de l'offre impossible (lecteur universel : ${res.status}).`
    );
  }
  const text = (await res.text())
    .replace(/\[image\]|\(image\)/gi, " ")
    .trim();
  if (text.length < 250) {
    throw new JobScrapeError(
      "Le contenu extrait de cette page est trop court pour être une offre."
    );
  }
  return { text: text.slice(0, 8000), finalUrl: url };
}

export async function fetchJobPageFromUrl(url: string): Promise<ScrapedJobPage> {
  const target = normalizeUrl(url);

  try {
    return await fetchJobPageDirect(target);
  } catch (directError) {
    // La lecture directe a échoué (protection anti-robot, page JS only…)
    // → on retente via le lecteur universel gratuit.
    try {
      return await fetchJobPageViaReader(target);
    } catch {
      if (directError instanceof JobScrapeError) throw directError;
      throw new JobScrapeError(
        "Impossible de lire cette page d'offre. Collez le texte de l'annonce manuellement."
      );
    }
  }
}