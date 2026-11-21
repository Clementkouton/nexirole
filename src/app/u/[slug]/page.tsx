import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  IconPrinter, IconQrcode, IconEye, IconWorld, IconMail, IconPhone, IconMapPin, IconLink,
} from "@tabler/icons-react";

export const dynamic = "force-dynamic";

/* ---------------- types + helpers ---------------- */

type NormalizedCv = {
  name: string; title: string; photo: string | null;
  email: string; phone: string; location: string; website: string;
  summary: string;
  experiences: { role: string; company: string; period: string; description: string }[];
  educations: { degree: string; school: string; period: string }[];
  skills: string[]; languages: string[];
};

function asRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function asText(v: unknown): string { return typeof v === "string" ? v.trim() : ""; }
function asArr(v: unknown): unknown[] { return Array.isArray(v) ? v : []; }

function pickPeriod(o: Record<string, unknown>): string {
  const start = asText(o.startDate) || asText(o.start) || asText(o.from) || asText(o.dateDebut);
  const end = asText(o.endDate) || asText(o.end) || asText(o.to) || asText(o.dateFin) || (o.current === true ? "Aujourd'hui" : "");
  if (start && end) return `${start} — ${end}`;
  return start || end || asText(o.period) || asText(o.periode);
}

function normalizeCv(raw: unknown): NormalizedCv {
  const root = asRec(raw) ?? {};
  const personal = asRec(root.personal) ?? {};
  const name = asText(personal.fullName) || asText(root.fullName) || asText(personal.name) || asText(root.name) || "CV";
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
  return {
    name, title: asText(personal.title) || asText(root.title) || asText(root.jobTitle), photo,
    email: asText(personal.email) || asText(root.email),
    phone: asText(personal.phone) || asText(root.phone),
    location: asText(personal.location) || asText(personal.city) || asText(root.location),
    website: asText(personal.website) || asText(root.website) || asText(root.linkedin),
    summary: asText(root.summary) || asText(root.objective) || asText(root.profile) || asText(root.profil),
    experiences, educations,
    skills: asArr(root.skills ?? root.competences).map((s) => (typeof s === "string" ? s : asText(asRec(s)?.name))).filter(Boolean),
    languages: asArr(root.languages ?? root.langues).map((l) => (typeof l === "string" ? l : asText(asRec(l)?.name))).filter(Boolean),
  };
}

function extractWebTheme(raw: unknown, templateColumn: string | null): { webTemplate: string; accentColor: string } {
  const root = asRec(raw) ?? {};
  const theme = asRec(root.theme) ?? {};
  const accent = typeof theme.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(theme.accentColor) ? theme.accentColor : "#FFC107";
  const web = (typeof theme.webTemplate === "string" && theme.webTemplate) || templateColumn || "classique";
  return { webTemplate: web, accentColor: accent };
}

