import React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";

export type PdfCv = {
  name: string;
  title: string;
  photo: string | null;
  email: string;
  phone: string;
  location: string;
  website: string;
  summary: string;
  experiences: { role: string; company: string; period: string; description: string }[];
  educations: { degree: string; school: string; period: string }[];
  skills: string[];
  languages: string[];
};

export type QrCvTemplateProps = {
  cv: PdfCv;
  accent: string;
  qrDataUrl: string | null;
  publicUrl: string;
  template: string;
};

function mix(hex: string, target: number, ratio: number): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16) || 0;
  const g = parseInt(n.slice(2, 4), 16) || 0;
  const b = parseInt(n.slice(4, 6), 16) || 0;
  const c = (v: number) => Math.round((target - v) * ratio + v);
  return `#${[c(r), c(g), c(b)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
const darken = (hex: string, r = 0.25) => mix(hex, 0, r);

function QrBlock({ qr, url, size = 78, boxed = true }: { qr: string | null; url: string; size?: number; boxed?: boolean }) {
  if (!qr) return null;
  return (
    <View style={boxed ? { backgroundColor: "#FFFFFF", padding: 5, borderRadius: 4, border: "1 solid #E2E8F0", alignItems: "center" } : { alignItems: "center" }}>
      <Image src={qr} style={{ width: size, height: size }} />
      <Text style={{ fontSize: 6, color: "#051937", marginTop: 2, fontFamily: "Helvetica-Bold" }}>Version en ligne</Text>
      <Text style={{ fontSize: 5, color: "#64748B" }}>{url.replace(/^https?:\/\//, "")}</Text>
    </View>
  );
}

function SectionTitle({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <View style={{ borderBottom: `2 solid ${accent}`, marginBottom: 6, paddingBottom: 2 }}>
      <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold", color: "#051937", textTransform: "uppercase", letterSpacing: 1 }}>{children}</Text>
    </View>
  );
}

function PdfExp({ e, accent }: { e: PdfCv["experiences"][number]; accent: string }) {
  return (
    <View style={{ marginBottom: 6 }}>
      <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#0F172A" }}>{e.role}</Text>
      <Text style={{ fontSize: 9, color: darken(accent, 0.35), marginBottom: 1 }}>
        {e.company}{e.period ? `  ·  ${e.period}` : ""}
      </Text>
      {e.description ? <Text style={{ fontSize: 8.5, color: "#334155", lineHeight: 1.35 }}>{e.description}</Text> : null}
    </View>
  );
}

function PdfSkills({ skills, accent }: { skills: string[]; accent: string }) {
  if (!skills.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 3 }}>
      {skills.map((s, i) => (
        <View key={i} style={{ backgroundColor: `${accent}22`, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2 }}>
          <Text style={{ fontSize: 8, color: "#0F172A" }}>{s}</Text>
        </View>
      ))}
    </View>
  );
}

function PdfBody({ cv, accent }: { cv: PdfCv; accent: string }) {
  return (
    <View>
      {cv.summary ? (
        <View style={{ marginBottom: 8 }}>
          <SectionTitle accent={accent}>Profil</SectionTitle>
          <Text style={{ fontSize: 9, color: "#334155", lineHeight: 1.4 }}>{cv.summary}</Text>
        </View>
      ) : null}
      {cv.experiences.length ? (
        <View style={{ marginBottom: 8 }}>
          <SectionTitle accent={accent}>Expérience professionnelle</SectionTitle>
          {cv.experiences.map((e, i) => <PdfExp key={i} e={e} accent={accent} />)}
        </View>
      ) : null}
      {cv.educations.length ? (
        <View style={{ marginBottom: 8 }}>
          <SectionTitle accent={accent}>Formation</SectionTitle>
          {cv.educations.map((d, i) => (
            <View key={i} style={{ marginBottom: 4 }}>
              <Text style={{ fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#0F172A" }}>{d.degree}</Text>
              <Text style={{ fontSize: 8.5, color: "#64748B" }}>{d.school}{d.period ? `  ·  ${d.period}` : ""}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {cv.skills.length ? (
        <View style={{ marginBottom: 8 }}>
          <SectionTitle accent={accent}>Compétences</SectionTitle>
          <PdfSkills skills={cv.skills} accent={accent} />
        </View>
      ) : null}
      {cv.languages.length ? (
        <View>
          <SectionTitle accent={accent}>Langues</SectionTitle>
          <PdfSkills skills={cv.languages} accent={accent} />
        </View>
      ) : null}
    </View>
  );
}

function PhotoCircle({ photo, size = 62, ring }: { photo: string | null; size?: number; ring?: string }) {
  if (!photo) return null;
  return <Image src={photo} style={{ width: size, height: size, borderRadius: size / 2, objectFit: "cover", border: `2 solid ${ring ?? "#FFFFFF"}` }} />;
}

/* ---------- 1. QR Exécutif ---------- */
function QrExecutif({ cv, accent, qrDataUrl, publicUrl }: QrCvTemplateProps) {
  return (
    <Page size="A4" style={{ backgroundColor: "#FFFFFF", fontFamily: "Helvetica" }}>
      <View style={{ backgroundColor: "#051937", padding: 24, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <PhotoCircle photo={cv.photo} ring={accent} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 19, fontFamily: "Helvetica-Bold", color: "#FFFFFF" }}>{cv.name}</Text>
          <Text style={{ fontSize: 11, color: accent, marginTop: 2 }}>{cv.title}</Text>
          <Text style={{ fontSize: 8, color: "#CBD5E1", marginTop: 4 }}>
            {[cv.email, cv.phone, cv.location].filter(Boolean).join("  ·  ")}
          </Text>
        </View>
        <QrBlock qr={qrDataUrl} url={publicUrl} />
      </View>
      <View style={{ padding: 24 }}><PdfBody cv={cv} accent={accent} /></View>
    </Page>
  );
}

/* ---------- 2. QR Moderne (colonne latérale) ---------- */
function QrModerne({ cv, accent, qrDataUrl, publicUrl }: QrCvTemplateProps) {
  return (
    <Page size="A4" style={{ backgroundColor: "#FFFFFF", fontFamily: "Helvetica" }}>
      <View style={{ flexDirection: "row", width: "100%" }}>
        <View style={{ backgroundColor: "#051937", width: 170, padding: 18, height: "100%" }}>
          <View style={{ alignItems: "center", marginBottom: 12 }}>
            <PhotoCircle photo={cv.photo} ring={accent} />
          </View>
          <Text style={{ fontSize: 6.5, color: accent, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Contact</Text>
          <Text style={{ fontSize: 7.5, color: "#E2E8F0", marginBottom: 8 }}>{[cv.email, cv.phone, cv.location, cv.website].filter(Boolean).join("\n")}</Text>
          {cv.skills.length ? (
            <View>
              <Text style={{ fontSize: 6.5, color: accent, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Compétences</Text>
              {cv.skills.map((s, i) => <Text key={i} style={{ fontSize: 7.5, color: "#E2E8F0", marginBottom: 2 }}>· {s}</Text>)}
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, padding: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontFamily: "Helvetica-Bold", color: "#051937" }}>{cv.name}</Text>
              <Text style={{ fontSize: 10, color: darken(accent, 0.35), marginTop: 1 }}>{cv.title}</Text>
            </View>
            <QrBlock qr={qrDataUrl} url={publicUrl} size={62} />
          </View>
          <PdfBody cv={cv} accent={accent} />
        </View>
      </View>
    </Page>
  );
}

/* ---------- 3. QR Classique ---------- */
function QrClassique({ cv, accent, qrDataUrl, publicUrl }: QrCvTemplateProps) {
  return (
    <Page size="A4" style={{ backgroundColor: "#FFFFFF", fontFamily: "Helvetica" }}>
      <View style={{ padding: 24, paddingBottom: 14, flexDirection: "row", alignItems: "center", gap: 12, borderBottom: `3 solid ${accent}` }}>
        <View style={{ flex: 1, alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <PhotoCircle photo={cv.photo} ring={accent} />
            <View>
              <Text style={{ fontSize: 18, fontFamily: "Helvetica-Bold", color: "#051937" }}>{cv.name}</Text>
              <Text style={{ fontSize: 10.5, color: darken(accent, 0.35) }}>{cv.title}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 8, color: "#475569", marginTop: 5 }}>
            {[cv.email, cv.phone, cv.location, cv.website].filter(Boolean).join("  ·  ")}
          </Text>
        </View>
        <QrBlock qr={qrDataUrl} url={publicUrl} size={64} />
      </View>
      <View style={{ padding: 24 }}><PdfBody cv={cv} accent={accent} /></View>
    </Page>
  );
}

/* ---------- 4. QR Minimal ---------- */
function QrMinimal({ cv, accent, qrDataUrl, publicUrl }: QrCvTemplateProps) {
  return (
    <Page size="A4" style={{ backgroundColor: "#FFFFFF", fontFamily: "Helvetica" }}>
      <View style={{ height: 6, backgroundColor: accent }} />
      <View style={{ padding: 26, paddingBottom: 10, flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontFamily: "Helvetica-Bold", color: "#0F172A" }}>{cv.name}</Text>
          <Text style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>{cv.title}</Text>
          <Text style={{ fontSize: 7.5, color: "#94A3B8", marginTop: 5 }}>
            {[cv.email, cv.phone, cv.location].filter(Boolean).join("   ·   ")}
          </Text>
        </View>
        {cv.photo ? <PhotoCircle photo={cv.photo} size={46} ring="#E2E8F0" /> : null}
        <QrBlock qr={qrDataUrl} url={publicUrl} size={58} boxed={false} />
      </View>
      <View style={{ padding: 26 }}>
        <PdfBody cv={cv} accent="#051937" />
      </View>
    </Page>
  );
}

/* ---------- 5. QR Compact ---------- */
function QrCompact({ cv, accent, qrDataUrl, publicUrl }: QrCvTemplateProps) {
  return (
    <Page size="A4" style={{ backgroundColor: "#FFFFFF", fontFamily: "Helvetica" }}>
      <View style={{ backgroundColor: darken(accent, 0.55), padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <PhotoCircle photo={cv.photo} size={44} ring="#FFFFFF" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontFamily: "Helvetica-Bold", color: "#FFFFFF" }}>{cv.name}</Text>
          <Text style={{ fontSize: 8.5, color: "#E2E8F0", marginTop: 2 }}>
            {cv.title}{cv.title && cv.location ? " · " : ""}{cv.location}
          </Text>
          <Text style={{ fontSize: 7.5, color: "#CBD5E1", marginTop: 2 }}>
            {[cv.email, cv.phone].filter(Boolean).join("  ·  ")}
          </Text>
        </View>
        <QrBlock qr={qrDataUrl} url={publicUrl} size={58} />
      </View>
      <View style={{ padding: 22 }}><PdfBody cv={cv} accent={accent} /></View>
    </Page>
  );
}

export function renderQrCvDocument(props: QrCvTemplateProps): React.ReactElement<DocumentProps> {
  const el = (() => {
    switch (props.template) {
      case "moderne": return <QrModerne {...props} />;
      case "classique": return <QrClassique {...props} />;
      case "minimal": return <QrMinimal {...props} />;
      case "compact": return <QrCompact {...props} />;
      default: return <QrExecutif {...props} />;
    }
  })();
  return el as unknown as React.ReactElement<DocumentProps>;
}

export default renderQrCvDocument;