import { NextResponse } from "next/server";
import { auth } from "@/auth";
// NOTE : conservez le chemin d'import de prisma utilisé dans VOTRE projet
// (par exemple "@/lib/prisma", "@/db" ou "@/lib/db") si différent de celui-ci.
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type TrackerStatusValue = "A_POSTULER" | "ENVOYE" | "ENTRETIEN" | "OFFRE" | "REFUSEE";

const VALID_STATUSES: readonly TrackerStatusValue[] = [
  "A_POSTULER",
  "ENVOYE",
  "ENTRETIEN",
  "OFFRE",
  "REFUSEE",
];

const DAY_MS = 86_400_000;
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

interface FollowUpEmail {
  subject: string;
  body: string;
}

interface FollowUpContext {
  jobTitle: string;
  companyName: string;
  daysSince: number;
  candidateName: string;
  notes: string | null;
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Vous devez être connecté." }, { status: 401 });
}

/**
 * Récupère l'utilisateur connecté. Tolérant : si la session n'expose pas
 * l'id (JWT sans callback), on retombe sur la recherche par e-mail.
 */
async function getCurrentUser(): Promise<{ id: string; name: string } | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  const sessionUser = session.user as { id?: unknown; name?: unknown };
  let userId =
    typeof sessionUser.id === "string" && sessionUser.id.length > 0 ? sessionUser.id : null;
  let candidateName =
    typeof sessionUser.name === "string" && sessionUser.name.length > 0 ? sessionUser.name : null;

  if (!userId) {
    const dbUser = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    if (!dbUser) return null;
    userId = dbUser.id;
    candidateName = candidateName ?? dbUser.name;
  }

  return { id: userId, name: candidateName ?? "Candidat" };
}

function buildFallbackEmail(context: FollowUpContext): FollowUpEmail {
  const plural = context.daysSince > 1 ? "s" : "";
  const subject = `Suivi de ma candidature – ${context.jobTitle} chez ${context.companyName}`;
  const body = [
    "Bonjour,",
    "",
    `Je me permets de revenir vers vous concernant ma candidature au poste de ${context.jobTitle}, que je vous ai adressée il y a ${context.daysSince} jour${plural}.`,
    "",
    `Mon intérêt pour ce poste et pour ${context.companyName} reste intact : mon profil correspond aux attentes exprimées et je serais ravi(e) d'échanger avec vous sur ce que je peux apporter à votre équipe.`,
    "",
    "Pourriez-vous me faire part de l'état d'avancement de ma candidature ? Je reste naturellement à votre disposition pour tout complément d'information.",
    "",
    "Dans l'attente de votre retour, je vous prie d'agréer mes salutations distinguées.",
    "",
    context.candidateName,
  ].join("\n");
  return { subject, body };
}

function parseFollowUpJson(raw: string): FollowUpEmail | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { subject?: unknown; body?: unknown };
    if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") return null;
    if (!parsed.subject.trim() || !parsed.body.trim()) return null;
    return { subject: parsed.subject.trim(), body: parsed.body.trim() };
  } catch {
    return null;
  }
}

async function generateFollowUpEmail(context: FollowUpContext): Promise<FollowUpEmail> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return buildFallbackEmail(context);

  const systemMessage =
    "Tu es un expert de la recherche d'emploi en France. Tu rédiges des e-mails de relance de candidature courts, polis et percutants. Tu réponds EXCLUSIVEMENT par un objet JSON valide, sans aucun texte autour, au format exact : {\"subject\": \"objet de l'e-mail\", \"body\": \"corps de l'e-mail avec des sauts de ligne \\n\"}.";

  const userMessage = [
    "Rédige un e-mail de relance de candidature.",
    `Poste visé : ${context.jobTitle}`,
    `Entreprise : ${context.companyName}`,
    `Candidature envoyée il y a : ${context.daysSince} jour(s)`,
    `Nom du candidat : ${context.candidateName}`,
    context.notes ? `Contexte additionnel : ${context.notes}` : null,
    "",
    "Consignes :",
    "- L'objet doit être court et professionnel (90 caractères maximum).",
    `- Le corps doit contenir entre 120 et 180 mots : rappel de la candidature envoyée il y a ${context.daysSince} jours, reformulation de l'intérêt pour le poste, un élément de valeur, puis une demande polie d'information sur l'avancement.`,
    "- Ton confiant, jamais suppliant, aucune formule creuse.",
    `- Termine le corps par la signature « ${context.candidateName} ».`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userMessage },
        ],
        temperature: 0.6,
        max_tokens: 700,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return buildFallbackEmail(context);

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") return buildFallbackEmail(context);

    return parseFollowUpJson(content) ?? buildFallbackEmail(context);
  } catch {
    return buildFallbackEmail(context);
  }
}

