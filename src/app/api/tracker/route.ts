import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { PrismaClient } from "@/generated/prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT — IMPORT PRISMA :
// Si votre projet importe déjà Prisma autrement (ex. `import { prisma } from "@/lib/prisma"`),
// conservez VOTRE import et supprimez le bloc singleton ci-dessous.
// ─────────────────────────────────────────────────────────────────────────────
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// ─────────────────────────────────────────────────────────────────────────────
// CONTRAT D'API
// GET    /api/tracker                → { applications: [...] } triées par date desc
// POST   /api/tracker                → création ({ jobTitle, companyName, jobUrl?, notes? })
// POST   /api/tracker                → { action: "generate-followup", applicationId }
//                                      → { subject, body, daysSinceLastAction, source }
// PATCH  /api/tracker                → { id, status } (+ date de référence = maintenant)
// DELETE /api/tracker?id=...         → { success: true }
//
// NB — VOTRE SCHÉMA : le modèle Prisma existant utilise `followUpDate` (DateTime?)
// comme date de référence. La route interroge ce champ et l'expose au client
// sous le nom `lastActionDate` — la page n'a donc aucun changement à faire.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_STATUSES = ["A_POSTULER", "ENVOYE", "ENTRETIEN", "OFFRE", "REFUSEE"] as const;
type TrackerStatus = (typeof ALLOWED_STATUSES)[number];

const DAY_MS = 86_400_000;
const GROQ_MODEL = "llama-3.3-70b-versatile";

function isAllowedStatus(value: unknown): value is TrackerStatus {
  return typeof value === "string" && (ALLOWED_STATUSES as readonly string[]).includes(value);
}

/** Convertit une valeur en date ISO valide — ne lève JAMAIS d'exception. */
function toIsoDate(value: unknown, fallback: Date): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return fallback.toISOString();
}

interface TrackerRow {
  id: string;
  jobTitle: string;
  companyName: string;
  jobUrl: string | null;
  status: string;
  followUpDate: Date | null;
  notes: string | null;
  createdAt: Date | null;
}

