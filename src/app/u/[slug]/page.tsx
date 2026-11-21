import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  IconAward,
  IconBriefcase,
  IconDownload,
  IconFileText,
  IconLanguage,
  IconMail,
  IconMapPin,
  IconPhone,
  IconSchool,
  IconWorld,
} from "@tabler/icons-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation défensive du JSON cvData : accepte plusieurs formes de clés
// (identite/identity, fullName/nom, experiences/experience, skills/competences…)
// et renvoie une structure fiable pour le rendu. Ne lève JAMAIS d'exception.
// ─────────────────────────────────────────────────────────────────────────────

interface ExperienceNorm {
  poste: string;
  entreprise: string;
  periode: string;
  description: string;
}
interface FormationNorm {
  diplome: string;
  etablissement: string;
  periode: string;
}
interface LangueNorm {
  nom: string;
  niveau: string;
}
interface NormalizedCv {
  fullName: string;
  jobTitle: string;
  summary: string;
  photoUrl: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  experiences: ExperienceNorm[];
  formations: FormationNorm[];
  competences: string[];
  langues: LangueNorm[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function pickString(source: Record<string, unknown> | null, keys: string[]): string {
  if (!source) return "";
  for (const key of keys) {
    const value = asString(source[key]);
    if (value !== "") return value;
  }
  return "";
}
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function asTextOrList(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        const entry = asRecord(item);
        return entry ? pickString(entry, ["text", "contenu", "point", "description"]) : "";
      })
      .filter(Boolean)
      .join(" ");
  }
  return "";
}
function buildPeriode(record: Record<string, unknown>): string {
  const debut = pickString(record, ["startDate", "dateDebut", "debut", "datedebut", "de"]);
  const fin = pickString(record, ["endDate", "dateFin", "fin", "au"]);
  const current = typeof record.current === "boolean" && record.current ? "Aujourd'hui" : "";
  const finReelle = fin !== "" ? fin : current;
  if (debut === "" && finReelle === "") return "";
  if (finReelle === "") return debut;
  if (debut === "") return finReelle;
  return `${debut} — ${finReelle}`;
}

function normalizeCvData(raw: unknown): NormalizedCv {
  const record = asRecord(raw) ?? {};
  const identity =
    asRecord(record.identite) ?? asRecord(record.identity) ?? asRecord(record.contact) ?? record;

  let fullName = pickString(identity, ["fullName", "nomComplet", "nom", "name", "fullname"]);
  if (fullName === "") {
    const prenom = pickString(identity, ["prenom", "firstName"]);
    const nom = pickString(identity, ["nomFamille", "lastName"]);
    fullName = [prenom, nom].filter(Boolean).join(" ").trim();
  }

  const jobTitle =
    pickString(identity, ["jobTitle", "titre", "poste", "title"]) ||
    pickString(record, ["jobTitle", "titre", "poste", "title"]);
  const summary = pickString(record, ["resume", "résumé", "summary", "profil", "about", "resumePro"]);

  const contact = asRecord(identity.contact) ?? identity;
  const email = pickString(contact, ["email", "mail"]);
  const phone = pickString(contact, ["phone", "telephone", "téléphone", "tel"]);
  const location = pickString(contact, ["location", "adresse", "ville", "city"]);
  const website = pickString(contact, ["website", "siteWeb", "site", "url", "linkedin"]);
  const photoUrl =
    pickString(identity, ["photoUrl", "photo", "avatar", "image"]) ||
    pickString(record, ["photoUrl", "photo", "avatar"]);

  const experiences: ExperienceNorm[] = asArray(
    record.experiences ?? record.experience ?? record.experiencesPro,
  )
    .map((item) => {
      const entry = asRecord(item);
      if (!entry) {
        const texte = asString(item);
        return { poste: texte, entreprise: "", periode: "", description: "" };
      }
      return {
        poste: pickString(entry, ["poste", "titre", "title", "role", "jobTitle", "fonction"]),
        entreprise: pickString(entry, ["entreprise", "company", "societe", "employeur"]),
        periode: pickString(entry, ["periode", "période", "dates", "period"]) || buildPeriode(entry),
        description: asTextOrList(entry.description ?? entry.details ?? entry.detail),
      };
    })
    .filter((item) => item.poste !== "" || item.entreprise !== "" || item.description !== "");

  const formations: FormationNorm[] = asArray(record.formations ?? record.education ?? record.etudes)
    .map((item) => {
      const entry = asRecord(item);
      if (!entry) {
        const texte = asString(item);
        return { diplome: texte, etablissement: "", periode: "" };
      }
      return {
        diplome: pickString(entry, ["diplome", "diplôme", "titre", "degree", "title", "formation"]),
        etablissement: pickString(entry, [
          "etablissement", "établissement", "school", "ecole", "école", "institution", "university",
        ]),
        periode: pickString(entry, ["periode", "période", "dates", "period"]) || buildPeriode(entry),
      };
    })
    .filter((item) => item.diplome !== "" || item.etablissement !== "");

  const rawCompetences = record.competences ?? record.skills ?? record.competencesCles ?? [];
  let competences: string[] = [];
  if (typeof rawCompetences === "string") {
    competences = rawCompetences.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
  } else {
    competences = asArray(rawCompetences)
      .map((item) => {
        if (typeof item === "string") return item.trim();
        const entry = asRecord(item);
        if (!entry) return "";
        const nom = pickString(entry, ["nom", "name", "label", "titre", "skill"]);
        if (nom === "") return "";
        const niveau = pickString(entry, ["niveau", "level"]);
        return niveau !== "" ? `${nom} (${niveau})` : nom;
      })
      .filter(Boolean);
  }

  const langues: LangueNorm[] = asArray(record.langues ?? record.languages)
    .map((item) => {
      if (typeof item === "string") {
        const parts = item.split(/[:\-–—]/).map((part) => part.trim());
        return { nom: parts[0] ?? "", niveau: parts[1] ?? "" };
      }
      const entry = asRecord(item);
      if (!entry) return { nom: "", niveau: "" };
      return {
        nom: pickString(entry, ["nom", "name", "langue", "language", "label"]),
        niveau: pickString(entry, ["niveau", "level"]),
      };
    })
    .filter((item) => item.nom !== "");

  return {
    fullName, jobTitle, summary, photoUrl, email, phone, location, website,
    experiences, formations, competences, langues,
  };
}