/* ------------------------------------------------------------------ */
/* GET — liste des candidatures de l'utilisateur connecté               */
/* ------------------------------------------------------------------ */
export async function GET(): Promise<NextResponse> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return unauthorized();

  const applications = await prisma.jobApplicationTracker.findMany({
    where: { userId: currentUser.id },
    orderBy: { lastActionDate: "desc" },
  });

  return NextResponse.json({ applications });
}

/* ------------------------------------------------------------------ */
/* POST — création OU génération de relance IA                          */
/* ------------------------------------------------------------------ */
export async function POST(request: Request): Promise<NextResponse> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return unauthorized();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  // --- Génération d'un e-mail de relance IA ---
  if (body.action === "generate-followup") {
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) {
      return NextResponse.json({ error: "Candidature introuvable." }, { status: 400 });
    }
    const application = await prisma.jobApplicationTracker.findFirst({
      where: { id, userId: currentUser.id },
    });
    if (!application) {
      return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 });
    }
    const daysSince = Math.max(
      0,
      Math.floor((Date.now() - application.lastActionDate.getTime()) / DAY_MS)
    );
    const email = await generateFollowUpEmail({
      jobTitle: application.jobTitle,
      companyName: application.companyName,
      daysSince,
      candidateName: currentUser.name,
      notes: application.notes,
    });
    return NextResponse.json({ ...email, daysSince });
  }

  // --- Création d'une nouvelle candidature ---
  const jobTitle = typeof body.jobTitle === "string" ? body.jobTitle.trim() : "";
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  const jobUrl = typeof body.jobUrl === "string" ? body.jobUrl.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const status = (VALID_STATUSES as readonly unknown[]).includes(body.status)
    ? (body.status as TrackerStatusValue)
    : "A_POSTULER";

  if (!jobTitle || !companyName) {
    return NextResponse.json(
      { error: "Le poste et l'entreprise sont obligatoires." },
      { status: 400 }
    );
  }
  if (jobTitle.length > 140 || companyName.length > 140) {
    return NextResponse.json(
      { error: "Le poste et l'entreprise sont limités à 140 caractères." },
      { status: 400 }
    );
  }
  if (jobUrl.length > 500 || notes.length > 1000) {
    return NextResponse.json(
      { error: "L'URL de l'offre ou les notes dépassent la taille autorisée." },
      { status: 400 }
    );
  }

  const application = await prisma.jobApplicationTracker.create({
    data: {
      userId: currentUser.id,
      jobTitle,
      companyName,
      jobUrl: jobUrl || null,
      notes: notes || null,
      status,
    },
  });

  return NextResponse.json({ application }, { status: 201 });
}

/* ------------------------------------------------------------------ */
/* PATCH — changement de statut + lastActionDate à maintenant           */
/* ------------------------------------------------------------------ */
export async function PATCH(request: Request): Promise<NextResponse> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return unauthorized();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const status = (VALID_STATUSES as readonly unknown[]).includes(body?.status)
    ? (body?.status as TrackerStatusValue)
    : null;

  if (!id || !status) {
    return NextResponse.json({ error: "Candidature ou statut invalide." }, { status: 400 });
  }

  const existing = await prisma.jobApplicationTracker.findFirst({
    where: { id, userId: currentUser.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 });
  }

  const application = await prisma.jobApplicationTracker.update({
    where: { id },
    data: { status, lastActionDate: new Date() },
  });

  return NextResponse.json({ application });
}

/* ------------------------------------------------------------------ */
/* DELETE — suppression d'une candidature                               */
/* ------------------------------------------------------------------ */
export async function DELETE(request: Request): Promise<NextResponse> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return unauthorized();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "Candidature introuvable." }, { status: 400 });
  }

  const existing = await prisma.jobApplicationTracker.findFirst({
    where: { id, userId: currentUser.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 });
  }

  await prisma.jobApplicationTracker.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}