/* ============================================================
   NexiRole - Normalisation tolerante des donnees de CV
   Partage : /u/[slug]/page.tsx + api/public-cv/route.ts
   Double export : normalizeCv (nomme) + default
   ============================================================ */

export type NormalizedCvExperience = { role: string; company: string; period: string; description: string };
export type NormalizedCvEducation = { degree: string; school: string; period: string };

export type NormalizedCv = {
  name: string;
  title: string;
  photo: string | null;
  email: string;
  phone: string;
  location: string;
  website: string;
  summary: string;
  experiences: NormalizedCvExperience[];
  educations: NormalizedCvEducation[];
  skills: string[];
  languages: string[];
  isEmpty: boolean;
};

function asRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function asText(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function tryParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}
function get(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}
function firstVal(...vals: unknown[]): unknown {
  for (const v of vals) if (v !== undefined && v !== null && v !== "") return v;
  return undefined;
}

const WRAPPER_KEYS = ["cv", "cvData", "resume", "data", "payload", "content", "parsed", "value"];

function unwrapRoot(v: unknown, depth = 0): Record<string, unknown> {
  if (depth > 4) return {};
  if (typeof v === "string") {
    const parsed = tryParseJson(v);
    return parsed && typeof parsed === "object" ? unwrapRoot(parsed, depth + 1) : {};
  }
  const o = asRec(v);
  if (!o) return {};
  for (const k of WRAPPER_KEYS) {
    const inner = asRec(o[k]);
    if (!inner) continue;
    const outerOthers = Object.keys(o).filter((x) => x !== k && o[x] !== undefined && o[x] !== null && o[x] !== "");
    const innerKeys = Object.keys(inner).filter((x) => inner[x] !== undefined && inner[x] !== null && inner[x] !== "");
    if (innerKeys.length >= 3 && outerOthers.length <= 3) {
      const unwrapped = unwrapRoot(inner, depth + 1);
      const merged: Record<string, unknown> = { ...unwrapped };
      for (const k2 of Object.keys(o)) {
        if (k2 === k) continue;
        if (merged[k2] === undefined) merged[k2] = o[k2];
      }
      return merged;
    }
  }
  return o;
}

function pickPeriod(o: Record<string, unknown>): string {
  const start = asText(get(o, ["startDate", "start", "from", "dateDebut", "beginDate", "debut"]));
  const current = o.current === true || o.currently === true || o.ongoing === true || o.present === true;
  const end = asText(get(o, ["endDate", "end", "to", "dateFin", "fin"])) || (current ? "Aujourd'hui" : "");
  if (start && end) return `${start} — ${end}`;
  return start || end || asText(get(o, ["period", "periode", "dates", "duration", "duree"]));
}

function collectBullets(o: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of ["bullets", "highlights", "missions", "tasks", "responsibilities", "responsabilites", "achievements", "points"]) {
    for (const b of asArr(o[key])) {
      const t = typeof b === "string" ? b.trim() : asText(get(asRec(b) ?? {}, ["text", "label", "value", "content"]));
      if (t) out.push(t);
    }
  }
  return out;
}

function toExperiences(v: unknown): NormalizedCvExperience[] {
  return asArr(v)
    .map((x): NormalizedCvExperience | null => {
      const o = asRec(x);
      if (!o) {
        const s = typeof x === "string" ? x.trim() : "";
        return s ? { role: s, company: "", period: "", description: "" } : null;
      }
      const bullets = collectBullets(o);
      let description = asText(get(o, ["description", "summary", "details", "text", "contenu"]));
      if (bullets.length) {
        const block = bullets.map((b) => `• ${b}`).join("\n");
        description = description ? `${description}\n${block}` : block;
      }
      return {
        role: asText(get(o, ["role", "position", "jobTitle", "title", "poste", "intitule", "metier"])),
        company: asText(get(o, ["company", "employer", "entreprise", "societe", "organisation", "structure"])),
        period: pickPeriod(o),
        description,
      };
    })
    .filter((e): e is NormalizedCvExperience => Boolean(e && (e.role || e.company || e.description)));
}

function toEducations(v: unknown): NormalizedCvEducation[] {
  return asArr(v)
    .map((x): NormalizedCvEducation | null => {
      const o = asRec(x);
      if (!o) {
        const s = typeof x === "string" ? x.trim() : "";
        return s ? { degree: s, school: "", period: "" } : null;
      }
      return {
        degree: asText(get(o, ["degree", "diploma", "diplome", "title", "titre", "formation", "field", "domaine", "study"])),
        school: asText(get(o, ["school", "institution", "ecole", "universite", "university", "organisme"])),
        period: pickPeriod(o),
      };
    })
    .filter((d): d is NormalizedCvEducation => Boolean(d && (d.degree || d.school)));
}