// ─────────────────────────────── SEO dynamique ───────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const row = await prisma.publicResume.findFirst({ where: { slug, isPublic: true } });
  if (!row) return { title: "CV introuvable — NexiRole" };
  const cv = normalizeCvData(row.cvData);
  const name = cv.fullName !== "" ? cv.fullName : "Candidat";
  const fullTitle = cv.jobTitle !== "" ? `${name} — ${cv.jobTitle}` : `${name} — CV en ligne`;
  const description = (
    cv.summary !== "" ? cv.summary : `Découvrez le CV en ligne de ${name}, propulsé par NexiRole.`
  ).slice(0, 180);
  return {
    title: fullTitle,
    description,
    openGraph: { title: fullTitle, description, type: "profile" },
    twitter: { card: "summary_large_image", title: fullTitle, description },
  };
}

// ─────────────────────────────── Page publique ───────────────────────────────

function SectionTitle({ icon: Icon, children }: { icon: typeof IconBriefcase; children: ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FFC107]/20 text-[#051937]">
        <Icon size={20} stroke={1.8} />
      </span>
      <h2 className="text-lg font-bold tracking-tight text-[#051937]">{children}</h2>
    </div>
  );
}

export default async function PublicResumePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const row = await prisma.publicResume.findFirst({ where: { slug, isPublic: true } });
  if (!row) notFound();

  // Compteur de vues : incrément asynchrone, non bloquant pour le rendu.
  void prisma.publicResume
    .update({ where: { id: row.id }, data: { viewsCount: { increment: 1 } } })
    .catch(() => undefined);

  const cv = normalizeCvData(row.cvData);
  const initials =
    cv.fullName
      .split(/\s+/)
      .map((part) => part.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase() || "CV";

  const contacts = [
    { icon: IconMail, value: cv.email, href: cv.email !== "" ? `mailto:${cv.email}` : null },
    {
      icon: IconPhone,
      value: cv.phone,
      href: cv.phone !== "" ? `tel:${cv.phone.replace(/\s+/g, "")}` : null,
    },
    { icon: IconMapPin, value: cv.location, href: null },
    { icon: IconWorld, value: cv.website, href: cv.website !== "" ? cv.website : null },
  ].filter((item) => item.value !== "");

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <style>{`@media print { @page { margin: 12mm; } .nr-header { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }`}</style>

      <header className="nr-header bg-[#051937] text-white">
        <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-5">
              {cv.photoUrl !== "" ? (
                <img
                  src={cv.photoUrl}
                  alt={cv.fullName !== "" ? cv.fullName : "Photo du candidat"}
                  className="h-20 w-20 shrink-0 rounded-full border-4 border-[#FFC107] object-cover"
                />
              ) : (
                <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-[#FFC107] bg-white/10 text-2xl font-bold text-[#FFC107]">
                  {initials}
                </span>
              )}
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {cv.fullName !== "" ? cv.fullName : "CV en ligne"}
                </h1>
                {cv.jobTitle !== "" && (
                  <p className="mt-1 text-base font-medium text-[#FFC107] sm:text-lg">{cv.jobTitle}</p>
                )}
                {contacts.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-white/75">
                    {contacts.map(({ icon: Icon, value, href }, index) => (
                      <span key={index} className="inline-flex items-center gap-1.5">
                        <Icon size={15} stroke={1.8} className="text-[#FFC107]" />
                        {href !== null ? (
                          <a
                            href={href}
                            className="hover:text-white hover:underline"
                            target={href.startsWith("http") ? "_blank" : undefined}
                            rel={href.startsWith("http") ? "noreferrer" : undefined}
                          >
                            {value}
                          </a>
                        ) : (
                          <span>{value}</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button
              id="nr-print-btn"
              type="button"
              className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-[#FFC107] px-4 py-2.5 text-sm font-semibold text-[#051937] shadow-sm transition hover:bg-[#FFD056] print:hidden"
            >
              <IconDownload size={18} stroke={1.8} />
              Télécharger en PDF
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-8 sm:px-6">
        {cv.summary !== "" && (
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <SectionTitle icon={IconFileText}>Résumé</SectionTitle>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{cv.summary}</p>
          </section>
        )}

        {cv.experiences.length > 0 && (
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <SectionTitle icon={IconBriefcase}>Expériences professionnelles</SectionTitle>
            <ul className="space-y-5">
              {cv.experiences.map((experience, index) => (
                <li key={index} className="border-l-2 border-[#FFC107] pl-4">
                  <p className="font-semibold text-[#051937]">
                    {experience.poste !== "" ? experience.poste : "Expérience"}
                  </p>
                  {(experience.entreprise !== "" || experience.periode !== "") && (
                    <p className="mt-0.5 text-sm text-slate-500">
                      {[experience.entreprise, experience.periode].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {experience.description !== "" && (
                    <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                      {experience.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {cv.formations.length > 0 && (
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <SectionTitle icon={IconSchool}>Formations</SectionTitle>
            <ul className="space-y-5">
              {cv.formations.map((formation, index) => (
                <li key={index} className="border-l-2 border-[#FFC107] pl-4">
                  <p className="font-semibold text-[#051937]">
                    {formation.diplome !== "" ? formation.diplome : "Formation"}
                  </p>
                  {(formation.etablissement !== "" || formation.periode !== "") && (
                    <p className="mt-0.5 text-sm text-slate-500">
                      {[formation.etablissement, formation.periode].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {cv.competences.length > 0 && (
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <SectionTitle icon={IconAward}>Compétences</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {cv.competences.map((competence, index) => (
                <span
                  key={index}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-[#051937]"
                >
                  {competence}
                </span>
              ))}
            </div>
          </section>
        )}

        {cv.langues.length > 0 && (
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <SectionTitle icon={IconLanguage}>Langues</SectionTitle>
            <ul className="flex flex-wrap gap-2">
              {cv.langues.map((langue, index) => (
                <li
                  key={index}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm"
                >
                  <span className="font-semibold text-[#051937]">{langue.nom}</span>
                  {langue.niveau !== "" && (
                    <span className="rounded-full bg-[#FFC107]/25 px-2 py-0.5 text-xs font-semibold text-[#051937]">
                      {langue.niveau}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-sm text-slate-500 print:hidden">
        CV interactif propulsé par{" "}
        <Link
          href="/"
          className="font-semibold text-[#051937] underline decoration-[#FFC107] decoration-2 underline-offset-2 hover:text-[#0A2A5C]"
        >
          NexiRole
        </Link>{" "}
        — Créez le vôtre gratuitement
      </footer>

      <script
        dangerouslySetInnerHTML={{
          __html: `if (!window.__nrPrintBound) { window.__nrPrintBound = true; document.addEventListener("click", function (event) { var el = event.target; if (el && el.id === "nr-print-btn") { window.print(); } }); }`,
        }}
      />
    </div>
  );
}