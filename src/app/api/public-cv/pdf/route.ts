import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CvPdfDocument, type DossierData } from "@/components/pdf/CvPdfDocument";
import { mapDesignTemplate } from "@/lib/cv-publish-payload";

/* ==================================================================
   NexiRole — PDF public du CV (avec QR code), nouvelle route dédiée
   GET /api/public-cv/pdf?slug=<slug>  → accès public (CV publié)
   GET /api/public-cv/pdf?cv=<id>      → propriétaire connecté (aperçu
                                         téléchargeable même non publié)
   Remplace l'appel historique /api/public-cv?slug=...&format=pdf qui
   renvoyait « Erreur interne du serveur. » : cette route est
   autonome (QR serveur via qrcode, rendu via @react-pdf/renderer,
   patterns identiques à /api/download-pdf déjà en production).
   ================================================================== */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const TEMPLATE_IDS = ["modern-accent", "sleek-executive", "bold-minimalism", "clean-ats"] as const;
type TemplateIdSafe = (typeof TEMPLATE_IDS)[number];

function safeTemplateId(value: unknown): TemplateIdSafe {
  const v = typeof value === "string" ? value.trim() : "";
  return (TEMPLATE_IDS as readonly string[]).includes(v) ? (v as TemplateIdSafe) : "modern-accent";
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

/** Convertit le cvData stocké (builder ou publication) en DossierData PDF. */
function toDossier(cv: Record<string, unknown>): DossierData {
  const personal = asRecord(cv.personal);
  const experiences = asArray(cv.experiences);
  const education = asArray(cv.education);
  const skills = Array.isArray(cv.skills) ? cv.skills : [];
  const languages = asArray(cv.languages);

  return {
    identite: {
      nom_complet: str(personal.fullName) || "Candidat",
      email: str(personal.email),
      telephone: str(personal.phone),
      ville: str(personal.location),
      linkedin: str(personal.linkedin),
    },
    titre: str(personal.title) || "Candidat",
    resume: str(cv.summary),
    experiences: experiences
      .filter((e) => str(e.role) !== "" || str(e.company) !== "")
      .map((e) => ({
        poste: str(e.role) || "Poste",
        periode: str(e.period),
        entreprise: str(e.company) || "Entreprise",
        lieu: str(e.location),
        missions: asArray(e.achievements)
          .map((m) => (typeof m === "string" ? m.trim() : ""))
          .filter(Boolean),
      })),
    formations: education
      .filter((e) => str(e.degree) !== "" || str(e.school) !== "")
      .map((e) => ({
        diplome: str(e.degree) || "Diplôme",
        periode: str(e.period),
        etablissement: str(e.school),
      })),
    competences: skills
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter(Boolean),
    langues: languages
      .filter((l) => str(l.name) !== "")
      .map((l) => ({ nom: str(l.name), niveau: str(l.level) || "Courant" })),
  };
}

function sanitizeFilename(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return cleaned.length > 0 ? cleaned : "document";
}

async function renderPdfBuffer(element: React.ReactElement): Promise<Buffer> {
  return renderToBuffer(element as unknown as React.ReactElement<DocumentProps>);
}

function originFrom(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (configured.trim() !== "") return configured.trim().replace(/\/+$/, "");
  return new URL(request.url).origin;
}

/** QR code serveur pointant vers la page publique. */
async function qrDataUrlFor(publicUrl: string): Promise<string | null> {
  try {
    const mod = (await import("qrcode")) as unknown as {
      default: { toDataURL: (text: string, options?: Record<string, unknown>) => Promise<string> };
    };
    return await mod.default.toDataURL(publicUrl, {
      color: { dark: "#051937", light: "#FFFFFF" },
      width: 512,
      margin: 1,
    });
  } catch (error) {
    console.error("[api/public-cv/pdf] QR code indisponible :", error);
    return null; // le PDF reste généré, sans QR
  }
}

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  const sessionUser = (session?.user ?? null) as unknown as
    | { id?: string; email?: string | null }
    | null;

  const directId = typeof sessionUser?.id === "string" ? sessionUser.id.trim() : "";
  if (directId !== "") return directId;

  const email = typeof sessionUser?.email === "string" ? sessionUser.email.trim() : "";
  if (email !== "") {
    try {
      const found = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      return found?.id ?? null;
    } catch (error) {
      console.error("[api/public-cv/pdf] Résolution utilisateur par email impossible :", error);
      return null;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const slug = (params.get("slug") ?? "").trim();
  const cvId = (params.get("cv") ?? "").trim();

  try {
    if (slug !== "") {
      // Mode public : le CV publié doit exister et être visible.
      const row = await prisma.publicResume.findUnique({ where: { slug } });
      if (!row || !row.isPublic) {
        return NextResponse.json({ error: "CV public introuvable ou privé." }, { status: 404 });
      }
      const cv = asRecord(row.cvData);
      const theme = asRecord(cv.theme);
      const publicUrl = `${originFrom(request)}/u/${row.slug}`;
      const nomComplet = str(asRecord(cv.personal).fullName) || "Candidat";
      const photo = typeof cv.photo === "string" && cv.photo.length > 0 ? cv.photo : null;
      const qr = await qrDataUrlFor(publicUrl);
      const buffer = await renderPdfBuffer(
        React.createElement(CvPdfDocument, {
          data: toDossier(cv),
          templateId: safeTemplateId(theme.webTemplate),
          photo,
          qrDataUrl: qr,
          onlineUrl: publicUrl,
        })
      );
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${sanitizeFilename(nomComplet)}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (cvId !== "") {
      // Mode bibliothèque : propriétaire connecté uniquement.
      const userId = await requireUserId();
      if (!userId) {
        return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
      }
      if (cvId.length > 64) {
        return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
      }
      const row = await prisma.cvDocument.findUnique({ where: { id: cvId } });
      if (!row || row.userId !== userId) {
        return NextResponse.json({ error: "CV introuvable." }, { status: 404 });
      }
      if (row.trashedAt) {
        return NextResponse.json(
          { error: "Ce CV est dans la corbeille : restaurez-le pour télécharger son PDF." },
          { status: 409 }
        );
      }
      const cv = asRecord(row.data);
      const design = asRecord(row.design);

      // Photo + lien public repris de la publication existante si disponible.
      let photo: string | null = null;
      let publicUrl: string | null = null;
      if (typeof row.publishedSlug === "string" && row.publishedSlug !== "") {
        try {
          const pub = await prisma.publicResume.findUnique({ where: { slug: row.publishedSlug } });
          const pubCv = asRecord(pub?.cvData);
          if (typeof pubCv.photo === "string" && pubCv.photo.length > 0) photo = pubCv.photo;
          if (pub?.isPublic) publicUrl = `${originFrom(request)}/u/${row.publishedSlug}`;
        } catch (error) {
          console.error("[api/public-cv/pdf] Publication existante illisible :", error);
        }
      }

      const qr = publicUrl ? await qrDataUrlFor(publicUrl) : null;
      const nomComplet = str(asRecord(cv.personal).fullName) || "Candidat";
      const buffer = await renderPdfBuffer(
        React.createElement(CvPdfDocument, {
          data: toDossier(cv),
          templateId: safeTemplateId(mapDesignTemplate(str(design.template))),
          photo,
          qrDataUrl: qr,
          onlineUrl: publicUrl,
        })
      );
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${sanitizeFilename(nomComplet)}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json(
      { error: "Paramètre attendu : slug (public) ou cv (bibliothèque)." },
      { status: 400 }
    );
  } catch (error) {
    console.error("[api/public-cv/pdf][GET]", error);
    return NextResponse.json(
      { error: "La génération du PDF a échoué. Réessayez." },
      { status: 500 }
    );
  }
}