/** Sérialisation blindée : une date ISO TOUJOURS valide, jamais null/undefined. */
function serializeApplication(row: TrackerRow) {
  const createdAt = row.createdAt ?? new Date();
  return {
    id: row.id,
    jobTitle: row.jobTitle,
    companyName: row.companyName,
    jobUrl: row.jobUrl ?? null,
    status: isAllowedStatus(row.status) ? row.status : "A_POSTULER",
    // Champ DB `followUpDate` exposé au client sous le nom `lastActionDate`
    lastActionDate: toIsoDate(row.followUpDate, createdAt),
    notes: row.notes ?? null,
    createdAt: toIsoDate(createdAt, new Date()),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Résolution utilisateur : avec la stratégie JWT de next-auth v5, session.user
// ne contient par défaut que name/email/image — PAS d'id. On utilise l'id
// s'il existe, sinon l'email (toujours présent dans la session).
// ─────────────────────────────────────────────────────────────────────────────
async function requireUserId(): Promise<string | null> {
  const session = await auth();
  const sessionUser = (session?.user ?? null) as unknown as
    | { id?: string; email?: string | null }
    | null;

  // Log de diagnostic — à retirer une fois la fonctionnalité validée
  console.log(
    "[api/tracker] session présente :", Boolean(session),
    "| champs user :", Object.keys(session?.user ?? {}).join(", ") || "aucun",
  );

  const directId = typeof sessionUser?.id === "string" ? sessionUser.id.trim() : "";
  if (directId !== "") return directId;

  const email = typeof sessionUser?.email === "string" ? sessionUser.email.trim() : "";
  if (email !== "") {
    try {
      const found = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      return found?.id ?? null;
    } catch (error) {
      console.error("[api/tracker] Résolution utilisateur par email impossible :", error);
      return null;
    }
  }

  return null;
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Session invalide. Reconnectez-vous puis réessayez." },
    { status: 401 },
  );
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function readStringField(record: Record<string, unknown> | null, keys: string[]): string {
  if (!record) return "";
  for (const key of keys) {
    const value: unknown = record[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

/* ─────────────── Génération de l'e-mail de relance (Groq) ─────────────── */

const FOLLOWUP_SYSTEM_PROMPT = `Tu es un coach carrière senior de NexiRole, expert en candidatures et communication professionnelle.
Rédige un e-mail de relance de candidature EN FRANÇAIS destiné à un recruteur.
Contraintes :
- ton professionnel, poli et persuasif ;
- corps entre 120 et 180 mots ;
- personnalisé : poste visé, entreprise, nombre de jours écoulés depuis l'envoi ;
- structure : salutation, rappel du contexte, réaffirmation de la motivation et de la valeur apportée, appel à l'action clair (proposer un échange ou un entretien), formule de politesse, signature « [Votre nom] » ;
- n'invente aucun fait (ne suppose pas qu'un entretien a déjà eu lieu).
Réponds STRICTEMENT avec un JSON valide, sans texte autour :
{"objet": "…", "corps": "…"}`;

interface FollowupInput {
  jobTitle: string;
  companyName: string;
  days: number;
  notes: string | null;
}

interface FollowupEmail {
  subject: string;
  body: string;
  source: "groq" | "modele";
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    const parsed: unknown = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1));
        return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** E-mail de secours si Groq est indisponible — la fonctionnalité ne casse jamais. */
function buildTemplateEmail(input: FollowupInput): FollowupEmail {
  const delayLabel = input.days <= 0 ? "récemment" : `il y a ${input.days} jour${input.days > 1 ? "s" : ""}`;
  const notesBlock = input.notes
    ? `\n\nPour rappel, quelques éléments de mon profil : ${input.notes}`
    : "";
  return {
    subject: `Suivi de ma candidature — ${input.jobTitle} chez ${input.companyName}`,
    body: [
      "Madame, Monsieur,",
      "",
      `Je me permets de revenir vers vous concernant ma candidature au poste de ${input.jobTitle} au sein de ${input.companyName}, envoyée ${delayLabel}.`,
      "",
      "Ce projet continue de me motiver pleinement : je suis convaincu(e) que mon profil correspond à vos attentes et je serais ravi(e) de vous l'exposer lors d'un entretien, à votre convenance.",
      "",
      "Si votre processus de recrutement est toujours en cours, je reste bien entendu disponible pour toute information complémentaire.",
      "",
      "Je vous remercie pour l'attention portée à ma candidature et vous prie d'agréer, Madame, Monsieur, mes salutations distinguées.",
      "",
      "[Votre nom]",
      notesBlock,
    ].join("\n"),
    source: "modele",
  };
}

async function generateFollowupEmail(input: FollowupInput): Promise<FollowupEmail> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return buildTemplateEmail(input);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.7,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: FOLLOWUP_SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              poste: input.jobTitle,
              entreprise: input.companyName,
              jours_depuis_derniere_action: input.days,
              notes_candidat: input.notes ?? "",
            }),
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Groq HTTP ${response.status}`);
    const payload: unknown = await response.json();
    const choices = (payload as { choices?: Array<{ message?: { content?: string } }> }).choices ?? [];
    const content = choices[0]?.message?.content ?? "";
    const parsed = extractJsonObject(content);
    const subject = readStringField(parsed, ["objet", "subject"]);
    const body = readStringField(parsed, ["corps", "body", "message"]);
    if (!subject || !body) throw new Error("Réponse Groq incomplète");
    return { subject, body, source: "groq" };
  } catch (error) {
    console.error("[api/tracker] Groq indisponible, e-mail type utilisé :", error);
    return buildTemplateEmail(input);
  }
}

/* ─────────────── GET : liste triée par date de référence desc ─────────────── */

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  try {
    const rows = await prisma.jobApplicationTracker.findMany({
      where: { userId },
      orderBy: [{ followUpDate: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ applications: rows.map(serializeApplication) });
  } catch (error) {
    console.error("[api/tracker][GET]", error);
    return NextResponse.json({ error: "Impossible de charger le suivi des candidatures." }, { status: 500 });
  }
}

/* ─────────────── POST : création OU génération de relance IA ─────────────── */

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const body = await readJsonBody(request);
  if (!body) return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });

  // Cas 1 — Génération d'un e-mail de relance par l'IA
  if (body.action === "generate-followup") {
    const applicationId = typeof body.applicationId === "string" ? body.applicationId : "";
    if (!applicationId) {
      return NextResponse.json({ error: "Identifiant de candidature manquant." }, { status: 400 });
    }
    try {
      const row = await prisma.jobApplicationTracker.findFirst({ where: { id: applicationId, userId } });
      if (!row) return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 });

      const referenceDate: Date | null = row.followUpDate ?? row.createdAt ?? null;
      const referenceMs =
        referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
          ? referenceDate.getTime()
          : Date.now();
      const daysSinceLastAction = Math.max(0, Math.floor((Date.now() - referenceMs) / DAY_MS));

      const email = await generateFollowupEmail({
        jobTitle: row.jobTitle,
        companyName: row.companyName,
        days: daysSinceLastAction,
        notes: row.notes,
      });
      return NextResponse.json({
        subject: email.subject,
        body: email.body,
        daysSinceLastAction,
        source: email.source,
      });
    } catch (error) {
      console.error("[api/tracker][POST:followup]", error);
      return NextResponse.json({ error: "La génération de l'e-mail de relance a échoué." }, { status: 500 });
    }
  }

  // Cas 2 — Création d'une candidature
  const jobTitle = typeof body.jobTitle === "string" ? body.jobTitle.trim() : "";
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  if (!jobTitle || !companyName) {
    return NextResponse.json(
      { error: "L'intitulé du poste et le nom de l'entreprise sont obligatoires." },
      { status: 400 },
    );
  }
  const jobUrl = typeof body.jobUrl === "string" && body.jobUrl.trim() !== "" ? body.jobUrl.trim() : null;
  const notes = typeof body.notes === "string" && body.notes.trim() !== "" ? body.notes.trim() : null;
  const status: TrackerStatus = isAllowedStatus(body.status) ? body.status : "A_POSTULER";

  try {
    const created = await prisma.jobApplicationTracker.create({
      data: { userId, jobTitle, companyName, jobUrl, notes, status, followUpDate: new Date() },
    });
    return NextResponse.json({ application: serializeApplication(created) }, { status: 201 });
  } catch (error) {
    console.error("[api/tracker][POST:create]", error);
    return NextResponse.json({ error: "Impossible d'enregistrer la candidature." }, { status: 500 });
  }
}

/* ─────────────── PATCH : changement de statut (+ date de référence = maintenant) ─────────────── */

export async function PATCH(request: Request) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const body = await readJsonBody(request);
  if (!body) return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });

  const id = typeof body.id === "string" ? body.id : "";
  const nextStatus: unknown = body.status;
  if (!id) return NextResponse.json({ error: "Identifiant de candidature manquant." }, { status: 400 });
  if (!isAllowedStatus(nextStatus)) return NextResponse.json({ error: "Statut invalide." }, { status: 400 });

  try {
    const existing = await prisma.jobApplicationTracker.findFirst({ where: { id, userId } });
    if (!existing) return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 });
    const updated = await prisma.jobApplicationTracker.update({
      where: { id: existing.id },
      data: { status: nextStatus, followUpDate: new Date() },
    });
    return NextResponse.json({ application: serializeApplication(updated) });
  } catch (error) {
    console.error("[api/tracker][PATCH]", error);
    return NextResponse.json({ error: "La mise à jour du statut a échoué." }, { status: 500 });
  }
}

/* ─────────────── DELETE : suppression ─────────────── */

export async function DELETE(request: Request) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Identifiant de candidature manquant." }, { status: 400 });

  try {
    const existing = await prisma.jobApplicationTracker.findFirst({ where: { id, userId } });
    if (!existing) return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 });
    await prisma.jobApplicationTracker.delete({ where: { id: existing.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/tracker][DELETE]", error);
    return NextResponse.json({ error: "La suppression a échoué." }, { status: 500 });
  }
}