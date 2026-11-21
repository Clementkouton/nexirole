import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { pdf } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { renderQrCvDocument } from "@/components/pdf/CvPdfQrTemplates";
import type { PdfCv } from "@/components/pdf/CvPdfQrTemplates";
import { enrichCv } from "@/lib/cv-normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------------- utilitaires ---------------- */

function asRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function asText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

type PublicResumeLike = {
  id: string; slug: string; isPublic: boolean; templateId: string | null;
  viewsCount: number; cvData: unknown; updatedAt: Date;
};

type JsonInputValue = string | number | boolean | JsonInputValue[] | { [key: string]: JsonInputValue | null };

function serializePublicResume(row: PublicResumeLike, url: string) {
  return {
    id: row.id, slug: row.slug, isPublic: row.isPublic === true,
    templateId: row.templateId ?? null, viewsCount: row.viewsCount ?? 0,
    cvData: row.cvData ?? {}, updatedAt: row.updatedAt, publicUrl: url,
  };
}

function publicUrlFromRequest(req: NextRequest, slug: string): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const base = envUrl
    ? envUrl.replace(/\/$/, "")
    : `${req.headers.get("x-forwarded-proto") ?? "http"}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000"}`;
  return `${base}/u/${slug}`;
}

function sanitizeSlug(input: string): string {
  const s = input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "");
  return s || "cv";
}

async function generateUniqueSlug(base: string, userId: string): Promise<string> {
  const clean = sanitizeSlug(base);
  for (let i = 1; i <= 50; i++) {
    const candidate = i === 1 ? clean : `${clean}-${i + 1}`;
    const existing = await prisma.publicResume.findUnique({ where: { slug: candidate }, select: { userId: true } });
    if (!existing) return candidate;
    if (existing.userId === userId) return candidate;
  }
  return `${clean}-${Date.now()}`;
}

function sanitizeCvData(v: unknown): JsonInputValue {
  if (v === null || v === undefined) return {};
  try {
    const parsed: unknown = JSON.parse(JSON.stringify(v));
    return parsed === null ? {} : parsed as JsonInputValue;
  } catch { return {}; }
}

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  const u = session?.user as { id?: string; email?: string } | undefined;
  if (u?.id) return u.id;
  const email = u?.email;
  if (!email) return null;
  const row = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return row?.id ?? null;
}

function errorResponse(err: unknown, tag: string): NextResponse {
  const e = err as { code?: string; message?: string };
  console.error(`${tag} Error`, e?.code ?? "", e?.message ?? err);
  if (e?.code === "P2021") {
    return NextResponse.json(
      { error: "La table PublicResume n'existe pas encore. Execute publier-public-resume.ps1 (npx prisma db push).", code: "P2021" },
      { status: 503 },
    );
  }
  return NextResponse.json({ error: "Erreur interne du serveur." }, { status: 500 });
}

/* ---------------- normalisation CV ---------------- */

function pickPeriod(o: Record<string, unknown>): string {
  const start = asText(o.startDate) || asText(o.start) || asText(o.from) || asText(o.dateDebut);
  const end = asText(o.endDate) || asText(o.end) || asText(o.to) || asText(o.dateFin) || (o.current === true ? "Aujourd'hui" : "");
  if (start && end) return `${start} — ${end}`;
  return start || end || asText(o.period) || asText(o.periode);
}

function normalizeCvForPdf(...args: Parameters<typeof normalizeCvForPdfBase>) {
  return enrichCv(normalizeCvForPdfBase(...args), args[0]);
}
function normalizeCvForPdfBase(raw: unknown): PdfCv {
  const root = asRec(raw) ?? {};
  const personal = asRec(root.personal) ?? {};
  const name = asText(personal.fullName) || asText(root.fullName) || asText(personal.name) || asText(root.name) || asText(root.title2) || "CV";
  const title = asText(personal.title) || asText(root.title) || asText(personal.jobTitle) || asText(root.jobTitle);
  const photoRaw = asText(personal.photo) || asText(root.photo) || asText(root.avatar);
  const photo = /^data:image\/(png|jpe?g|webp);base64,/.test(photoRaw) || /^https?:\/\//.test(photoRaw) ? photoRaw : null;
  const experiences = asArr(root.experiences ?? root.experience ?? root.work).map((x) => {
    const o = asRec(x) ?? {};
    return {
      role: asText(o.role) || asText(o.position) || asText(o.title) || asText(o.poste),
      company: asText(o.company) || asText(o.employer) || asText(o.entreprise),
      period: pickPeriod(o),
      description: asText(o.description) || asArr(o.bullets).filter((b) => typeof b === "string").join("\n"),
    };
  }).filter((e) => e.role || e.company);
  const educations = asArr(root.educations ?? root.education ?? root.formations).map((x) => {
    const o = asRec(x) ?? {};
    return {
      degree: asText(o.degree) || asText(o.diploma) || asText(o.diplome) || asText(o.title),
      school: asText(o.school) || asText(o.institution) || asText(o.ecole),
      period: pickPeriod(o),
    };
  }).filter((d) => d.degree || d.school);
  const skills = asArr(root.skills ?? root.competences).map((s) => (typeof s === "string" ? s : asText(asRec(s)?.name))).filter(Boolean);
  const languages = asArr(root.languages ?? root.langues).map((l) => (typeof l === "string" ? l : asText(asRec(l)?.name))).filter(Boolean);
  return {
    name, title, photo,
    email: asText(personal.email) || asText(root.email),
    phone: asText(personal.phone) || asText(root.phone),
    location: asText(personal.location) || asText(personal.city) || asText(root.location),
    website: asText(personal.website) || asText(root.website) || asText(root.linkedin),
    summary: asText(root.summary) || asText(root.objective) || asText(root.profile) || asText(root.profil),
    experiences, educations, skills, languages,
  };
}

