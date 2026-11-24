"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconArrowRight,
  IconBriefcase,
  IconCheck,
  IconCirclePlus,
  IconCopy,
  IconDeviceFloppy,
  IconDownload,
  IconEye,
  IconId,
  IconLanguage,
  IconLink,
  IconLoader2,
  IconPalette,
  IconPrinter,
  IconQrcode,
  IconSchool,
  IconSparkles,
  IconTrash,
  IconUser,
  IconWand,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { downloadPdf } from "@/lib/download-client";
import { toast } from "sonner";
import type { CvBuilderData } from "@/lib/types";
import { PublicCvStudio } from "@/components/PublicCvStudio";

/* ------------------------------------------------------------------ */
/*  Types & constantes                                                 */
/* ------------------------------------------------------------------ */

type TemplateId = "modern" | "sleek" | "bold" | "clean";
type FontKey = "inter" | "jakarta" | "georgia" | "arial";

interface CvDesign {
  template: TemplateId;
  accent: string;
  headingFont: FontKey;
  bodyFont: FontKey;
  scale: number; // 0.92 | 1 | 1.08
}

interface ImprovementResult {
  resume: string;
  titreSuggere: string;
  experiences: Array<{ index: number; realisations: string[] }>;
  competences: string[];
  conseils: string[];
}

