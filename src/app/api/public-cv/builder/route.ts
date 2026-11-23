import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Publication du CV Builder vers la page publique /u/[slug].
 * GET  : etat de publication (slug, lien public, nombre de vues)
 *        pour l'utilisateur connecte.
 * POST : ecriture des donnees dans PublicResume (upsert par slug,
 *        photo existante preservee, isPublic force a true).
 *
 * SOURCE-DE-VERITE-CVDOCUMENT :
 * quand un CV de la bibliotheque (CvDocument) est lie au slug
 * publie, son champ data fait foi : les ameliorations IA et les
 * dernieres modifications enregistrees en base sont toujours
 * publiees, meme si le client envoie un instantane ancien (cas
 * "Mettre a jour la publication" de l'espace Lien Web Public).
 * Le theme recu reste applique ; la photo existante est conservee.
 * Sans CvDocument lie (CV local hors bibliotheque), le contenu recu
 * du createur est utilise, comme avant.
 * Ce fichier ne modifie aucune autre route, page ou modele.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

function slugifyNom(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const publishSchema = z.object({
  slug: z.string().regex(SLUG_RE).optional(),
  theme: z
    .object({
      webTemplate: z.string().max(40).default("classique"),
      accentColor: z.string().max(20).default("#FFC107"),
      qrTemplate: z.string().max(40).default("executif"),
    })
    .optional(),
  data: z.object({
    personal: z.object({
      fullName: z.string().max(120).default(""),
      title: z.string().max(160).default(""),
      email: z.string().max(160).default(""),
      phone: z.string().max(40).default(""),
      location: z.string().max(120).default(""),
      linkedin: z.string().max(200).default(""),
    }),
    summary: z.string().max(4000).default(""),
    experiences: z
      .array(
        z.object({
          role: z.string().max(160).default(""),
          company: z.string().max(160).default(""),
          period: z.string().max(80).default(""),
          location: z.string().max(120).default(""),
          achievements: z.array(z.string().max(800)).max(12).default([]),
        })
      )
      .max(15)
      .default([]),
    education: z
      .array(
        z.object({
          degree: z.string().max(160).default(""),
          school: z.string().max(160).default(""),
          period: z.string().max(80).default(""),
        })
      )
      .max(15)
      .default([]),
    skills: z.array(z.string().max(80)).max(40).default([]),
    languages: z
      .array(
        z.object({
          name: z.string().max(60).default(""),
          level: z.string().max(60).default(""),
        })
      )
      .max(12)
      .default([]),
  }),
});

type PublishData = z.infer<typeof publishSchema>["data"];

async function resolveSlug(
  preferred: string | undefined,
  fallbackName: string
): Promise<string | null> {
  const direct = (preferred ?? "").trim();
  if (direct !== "" && SLUG_RE.test(direct)) return direct;
  const derived = slugifyNom(fallbackName ?? "");
  return derived.length >= 2 ? derived : null;
}

function publicUrlFrom(request: NextRequest, slug: string): string {
  try {
    return `${new URL(request.url).origin.replace(/\/+$/, "")}/u/${slug}`;
  } catch {
    return `/u/${slug}`;
  }
}

function resumeJson(
  row: { slug: string; viewsCount: number } | null,
  request: NextRequest
) {
  if (!row) return null;
  return {
    slug: row.slug,
    publicUrl: publicUrlFrom(request, row.slug),
    viewsCount: typeof row.viewsCount === "number" ? row.viewsCount : 0,
  };
}

/**
 * Contenu effectif publie. Si un CV de la bibliotheque est lie a ce
 * slug (publishedSlug) et n'est pas dans la corbeille, son contenu
 * enregistre (data, ameliorations IA incluses) remplace celui du
 * payload. En cas d'echec de lecture ou de donnees non conformes, on
 * retombe sans erreur sur le contenu recu du createur.
 */
async function contenuSourceDeVerite(
  slug: string,
  dataRecu: PublishData
): Promise<PublishData> {
  try {
    const cv = await prisma.cvDocument.findFirst({
      where: { publishedSlug: slug, trashedAt: null },
      orderBy: { updatedAt: "desc" },
    });
    if (!cv || cv.data === null || typeof cv.data !== "object") {
      return dataRecu;
    }
    const parsedCv = publishSchema.shape.data.safeParse(cv.data);
    if (!parsedCv.success) {
      console.warn(
        "[public-cv/builder][POST] CvDocument.data non conforme - contenu recu utilise."
      );
      return dataRecu;
    }
    return parsedCv.data;
  } catch (error) {
    console.error(
      "[public-cv/builder][POST] Lecture du CvDocument impossible :",
      error
    );
    return dataRecu;
  }
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }
  const asked = new URL(request.url).searchParams.get("slug") ?? undefined;
  const sessionName = typeof session.user.name === "string" ? session.user.name : "";
  const slug = await resolveSlug(asked, sessionName);
  if (!slug) {
    return NextResponse.json({ publicResume: null });
  }
  try {
    const row = await prisma.publicResume.findUnique({ where: { slug } });
    return NextResponse.json({ publicResume: resumeJson(row, request) });
  } catch (error) {
    console.error("[public-cv/builder][GET]", error);
    return NextResponse.json(
      { error: "Lecture de la configuration impossible." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Connexion requise. Reconnectez-vous puis reessayez." },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requete JSON invalide." },
      { status: 400 }
    );
  }

  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Donnees du CV invalides (publication refusee)." },
      { status: 400 }
    );
  }

  const { slug: slugDemande, theme } = parsed.data;
  const slug = await resolveSlug(
    slugDemande,
    parsed.data.data.personal.fullName
  );
  if (!slug) {
    return NextResponse.json(
      {
        error:
          "Impossible de deriver le slug : renseignez votre nom complet (etape 1).",
      },
      { status: 400 }
    );
  }

  /* Contenu effectif : CvDocument lie au slug, sinon payload recu. */
  const data = await contenuSourceDeVerite(slug, parsed.data.data);

  const experiences = data.experiences.filter(
    (e) => e.role !== "" || e.company !== "" || e.achievements.length > 0
  );
  const education = data.education.filter(
    (e) => e.degree !== "" || e.school !== ""
  );
  const skills = data.skills.map((s) => s.trim()).filter(Boolean);
  const languages = data.languages.filter((l) => l.name !== "");

  try {
    const existing = await prisma.publicResume.findUnique({ where: { slug } });
    const existingCv =
      existing?.cvData &&
      typeof existing.cvData === "object" &&
      !Array.isArray(existing.cvData)
        ? (existing.cvData as unknown as Record<string, unknown>)
        : null;
    const photo =
      existingCv &&
      typeof existingCv.photo === "string" &&
      existingCv.photo.length > 0
        ? existingCv.photo
        : null;

    const cvData = {
      personal: data.personal,
      summary: data.summary,
      experiences,
      education,
      skills,
      languages,
      ...(theme ? { theme } : {}),
      photo,
    };

    const payload = JSON.parse(JSON.stringify(cvData));

    const row = existing
      ? await prisma.publicResume.update({
          where: { slug },
          data: { cvData: payload, isPublic: true },
        })
      : await prisma.publicResume.create({
          data: {
            slug,
            cvData: payload,
            isPublic: true,
            viewsCount: 0,
            user: { connect: { id: session.user.id } },
          },
        });

    return NextResponse.json({ publicResume: resumeJson(row, request) });
  } catch (error) {
    console.error("[public-cv/builder][POST]", error);
    return NextResponse.json(
      {
        error:
          "Enregistrement impossible. Si le probleme persiste, ouvrez /api/diagnostic-cv?slug=" +
          slug,
      },
      { status: 500 }
    );
  }
}