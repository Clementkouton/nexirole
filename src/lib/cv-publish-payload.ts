/* ==================================================================
   NexiRole — Utilitaires de publication du CV Builder
   Utilisé par la bibliothèque de CV (/dashboard/cv-builder) et la
   route PDF publique (/api/public-cv/pdf). Le payload produit est
   STRICTEMENT identique à celui du bouton « Publier » du créateur,
   consommé par /api/public-cv/builder (schéma zod existant).
   Aucun effet de bord : fonctions pures.
   ================================================================== */

/** Mapping design du builder -> templateId public/PDF (logique du créateur). */
export function mapDesignTemplate(id: string): string {
  if (id === "sleek") return "sleek-executive";
  if (id === "bold") return "bold-minimalism";
  if (id === "clean") return "clean-ats";
  return "modern-accent";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strList(value: unknown, max = 40): string[] {
  return asArray(value)
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, max);
}

export interface PublishPayload {
  slug?: string;
  theme: {
    webTemplate: string;
    accentColor: string;
    qrTemplate: string;
  };
  data: {
    personal: {
      fullName: string;
      title: string;
      email: string;
      phone: string;
      location: string;
      linkedin: string;
    };
    summary: string;
    experiences: Array<{
      role: string;
      company: string;
      period: string;
      location: string;
      achievements: string[];
    }>;
    education: Array<{
      degree: string;
      school: string;
      period: string;
    }>;
    skills: string[];
    languages: Array<{ name: string; level: string }>;
  };
}

/**
 * Construit le corps de POST /api/public-cv/builder depuis les champs
 * stockés d'un CvDocument (data = CvBuilderData, design = CvDesign).
 * Champs vides filtrés exactement comme le créateur le fait.
 */
export function buildPublishPayload(input: {
  data: unknown;
  design: unknown;
  slug?: string | null;
}): PublishPayload {
  const data = asRecord(input.data);
  const design = asRecord(input.design);
  const personal = asRecord(data.personal);

  const slugRaw = str(input.slug ?? "");
  const accent = (str(design.accent) || "#0F172A").slice(0, 20);

  const payload: PublishPayload = {
    ...(slugRaw !== "" ? { slug: slugRaw } : {}),
    theme: {
      webTemplate: mapDesignTemplate(str(design.template)),
      accentColor: accent,
      qrTemplate: "executif",
    },
    data: {
      personal: {
        fullName: str(personal.fullName).slice(0, 120),
        title: str(personal.title).slice(0, 160),
        email: str(personal.email).slice(0, 160),
        phone: str(personal.phone).slice(0, 40),
        location: str(personal.location).slice(0, 120),
        linkedin: str(personal.linkedin).slice(0, 200),
      },
      summary: str(data.summary).slice(0, 4000),
      experiences: asArray(data.experiences)
        .filter(
          (e) => str(e.role) !== "" || str(e.company) !== "" || asArray(e.achievements).length > 0
        )
        .slice(0, 15)
        .map((e) => ({
          role: str(e.role).slice(0, 160),
          company: str(e.company).slice(0, 160),
          period: str(e.period).slice(0, 80),
          location: str(e.location).slice(0, 120),
          achievements: strList(e.achievements, 12),
        })),
      education: asArray(data.education)
        .filter((e) => str(e.degree) !== "" || str(e.school) !== "")
        .slice(0, 15)
        .map((e) => ({
          degree: str(e.degree).slice(0, 160),
          school: str(e.school).slice(0, 160),
          period: str(e.period).slice(0, 80),
        })),
      skills: strList(data.skills),
      languages: asArray(data.languages)
        .filter((l) => str(l.name) !== "")
        .slice(0, 12)
        .map((l) => ({
          name: str(l.name).slice(0, 60),
          level: str(l.level).slice(0, 60) || "Courant",
        })),
    },
  };

  return payload;
}