interface SheetProps {
  data: CvBuilderData;
  design: CvDesign;
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const EMPTY_DATA: CvBuilderData = {
  personal: {
    fullName: "",
    title: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
  },
  summary: "",
  experiences: [
    {
      id: "exp-1", role: "", company: "", period: "", location: "", achievements: [""],
      target: undefined
    },
  ],
  education: [{ id: "edu-1", degree: "", school: "", period: "" }],
  skills: [],
  languages: [{ id: "lang-1", name: "", level: "" }],
};

const DEFAULT_DESIGN: CvDesign = {
  template: "modern",
  accent: "#051937",
  headingFont: "jakarta",
  bodyFont: "inter",
  scale: 1,
};

const STORAGE_KEY = "nexirole-cv-builder-v2";
const STORAGE_KEY_V1 = "nexirole-cv-builder-v1";

const STEPS = [
  { id: 0, label: "Infos personnelles", icon: IconId },
  { id: 1, label: "Résumé", icon: IconUser },
  { id: 2, label: "Expériences", icon: IconBriefcase },
  { id: 3, label: "Formations", icon: IconSchool },
  { id: 4, label: "Compétences & langues", icon: IconLanguage },
  { id: 5, label: "Design & modèle", icon: IconPalette },
] as const;

const TEMPLATES: Array<{
  id: TemplateId;
  name: string;
  desc: string;
}> = [
    { id: "modern", name: "Modern Color Accent", desc: "Colonne latérale colorée, très complet" },
    { id: "sleek", name: "Sleek Executive", desc: "Élégant et classique, idéal cadres" },
    { id: "bold", name: "Bold Minimalism", desc: "Typographie forte et contemporaine" },
    { id: "clean", name: "Clean Balanced ATS", desc: "Une colonne, lisibilité ATS maximale" },
  ];

const ACCENT_PRESETS: Array<{ hex: string; name: string }> = [
  { hex: "#051937", name: "Navy NexiRole" },
  { hex: "#FFC107", name: "Or NexiRole" },
  { hex: "#2563EB", name: "Bleu" },
  { hex: "#059669", name: "Émeraude" },
  { hex: "#7C3AED", name: "Violet" },
  { hex: "#DC2626", name: "Rouge" },
  { hex: "#0F172A", name: "Noir" },
  { hex: "#B45309", name: "Ambre" },
];

const FONT_FAMILIES: Record<FontKey, { label: string; stack: string }> = {
  inter: { label: "Inter (moderne)", stack: "var(--font-inter), 'Inter', Arial, sans-serif" },
  jakarta: {
    label: "Plus Jakarta Sans (marque)",
    stack: "var(--font-jakarta), 'Plus Jakarta Sans', Arial, sans-serif",
  },
  georgia: { label: "Georgia (serif classique)", stack: "Georgia, 'Times New Roman', serif" },
  arial: { label: "Arial (sobre / ATS)", stack: "Arial, Helvetica, sans-serif" },
};

const SIZES: Array<{ value: number; label: string }> = [
  { value: 0.92, label: "Compact" },
  { value: 1, label: "Normal" },
  { value: 1.08, label: "Aéré" },
];

/* ------------------------------------------------------------------ */
/*  Utilitaires                                                        */
/* ------------------------------------------------------------------ */

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Normalise des données potentiellement corrompues du localStorage :
 *  chaque champ redevient une vraie chaîne — c'est la garantie anti-formulaire-bloqué. */
function sanitizeData(raw: unknown): CvBuilderData {
  const d = (raw ?? {}) as Partial<CvBuilderData>;
  const p = (d.personal ?? {}) as Partial<CvBuilderData["personal"]>;

  const experiences =
    Array.isArray(d.experiences) && d.experiences.length > 0
      ? d.experiences.map((e) => ({
        id: str(e?.id) || uid(),
        target: str(e?.target),
        role: str(e?.role),
        company: str(e?.company),
        period: str(e?.period),
        location: str(e?.location),
        achievements:
          Array.isArray(e?.achievements) && e.achievements.length > 0
            ? e.achievements.map((a) => str(a))
            : [""],
      }))
      : [{ ...EMPTY_DATA.experiences[0], id: uid() }];

  const education =
    Array.isArray(d.education) && d.education.length > 0
      ? d.education.map((e) => ({
        id: str(e?.id) || uid(),
        degree: str(e?.degree),
        school: str(e?.school),
        period: str(e?.period),
      }))
      : [{ ...EMPTY_DATA.education[0], id: uid() }];

  const languages =
    Array.isArray(d.languages) && d.languages.length > 0
      ? d.languages.map((l) => ({
        id: str(l?.id) || uid(),
        name: str(l?.name),
        level: str(l?.level),
      }))
      : [{ ...EMPTY_DATA.languages[0], id: uid() }];

  return {
    personal: {
      fullName: str(p.fullName),
      title: str(p.title),
      email: str(p.email),
      phone: str(p.phone),
      location: str(p.location),
      linkedin: str(p.linkedin),
    },
    summary: str(d.summary),
    experiences,
    education,
    skills: Array.isArray(d.skills) ? d.skills.map((s) => str(s)).filter(Boolean) : [],
    languages,
  };
}

function sanitizeDesign(raw: unknown): CvDesign {
  const d = (raw ?? {}) as Partial<CvDesign>;
  const template = (["modern", "sleek", "bold", "clean"] as TemplateId[]).includes(
    d.template as TemplateId
  )
    ? (d.template as TemplateId)
    : DEFAULT_DESIGN.template;
  const headingFont = (Object.keys(FONT_FAMILIES) as FontKey[]).includes(d.headingFont as FontKey)
    ? (d.headingFont as FontKey)
    : DEFAULT_DESIGN.headingFont;
  const bodyFont = (Object.keys(FONT_FAMILIES) as FontKey[]).includes(d.bodyFont as FontKey)
    ? (d.bodyFont as FontKey)
    : DEFAULT_DESIGN.bodyFont;
  const scale = [0.92, 1, 1.08].includes(d.scale as number) ? (d.scale as number) : 1;
  const accent =
    typeof d.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(d.accent)
      ? d.accent
      : DEFAULT_DESIGN.accent;
  return { template, headingFont, bodyFont, scale, accent };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.trim().replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Luminance perçue (0 = sombre, 1 = clair). */
function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
}

/** Couleur de texte lisible posée sur un fond `hex`. */
function onColor(hex: string): string {
  return luminance(hex) > 0.6 ? "#051937" : "#ffffff";
}

/* ------------------------------------------------------------------ */
/*  Bouton « Améliorer avec l'IA » local (champ par champ)             */
/* ------------------------------------------------------------------ */

function FieldImproveButton({
  label,
  value,
  context,
  onImproved,
  compact,
}: {
  label: string;
  value: string;
  context?: string;
  onImproved: (text: string) => void;
  compact?: boolean;
}) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (value.trim().length < 5) {
      toast.error("Écrivez d'abord quelques mots à améliorer.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/improve-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, text: value, context }),
      });
      const json = (await res.json().catch(() => null)) as
        | { improved?: string; error?: string }
        | null;
      if (!res.ok || !json?.improved) {
        toast.error(json?.error ?? "L'amélioration IA a échoué. Réessayez.");
        return;
      }
      onImproved(json.improved);
      toast.success("Texte amélioré par l'IA");
    } catch {
      toast.error("Impossible de joindre le serveur. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gold/70 bg-gold-soft font-semibold text-accent-foreground transition-colors hover:bg-gold hover:text-navy disabled:cursor-not-allowed disabled:opacity-60 ${compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
        }`}
      aria-label={`Améliorer avec l'IA : ${label}`}
    >
      {loading ? (
        <IconLoader2 className="size-3.5 animate-spin" />
      ) : (
        <IconWand className="size-3.5" />
      )}
      {loading ? "Amélioration…" : "Améliorer"}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Feuille CV — les 4 modèles                                         */
/* ------------------------------------------------------------------ */

interface Computed {
  accent: string;
  onAccent: string;
  heading: string;
  body: string;
  contactItems: string[];
  exps: CvBuilderData["experiences"];
  edus: CvBuilderData["education"];
  langs: CvBuilderData["languages"];
}

function computeSheet(data: CvBuilderData, design: CvDesign): Computed {
  const { personal } = data;
  return {
    accent: design.accent,
    onAccent: onColor(design.accent),
    heading: FONT_FAMILIES[design.headingFont].stack,
    body: FONT_FAMILIES[design.bodyFont].stack,
    contactItems: [personal.email, personal.phone, personal.location, personal.linkedin]
      .map((v) => v.trim())
      .filter(Boolean),
    exps: data.experiences.filter(
      (e) =>
        e.role.trim() ||
        e.company.trim() ||
        e.achievements.some((a) => a.trim())
    ),
    edus: data.education.filter((e) => e.degree.trim() || e.school.trim()),
    langs: data.languages.filter((l) => l.name.trim()),
  };
}

function SheetFooter() {
  return (
    <p
      style={{
        marginTop: "1.3em",
        paddingTop: "0.55em",
        borderTop: "1px solid #e2e8f0",
        fontSize: "0.6em",
        color: "#94a3b8",
        textAlign: "center",
      }}
    >
      Optimisé avec NexiRole
    </p>
  );
}

function TemplateModern({ data, design }: SheetProps) {
  const c = computeSheet(data, design);
  const { personal, summary, skills } = data;

  const sectionTitle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginBottom: "0.5em",
  };
  const barStyle: CSSProperties = {
    width: "16px",
    height: "3px",
    background: c.accent,
    borderRadius: "2px",
    flexShrink: 0,
  };
  const labelStyle: CSSProperties = {
    fontSize: "0.72em",
    fontWeight: 800,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#051937",
  };
  const chipBorder = c.onAccent === "#ffffff" ? "rgba(255,255,255,0.45)" : "rgba(5,25,55,0.35)";

  return (
    <div style={{ display: "flex", minHeight: "inherit", textAlign: "left" }}>
      {/* Colonne latérale colorée */}
      <aside
        style={{
          width: "33%",
          background: c.accent,
          color: c.onAccent,
          padding: "1.5em 1.1em",
          display: "flex",
          flexDirection: "column",
          gap: "1.15em",
        }}
      >
        <div>
          <div style={{ fontFamily: c.heading, fontSize: "1.28em", fontWeight: 800, lineHeight: 1.15 }}>
            {personal.fullName.trim() || "Votre Nom"}
          </div>
          <div
            style={{
              fontSize: "0.72em",
              marginTop: "0.35em",
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              opacity: 0.88,
              fontWeight: 600,
            }}
          >
            {personal.title.trim() || "Titre professionnel"}
          </div>
        </div>

        {c.contactItems.length > 0 && (
          <div>
            <div style={{ fontSize: "0.6em", fontWeight: 800, letterSpacing: "0.16em", opacity: 0.75, marginBottom: "0.4em" }}>
              CONTACT
            </div>
            {c.contactItems.map((item) => (
              <div key={item} style={{ fontSize: "0.68em", marginBottom: "0.3em", wordBreak: "break-word" }}>
                {item}
              </div>
            ))}
          </div>
        )}

        {skills.length > 0 && (
          <div>
            <div style={{ fontSize: "0.6em", fontWeight: 800, letterSpacing: "0.16em", opacity: 0.75, marginBottom: "0.4em" }}>
              COMPÉTENCES
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {skills.map((skill, i) => (
                <span
                  key={`${skill}-${i}`}
                  style={{
                    border: `1px solid ${chipBorder}`,
                    borderRadius: "999px",
                    padding: "1px 8px",
                    fontSize: "0.62em",
                    fontWeight: 600,
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {c.langs.length > 0 && (
          <div>
            <div style={{ fontSize: "0.6em", fontWeight: 800, letterSpacing: "0.16em", opacity: 0.75, marginBottom: "0.4em" }}>
              LANGUES
            </div>
            {c.langs.map((lang) => (
              <div key={lang.id} style={{ fontSize: "0.68em", marginBottom: "0.25em" }}>
                <span style={{ fontWeight: 700 }}>{lang.name}</span>
                {lang.level.trim() ? <span style={{ opacity: 0.8 }}> — {lang.level}</span> : null}
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Colonne principale */}
      <main style={{ flex: 1, minWidth: 0, padding: "1.45em 1.35em", color: "#1e293b" }}>
        {summary.trim() && (
          <section style={{ marginBottom: "1.1em" }}>
            <div style={sectionTitle}>
              <span style={barStyle} />
              <span style={labelStyle}>Profil professionnel</span>
            </div>
            <p style={{ fontSize: "0.76em", lineHeight: 1.55, color: "#334155" }}>{summary}</p>
          </section>
        )}

        {c.exps.length > 0 && (
          <section style={{ marginBottom: "1.1em" }}>
            <div style={sectionTitle}>
              <span style={barStyle} />
              <span style={labelStyle}>Expériences professionnelles</span>
            </div>
            {c.exps.map((exp) => (
              <div key={exp.id} style={{ marginBottom: "0.85em" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
                  <span style={{ fontFamily: c.heading, fontSize: "0.84em", fontWeight: 700, color: "#0f172a" }}>
                    {exp.role.trim() || "Poste"}
                  </span>
                  <span style={{ fontSize: "0.64em", color: "#64748b", whiteSpace: "nowrap" }}>
                    {exp.period}
                  </span>
                </div>
                <div style={{ fontSize: "0.71em", fontWeight: 600, color: "#334155", marginTop: "1px" }}>
                  {exp.company.trim() || "Entreprise"}
                  {exp.location.trim() ? ` · ${exp.location}` : ""}
                </div>
                <ul style={{ marginTop: "3px", listStyle: "none", padding: 0 }}>
                  {exp.achievements
                    .filter((a) => a.trim())
                    .map((a, i) => (
                      <li
                        key={i}
                        style={{ display: "flex", gap: "6px", fontSize: "0.71em", lineHeight: 1.5, color: "#475569" }}
                      >
                        <span style={{ color: c.accent, fontWeight: 700 }}>•</span>
                        <span>{a}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {c.edus.length > 0 && (
          <section>
            <div style={sectionTitle}>
              <span style={barStyle} />
              <span style={labelStyle}>Formation</span>
            </div>
            {c.edus.map((edu) => (
              <div key={edu.id} style={{ marginBottom: "0.6em" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
                  <span style={{ fontSize: "0.8em", fontWeight: 700, color: "#0f172a" }}>
                    {edu.degree.trim() || "Diplôme"}
                  </span>
                  <span style={{ fontSize: "0.64em", color: "#64748b", whiteSpace: "nowrap" }}>
                    {edu.period}
                  </span>
                </div>
                <div style={{ fontSize: "0.71em", color: "#475569" }}>{edu.school}</div>
              </div>
            ))}
          </section>
        )}

        <SheetFooter />
      </main>
    </div>
  );
}

function TemplateSleek({ data, design }: SheetProps) {
  const c = computeSheet(data, design);
  const { personal, summary, skills } = data;

  const sectionTitle: CSSProperties = {
    fontSize: "0.72em",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.18em",
    color: "#0f172a",
    borderBottom: "1px solid #e2e8f0",
    paddingBottom: "3px",
    marginBottom: "0.55em",
  };
  const accentDash: CSSProperties = { color: c.accent, marginRight: "5px", fontWeight: 800 };

  return (
    <div style={{ padding: "1.55em 1.65em", color: "#1f2937", textAlign: "left" }}>
      <header style={{ textAlign: "center", paddingBottom: "0.85em" }}>
        <div style={{ fontFamily: c.heading, fontSize: "1.5em", fontWeight: 700, color: "#0f172a", letterSpacing: "0.02em" }}>
          {personal.fullName.trim() || "Votre Nom"}
        </div>
        <div style={{ fontSize: "0.74em", textTransform: "uppercase", letterSpacing: "0.22em", color: "#475569", marginTop: "0.3em" }}>
          {personal.title.trim() || "Titre professionnel"}
        </div>
        <div
          style={{
            width: "46px",
            height: "3px",
            background: c.accent,
            margin: "0.6em auto 0",
            borderRadius: "2px",
          }}
        />
        {c.contactItems.length > 0 && (
          <div style={{ fontSize: "0.66em", color: "#64748b", marginTop: "0.5em" }}>
            {c.contactItems.join("   ·   ")}
          </div>
        )}
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1.62fr 1fr", gap: "1.25em", marginTop: "1em" }}>
        {/* Colonne principale */}
        <div>
          {summary.trim() && (
            <section style={{ marginBottom: "1em" }}>
              <div style={sectionTitle}>
                <span style={accentDash}>—</span>Profil
              </div>
              <p style={{ fontSize: "0.74em", lineHeight: 1.6, color: "#374151" }}>{summary}</p>
            </section>
          )}

          {c.exps.length > 0 && (
            <section style={{ marginBottom: "1em" }}>
              <div style={sectionTitle}>
                <span style={accentDash}>—</span>Expériences
              </div>
              {c.exps.map((exp) => (
                <div key={exp.id} style={{ marginBottom: "0.8em" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
                    <span style={{ fontFamily: c.heading, fontSize: "0.82em", fontWeight: 700, color: "#0f172a" }}>
                      {exp.role.trim() || "Poste"}
                    </span>
                    <span style={{ fontSize: "0.63em", color: "#64748b", whiteSpace: "nowrap" }}>{exp.period}</span>
                  </div>
                  <div style={{ fontSize: "0.7em", color: "#475569", fontStyle: "italic", marginTop: "1px" }}>
                    {exp.company.trim() || "Entreprise"}
                    {exp.location.trim() ? ` · ${exp.location}` : ""}
                  </div>
                  <ul style={{ marginTop: "3px", listStyle: "none", padding: 0 }}>
                    {exp.achievements
                      .filter((a) => a.trim())
                      .map((a, i) => (
                        <li key={i} style={{ display: "flex", gap: "6px", fontSize: "0.7em", lineHeight: 1.5, color: "#4b5563" }}>
                          <span style={{ color: c.accent }}>•</span>
                          <span>{a}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </section>
          )}

          {c.edus.length > 0 && (
            <section>
              <div style={sectionTitle}>
                <span style={accentDash}>—</span>Formation
              </div>
              {c.edus.map((edu) => (
                <div key={edu.id} style={{ marginBottom: "0.55em" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
                    <span style={{ fontSize: "0.78em", fontWeight: 700, color: "#0f172a" }}>
                      {edu.degree.trim() || "Diplôme"}
                    </span>
                    <span style={{ fontSize: "0.63em", color: "#64748b", whiteSpace: "nowrap" }}>{edu.period}</span>
                  </div>
                  <div style={{ fontSize: "0.7em", color: "#475569" }}>{edu.school}</div>
                </div>
              ))}
            </section>
          )}
        </div>

        {/* Colonne secondaire */}
        <div style={{ borderLeft: "1px solid #e2e8f0", paddingLeft: "1.1em" }}>
          {c.contactItems.length > 0 && (
            <section style={{ marginBottom: "1em" }}>
              <div style={sectionTitle}>
                <span style={accentDash}>—</span>Contact
              </div>
              {c.contactItems.map((item) => (
                <div key={item} style={{ fontSize: "0.68em", color: "#4b5563", marginBottom: "0.3em", wordBreak: "break-word" }}>
                  {item}
                </div>
              ))}
            </section>
          )}

          {skills.length > 0 && (
            <section style={{ marginBottom: "1em" }}>
              <div style={sectionTitle}>
                <span style={accentDash}>—</span>Compétences
              </div>
              {skills.map((skill, i) => (
                <div key={`${skill}-${i}`} style={{ display: "flex", gap: "6px", fontSize: "0.7em", color: "#4b5563", marginBottom: "0.28em" }}>
                  <span style={{ color: c.accent }}>•</span>
                  <span>{skill}</span>
                </div>
              ))}
            </section>
          )}

          {c.langs.length > 0 && (
            <section>
              <div style={sectionTitle}>
                <span style={accentDash}>—</span>Langues
              </div>
              {c.langs.map((lang) => (
                <div key={lang.id} style={{ fontSize: "0.7em", color: "#4b5563", marginBottom: "0.28em" }}>
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>{lang.name}</span>
                  {lang.level.trim() ? ` — ${lang.level}` : ""}
                </div>
              ))}
            </section>
          )}
        </div>
      </div>

      <SheetFooter />
    </div>
  );
}

function TemplateBold({ data, design }: SheetProps) {
  const c = computeSheet(data, design);
  const { personal, summary, skills } = data;

  const titleRow: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    margin: "1.15em 0 0.55em",
  };
  const barStyle: CSSProperties = {
    width: "22px",
    height: "3px",
    background: c.accent,
    borderRadius: "2px",
    flexShrink: 0,
  };
  const labelStyle: CSSProperties = {
    fontSize: "0.86em",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: "#0f172a",
  };

  return (
    <div style={{ padding: "1.6em 1.7em", color: "#111827", textAlign: "left" }}>
      <header>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
          <span
            style={{
              width: "14px",
              height: "14px",
              background: c.accent,
              borderRadius: "3px",
              marginTop: "0.45em",
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: c.heading,
                fontSize: "1.85em",
                fontWeight: 800,
                textTransform: "uppercase",
                lineHeight: 1.05,
                color: "#0f172a",
              }}
            >
              {personal.fullName.trim() || "Votre Nom"}
            </div>
            <div
              style={{
                fontSize: "0.76em",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: "#475569",
                marginTop: "0.3em",
              }}
            >
              {personal.title.trim() || "Titre professionnel"}
            </div>
          </div>
        </div>
        {c.contactItems.length > 0 && (
          <div
            style={{
              fontSize: "0.68em",
              color: "#64748b",
              marginTop: "0.7em",
              display: "flex",
              flexWrap: "wrap",
              gap: "3px 14px",
            }}
          >
            {c.contactItems.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        )}
      </header>

      {summary.trim() && (
        <section>
          <div style={titleRow}>
            <span style={barStyle} />
            <span style={labelStyle}>Profil</span>
          </div>
          <p style={{ fontSize: "0.75em", lineHeight: 1.6, color: "#374151" }}>{summary}</p>
        </section>
      )}

      {c.exps.length > 0 && (
        <section>
          <div style={titleRow}>
            <span style={barStyle} />
            <span style={labelStyle}>Expériences</span>
          </div>
          {c.exps.map((exp) => (
            <div key={exp.id} style={{ marginBottom: "0.85em" }}>
              <div style={{ fontSize: "0.88em", fontWeight: 800, color: "#0f172a" }}>
                {exp.role.trim() || "Poste"}
              </div>
              <div
                style={{
                  fontSize: "0.64em",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#64748b",
                  marginTop: "1px",
                }}
              >
                {[exp.company.trim() || "Entreprise", exp.period.trim(), exp.location.trim()]
                  .filter(Boolean)
                  .join("  ·  ")}
              </div>
              <ul style={{ marginTop: "4px", listStyle: "none", padding: 0 }}>
                {exp.achievements
                  .filter((a) => a.trim())
                  .map((a, i) => (
                    <li key={i} style={{ display: "flex", gap: "6px", fontSize: "0.71em", lineHeight: 1.5, color: "#4b5563" }}>
                      <span style={{ color: c.accent, fontWeight: 800 }}>■</span>
                      <span>{a}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {skills.length > 0 && (
        <section>
          <div style={titleRow}>
            <span style={barStyle} />
            <span style={labelStyle}>Compétences</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {skills.map((skill, i) => (
              <span
                key={`${skill}-${i}`}
                style={{
                  border: "1.5px solid #0f172a",
                  borderRadius: "999px",
                  padding: "2px 10px",
                  fontSize: "0.66em",
                  fontWeight: 600,
                  color: "#0f172a",
                }}
              >
                {skill}
              </span>
            ))}
          </div>
        </section>
      )}

      {c.edus.length > 0 && (
        <section>
          <div style={titleRow}>
            <span style={barStyle} />
            <span style={labelStyle}>Formation</span>
          </div>
          {c.edus.map((edu) => (
            <div key={edu.id} style={{ marginBottom: "0.55em", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
              <div>
                <span style={{ fontSize: "0.8em", fontWeight: 800, color: "#0f172a" }}>
                  {edu.degree.trim() || "Diplôme"}
                </span>
                <span style={{ fontSize: "0.68em", color: "#475569" }}>
                  {edu.school.trim() ? ` — ${edu.school}` : ""}
                </span>
              </div>
              <span style={{ fontSize: "0.63em", color: "#64748b", whiteSpace: "nowrap" }}>{edu.period}</span>
            </div>
          ))}
        </section>
      )}

      {c.langs.length > 0 && (
        <section>
          <div style={titleRow}>
            <span style={barStyle} />
            <span style={labelStyle}>Langues</span>
          </div>
          <div style={{ fontSize: "0.72em", color: "#374151", lineHeight: 1.7 }}>
            {c.langs
              .map((lang) => (lang.level.trim() ? `${lang.name} — ${lang.level}` : lang.name))
              .join("   ·   ")}
          </div>
        </section>
      )}

      <SheetFooter />
    </div>
  );
}

function TemplateClean({ data, design }: SheetProps) {
  const c = computeSheet(data, design);
  const { personal, summary, skills } = data;

  const sectionTitle: CSSProperties = {
    fontSize: "0.78em",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: "#0f172a",
    borderBottom: "1px solid #cbd5e1",
    paddingBottom: "2px",
    margin: "1em 0 0.5em",
  };

  return (
    <div style={{ padding: "1.55em 1.6em", color: "#1f2937", textAlign: "left" }}>
      <header style={{ borderBottom: "2px solid #0f172a", paddingBottom: "0.7em" }}>
        <div style={{ fontFamily: c.heading, fontSize: "1.35em", fontWeight: 800, color: "#0f172a" }}>
          {personal.fullName.trim() || "Votre Nom"}
        </div>
        <div style={{ fontSize: "0.84em", color: "#374151", marginTop: "2px" }}>
          {personal.title.trim() || "Titre professionnel"}
        </div>
        {c.contactItems.length > 0 && (
          <div style={{ fontSize: "0.7em", color: "#4b5563", marginTop: "6px" }}>
            {c.contactItems.join("  |  ")}
          </div>
        )}
      </header>

      {summary.trim() && (
        <section>
          <div style={sectionTitle}>Profil professionnel</div>
          <p style={{ fontSize: "0.76em", lineHeight: 1.6, color: "#374151" }}>{summary}</p>
        </section>
      )}

      {c.exps.length > 0 && (
        <section>
          <div style={sectionTitle}>Expériences professionnelles</div>
          {c.exps.map((exp) => (
            <div key={exp.id} style={{ marginBottom: "0.75em" }}>
              <div style={{ fontSize: "0.82em", fontWeight: 700, color: "#111827" }}>
                {exp.role.trim() || "Poste"}
              </div>
              <div style={{ fontSize: "0.72em", color: "#4b5563", marginTop: "1px" }}>
                {[exp.company.trim() || "Entreprise", exp.period.trim(), exp.location.trim()]
                  .filter(Boolean)
                  .join(" | ")}
              </div>
              <ul style={{ marginTop: "3px", listStyle: "none", padding: 0 }}>
                {exp.achievements
                  .filter((a) => a.trim())
                  .map((a, i) => (
                    <li key={i} style={{ display: "flex", gap: "6px", fontSize: "0.72em", lineHeight: 1.55, color: "#374151" }}>
                      <span>-</span>
                      <span>{a}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {skills.length > 0 && (
        <section>
          <div style={sectionTitle}>Compétences</div>
          <p style={{ fontSize: "0.74em", lineHeight: 1.65, color: "#374151" }}>
            {skills.join("  •  ")}
          </p>
        </section>
      )}

      {c.edus.length > 0 && (
        <section>
          <div style={sectionTitle}>Formation</div>
          {c.edus.map((edu) => (
            <div key={edu.id} style={{ marginBottom: "0.5em" }}>
              <div style={{ fontSize: "0.78em", fontWeight: 700, color: "#111827" }}>
                {edu.degree.trim() || "Diplôme"}
              </div>
              <div style={{ fontSize: "0.72em", color: "#4b5563" }}>
                {[edu.school.trim(), edu.period.trim()].filter(Boolean).join(" | ")}
              </div>
            </div>
          ))}
        </section>
      )}

      {c.langs.length > 0 && (
        <section>
          <div style={sectionTitle}>Langues</div>
          {c.langs.map((lang) => (
            <div key={lang.id} style={{ fontSize: "0.73em", color: "#374151", marginBottom: "0.22em" }}>
              <span style={{ fontWeight: 700, color: "#111827" }}>{lang.name}</span>
              {lang.level.trim() ? ` — ${lang.level}` : ""}
            </div>
          ))}
        </section>
      )}

      <SheetFooter />
    </div>
  );
}

function CvSheet({ data, design }: SheetProps) {
  switch (design.template) {
    case "sleek":
      return <TemplateSleek data={data} design={design} />;
    case "bold":
      return <TemplateBold data={data} design={design} />;
    case "clean":
      return <TemplateClean data={data} design={design} />;
    default:
      return <TemplateModern data={data} design={design} />;
  }
}

/* ------------------------------------------------------------------ */
/*  Page principale                                                    */
/* ------------------------------------------------------------------ */

export default function CvBuilderPage() {
  const [data, setData] = useState<CvBuilderData>(EMPTY_DATA);
  const [design, setDesign] = useState<CvDesign>(DEFAULT_DESIGN);
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [skillInput, setSkillInput] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [mobileTab, setMobileTab] = useState<"form" | "preview">("form");
  const [zoomMode, setZoomMode] = useState<"fit" | "actual">("fit");

  /* Modale d'amélioration IA globale */
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<ImprovementResult | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  /* Aperçu : mise à l'échelle de la feuille A4 (794 px) */
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [wrapWidth, setWrapWidth] = useState(800);
  const [sheetHeight, setSheetHeight] = useState(1123);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);


  /* ================================================================
     Bibliothèque de CV — synchronisation base de données
     - ?cv=<id> dans l'URL : hydratation depuis la base puis
       sauvegarde automatique (900 ms) après chaque modification
       (formulaires, design, étape, améliorations IA).
     - sans ?cv : migration automatique du CV local vers la base
       (une seule fois par session navigateur).
     ================================================================ */
  const [cvId, setCvId] = useState<string | null>(null);
  const [dbState, setDbState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [dbSavedAt, setDbSavedAt] = useState<Date | null>(null);
  const cvHydratedRef = useRef(false);
  const cvMigrationRef = useRef(false);
  const cvSaveTimerRef = useRef<number | null>(null);

  /* 1 - Hydratation depuis la base quand ?cv=<id> est présent. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const asked = params.get("cv");
    if (!asked) {
      cvHydratedRef.current = true;
      return;
    }
    setCvId(asked);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/cv/${asked}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as
          | { cv?: { data?: unknown; design?: unknown; step?: number } | null }
          | null;
        if (cancelled || !json?.cv) return;
        setData(sanitizeData(json.cv.data));
        setDesign(sanitizeDesign(json.cv.design));
        if (typeof json.cv.step === "number" && json.cv.step >= 0 && json.cv.step <= 5) {
          setStep(json.cv.step);
        }
      } catch {
        /* réseau indisponible : on garde le contenu local */
      } finally {
        if (!cancelled) cvHydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* 2 - Migration automatique : CV local (sans ?cv) -> base de données. */
  useEffect(() => {
    if (!loaded || cvId !== null || cvMigrationRef.current) return;
    if (window.sessionStorage.getItem("nexirole-cv-migration-done") === "1") {
      cvHydratedRef.current = true;
      return;
    }
    const hasContent =
      data.personal.fullName.trim() !== "" ||
      data.summary.trim() !== "" ||
      data.experiences.some((e) => e.role.trim() !== "" || e.company.trim() !== "") ||
      data.education.some((e) => e.degree.trim() !== "" || e.school.trim() !== "");
    if (!hasContent) return;
    cvMigrationRef.current = true;
    const [payloadData, payloadDesign, payloadStep] = [data, design, step];
    (async () => {
      try {
        const res = await fetch("/api/cv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: payloadData, design: payloadDesign, step: payloadStep }),
        });
        const json = (await res.json().catch(() => null)) as
          | { cv?: { id?: string } | null }
          | null;
        const newId = json?.cv?.id;
        if (!res.ok || !newId) {
          cvMigrationRef.current = false;
          return;
        }
        window.sessionStorage.setItem("nexirole-cv-migration-done", "1");
        setCvId(newId);
        const url = new URL(window.location.href);
        url.searchParams.set("cv", newId);
        window.history.replaceState(null, "", url.toString());
        toast.success("CV enregistré dans votre bibliothèque.");
      } catch {
        cvMigrationRef.current = false;
      }
    })();
  }, [loaded, cvId, data, design, step]);

  /* 3 - Sauvegarde automatique en base (debounce 900 ms). */
  useEffect(() => {
    if (!loaded || cvId === null || !cvHydratedRef.current) return;
    if (cvSaveTimerRef.current !== null) {
      window.clearTimeout(cvSaveTimerRef.current);
    }
    setDbState("saving");
    cvSaveTimerRef.current = window.setTimeout(() => {
      cvSaveTimerRef.current = null;
      const idAtSave = cvId;
      (async () => {
        try {
          const res = await fetch(`/api/cv/${idAtSave}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data, design, step }),
          });
          if (!res.ok) throw new Error("échec de l'enregistrement en base");
          setDbState("saved");
          setDbSavedAt(new Date());
        } catch {
          setDbState("error");
        }
      })();
    }, 900);
    return () => {
      if (cvSaveTimerRef.current !== null) {
        window.clearTimeout(cvSaveTimerRef.current);
        cvSaveTimerRef.current = null;
      }
    };
  }, [data, design, step, loaded, cvId]);

  /* CV public : publication du builder vers la page /u/[slug] */
  const [pubSlug, setPubSlug] = useState<string | null>(null);
  const [pubUrl, setPubUrl] = useState<string | null>(null);
  const [pubViews, setPubViews] = useState<number | null>(null);
  const [pubLoading, setPubLoading] = useState(false);

  /* Chargement (migration v1 → v2 incluse) */
  useEffect(() => {
    try {
      const savedV2 = window.localStorage.getItem(STORAGE_KEY);
      if (savedV2) {
        const parsed = JSON.parse(savedV2) as { data?: unknown; design?: unknown; step?: unknown };
        setData(sanitizeData(parsed.data));
        setDesign(sanitizeDesign(parsed.design));
        if (typeof parsed.step === "number" && parsed.step >= 0 && parsed.step <= 5) {
          setStep(parsed.step);
        }
      } else {
        const savedV1 = window.localStorage.getItem(STORAGE_KEY_V1);
        if (savedV1) {
          setData(sanitizeData(JSON.parse(savedV1)));
        }
      }
    } catch {
      /* données locales corrompues : on repart du modèle vide */
    }
    setLoaded(true);
  }, []);

  /* Sauvegarde automatique (debounce 600 ms) — n'écrit JAMAIS dans l'état */
  useEffect(() => {
    if (!loaded) return;
    setSaving(true);
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ data, design, step })
        );
      } catch {
        /* quota dépassé : on ignore */
      }
      setSaving(false);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [data, design, step, loaded]);

  /* Mesure de la largeur du conteneur d'aperçu (responsive) */
  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 0) setWrapWidth(width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Mesure de la hauteur réelle de la feuille */
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSheetHeight(Math.max(1123, el.offsetHeight));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitScale = Math.min(1, wrapWidth / 794);
  const previewScale = zoomMode === "fit" ? fitScale : 1;
  const previewViewportHeight =
    zoomMode === "fit" ? sheetHeight * previewScale : Math.min(sheetHeight, 760);

  /* ---------------------------------------------------------------- */
  /*  Mise à jour de l'état (toujours fonctionnel = jamais bloqué)     */
  /* ---------------------------------------------------------------- */

  /* -------------------------------------------------------------- */
  /*  CV public - publication du builder vers /u/[slug]              */
  /* -------------------------------------------------------------- */

  /* Configuration existante (slug, lien, vues) au chargement. */
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/public-cv/builder", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as
          | { publicResume?: { slug?: string; publicUrl?: string; viewsCount?: number } | null }
          | null;
        if (cancelled || !json?.publicResume?.slug) return;
        setPubSlug(json.publicResume.slug);
        setPubUrl(json.publicResume.publicUrl ?? null);
        setPubViews(
          typeof json.publicResume.viewsCount === "number"
            ? json.publicResume.viewsCount
            : 0
        );
      } catch {
        /* serveur injoignable : bloc en mode non publie */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  /* Design du builder -> templateId comprehensible par la page publique. */
  function mapPublicCvDesignTemplate(id: "modern" | "sleek" | "bold" | "clean"): string {
    if (id === "sleek") return "sleek-executive";
    if (id === "bold") return "bold-minimalism";
    if (id === "clean") return "clean-ats";
    return "modern-accent";
  }

  // [SYNC V3] debut - helper : ecriture base puis publication avant chaque action
  async function publierCvActuel(): Promise<string | null> {
    try {
      if (cvId) {
        const __saveRes = await fetch('/api/cv/' + encodeURIComponent(cvId), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, design, step }),
        });
        if (!__saveRes.ok) {
          console.warn('[SYNC V3] sauvegarde CvDocument echouee (HTTP ' + __saveRes.status + ')');
        }
      }      const __res = await fetch('/api/public-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvData: buildPublicCvPayload(), templateId: mapPublicCvDesignTemplate(design.template) }),
      });
      const __json = (await __res.json().catch(() => null)) as
        | { publicResume?: { slug?: string } | null }
        | null;
      const __slug = __json && __json.publicResume && __json.publicResume.slug
        ? String(__json.publicResume.slug)
        : '';
      if (!__res.ok || !__slug) {
        console.warn('[SYNC V3] publication echouee (HTTP ' + __res.status + ')', __json);
        return null;
      }
      console.log('[SYNC V3] ecriture base + publication OK : /u/' + __slug);
      try {
        if (cvId) {
          await fetch('/api/cv/' + encodeURIComponent(cvId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isPublic: true, publishedSlug: __slug }),
          });
        }
      } catch (_flagErr) {
        // drapeaux non critiques : la publication reste valide
      }      try { setPubSlug(__slug); } catch (_setPubErr) { /* etat indisponible */ }      return __slug;
    } catch (__e) {
      console.warn('[SYNC V3] exception publication', __e);
      return null;
    }
  }
  // [SYNC V3] fin - helper

  async function handlePublishPublicCv() {
    // [SYNC V3 E-C] debut - ecriture base avant la publication
    try {
      if (cvId) {
        const __saveRes = await fetch('/api/cv/' + encodeURIComponent(cvId), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, design, step }),
        });
        if (!__saveRes.ok) {
          console.warn('[SYNC V3] sauvegarde CvDocument echouee (HTTP ' + __saveRes.status + ')');
        }
      }
    } catch (__syncErrC) {
      console.warn('[SYNC V3] sauvegarde exception', __syncErrC);
    }
    // [SYNC V3 E-C] fin

    if (!data.personal.fullName.trim()) {
      toast.error("Renseignez votre nom complet (etape 1) avant la publication.");
      setStep(0);
      setMobileTab("form");
      return;
    }
    setPubLoading(true);
    try {
      const res = await fetch("/api/public-cv/builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: pubSlug ?? undefined,
          theme: {
            webTemplate: mapDesignTemplate(design.template),
            accentColor: design.accent,
            qrTemplate: "executif",
          },
          data: {
            personal: {
              fullName: data.personal.fullName.trim(),
              title: data.personal.title.trim(),
              email: data.personal.email.trim(),
              phone: data.personal.phone.trim(),
              location: data.personal.location.trim(),
              linkedin: data.personal.linkedin.trim(),
            },
            summary: data.summary.trim(),
            experiences: data.experiences
              .map((e) => ({
                role: e.role.trim(),
                company: e.company.trim(),
                period: e.period.trim(),
                location: e.location.trim(),
                achievements: e.achievements.map((a) => a.trim()).filter(Boolean),
              }))
              .filter(
                (e) => e.role !== "" || e.company !== "" || e.achievements.length > 0
              ),
            education: data.education
              .map((e) => ({
                degree: e.degree.trim(),
                school: e.school.trim(),
                period: e.period.trim(),
              }))
              .filter((e) => e.degree !== "" || e.school !== ""),
            skills: data.skills.map((s) => s.trim()).filter(Boolean),
            languages: data.languages
              .map((l) => ({ name: l.name.trim(), level: l.level.trim() }))
              .filter((l) => l.name !== ""),
          },
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | {
            publicResume?: { slug?: string; publicUrl?: string; viewsCount?: number };
            error?: string;
          }
        | null;
      if (!res.ok || !json?.publicResume?.slug) {
        toast.error(
          json?.error ?? `Publication impossible (code ${res.status}). Reessayez.`
        );
        return;
      }
      setPubSlug(json.publicResume.slug);
      setPubUrl(json.publicResume.publicUrl ?? null);
      setPubViews(
        typeof json.publicResume.viewsCount === "number"
          ? json.publicResume.viewsCount
          : 0
      );
      toast.success("CV publie en ligne ! Le lien Voir en ligne est actif dans l'en-tete.");
    } catch {
      toast.error("Impossible de joindre le serveur. Verifiez votre connexion et reessayez.");
    } finally {
      setPubLoading(false);
    }
  }

  function update(patch: Partial<CvBuilderData>) {
    setData((prev) => ({ ...prev, ...patch }));
  }

  function updatePersonal(patch: Partial<CvBuilderData["personal"]>) {
    setData((prev) => ({ ...prev, personal: { ...prev.personal, ...patch } }));
  }

  function patchExperience(
    id: string,
    patcher: (current: CvBuilderData["experiences"][number]) => CvBuilderData["experiences"][number]
  ) {
    setData((prev) => ({
      ...prev,
      experiences: prev.experiences.map((item) => (item.id === id ? patcher(item) : item)),
    }));
  }

  function patchEducation(
    id: string,
    patcher: (current: CvBuilderData["education"][number]) => CvBuilderData["education"][number]
  ) {
    setData((prev) => ({
      ...prev,
      education: prev.education.map((item) => (item.id === id ? patcher(item) : item)),
    }));
  }

  function patchLanguage(
    id: string,
    patcher: (current: CvBuilderData["languages"][number]) => CvBuilderData["languages"][number]
  ) {
    setData((prev) => ({
      ...prev,
      languages: prev.languages.map((item) => (item.id === id ? patcher(item) : item)),
    }));
  }

  function addExperience() {
    setData((prev) => ({
      ...prev,
      experiences: [
        ...prev.experiences,
        {
          ...EMPTY_DATA.experiences[0],
          id: uid(),
          achievements: [""],
        },
      ],
    }));
  }

  function addEducation() {
    setData((prev) => ({
      ...prev,
      education: [...prev.education, { id: uid(), degree: "", school: "", period: "" }],
    }));
  }

  function addLanguage() {
    setData((prev) => ({
      ...prev,
      languages: [...prev.languages, { id: uid(), name: "", level: "" }],
    }));
  }

  function addSkill(raw: string) {
    const skill = raw.trim().replace(/,+$/, "");
    if (!skill) return;
    setData((prev) => {
      const exists = prev.skills.some((s) => s.toLowerCase() === skill.toLowerCase());
      if (exists) return prev;
      return { ...prev, skills: [...prev.skills, skill] };
    });
    setSkillInput("");
  }

  const contextHint = useMemo(
    () =>
      [data.personal.title, data.personal.location].filter(Boolean).join(" — "),
    [data.personal.title, data.personal.location]
  );

  const cvHasContent = useMemo(() => {
    return Boolean(
      data.summary.trim().length > 30 ||
      data.experiences.some((e) => e.role.trim() && e.achievements.some((a) => a.trim()))
    );
  }, [data.summary, data.experiences]);

  /* ---------------------------------------------------------------- */
  /*  Export PDF                                                      */
  /* ---------------------------------------------------------------- */

  function handlePrint() {
    if (!data.personal.fullName.trim()) {
      toast.error("Renseignez votre nom complet (étape 1) avant l'export.");
      setStep(0);
      return;
    }
    window.print();
  }

  async function handleDownloadPdfServer() {
    // [SYNC V3 E-E] debut - ecriture base avant le telechargement PDF
    try {
      await publierCvActuel();
    } catch (_syncErrE) {
      // l export historique continue meme si l ecriture echoue
    }
    // [SYNC V3 E-E] fin

    if (!data.personal.fullName.trim()) {
      toast.error("Renseignez votre nom complet (étape 1) avant l'export.");
      setStep(0);
      return;
    }
    setDownloading(true);
    try {
      await downloadPdf(
        "cv",
        {
          cv: {
            title: data.personal.title.trim() || "Candidat",
            summary: data.summary.trim(),
            experiences: data.experiences
              .filter((e) => e.role.trim() || e.company.trim())
              .map((e) => ({
                role: e.role.trim() || "Poste",
                company: e.company.trim() || "Entreprise",
                period: e.period.trim(),
                location: e.location.trim(),
                achievements: e.achievements.map((a) => a.trim()).filter(Boolean),
              })),
            education: data.education
              .filter((e) => e.degree.trim() || e.school.trim())
              .map((e) => ({
                degree: e.degree.trim() || "Diplôme",
                school: e.school.trim(),
                period: e.period.trim(),
              })),
            skills: data.skills,
            languages: data.languages
              .filter((l) => l.name.trim())
              .map((l) => ({ name: l.name.trim(), level: l.level.trim() || "Courant" })),
            keywordsMatched: [],
          },
          candidateName: data.personal.fullName.trim(),
          contact: {
            email: data.personal.email.trim(),
            phone: data.personal.phone.trim(),
            location: data.personal.location.trim(),
            linkedin: data.personal.linkedin.trim(),
          },
        },
        `CV-${data.personal.fullName.trim() || "NexiRole"}`
      );
      toast.success("CV téléchargé (version ATS serveur)");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "La génération du PDF a échoué."
      );
    } finally {
      setDownloading(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  CV public partageable — lien web + QR code (bloc additif)         */
  /* ---------------------------------------------------------------- */

  const [siteOrigin, setSiteOrigin] = useState("");
  const [pubError, setPubError] = useState<string | null>(null);
  const [pubCopied, setPubCopied] = useState(false);
  const [showQrOnPdf, setShowQrOnPdf] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrDownloading, setQrDownloading] = useState(false);

  /* Origine du site (client uniquement — évite tout écart d'hydratation). */
  useEffect(() => {
    setSiteOrigin(window.location.origin.replace(/\/+$/, ""));
  }, []);

  /* Configuration existante (slug, lien, vues) au chargement de la page. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/public-cv", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as
          | {
              publicResume?: {
                slug?: string;
                viewsCount?: number;
                publicUrl?: string;
              } | null;
            }
          | null;
        if (cancelled || !json?.publicResume?.slug) return;
        setPubSlug(json.publicResume.slug);
        setPubUrl(json.publicResume.publicUrl ?? null);
        setPubViews(
          typeof json.publicResume.viewsCount === "number"
            ? json.publicResume.viewsCount
            : 0
        );
      } catch {
        /* serveur injoignable : le bloc reste en mode « non publié » */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Bascule QR persistée dans localStorage. */
  useEffect(() => {
    try {
      if (window.localStorage.getItem("nexirole-cv-qr-toggle") === "1") {
        setShowQrOnPdf(true);
      }
    } catch {
      /* stockage indisponible : on ignore */
    }
  }, []);

  /* Génération locale du QR (data URL navy #051937 / blanc). */
  useEffect(() => {
    if (!showQrOnPdf || !pubSlug) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const QRCode = (await import("qrcode")).default;
        const url = pubUrl ?? `${window.location.origin}/u/${pubSlug}`;
        const dataUrl = await QRCode.toDataURL(url, {
          color: { dark: "#051937", light: "#FFFFFF" },
          width: 512,
          margin: 1,
        });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch {
        if (!cancelled) setQrDataUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showQrOnPdf, pubSlug, pubUrl]);

  function toggleShowQrOnPdf() {
    setShowQrOnPdf((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("nexirole-cv-qr-toggle", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  /* Design du builder → templateId de la base PublicResume. */
  function mapDesignTemplate(id: "modern" | "sleek" | "bold" | "clean"): string {
    if (id === "sleek") return "sleek-executive";
    if (id === "bold") return "bold-minimalism";
    if (id === "clean") return "clean-ats";
    return "modern-accent";
  }

  /* Charge utile publiée : même structure que l'export ATS serveur. */
  function buildPublicCvPayload(): Record<string, unknown> {
    return {
      cv: {
        title: data.personal.title.trim() || "Candidat",
        summary: data.summary.trim(),
        experiences: data.experiences
          .filter((e) => e.role.trim() || e.company.trim())
          .map((e) => ({
            role: e.role.trim() || "Poste",
            company: e.company.trim() || "Entreprise",
            period: e.period.trim(),
            location: e.location.trim(),
            achievements: e.achievements.map((a) => a.trim()).filter(Boolean),
          })),
        education: data.education
          .filter((e) => e.degree.trim() || e.school.trim())
          .map((e) => ({
            degree: e.degree.trim() || "Diplôme",
            school: e.school.trim(),
            period: e.period.trim(),
          })),
        skills: data.skills,
        languages: data.languages
          .filter((l) => l.name.trim())
          .map((l) => ({ name: l.name.trim(), level: l.level.trim() || "Courant" })),
        keywordsMatched: [],
      },
      candidateName: data.personal.fullName.trim(),
      contact: {
        email: data.personal.email.trim(),
        phone: data.personal.phone.trim(),
        location: data.personal.location.trim(),
        linkedin: data.personal.linkedin.trim(),
      },
      showQrOnPdf,
    };
  }


  async function handleCopyPublicLink() {
    if (!pubSlug) return;
    const url = pubUrl ?? `${siteOrigin || window.location.origin}/u/${pubSlug}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const area = document.createElement("textarea");
        area.value = url;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      setPubCopied(true);
      toast.success("Lien public copié !");
      window.setTimeout(() => setPubCopied(false), 2500);
    } catch {
      toast.error(`Copie impossible — copiez manuellement : ${url}`);
    }
  }

  /* Données au format attendu par CvPdfDocument (@react-pdf/renderer). */
  function buildDossierForCvPdf(): {
    identite: {
      nom_complet: string;
      email: string;
      telephone: string;
      ville: string;
      linkedin: string;
    };
    titre: string;
    resume: string;
    experiences: Array<{
      poste: string;
      periode: string;
      entreprise: string;
      lieu: string;
      missions: string[];
    }>;
    formations: Array<{
      diplome: string;
      periode: string;
      etablissement: string;
    }>;
    competences: string[];
    langues: Array<{ nom: string; niveau: string }>;
  } {
    return {
      identite: {
        nom_complet: data.personal.fullName.trim() || "Candidat",
        email: data.personal.email.trim(),
        telephone: data.personal.phone.trim(),
        ville: data.personal.location.trim(),
        linkedin: data.personal.linkedin.trim(),
      },
      titre: data.personal.title.trim() || "Candidat",
      resume: data.summary.trim(),
      experiences: data.experiences
        .filter((e) => e.role.trim() || e.company.trim())
        .map((e) => ({
          poste: e.role.trim() || "Poste",
          periode: e.period.trim(),
          entreprise: e.company.trim() || "Entreprise",
          lieu: e.location.trim(),
          missions: e.achievements.map((a) => a.trim()).filter(Boolean),
        })),
      formations: data.education
        .filter((e) => e.degree.trim() || e.school.trim())
        .map((e) => ({
          diplome: e.degree.trim() || "Diplôme",
          periode: e.period.trim(),
          etablissement: e.school.trim(),
        })),
      competences: data.skills.filter((s) => s.trim() !== ""),
      langues: data.languages
        .filter((l) => l.name.trim() !== "")
        .map((l) => ({ nom: l.name.trim(), niveau: l.level.trim() || "Courant" })),
    };
  }

  /* PDF @react-pdf/renderer AVEC QR code — imports dynamiques résilients :
     accepte l'export nommé OU l'export par défaut du module. */
  async function handleDownloadPdfWithQr() {
    // [SYNC V3 E-D] debut - ecriture base + publication puis PDF du slug frais
    try {
      const __slugPdf = await publierCvActuel();
      const __slugFinal = __slugPdf || pubSlug || '';
      if (__slugFinal) {
        window.open('/api/public-cv/pdf?slug=' + encodeURIComponent(__slugFinal), '_blank');
        return;
      }
      console.warn('[SYNC V3] slug indisponible : export historique en secours');
    } catch (__syncErrD) {
      console.warn('[SYNC V3] exception PDF QR : export historique en secours', __syncErrD);
    }
    // [SYNC V3 E-D] fin

    if (!data.personal.fullName.trim()) {
      toast.error("Renseignez votre nom complet (étape 1) avant l'export.");
      setStep(0);
      return;
    }
    if (!pubSlug) {
      toast.error("Publiez d'abord votre CV en ligne : le QR code pointera vers cette page.");
      return;
    }
    setQrDownloading(true);
    try {
      const publicUrl = pubUrl ?? `${window.location.origin}/u/${pubSlug}`;
      const QRCode = (await import("qrcode")).default;
      const qr = await QRCode.toDataURL(publicUrl, {
        color: { dark: "#051937", light: "#FFFFFF" },
        width: 512,
        margin: 1,
      });
      const [{ pdf }, docModule] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/pdf/CvPdfDocument"),
      ]);
      type DocProps = {
        data: Record<string, unknown>;
        templateId: string;
        photo?: string | null;
        qrDataUrl?: string | null;
        onlineUrl?: string | null;
      };
      const candidates = docModule as unknown as {
        CvPdfDocument?: ComponentType<DocProps>;
        default?: ComponentType<DocProps>;
      };
      const DocComponent = candidates.CvPdfDocument ?? candidates.default ?? null;
      if (!DocComponent) {
        throw new Error("Composant PDF introuvable (ni export nommé ni export par défaut).");
      }
      const blob = await pdf(
        (
          <DocComponent
            data={buildDossierForCvPdf()}
            templateId={mapDesignTemplate(design.template)}
            photo={null}
            qrDataUrl={qr}
            onlineUrl={publicUrl}
          />
        ) as unknown as Parameters<typeof pdf>[0]
      ).toBlob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `CV-NexiRole-QR-${
        data.personal.fullName.trim().replace(/[^a-zA-Z0-9]+/g, "-") || "NexiRole"
      }.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      toast.success("PDF avec QR code téléchargé.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "La génération du PDF avec QR a échoué."
      );
    } finally {
      setQrDownloading(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Amélioration IA globale                                          */
  /* ---------------------------------------------------------------- */

  async function runGlobalImprove() {
    if (!cvHasContent) {
      toast.error("Remplissez d'abord votre résumé ou au moins une expérience.");
      setStep(1);
      return;
    }
    setAiOpen(true);
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    try {
      const improvable = data.experiences
        .map((exp, index) => ({ exp, index }))
        .filter(({ exp }) => exp.role.trim() || exp.company.trim());

      const res = await fetch("/api/improve-cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cv: {
            titre: data.personal.title,
            nom: data.personal.fullName,
            resume: data.summary,
            experiences: improvable.map(({ exp, index }) => ({
              index,
              poste: exp.role,
              entreprise: exp.company,
              periode: exp.period,
              realisations: exp.achievements.filter((a) => a.trim()),
            })),
            competences: data.skills,
            langues: data.languages
              .filter((l) => l.name.trim())
              .map((l) => `${l.name} (${l.level})`),
          },
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { result?: ImprovementResult; error?: string }
        | null;
      if (!res.ok || !json?.result) {
        setAiError(json?.error ?? "L'amélioration IA a échoué. Réessayez dans un instant.");
        return;
      }
      setAiResult(json.result);
      setSelectedSkills(json.result.competences ?? []);
    } catch {
      setAiError("Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.");
    } finally {
      setAiLoading(false);
    }
  }

  function applyGlobalImprovement() {
    if (!aiResult) return;
    setData((prev) => {
      const next: CvBuilderData = { ...prev };
      if (aiResult.resume.trim()) next.summary = aiResult.resume.trim();
      if (aiResult.titreSuggere.trim()) {
        next.personal = { ...prev.personal, title: aiResult.titreSuggere.trim() };
      }
      next.experiences = prev.experiences.map((exp, index) => {
        const imp = aiResult.experiences.find((x) => x.index === index);
        if (!imp) return exp;
        const cleaned = imp.realisations.map((s) => s.trim()).filter(Boolean);
        return cleaned.length > 0 ? { ...exp, achievements: cleaned } : exp;
      });
      if (selectedSkills.length > 0) next.skills = selectedSkills;
      return next;
    });
    toast.success("Améliorations appliquées à votre CV");
    setAiOpen(false);
  }

  function toggleSelectedSkill(skill: string) {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Rendu des étapes du formulaire                                   */
  /* ---------------------------------------------------------------- */

  const inputClass = "h-10 rounded-xl border-slate-200 text-sm";
  const fieldLabelClass = "text-xs font-semibold text-navy";

  function renderStep() {
    switch (step) {
      case 0:
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="fullName" className={fieldLabelClass}>
                Nom complet *
              </Label>
              <Input
                id="fullName"
                placeholder="Marie Dupont"
                value={data.personal.fullName}
                onChange={(evt) => updatePersonal({ fullName: evt.target.value })}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="title" className={fieldLabelClass}>
                Titre professionnel
              </Label>
              <Input
                id="title"
                placeholder="Ex : Développeuse Fullstack Senior"
                value={data.personal.title}
                onChange={(evt) => updatePersonal({ title: evt.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <Label htmlFor="email" className={fieldLabelClass}>
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="marie.dupont@email.com"
                value={data.personal.email}
                onChange={(evt) => updatePersonal({ email: evt.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <Label htmlFor="phone" className={fieldLabelClass}>
                Téléphone
              </Label>
              <Input
                id="phone"
                placeholder="+33 6 12 34 56 78"
                value={data.personal.phone}
                onChange={(evt) => updatePersonal({ phone: evt.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <Label htmlFor="location" className={fieldLabelClass}>
                Ville / Pays
              </Label>
              <Input
                id="location"
                placeholder="Paris, France"
                value={data.personal.location}
                onChange={(evt) => updatePersonal({ location: evt.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <Label htmlFor="linkedin" className={fieldLabelClass}>
                LinkedIn
              </Label>
              <Input
                id="linkedin"
                placeholder="linkedin.com/in/mariedupont"
                value={data.personal.linkedin}
                onChange={(evt) => updatePersonal({ linkedin: evt.target.value })}
                className={inputClass}
              />
            </div>
          </div>
        );

      case 1:
        return (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="summary" className={fieldLabelClass}>
                Résumé professionnel — 3 à 4 phrases qui résument votre valeur
              </Label>
              <FieldImproveButton
                label="Résumé professionnel"
                value={data.summary}
                context={contextHint}
                onImproved={(text) => update({ summary: text })}
              />
            </div>
            <Textarea
              id="summary"
              placeholder="Ex : Développeuse fullstack avec 6 ans d'expérience…"
              value={data.summary}
              onChange={(evt) => update({ summary: evt.target.value })}
              rows={7}
              className="nice-scrollbar mt-2 rounded-xl border-slate-200 text-sm"
            />
            <p className="mt-1.5 text-[11px] text-slate-400">
              {data.summary.trim().split(/\s+/).filter(Boolean).length} mots —
              cible recommandée : 40 à 70 mots.
            </p>
          </div>
        );

      case 2:
        return (
          <div className="space-y-5">
            {data.experiences.map((exp, index) => (
              <div
                key={exp.id}
                className="rounded-xl border border-slate-200 bg-ice/50 p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-navy">
                    Expérience {index + 1}
                  </p>
                  {data.experiences.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        update({
                          experiences: data.experiences.filter((item) => item.id !== exp.id),
                        })
                      }
                      className="flex size-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                      aria-label={`Supprimer l'expérience ${index + 1}`}
                    >
                      <IconTrash className="size-4" />
                    </button>
                  )}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className={fieldLabelClass}>Poste occupé</Label>
                    <Input
                      placeholder="Développeur Frontend"
                      value={exp.role}
                      onChange={(evt) =>
                        patchExperience(exp.id, (current) => ({
                          ...current,
                          role: evt.target.value,
                        }))
                      }
                      className={`${inputClass} mt-1`}
                    />
                  </div>
                  <div>
                    <Label className={fieldLabelClass}>Entreprise</Label>
                    <Input
                      placeholder="Acme Corp"
                      value={exp.company}
                      onChange={(evt) =>
                        patchExperience(exp.id, (current) => ({
                          ...current,
                          company: evt.target.value,
                        }))
                      }
                      className={`${inputClass} mt-1`}
                    />
                  </div>
                  <div>
                    <Label className={fieldLabelClass}>Période</Label>
                    <Input
                      placeholder="2022 — Aujourd'hui"
                      value={exp.period}
                      onChange={(evt) =>
                        patchExperience(exp.id, (current) => ({
                          ...current,
                          period: evt.target.value,
                        }))
                      }
                      className={`${inputClass} mt-1`}
                    />
                  </div>
                  <div>
                    <Label className={fieldLabelClass}>Lieu</Label>
                    <Input
                      placeholder="Paris / Remote"
                      value={exp.location}
                      onChange={(evt) =>
                        patchExperience(exp.id, (current) => ({
                          ...current,
                          location: evt.target.value,
                        }))
                      }
                      className={`${inputClass} mt-1`}
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <Label className={fieldLabelClass}>Réalisations &amp; missions</Label>
                  <div className="mt-1.5 space-y-2">
                    {exp.achievements.map((achievement, aIndex) => (
                      <div key={aIndex} className="flex items-start gap-2">
                        <Textarea
                          placeholder="Ex : Refonte du front-end SaaS : -40 % de temps de chargement…"
                          value={achievement}
                          onChange={(evt) =>
                            patchExperience(exp.id, (current) => ({
                              ...current,
                              achievements: current.achievements.map((a, i) =>
                                i === aIndex ? evt.target.value : a
                              ),
                            }))
                          }
                          rows={2}
                          className="nice-scrollbar flex-1 rounded-xl border-slate-200 text-sm"
                        />
                        <div className="flex flex-col gap-1.5">
                          <FieldImproveButton
                            compact
                            label={`Réalisation ${aIndex + 1} (${exp.role || "poste"})`}
                            value={achievement}
                            context={contextHint}
                            onImproved={(text) =>
                              patchExperience(exp.id, (current) => ({
                                ...current,
                                achievements: current.achievements.map((a, i) =>
                                  i === aIndex ? text : a
                                ),
                              }))
                            }
                          />
                          {exp.achievements.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                patchExperience(exp.id, (current) => ({
                                  ...current,
                                  achievements: current.achievements.filter(
                                    (_, i) => i !== aIndex
                                  ),
                                }))
                              }
                              className="mx-auto flex size-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                              aria-label={`Supprimer la réalisation ${aIndex + 1}`}
                            >
                              <IconX className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      patchExperience(exp.id, (current) => ({
                        ...current,
                        achievements: [...current.achievements, ""],
                      }))
                    }
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-navy underline decoration-gold decoration-2 underline-offset-4"
                  >
                    <IconCirclePlus className="size-3.5 text-gold-dark" />
                    Ajouter une réalisation
                  </button>
                </div>
              </div>
            ))}

            <Button
              type="button"
              onClick={addExperience}
              variant="outline"
              className="h-10 w-full rounded-xl border-dashed border-slate-300 bg-white px-5 text-sm font-semibold text-navy hover:bg-slate-50"
            >
              <IconCirclePlus className="mr-2 size-4 text-gold-dark" />
              Ajouter une expérience
            </Button>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            {data.education.map((edu, index) => (
              <div key={edu.id} className="rounded-xl border border-slate-200 bg-ice/50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-navy">
                    Formation {index + 1}
                  </p>
                  {data.education.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        update({
                          education: data.education.filter((item) => item.id !== edu.id),
                        })
                      }
                      className="flex size-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                      aria-label={`Supprimer la formation ${index + 1}`}
                    >
                      <IconTrash className="size-4" />
                    </button>
                  )}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className={fieldLabelClass}>Diplôme / Formation</Label>
                    <Input
                      placeholder="Master Informatique"
                      value={edu.degree}
                      onChange={(evt) =>
                        patchEducation(edu.id, (current) => ({
                          ...current,
                          degree: evt.target.value,
                        }))
                      }
                      className={`${inputClass} mt-1`}
                    />
                  </div>
                  <div>
                    <Label className={fieldLabelClass}>Établissement</Label>
                    <Input
                      placeholder="Université Paris-Saclay"
                      value={edu.school}
                      onChange={(evt) =>
                        patchEducation(edu.id, (current) => ({
                          ...current,
                          school: evt.target.value,
                        }))
                      }
                      className={`${inputClass} mt-1`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className={fieldLabelClass}>Période</Label>
                    <Input
                      placeholder="2018 — 2020"
                      value={edu.period}
                      onChange={(evt) =>
                        patchEducation(edu.id, (current) => ({
                          ...current,
                          period: evt.target.value,
                        }))
                      }
                      className={`${inputClass} mt-1`}
                    />
                  </div>
                </div>
              </div>
            ))}

            <Button
              type="button"
              onClick={addEducation}
              variant="outline"
              className="h-10 w-full rounded-xl border-dashed border-slate-300 bg-white px-5 text-sm font-semibold text-navy hover:bg-slate-50"
            >
              <IconCirclePlus className="mr-2 size-4 text-gold-dark" />
              Ajouter une formation
            </Button>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div>
              <Label htmlFor="skill-input" className={fieldLabelClass}>
                Compétences — appuyez sur Entrée pour en ajouter
              </Label>
              <Input
                id="skill-input"
                placeholder="Ex : TypeScript, React, Gestion de projet…"
                value={skillInput}
                onChange={(evt) => setSkillInput(evt.target.value)}
                onKeyDown={(evt) => {
                  if (evt.key === "Enter") {
                    evt.preventDefault();
                    addSkill(skillInput);
                  }
                }}
                className={`${inputClass} mt-1.5`}
              />
              {data.skills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.skills.map((skill, i) => (
                    <span
                      key={`${skill}-${i}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-ice px-3 py-1.5 text-xs font-medium text-navy"
                    >
                      {skill}
                      <button
                        type="button"
                        onClick={() =>
                          update({
                            skills: data.skills.filter((_, idx) => idx !== i),
                          })
                        }
                        className="text-slate-400 transition-colors hover:text-red-500"
                        aria-label={`Retirer la compétence ${skill}`}
                      >
                        <IconX className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-3 text-[11px] text-slate-400">
                Conseil : les 5 premières compétences sont les plus visibles par
                les robots ATS — mettez d&apos;abord celles qui correspondent à
                vos offres cibles.
              </p>
            </div>

            <div className="border-t border-slate-100 pt-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Langues
              </p>
              <div className="mt-3 space-y-3">
                {data.languages.map((lang, index) => (
                  <div key={lang.id} className="flex items-end gap-3">
                    <div className="flex-1">
                      <Label className={fieldLabelClass}>Langue {index + 1}</Label>
                      <Input
                        placeholder="Anglais"
                        value={lang.name}
                        onChange={(evt) =>
                          patchLanguage(lang.id, (current) => ({
                            ...current,
                            name: evt.target.value,
                          }))
                        }
                        className={`${inputClass} mt-1`}
                      />
                    </div>
                    <div className="w-40 sm:w-44">
                      <Label className={fieldLabelClass}>Niveau</Label>
                      <Input
                        placeholder="C1 — Courant"
                        value={lang.level}
                        onChange={(evt) =>
                          patchLanguage(lang.id, (current) => ({
                            ...current,
                            level: evt.target.value,
                          }))
                        }
                        className={`${inputClass} mt-1`}
                      />
                    </div>
                    {data.languages.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          update({
                            languages: data.languages.filter((item) => item.id !== lang.id),
                          })
                        }
                        className="mb-1 flex size-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                        aria-label={`Supprimer la langue ${index + 1}`}
                      >
                        <IconTrash className="size-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                onClick={addLanguage}
                variant="outline"
                className="mt-4 h-10 w-full rounded-xl border-dashed border-slate-300 bg-white px-5 text-sm font-semibold text-navy hover:bg-slate-50 sm:w-auto sm:px-5"
              >
                <IconCirclePlus className="mr-2 size-4 text-gold-dark" />
                Ajouter une langue
              </Button>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-7">
            {/* Modèles */}
            <div>
              <p className={fieldLabelClass}>Modèle de CV</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {TEMPLATES.map((tpl) => {
                  const active = design.template === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setDesign((prev) => ({ ...prev, template: tpl.id }))}
                      className={`relative rounded-xl border p-3 text-left transition-all ${active
                        ? "border-navy bg-navy/[0.04] ring-2 ring-navy"
                        : "border-slate-200 bg-white hover:border-navy/40"
                        }`}
                      aria-pressed={active}
                    >
                      {active && (
                        <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-navy text-white">
                          <IconCheck className="size-3" />
                        </span>
                      )}
                      <p className="text-sm font-bold text-navy">{tpl.name}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{tpl.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Couleur d'accent */}
            <div>
              <p className={fieldLabelClass}>Couleur d&apos;accent</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {ACCENT_PRESETS.map((preset) => {
                  const active = design.accent.toLowerCase() === preset.hex.toLowerCase();
                  return (
                    <button
                      key={preset.hex}
                      type="button"
                      title={preset.name}
                      onClick={() => setDesign((prev) => ({ ...prev, accent: preset.hex }))}
                      className={`flex size-9 items-center justify-center rounded-full border-2 transition-all ${active ? "border-navy ring-2 ring-navy/30" : "border-transparent"
                        }`}
                      style={{ background: preset.hex }}
                      aria-label={`Couleur ${preset.name}`}
                      aria-pressed={active}
                    >
                      {active && <IconCheck className={`size-4 ${onColor(preset.hex) === "#ffffff" ? "text-white" : "text-navy"}`} />}
                    </button>
                  );
                })}
                <label
                  className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-navy"
                  title="Choisir une couleur personnalisée"
                >
                  Personnalisée
                  <input
                    type="color"
                    value={design.accent}
                    onChange={(evt) =>
                      setDesign((prev) => ({ ...prev, accent: evt.target.value }))
                    }
                    className="size-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
                    aria-label="Couleur personnalisée"
                  />
                </label>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px] text-slate-500">
                  {design.accent.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Polices */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="heading-font" className={fieldLabelClass}>
                  Police des titres
                </Label>
                <select
                  id="heading-font"
                  value={design.headingFont}
                  onChange={(evt) =>
                    setDesign((prev) => ({
                      ...prev,
                      headingFont: evt.target.value as FontKey,
                    }))
                  }
                  className={`${inputClass} mt-1.5 w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 text-sm text-navy`}
                >
                  {(Object.keys(FONT_FAMILIES) as FontKey[]).map((key) => (
                    <option key={key} value={key}>
                      {FONT_FAMILIES[key].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="body-font" className={fieldLabelClass}>
                  Police du texte
                </Label>
                <select
                  id="body-font"
                  value={design.bodyFont}
                  onChange={(evt) =>
                    setDesign((prev) => ({
                      ...prev,
                      bodyFont: evt.target.value as FontKey,
                    }))
                  }
                  className={`${inputClass} mt-1.5 w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 text-sm text-navy`}
                >
                  {(Object.keys(FONT_FAMILIES) as FontKey[]).map((key) => (
                    <option key={key} value={key}>
                      {FONT_FAMILIES[key].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Taille du texte */}
            <div>
              <p className={fieldLabelClass}>Taille du texte</p>
              <div className="mt-2 inline-flex overflow-hidden rounded-xl border border-slate-200">
                {SIZES.map((size) => {
                  const active = design.scale === size.value;
                  return (
                    <button
                      key={size.label}
                      type="button"
                      onClick={() => setDesign((prev) => ({ ...prev, scale: size.value }))}
                      className={`px-5 py-2 text-xs font-semibold transition-colors ${active ? "bg-navy text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      aria-pressed={active}
                    >
                      {size.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDesign(DEFAULT_DESIGN)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 underline decoration-slate-300 underline-offset-4 hover:text-navy"
            >
              Réinitialiser le design
            </button>
          </div>
        );

      default:
        return null;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Rendu global                                                     */
  /* ---------------------------------------------------------------- */

  const saveLabel = !loaded
    ? "Chargement…"
    : saving
      ? "Sauvegarde automatique…"
      : "Sauvegarde automatique activée";

  return (
    <><div className="bg-ice">
      {/* Styles d'impression : seule la feuille CV (portail) est imprimée, A4 exact.
        Le portail est un enfant direct de <body> : pagination multi-pages native. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@media print {
  @page { size: A4; margin: 0; }
  html, body { background: #ffffff !important; }
  body > *:not(#cv-print-root) { display: none !important; }
  #cv-print-root { display: block !important; }
  #cv-print-sheet, #cv-print-sheet * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  #cv-print-sheet {
    width: 210mm !important;
    min-height: auto !important;
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
  }
}
`,
        }} />

      {/* En-tête */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-slate-50"
          >
            <IconArrowLeft className="size-3.5" />
            <span className="hidden sm:inline">Retour au tableau de bord</span>
            <span className="sm:hidden">Retour</span>
          </Link>


          <Link
            href="/dashboard/cv-builder"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-slate-50"
          >
            <IconDeviceFloppy className="size-3.5" />
            <span className="hidden sm:inline">Ma bibliothèque</span>
            <span className="sm:hidden">Bibliothèque</span>
          </Link>

          <div className="min-w-0 flex-1">
            <h1 className="truncate font-heading text-base font-extrabold tracking-tight text-navy sm:text-lg">
              Créateur de CV
            </h1>

            <p className="truncate text-[11px] text-slate-400">
              Étape {step + 1}/{STEPS.length} · {saveLabel}
              {cvId !== null && dbState === "saving" ? " · Enregistrement en base…" : null}
              {cvId !== null && dbState === "error" ? " · Échec enregistrement en base" : null}
              {cvId !== null && dbState === "saved" && dbSavedAt
                ? ` · Base enregistrée à ${dbSavedAt.toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : null}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runGlobalImprove}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 rounded-full border border-gold/70 bg-gold-soft px-3 py-2 text-xs font-bold text-accent-foreground transition-colors hover:bg-gold hover:text-navy disabled:cursor-not-allowed disabled:opacity-60"
              title="L'assistant IA améliore l'ensemble de votre CV"
            >
              {aiLoading ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <IconSparkles className="size-4" />
              )}
              <span className="hidden md:inline">Améliorer avec l&apos;IA</span>
              <span className="md:hidden">IA</span>
            </button>

            {pubSlug !== null && (
              <a
                href={pubUrl ?? `/u/${pubSlug}`}
                target="_blank"
                rel="noreferrer"
                title="Ouvrir votre CV public dans un nouvel onglet"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 text-xs font-bold text-navy transition-colors hover:bg-slate-50"
              >
                <IconWorld className="size-4 text-gold" />
                <span className="hidden sm:inline">
                  Voir en ligne
                  {typeof pubViews === "number" && pubViews > 0
                    ? ` - ${pubViews} vue(s)`
                    : null}
                </span>
                <span className="sm:hidden">En ligne</span>
              </a>
            )}

            <button
              type="button"
              onClick={handlePublishPublicCv}
              disabled={pubLoading}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gold px-4 text-xs font-semibold text-navy transition-colors hover:bg-[#FFD056] disabled:cursor-not-allowed disabled:opacity-60"
              title="Publier la version actuelle du CV sur votre page publique"
            >
              {pubLoading ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <IconWorld className="size-4" />
              )}
              <span className="hidden sm:inline">Publier en ligne</span>
              <span className="sm:hidden">Publier</span>
            </button>

            <Button
              type="button"
              onClick={handlePrint}
              className="h-9 rounded-full bg-navy px-4 text-xs font-semibold text-white hover:bg-navy-800"
            >
              <IconPrinter className="mr-1.5 size-4 text-gold" />
              <span className="hidden sm:inline">Télécharger le CV PDF</span>
              <span className="sm:hidden">PDF</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Onglets mobiles : Formulaire / Aperçu */}
        <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white lg:hidden">
          <button
            type="button"
            onClick={() => setMobileTab("form")}
            className={`py-2.5 text-sm font-semibold transition-colors ${mobileTab === "form" ? "bg-navy text-white" : "text-slate-600"}`}
            aria-pressed={mobileTab === "form"}
          >
            Formulaire
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("preview")}
            className={`py-2.5 text-sm font-semibold transition-colors ${mobileTab === "preview" ? "bg-navy text-white" : "text-slate-600"}`}
            aria-pressed={mobileTab === "preview"}
          >
            Aperçu du CV
          </button>
        </div>

        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          {/* Colonne formulaire */}
          <div className={`min-w-0 ${mobileTab === "form" ? "" : "hidden lg:block"}`}>
            {/* Stepper */}
            <div className="nice-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
              {STEPS.map((s) => {
                const active = s.id === step;
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStep(s.id)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-all ${active
                      ? "border-navy bg-navy text-white shadow-[0_8px_20px_-8px_rgba(5,25,55,0.5)]"
                      : "border-slate-200 bg-white text-slate-600 hover:border-navy/30 hover:text-navy"}`}
                    aria-current={active ? "step" : undefined}
                  >
                    <span
                      className={`flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${active ? "bg-gold text-navy" : "bg-slate-100 text-slate-500"}`}
                    >
                      {s.id + 1}
                    </span>
                    <Icon className={`size-3.5 ${active ? "text-gold" : "text-gold-dark"}`} />
                    {s.label}
                  </button>
                );
              })}
            </div>

            {/* Carte étape */}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="font-heading text-lg font-bold text-navy">
                {STEPS[step].label}
              </h2>
              <div className="mt-4">{renderStep()}</div>

              {/* Navigation */}
              <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={step === 0}
                  className="h-10 rounded-full border-slate-300 bg-white px-5 text-sm font-semibold text-navy hover:bg-slate-50"
                >
                  <IconArrowLeft className="mr-1.5 size-4" />
                  Précédent
                </Button>

                <Button
                  type="button"
                  onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                  disabled={step === STEPS.length - 1}
                  className="h-10 rounded-full bg-navy px-5 text-sm font-semibold text-white hover:bg-navy-800"
                >
                  {step === STEPS.length - 1 ? "Dernière étape" : "Suivant"}
                  <IconArrowRight className="ml-1.5 size-4" />
                </Button>
              </div>
            </div>

            {/* Sélecteur de modèle rapide */}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Modèle de CV
                </p>
                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="text-[11px] font-semibold text-navy underline decoration-gold decoration-2 underline-offset-4"
                >
                  Couleurs &amp; polices
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TEMPLATES.map((tpl) => {
                  const active = design.template === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setDesign((prev) => ({ ...prev, template: tpl.id }))}
                      className={`rounded-xl border px-3 py-2.5 text-left text-[11px] font-semibold transition-all ${active
                        ? "border-navy bg-navy text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-navy/40"}`}
                      aria-pressed={active}
                    >
                      {active && <IconCheck className="mb-1 size-3.5 text-gold" />}
                      <span className="block leading-tight">{tpl.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* CV public partageable — lien web + QR code (bloc additif, ne touche à rien d'autre) */}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gold-soft text-accent-foreground">
                    <IconLink className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-navy">
                      Lien Web Public &amp; QR Code
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      Publiez votre CV sur une page web NexiRole, QR code inclus.
                    </p>
                  </div>
                </div>
                {pubSlug !== null && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    En ligne
                  </span>
                )}
              </div>

              {pubError !== null && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
                  <IconAlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  <span className="flex-1">{pubError}</span>
                </div>
              )}

              {pubSlug === null ? (
                <Button
                  type="button"
                  onClick={handlePublishPublicCv}
                  disabled={pubLoading}
                  className="mt-3 h-10 w-full rounded-xl bg-gold px-4 text-sm font-bold text-navy hover:bg-gold-dark disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pubLoading ? (
                    <IconLoader2 className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <IconWorld className="mr-1.5 size-4" />
                  )}
                  {pubLoading ? "Publication en cours…" : "Publier mon CV en ligne"}
                </Button>
              ) : (
                <>
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <code className="min-w-0 flex-1 truncate text-xs font-semibold text-navy">
                      {pubUrl ??
                        (siteOrigin !== "" ? `${siteOrigin}/u/${pubSlug}` : `/u/${pubSlug}`)}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyPublicLink}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-navy px-2.5 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-navy-800"
                      title="Copier le lien public"
                    >
                      {pubCopied ? (
                        <IconCheck className="size-3.5 text-gold" />
                      ) : (
                        <IconCopy className="size-3.5 text-gold" />
                      )}
                      {pubCopied ? "Copié" : "Copier"}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <IconEye className="size-3.5 text-gold-dark" />
                      {pubViews ?? 0} vue{(pubViews ?? 0) > 1 ? "s" : ""}
                    </span>
                    <a
                      href={`/u/${pubSlug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-navy underline decoration-gold decoration-2 underline-offset-4"
                    >
                      Ouvrir ma page publique
                    </a>
                  </div>
                </>
              )}

              <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-navy/40">
                <span className="flex items-center gap-2">
                  <IconQrcode className="size-4 text-navy" />
                  <span className="text-xs font-semibold text-navy">
                    Afficher le QR Code sur mon PDF
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={showQrOnPdf}
                  onChange={toggleShowQrOnPdf}
                  className="size-4 accent-[#FFC107]"
                  aria-label="Afficher le QR Code sur mon PDF" />
              </label>

              {showQrOnPdf && pubSlug === null && (
                <p className="mt-1.5 px-1 text-[11px] text-amber-700">
                  Publiez d&apos;abord votre CV : le QR code pointera vers votre page publique.
                </p>
              )}

              {showQrOnPdf && pubSlug !== null && (
                <Button
                  type="button"
                  onClick={handleDownloadPdfWithQr}
                  disabled={qrDownloading}
                  className="mt-2 h-10 w-full rounded-xl border text-navy border-gold  px-4 text-sm font-bold hover:bg-gold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {qrDownloading ? (
                    <IconLoader2 className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <IconQrcode className="mr-1.5 size-4 text-accent " />
                  )}
                  {qrDownloading ? "Génération du PDF…" : "Télécharger le PDF avec QR code"}
                </Button>
              )}

              <p className="mt-2 px-1 text-[10px] leading-relaxed text-slate-400">
                Le lien ci-dessus fonctionne en local comme en production
                (nexirole.vercel.app/u/…). Le QR code du PDF ouvre cette page sur mobile.
              </p>
            </div>
          </div>

          {/* Colonne aperçu */}
          <aside
            className={`min-w-0 lg:sticky lg:top-20 lg:self-start ${mobileTab === "preview" ? "" : "hidden lg:block"}`}
          >
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {/* Barre d'aperçu */}
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Aperçu temps réel
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="hidden rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-bold text-accent-foreground sm:inline">
                    Format A4
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoomMode("fit")}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors ${zoomMode === "fit"
                      ? "bg-navy text-white"
                      : "bg-slate-200 text-navy hover:bg-slate-300"}`}
                    aria-pressed={zoomMode === "fit"}
                  >
                    Ajuster
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomMode("actual")}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors ${zoomMode === "actual"
                      ? "bg-navy text-white"
                      : "bg-slate-200 text-navy hover:bg-slate-300"}`}
                    aria-pressed={zoomMode === "actual"}
                  >
                    100 %
                  </button>
                </div>
              </div>

              {/* Feuille A4 mise à l'échelle */}
              <div className="bg-slate-100 p-3 sm:p-4">
                <div
                  ref={previewWrapRef}
                  style={{
                    height: previewViewportHeight,
                    overflow: zoomMode === "fit" ? "hidden" : "auto",
                  }}
                  className="nice-scrollbar"
                >
                  <div
                    id="cv-print-scale"
                    style={{
                      width: "794px",
                      transform: `scale(${previewScale})`,
                      transformOrigin: "top left",
                    }}
                  >
                    <div
                      ref={sheetRef}
                      className="bg-white"
                      style={{
                        width: "794px",
                        minHeight: "1123px",
                        fontFamily: FONT_FAMILIES[design.bodyFont].stack,
                        fontSize: `${13.2 * design.scale}px`,
                        color: "#1e293b",
                      }}
                    >
                      <CvSheet data={data} design={design} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-2 px-1 text-[11px] text-slate-400">
              « Télécharger le CV PDF » ouvre votre navigateur : choisissez la
              destination « Enregistrer au format PDF » — les couleurs, polices et
              le modèle choisis sont conservés à l&apos;identique.
            </p>
            <button
              type="button"
              onClick={handleDownloadPdfServer}
              disabled={downloading}
              className="mt-2 inline-flex items-center gap-1.5 px-1 text-[11px] font-semibold text-slate-500 underline decoration-slate-300 underline-offset-4 transition-colors hover:text-navy disabled:opacity-60"
            >
              {downloading ? (
                <IconLoader2 className="size-3.5 animate-spin" />
              ) : (
                <IconDownload className="size-3.5" />
              )}
              Ou générer la version ATS serveur (PDF simple, sans design)
            </button>
          </aside>
        </div>
      </div>

      {/* Modale d'amélioration IA globale */}
      {aiOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Amélioration IA du CV"
        >
          <div className="nice-scrollbar max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-full bg-gold-soft text-accent-foreground">
                  <IconSparkles className="size-5" />
                </span>
                <div>
                  <h2 className="font-heading text-lg font-bold text-navy">
                    Amélioration de votre CV par l&apos;IA
                  </h2>
                  <p className="text-xs text-slate-500">
                    Résumé, réalisations, compétences et conseils personnalisés.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAiOpen(false)}
                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-navy"
                aria-label="Fermer"
              >
                <IconX className="size-5" />
              </button>
            </div>

            {aiLoading && (
              <div className="mt-8 flex flex-col items-center justify-center py-10 text-center">
                <IconLoader2 className="size-8 animate-spin text-navy" />
                <p className="mt-3 text-sm font-semibold text-navy">
                  L&apos;assistant analyse votre CV…
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Réécriture du résumé et des réalisations — 10 à 30 secondes.
                </p>
              </div>
            )}

            {!aiLoading && aiError && (
              <div className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
                <p className="flex-1">{aiError}</p>
                <button
                  type="button"
                  onClick={() => setAiOpen(false)}
                  className="rounded p-1 hover:bg-red-100"
                  aria-label="Fermer"
                >
                  <IconX className="size-4" />
                </button>
              </div>
            )}

            {!aiLoading && aiResult && (
              <div className="mt-6 space-y-5">
                {/* Résumé amélioré */}
                <section className="rounded-xl border border-slate-200 bg-ice/60 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-navy">
                    Résumé proposé
                  </p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                    {aiResult.resume || "—"}
                  </p>
                </section>

                {/* Réalisations améliorées */}
                {aiResult.experiences.length > 0 && (
                  <section className="rounded-xl border border-slate-200 bg-ice/60 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-navy">
                      Réalisations réécrites
                    </p>
                    <div className="mt-2 space-y-3">
                      {aiResult.experiences.map((imp) => {
                        const exp = data.experiences[imp.index];
                        return (
                          <div key={imp.index}>
                            <p className="text-xs font-semibold text-navy">
                              {exp ? `${exp.role || "Poste"} — ${exp.company || "Entreprise"}` : `Expérience ${imp.index + 1}`}
                            </p>
                            <ul className="mt-1 space-y-1">
                              {imp.realisations.map((r, i) => (
                                <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-slate-600">
                                  <span className="text-gold-dark">•</span>
                                  <span>{r}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* Compétences suggérées */}
                {aiResult.competences.length > 0 && (
                  <section className="rounded-xl border border-slate-200 bg-ice/60 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-navy">
                      Compétences suggérées — cliquez pour inclure / exclure
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {aiResult.competences.map((skill) => {
                        const active = selectedSkills.includes(skill);
                        return (
                          <button
                            key={skill}
                            type="button"
                            onClick={() => toggleSelectedSkill(skill)}
                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${active
                              ? "border-navy bg-navy text-white"
                              : "border-slate-200 bg-white text-slate-500 line-through opacity-60"}`}
                            aria-pressed={active}
                          >
                            {active && <IconCheck className="size-3" />}
                            {skill}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* Conseils */}
                {aiResult.conseils.length > 0 && (
                  <section className="rounded-xl border border-gold/50 bg-gold-soft/50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-accent-foreground">
                      Conseils du coach
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {aiResult.conseils.map((conseil, i) => (
                        <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-slate-700">
                          <IconCheck className="mt-0.5 size-3.5 shrink-0 text-gold-dark" />
                          <span>{conseil}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAiOpen(false)}
                    className="h-10 rounded-full border-slate-300 bg-white px-5 text-sm font-semibold text-navy hover:bg-slate-50"
                  >
                    Annuler
                  </Button>
                  <Button
                    type="button"
                    onClick={applyGlobalImprovement}
                    className="h-10 rounded-full bg-navy px-5 text-sm font-semibold text-white hover:bg-navy-800"
                  >
                    <IconDeviceFloppy className="mr-1.5 size-4 text-gold" />
                    Tout appliquer à mon CV
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Portail d'impression : rendu A4 dédié, enfant direct de <body>.
        Invisible à l'écran, affiché seul pendant l'impression. */}
      {mounted
        ? createPortal(
          <div id="cv-print-root" className="hidden" aria-hidden>
            <div
              id="cv-print-sheet"
              style={{
                width: "210mm",
                fontFamily: FONT_FAMILIES[design.bodyFont].stack,
                fontSize: `${13.2 * design.scale}px`,
                color: "#1e293b",
                background: "#ffffff",
                position: "relative",
              }}
            >
              <CvSheet data={data} design={design} />
                {showQrOnPdf && qrDataUrl !== null ? (
                <div
                  style={{
                    position: "absolute",
                    top: "8mm",
                    right: "8mm",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "1.2mm",
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "1.5mm",
                    padding: "1.8mm",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrDataUrl}
                    alt="QR code — version en ligne du CV"
                    style={{ width: "20mm", height: "20mm", display: "block" }} />
                  <span
                    style={{
                      fontSize: "6.5px",
                      fontWeight: 700,
                      color: "#051937",
                      letterSpacing: "0.05em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Version en ligne
                  </span>
                </div>
              ) : null}
            </div>
          </div>,
          document.body
        )
        : null}
    </div>
      <PublicCvStudio />
    </>
  );
}