function toNameList(v: unknown): string[] {
  return asArr(v)
    .map((x) => (typeof x === "string" ? x.trim() : asText(get(asRec(x) ?? {}, ["name", "label", "title", "value", "skill", "langue", "language"]))))
    .filter(Boolean);
}

function isImageSrc(v: string): boolean {
  return /^data:image\/(png|jpe?g|jpeg|webp|gif);base64,/.test(v) || /^https?:\/\/\S+$/i.test(v);
}

export function normalizeCv(raw: unknown): NormalizedCv {
  const root = unwrapRoot(raw);
  const personal = asRec(get(root, ["personal", "personnel", "personalInfo", "informationsPersonnelles", "infos", "identity", "identite"])) ?? {};
  const contact = asRec(get(root, ["contact", "contacts", "coordonnees"])) ?? {};
  const scalars = { ...root, ...personal, ...contact };

  const firstName = asText(get(scalars, ["firstName", "prenom", "first_name"]));
  const lastName = asText(get(scalars, ["lastName", "nom", "last_name", "familyName"]));
  const directName = asText(get(scalars, ["fullName", "name", "completeName", "candidateName", "displayName"]));
  const resolvedName = directName || [firstName, lastName].filter(Boolean).join(" ").trim();

  const title = asText(get(scalars, ["jobTitle", "title", "headline", "poste", "titre", "position", "role"]));
  const photoRaw = asText(get(scalars, ["photo", "photoUrl", "profilePhoto", "avatar", "image", "photoDeProfil"]));
  const photo = isImageSrc(photoRaw) ? photoRaw : null;

  const experiences = toExperiences(firstVal(
    root.experiences, root.experience, root.work, root.workExperience, root.workExperiences,
    root.professionalExperiences, root.jobs, root.employment, personal.experiences, personal.experience,
  ));
  const educations = toEducations(firstVal(
    root.educations, root.education, root.formations, root.academicBackground, root.studies, root.formation,
    personal.educations, personal.education,
  ));
  const skills = toNameList(firstVal(root.skills, root.competences, root.skillSet, root.technicalSkills, root.hardSkills, personal.skills));
  const languages = toNameList(firstVal(root.languages, root.langues, root.languageList, personal.languages));
  const summary = asText(get(scalars, ["summary", "profil", "profile", "about", "bio", "objective", "objectif", "professionalSummary", "accroche", "presentation"]));
  const email = asText(get(scalars, ["email", "mail", "courriel"]));
  const phone = asText(get(scalars, ["phone", "telephone", "tel", "mobile", "whatsapp"]));
  const location = asText(get(scalars, ["location", "city", "ville", "address", "adresse", "localisation"]));
  const website = asText(get(scalars, ["website", "url", "site", "portfolio", "linkedin", "github", "siteWeb"]));

  const hasContent = Boolean(resolvedName || summary || email || phone || experiences.length || educations.length || skills.length || languages.length);

  return {
    name: resolvedName || "CV",
    title, photo, email, phone, location, website, summary,
    experiences, educations, skills, languages,
    isEmpty: !hasContent,
  };
}

export function extractTheme(raw: unknown, templateColumn?: string | null): { webTemplate: string; qrTemplate: string; accentColor: string } {
  const direct = asRec(raw) ?? {};
  const directTheme = asRec(direct.theme) ?? {};
  const root = unwrapRoot(raw);
  const innerTheme = asRec(get(root, ["theme", "publicTheme", "design"])) ?? {};
  const theme = Object.keys(directTheme).length ? directTheme : innerTheme;
  const accentRaw = asText(get(theme, ["accentColor", "accent", "color", "couleur"]));
  const accent = /^#[0-9a-fA-F]{6}$/.test(accentRaw) ? accentRaw : "#FFC107";
  const webRaw = asText(get(theme, ["webTemplate", "web", "template"]));
  const qrRaw = asText(get(theme, ["qrTemplate", "qr", "pdfTemplate"]));
  return {
    webTemplate: webRaw || templateColumn || "classique",
    qrTemplate: qrRaw || "executif",
    accentColor: accent,
  };
}

export default normalizeCv;