function extractTheme(raw: unknown): { webTemplate: string; qrTemplate: string; accentColor: string } {
  const root = asRec(raw) ?? {};
  const theme = asRec(root.theme) ?? {};
  const accent = typeof theme.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(theme.accentColor) ? theme.accentColor : "#FFC107";
  const web = typeof theme.webTemplate === "string" && theme.webTemplate ? theme.webTemplate : "classique";
  const qr = typeof theme.qrTemplate === "string" && theme.qrTemplate ? theme.qrTemplate : "executif";
  return { webTemplate: web, qrTemplate: qr, accentColor: accent };
}

/* ---------------- PDF public (QR) ---------------- */

async function servePublicCvPdf(req: NextRequest, slugParam: string): Promise<NextResponse | Response> {
  const row = await prisma.publicResume.findUnique({ where: { slug: sanitizeSlug(slugParam) } });
  if (!row || row.isPublic !== true) {
    return NextResponse.json({ error: "CV introuvable ou privé." }, { status: 404 });
  }
  const publicUrl = publicUrlFromRequest(req, row.slug);
  const theme = extractTheme(row.cvData);
  let qrDataUrl: string | null = null;
  try {
    qrDataUrl = await QRCode.toDataURL(publicUrl, { width: 512, margin: 1, color: { dark: "#051937", light: "#FFFFFF" } });
  } catch { qrDataUrl = null; }
  const cv = normalizeCvForPdf(row.cvData);
  const doc = renderQrCvDocument({ cv, accent: theme.accentColor, qrDataUrl, publicUrl, template: theme.qrTemplate });
  const stream = await pdf(doc).toBuffer();
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="cv-${row.slug}.pdf"` },
  });
}

/* ---------------- handlers ---------------- */

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const slugParam = sp.get("slug");
    if (slugParam && sp.get("format") === "pdf") {
      return await servePublicCvPdf(req, slugParam);
    }
    const userId = await requireUserId();
    if (!userId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const row = await prisma.publicResume.findUnique({ where: { userId } });
    return NextResponse.json({
      publicResume: row ? serializePublicResume(row, publicUrlFromRequest(req, row.slug)) : null,
    });
  } catch (err) {
    return errorResponse(err, "[api/public-cv][GET]");
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as { cvData?: unknown; isPublic?: boolean; templateId?: string };
    const cvData = sanitizeCvData(body.cvData);
    const isPublic = body.isPublic !== false;
    const templateId = typeof body.templateId === "string" && body.templateId ? body.templateId.slice(0, 40) : null;
    const [userRow, existing] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      prisma.publicResume.findUnique({ where: { userId } }),
    ]);
    if (existing) {
      const updated = await prisma.publicResume.update({
        where: { id: existing.id },
        data: { cvData, isPublic, ...(templateId ? { templateId } : {}) },
      });
      return NextResponse.json({ publicResume: serializePublicResume(updated, publicUrlFromRequest(req, updated.slug)) });
    }
    const slug = await generateUniqueSlug(userRow?.name || "cv", userId);
    const created = await prisma.publicResume.create({ data: { userId, slug, isPublic, ...(templateId ? { templateId } : {}), cvData } });
    return NextResponse.json({ publicResume: serializePublicResume(created, publicUrlFromRequest(req, created.slug)) }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "[api/public-cv][POST]");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as { cvData?: unknown; isPublic?: boolean; templateId?: string };
    const existing = await prisma.publicResume.findUnique({ where: { userId } });
    if (!existing) return NextResponse.json({ error: "Aucun CV publié. Publie d'abord." }, { status: 404 });
    const updated = await prisma.publicResume.update({
      where: { id: existing.id },
      data: {
        ...(body.cvData !== undefined ? { cvData: sanitizeCvData(body.cvData) } : {}),
        ...(typeof body.isPublic === "boolean" ? { isPublic: body.isPublic } : {}),
        ...(typeof body.templateId === "string" && body.templateId ? { templateId: body.templateId.slice(0, 40) } : {}),
      },
    });
    return NextResponse.json({ publicResume: serializePublicResume(updated, publicUrlFromRequest(req, updated.slug)) });
  } catch (err) {
    return errorResponse(err, "[api/public-cv][PATCH]");
  }
}