function mix(hex: string, target: number, ratio: number): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16) || 0;
  const g = parseInt(n.slice(2, 4), 16) || 0;
  const b = parseInt(n.slice(4, 6), 16) || 0;
  const c = (v: number) => Math.round((target - v) * ratio + v);
  return `#${[c(r), c(g), c(b)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
const darken = (hex: string, r = 0.25) => mix(hex, 0, r);

/* ---------------- briques communes ---------------- */

function Photo({ src, size, ring }: { src: string | null; size: number; ring?: string }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="Photo de profil" width={size} height={size}
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size, border: `3px solid ${ring ?? "#FFC107"}` }} />
  );
}

function ContactChips({ cv, dark = false, accent }: { cv: NormalizedCv; dark?: boolean; accent: string }) {
  const cls = dark ? "text-slate-200" : "text-slate-600";
  const items = [
    cv.email ? { icon: <IconMail size={14} stroke={1.6} />, text: cv.email, href: `mailto:${cv.email}` } : null,
    cv.phone ? { icon: <IconPhone size={14} stroke={1.6} />, text: cv.phone, href: `tel:${cv.phone}` } : null,
    cv.location ? { icon: <IconMapPin size={14} stroke={1.6} />, text: cv.location, href: null } : null,
    cv.website ? { icon: <IconLink size={14} stroke={1.6} />, text: cv.website, href: cv.website } : null,
  ].filter(Boolean) as { icon: React.ReactNode; text: string; href: string | null }[];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((it, i) => {
        const inner = <span className={`inline-flex items-center gap-1 text-xs ${cls}`}>{it.icon}<span>{it.text}</span></span>;
        return it.href
          ? <a key={i} href={it.href} className="hover:underline" style={{ color: dark ? undefined : darken(accent, 0.35) }}>{inner}</a>
          : <span key={i}>{inner}</span>;
      })}
    </div>
  );
}

function SectionTitle({ children, accent, variant = "bar" }: { children: React.ReactNode; accent: string; variant?: "bar" | "underline" | "plain" }) {
  if (variant === "underline") {
    return <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: darken(accent, 0.35), borderBottom: `2px solid ${accent}`, paddingBottom: 4 }}>{children}</h2>;
  }
  if (variant === "plain") {
    return <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-800">{children}</h2>;
  }
  return (
    <h2 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-[#051937]">
      <span className="inline-block h-3.5 w-1 rounded" style={{ backgroundColor: accent }} />
      {children}
    </h2>
  );
}

function ExpItem({ e, accent, timeline = false }: { e: NormalizedCv["experiences"][number]; accent: string; timeline?: boolean }) {
  if (timeline) {
    return (
      <div className="relative border-l-2 pb-4 pl-4" style={{ borderColor: `${accent}66` }}>
        <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 bg-white" style={{ borderColor: accent }} />
        <p className="text-sm font-semibold text-slate-900">{e.role}</p>
        <p className="mb-1 text-xs" style={{ color: darken(accent, 0.35) }}>{e.company}{e.period ? ` · ${e.period}` : ""}</p>
        {e.description ? <p className="whitespace-pre-line text-[13px] leading-relaxed text-slate-600">{e.description}</p> : null}
      </div>
    );
  }
  return (
    <div className="mb-3">
      <p className="text-sm font-semibold text-slate-900">{e.role}</p>
      <p className="text-xs" style={{ color: darken(accent, 0.35) }}>{e.company}{e.period ? ` · ${e.period}` : ""}</p>
      {e.description ? <p className="mt-0.5 whitespace-pre-line text-[13px] leading-relaxed text-slate-600">{e.description}</p> : null}
    </div>
  );
}

function SkillChips({ skills, accent }: { skills: string[]; accent: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {skills.map((s, i) => (
        <span key={i} className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: `${accent}22`, color: "#0F172A" }}>{s}</span>
      ))}
    </div>
  );
}

function CvSection({ title, accent, variant, children }: { title: string; accent: string; variant?: "bar" | "underline" | "plain"; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <SectionTitle accent={accent} variant={variant}>{title}</SectionTitle>
      {children}
    </section>
  );
}

/* ---------------- les 7 modèles Web ---------------- */

function TplClassique({ cv, accent }: { cv: NormalizedCv; accent: string }) {
  return (
    <div>
      <header className="px-8 py-7 text-center" style={{ backgroundColor: "#051937" }}>
        <div className="mb-3 flex justify-center"><Photo src={cv.photo} size={84} ring={accent} /></div>
        <h1 className="text-2xl font-bold text-white">{cv.name}</h1>
        {cv.title ? <p className="mt-1 text-sm" style={{ color: accent }}>{cv.title}</p> : null}
        <div className="mt-3 flex justify-center"><ContactChips cv={cv} dark accent={accent} /></div>
      </header>
      <div className="p-8">
        {cv.summary ? <CvSection title="Profil" accent={accent}>{<p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{cv.summary}</p>}</CvSection> : null}
        {cv.experiences.length ? <CvSection title="Expérience professionnelle" accent={accent}>{cv.experiences.map((e, i) => <ExpItem key={i} e={e} accent={accent} />)}</CvSection> : null}
        {cv.educations.length ? <CvSection title="Formation" accent={accent}>{cv.educations.map((d, i) => (<div key={i} className="mb-2"><p className="text-sm font-semibold text-slate-900">{d.degree}</p><p className="text-xs text-slate-500">{d.school}{d.period ? ` · ${d.period}` : ""}</p></div>))}</CvSection> : null}
        {cv.skills.length ? <CvSection title="Compétences" accent={accent}><SkillChips skills={cv.skills} accent={accent} /></CvSection> : null}
        {cv.languages.length ? <CvSection title="Langues" accent={accent}><SkillChips skills={cv.languages} accent={accent} /></CvSection> : null}
      </div>
    </div>
  );
}

function TplModerne({ cv, accent }: { cv: NormalizedCv; accent: string }) {
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="w-full p-6 text-white md:w-[240px]" style={{ backgroundColor: "#051937" }}>
        <div className="mb-4 flex justify-center"><Photo src={cv.photo} size={100} ring={accent} /></div>
        <h1 className="text-lg font-bold">{cv.name}</h1>
        {cv.title ? <p className="mb-4 text-xs" style={{ color: accent }}>{cv.title}</p> : null}
        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: accent }}>Contact</p>
        <div className="mb-4 [&_a]:text-slate-200 [&_span]:text-slate-200"><ContactChips cv={cv} dark accent={accent} /></div>
        {cv.skills.length ? (<><p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: accent }}>Compétences</p><div className="flex flex-col gap-1">{cv.skills.map((s, i) => <span key={i} className="text-xs text-slate-200">· {s}</span>)}</div></>) : null}
      </aside>
      <main className="flex-1 p-7">
        {cv.summary ? <CvSection title="Profil" accent={accent}>{<p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{cv.summary}</p>}</CvSection> : null}
        {cv.experiences.length ? <CvSection title="Expérience professionnelle" accent={accent}>{cv.experiences.map((e, i) => <ExpItem key={i} e={e} accent={accent} />)}</CvSection> : null}
        {cv.educations.length ? <CvSection title="Formation" accent={accent}>{cv.educations.map((d, i) => (<div key={i} className="mb-2"><p className="text-sm font-semibold text-slate-900">{d.degree}</p><p className="text-xs text-slate-500">{d.school}{d.period ? ` · ${d.period}` : ""}</p></div>))}</CvSection> : null}
        {cv.languages.length ? <CvSection title="Langues" accent={accent}><SkillChips skills={cv.languages} accent={accent} /></CvSection> : null}
      </main>
    </div>
  );
}

function TplExecutif({ cv, accent }: { cv: NormalizedCv; accent: string }) {
  return (
    <div>
      <header className="px-8 pb-6 pt-8" style={{ backgroundColor: "#051937" }}>
        <div className="flex items-center gap-5">
          <Photo src={cv.photo} size={76} ring={accent} />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">{cv.name}</h1>
            {cv.title ? <p className="mt-0.5 text-sm" style={{ color: accent }}>{cv.title}</p> : null}
          </div>
        </div>
        <div className="mt-4"><ContactChips cv={cv} dark accent={accent} /></div>
      </header>
      <div className="h-1" style={{ backgroundColor: accent }} />
      <div className="grid gap-6 p-8 md:grid-cols-[1.6fr_1fr]">
        <div>
          {cv.summary ? <CvSection title="Profil" accent={accent}>{<p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{cv.summary}</p>}</CvSection> : null}
          {cv.experiences.length ? <CvSection title="Expérience professionnelle" accent={accent}>{cv.experiences.map((e, i) => <ExpItem key={i} e={e} accent={accent} />)}</CvSection> : null}
        </div>
        <div>
          {cv.educations.length ? <CvSection title="Formation" accent={accent}>{cv.educations.map((d, i) => (<div key={i} className="mb-2"><p className="text-sm font-semibold text-slate-900">{d.degree}</p><p className="text-xs text-slate-500">{d.school}{d.period ? ` · ${d.period}` : ""}</p></div>))}</CvSection> : null}
          {cv.skills.length ? <CvSection title="Compétences" accent={accent}><SkillChips skills={cv.skills} accent={accent} /></CvSection> : null}
          {cv.languages.length ? <CvSection title="Langues" accent={accent}><SkillChips skills={cv.languages} accent={accent} /></CvSection> : null}
        </div>
      </div>
    </div>
  );
}

function TplMinimal({ cv, accent }: { cv: NormalizedCv; accent: string }) {
  return (
    <div className="p-9">
      <header className="mb-6 flex items-center gap-5 border-b pb-5" style={{ borderColor: accent }}>
        <Photo src={cv.photo} size={64} ring="#E2E8F0" />
        <div className="flex-1">
          <h1 className="text-[26px] font-bold tracking-tight text-[#051937]">{cv.name}</h1>
          {cv.title ? <p className="text-sm text-slate-500">{cv.title}</p> : null}
        </div>
        <ContactChips cv={cv} accent="#051937" />
      </header>
      {cv.summary ? <CvSection title="Profil" accent={accent} variant="plain">{<p className="mb-4 whitespace-pre-line text-sm leading-relaxed text-slate-600">{cv.summary}</p>}</CvSection> : null}
      {cv.experiences.length ? <CvSection title="Expérience" accent={accent} variant="plain">{cv.experiences.map((e, i) => <ExpItem key={i} e={e} accent={accent} />)}</CvSection> : null}
      {cv.educations.length ? <CvSection title="Formation" accent={accent} variant="plain">{cv.educations.map((d, i) => (<div key={i} className="mb-2"><p className="text-sm font-semibold text-slate-900">{d.degree}</p><p className="text-xs text-slate-500">{d.school}{d.period ? ` · ${d.period}` : ""}</p></div>))}</CvSection> : null}
      {cv.skills.length ? <p className="mb-4 text-[13px] leading-relaxed text-slate-700">{cv.skills.join("  ·  ")}</p> : null}
      {cv.languages.length ? <p className="text-[13px] text-slate-700">{cv.languages.join("  ·  ")}</p> : null}
    </div>
  );
}

function TplColonne({ cv, accent }: { cv: NormalizedCv; accent: string }) {
  return (
    <div className="p-8">
      <header className="mb-6 flex items-center gap-4">
        <Photo src={cv.photo} size={70} ring={accent} />
        <div>
          <h1 className="text-xl font-bold text-[#051937]">{cv.name}</h1>
          {cv.title ? <p className="text-sm" style={{ color: darken(accent, 0.35) }}>{cv.title}</p> : null}
          <div className="mt-1.5"><ContactChips cv={cv} accent={accent} /></div>
        </div>
      </header>
      <div className="grid gap-7 md:grid-cols-2">
        <div className="md:border-r md:border-slate-200 md:pr-7">
          {cv.summary ? <CvSection title="Profil" accent={accent}>{<p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{cv.summary}</p>}</CvSection> : null}
          {cv.experiences.length ? <CvSection title="Expérience" accent={accent}>{cv.experiences.map((e, i) => <ExpItem key={i} e={e} accent={accent} />)}</CvSection> : null}
        </div>
        <div>
          {cv.educations.length ? <CvSection title="Formation" accent={accent}>{cv.educations.map((d, i) => (<div key={i} className="mb-2"><p className="text-sm font-semibold text-slate-900">{d.degree}</p><p className="text-xs text-slate-500">{d.school}{d.period ? ` · ${d.period}` : ""}</p></div>))}</CvSection> : null}
          {cv.skills.length ? <CvSection title="Compétences" accent={accent}><SkillChips skills={cv.skills} accent={accent} /></CvSection> : null}
          {cv.languages.length ? <CvSection title="Langues" accent={accent}><SkillChips skills={cv.languages} accent={accent} /></CvSection> : null}
        </div>
      </div>
    </div>
  );
}

function TplTimeline({ cv, accent }: { cv: NormalizedCv; accent: string }) {
  return (
    <div className="p-8">
      <header className="mb-6" style={{ borderBottom: `2px solid ${accent}` }}>
        <div className="flex items-center gap-4 pb-4">
          <Photo src={cv.photo} size={64} ring={accent} />
          <div>
            <h1 className="text-xl font-bold text-[#051937]">{cv.name}</h1>
            {cv.title ? <p className="text-sm text-slate-500">{cv.title}</p> : null}
            <div className="mt-1"><ContactChips cv={cv} accent={accent} /></div>
          </div>
        </div>
      </header>
      {cv.summary ? <CvSection title="Profil" accent={accent}>{<p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{cv.summary}</p>}</CvSection> : null}
      {cv.experiences.length ? <CvSection title="Parcours" accent={accent}>{cv.experiences.map((e, i) => <ExpItem key={i} e={e} accent={accent} timeline />)}</CvSection> : null}
      {cv.educations.length ? <CvSection title="Formation" accent={accent}>{cv.educations.map((d, i) => <ExpItem key={i} e={{ role: d.degree, company: d.school, period: d.period, description: "" }} accent={accent} timeline />)}</CvSection> : null}
      {cv.skills.length ? <CvSection title="Compétences" accent={accent}><SkillChips skills={cv.skills} accent={accent} /></CvSection> : null}
    </div>
  );
}

function TplCompact({ cv, accent }: { cv: NormalizedCv; accent: string }) {
  return (
    <div className="p-7">
      <header className="mb-4 flex items-center justify-between gap-4 rounded-lg px-4 py-3" style={{ backgroundColor: "#051937" }}>
        <div className="flex items-center gap-3">
          <Photo src={cv.photo} size={46} ring={accent} />
          <div>
            <h1 className="text-base font-bold text-white">{cv.name}</h1>
            <p className="text-[11px]" style={{ color: accent }}>{cv.title}</p>
          </div>
        </div>
        <ContactChips cv={cv} dark accent={accent} />
      </header>
      {cv.summary ? <CvSection title="Profil" accent={accent}>{<p className="whitespace-pre-line text-[13px] leading-relaxed text-slate-600">{cv.summary}</p>}</CvSection> : null}
      {cv.experiences.length ? <CvSection title="Expérience professionnelle" accent={accent}>{cv.experiences.map((e, i) => <ExpItem key={i} e={e} accent={accent} />)}</CvSection> : null}
      {cv.educations.length ? <CvSection title="Formation" accent={accent}>{cv.educations.map((d, i) => (<div key={i} className="mb-2"><p className="text-[13px] font-semibold text-slate-900">{d.degree}</p><p className="text-xs text-slate-500">{d.school}{d.period ? ` · ${d.period}` : ""}</p></div>))}</CvSection> : null}
      {cv.skills.length ? <p className="text-[13px] leading-relaxed text-slate-700">{cv.skills.join(", ")}</p> : null}
      {cv.languages.length ? <p className="mt-2 text-[13px] text-slate-700">{cv.languages.join(", ")}</p> : null}
    </div>
  );
}

function renderWebTemplate(template: string, cv: NormalizedCv, accent: string) {
  switch (template) {
    case "moderne": return <TplModerne cv={cv} accent={accent} />;
    case "executif": return <TplExecutif cv={cv} accent={accent} />;
    case "minimal": return <TplMinimal cv={cv} accent={accent} />;
    case "colonne": return <TplColonne cv={cv} accent={accent} />;
    case "timeline": return <TplTimeline cv={cv} accent={accent} />;
    case "compact": return <TplCompact cv={cv} accent={accent} />;
    default: return <TplClassique cv={cv} accent={accent} />;
  }
}

/* ---------------- SEO ---------------- */

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const row = await prisma.publicResume.findUnique({ where: { slug }, select: { isPublic: true, cvData: true } });
    if (!row || row.isPublic !== true) return { title: "CV introuvable — NexiRole" };
    const cv = normalizeCv(row.cvData);
    const description = (cv.summary || `CV en ligne de ${cv.name}`).slice(0, 160);
    return {
      title: cv.name ? `${cv.name}${cv.title ? ` — ${cv.title}` : ""}` : "CV en ligne — NexiRole",
      description,
      robots: { index: true, follow: true },
      openGraph: { title: cv.name || "CV en ligne", description, type: "profile" },
    };
  } catch {
    return { title: "CV en ligne — NexiRole" };
  }
}

/* ---------------- page ---------------- */

export default async function PublicCvPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let row: { id: string; slug: string; isPublic: boolean; viewsCount: number; templateId: string | null; cvData: unknown } | null = null;
  try {
    row = await prisma.publicResume.findUnique({
      where: { slug },
      select: { id: true, slug: true, isPublic: true, viewsCount: true, templateId: true, cvData: true },
    });
  } catch {
    notFound();
  }
  if (!row || row.isPublic !== true) notFound();

  void prisma.publicResume.update({ where: { id: row.id }, data: { viewsCount: { increment: 1 } } }).catch(() => undefined);

  const cv = normalizeCv(row.cvData);
  const theme = extractWebTheme(row.cvData, row.templateId);
  const pdfUrl = `/api/public-cv?slug=${encodeURIComponent(row.slug)}&format=pdf`;

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <style dangerouslySetInnerHTML={{ __html: `@media print{.nr-no-print{display:none!important}body{background:#fff!important}.nr-page{box-shadow:none!important;margin:0!important;max-width:100%!important;border-radius:0!important}@page{margin:12mm}}` }} />
      <script dangerouslySetInnerHTML={{ __html: `document.addEventListener('DOMContentLoaded',function(){var b=document.getElementById('nr-print-btn');if(b){b.addEventListener('click',function(){window.print();});}});` }} />

      <div className="nr-no-print mx-auto flex max-w-[860px] flex-wrap items-center justify-between gap-2 px-4 pt-5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
          <IconEye size={14} stroke={1.6} /> {(row.viewsCount ?? 0) + 1} vue(s)
        </span>
        <div className="flex gap-2">
          <button id="nr-print-btn" type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#051937] shadow-sm hover:bg-slate-50">
            <IconPrinter size={15} stroke={1.6} /> Imprimer
          </button>
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#051937] shadow-sm hover:brightness-95"
            style={{ backgroundColor: "#FFC107" }}>
            <IconQrcode size={15} stroke={1.6} /> PDF avec QR
          </a>
        </div>
      </div>

      <div className="nr-page mx-auto my-5 max-w-[860px] overflow-hidden rounded-2xl bg-white shadow-xl">
        {renderWebTemplate(theme.webTemplate, cv, theme.accentColor)}
      </div>

      <div className="nr-no-print fixed bottom-0 left-0 right-0 z-50 border-t border-slate-800 bg-[#051937] px-4 py-3">
        <div className="mx-auto flex max-w-[860px] flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-sm text-slate-200">
            <IconWorld size={16} stroke={1.6} className="text-[#FFC107]" />
            CV interactif propulsé par <strong className="text-white">NexiRole</strong>
          </span>
          <Link href="https://nexirole.vercel.app"
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold text-[#051937] hover:brightness-95"
            style={{ backgroundColor: "#FFC107" }}>
            Créer mon CV avec NexiRole
          </Link>
        </div>
      </div>
    </div>
  );
}