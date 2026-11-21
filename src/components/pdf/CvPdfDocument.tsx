import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { getTemplate, type TemplateId } from "@/lib/cv-templates";

/* Résistance aux imports — DossierData défini LOCALEMENT et réexporté.
   L'import historique depuis "@/lib/types" (champ absent de ce module,
   erreur TS2305) est remplacé par cette définition structurellement
   identique : le fichier compile même si @/lib/types change ou n'exporte
   jamais ce type. */
export interface DossierData {
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
}

/**
 * Document PDF du CV — 4 templates ATS (A4), avec ou sans photo.
 * Chargé UNIQUEMENT côté client (import dynamique depuis src/lib/pdf-client.tsx) :
 * aucune erreur SSR au build.
 */

export interface CvPdfDocumentProps {
  data: DossierData;
  templateId: TemplateId;
  photo?: string | null;
  /** Data URL du QR code pointant vers la page publique (/u/<slug>). */
  qrDataUrl?: string | null;
  /** URL publique affichée sous le QR code (optionnelle). */
  onlineUrl?: string | null;
}

function contactItems(data: DossierData): string[] {
  const items: string[] = [];
  if (data.identite.email) items.push(data.identite.email);
  if (data.identite.telephone) items.push(data.identite.telephone);
  if (data.identite.ville) items.push(data.identite.ville);
  if (data.identite.linkedin) items.push(data.identite.linkedin);
  return items;
}

function Photo({
  photo,
  shape,
  size,
}: {
  photo: string | null | undefined;
  shape: "circle" | "rounded" | "square";
  size: number;
}) {
  if (!photo) return null;
  const radius =
    shape === "circle" ? size / 2 : shape === "rounded" ? size * 0.18 : 0;
  return (
    <Image
      src={photo}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        objectFit: "cover",
      }}
    />
  );
}

export function CvPdfDocument({
  data,
  templateId,
  photo,
  qrDataUrl,
  onlineUrl,
}: CvPdfDocumentProps) {
  const t = getTemplate(templateId);
  const contacts = contactItems(data);
  const isSwiss = t.headerVariant === "swiss";
  const isCompact = t.headerVariant === "linear";

  const styles = StyleSheet.create({
    page: {
      paddingTop: isCompact ? 28 : t.headerVariant === "banner" ? 0 : 38,
      paddingHorizontal: isCompact ? 32 : 44,
      paddingBottom: isCompact ? 26 : 34,
      fontFamily: t.fontFamily,
      fontSize: isCompact ? 9.5 : 10,
      color: t.text,
      lineHeight: 1.45,
    },
    /* ── En-têtes ─────────────────────────────────────────────── */
    bannerHeader: {
      backgroundColor: t.navy,
      paddingHorizontal: 44,
      paddingTop: 34,
      paddingBottom: 26,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 14,
      borderBottomWidth: 4,
      borderBottomColor: t.accent,
    },
    bannerName: {
      fontSize: t.nameSize,
      fontWeight: "bold",
      color: "#ffffff",
      marginBottom: 4,
    },
    bannerTitle: {
      fontSize: 11.5,
      color: t.accent,
      marginBottom: 8,
      fontWeight: "bold",
    },
    bannerContact: {
      fontSize: 8.5,
      color: "#dbe3ee",
    },
    centeredHeader: {
      alignItems: "center",
      marginBottom: 14,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.line,
    },
    centeredName: {
      fontSize: t.nameSize,
      fontWeight: "bold",
      color: t.navy,
      marginBottom: 3,
    },
    centeredTitle: {
      fontSize: 11,
      color: t.muted,
      marginBottom: 6,
    },
    centeredContact: {
      fontSize: 8.5,
      color: t.muted,
    },
    swissHeader: {
      marginBottom: 20,
      paddingBottom: 14,
      borderBottomWidth: 2,
      borderBottomColor: "#111827",
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
    },
    swissName: {
      fontSize: t.nameSize,
      fontWeight: "bold",
      color: "#111827",
      letterSpacing: 1,
      marginBottom: 4,
    },
    swissTitle: {
      fontSize: 11,
      color: t.muted,
      letterSpacing: 1.5,
    },
    swissContact: {
      fontSize: 8.5,
      color: t.muted,
      textAlign: "right",
    },
    linearHeader: {
      marginBottom: 10,
      paddingBottom: 8,
      borderBottomWidth: 2,
      borderBottomColor: t.accent,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    linearName: {
      fontSize: t.nameSize,
      fontWeight: "bold",
      color: t.navy,
      marginBottom: 2,
    },
    linearTitle: {
      fontSize: 10,
      color: t.muted,
    },
    linearContact: {
      fontSize: 8,
      color: t.muted,
      textAlign: "right",
    },
    /* ── Sections ─────────────────────────────────────────────── */
    section: {
      marginBottom: t.sectionGap,
    },
    sectionTitle: {
      fontSize: isCompact ? 9.5 : 11,
      fontWeight: "bold",
      color: isSwiss ? "#111827" : t.navy,
      textTransform: t.uppercaseSections ? "uppercase" : "none",
      letterSpacing: t.sectionLetterSpacing,
      marginBottom: 5,
      paddingBottom: 3,
      borderBottomWidth: isSwiss ? 0 : 1,
      borderBottomColor: t.line,
    },
    summary: {
      fontSize: isCompact ? 9 : 9.5,
      color: t.text,
      textAlign: "justify",
    },
    experience: { marginBottom: isCompact ? 6 : 8 },
    experienceHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 1,
    },
    role: { fontSize: isCompact ? 9.5 : 10.5, fontWeight: "bold", color: t.navy },
    period: { fontSize: 8.5, color: t.muted },
    companyLine: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 3,
    },
    company: { fontSize: 9.5, color: t.accent, fontWeight: "bold" },
    location: { fontSize: 8.5, color: t.muted },
    bulletRow: { flexDirection: "row", marginBottom: 2, paddingRight: 6 },
    bulletDot: { fontSize: 9, color: t.accent, marginRight: 5 },
    bulletText: { fontSize: 9.2, color: t.text, flex: 1 },
    skillBadge: {
      backgroundColor: t.headerVariant === "banner" ? "#f1f5f9" : "#f8fafc",
      borderWidth: 0.7,
      borderColor: t.line,
      borderRadius: 3,
      paddingHorizontal: 6,
      paddingVertical: 2.5,
      marginRight: 4,
      marginBottom: 4,
    },
    skillBadgeText: { fontSize: 8.6, color: t.navy },
    skillLine: { fontSize: 9.2, color: t.text, marginBottom: 2 },
    langLine: { fontSize: 9.2, color: t.text, marginBottom: 2 },
    /* QR « Version en ligne » */
    qrRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginBottom: 12,
    },
    qrCard: {
      alignItems: "center",
      padding: 6,
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: 6,
      backgroundColor: "#ffffff",
    },
    qrImage: { width: 56, height: 56 },
    qrText: { fontSize: 6.5, color: t.navy, marginTop: 4, fontWeight: "bold" },
    qrUrl: { fontSize: 5.5, color: t.muted, marginTop: 1 },
  });

  function SectionTitle({ children }: { children: React.ReactNode }) {
    return <Text style={styles.sectionTitle}>{children}</Text>;
  }

  function renderSkills() {
    if (t.skillBadges) {
      return (
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {data.competences.map((skill) => (
            <View key={skill} style={styles.skillBadge}>
              <Text style={styles.skillBadgeText}>{skill}</Text>
            </View>
          ))}
        </View>
      );
    }
    return (
      <Text style={styles.skillLine}>
        {data.competences.join("   •   ")}
      </Text>
    );
  }

  return (
    <Document
      title={`CV ${data.identite.nom_complet}`}
      author={data.identite.nom_complet}
    >
      <Page size="A4" style={styles.page}>
        {/* ── EN-TÊTE selon template ─────────────────────────────── */}
        {t.headerVariant === "banner" && (
          <View style={styles.bannerHeader} wrap={false}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerName}>{data.identite.nom_complet}</Text>
              <Text style={styles.bannerTitle}>{data.titre}</Text>
              <Text style={styles.bannerContact}>{contacts.join("  •  ")}</Text>
            </View>
            <Photo photo={photo} shape={t.photoShape} size={64} />
          </View>
        )}

        {t.headerVariant === "centered-rule" && (
          <View style={styles.centeredHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={styles.centeredName}>{data.identite.nom_complet}</Text>
                <Text style={styles.centeredTitle}>{data.titre}</Text>
                <Text style={styles.centeredContact}>{contacts.join("  •  ")}</Text>
              </View>
              {photo ? <Photo photo={photo} shape={t.photoShape} size={58} /> : null}
            </View>
          </View>
        )}

        {t.headerVariant === "swiss" && (
          <View style={styles.swissHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.swissName}>{data.identite.nom_complet.toUpperCase()}</Text>
              <Text style={styles.swissTitle}>{data.titre.toUpperCase()}</Text>
              <Text style={styles.swissContact}>{contacts.join("  •  ")}</Text>
            </View>
            {photo ? <Photo photo={photo} shape={t.photoShape} size={56} /> : null}
          </View>
        )}

        {t.headerVariant === "linear" && (
          <View style={styles.linearHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.linearName}>{data.identite.nom_complet}</Text>
              <Text style={styles.linearTitle}>{data.titre}</Text>
              <Text style={styles.linearContact}>{contacts.join("  •  ")}</Text>
            </View>
            {photo ? <Photo photo={photo} shape={t.photoShape} size={44} /> : null}
          </View>
        )}

        {/* ── RÉSUMÉ ─────────────────────────────────────────────── */}
        {/* QR « Version en ligne » — optionnel (qrDataUrl) */}
        {qrDataUrl ? (
          <View style={styles.qrRow} wrap={false}>
            <View style={styles.qrCard}>
              <Image src={qrDataUrl} style={styles.qrImage} />
              <Text style={styles.qrText}>Version en ligne</Text>
              {onlineUrl ? (
                <Text style={styles.qrUrl}>
                  {onlineUrl.replace(/^https?:\/\//, "").slice(0, 40)}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {data.resume ? (
          <View style={styles.section}>
            <SectionTitle>Profil</SectionTitle>
            <Text style={styles.summary}>{data.resume}</Text>
          </View>
        ) : null}

        {/* ── EXPÉRIENCES ────────────────────────────────────────── */}
        {data.experiences.length > 0 && (
          <View style={styles.section}>
            <SectionTitle>Expérience professionnelle</SectionTitle>
            {data.experiences.map((exp, i) => (
              <View key={`exp-${i}`} style={styles.experience} wrap={false}>
                <View style={styles.experienceHeader}>
                  <Text style={styles.role}>{exp.poste}</Text>
                  <Text style={styles.period}>{exp.periode}</Text>
                </View>
                <View style={styles.companyLine}>
                  <Text style={styles.company}>{exp.entreprise}</Text>
                  <Text style={styles.location}>{exp.lieu}</Text>
                </View>
                {exp.missions.map((mission, j) => (
                  <View key={`m-${i}-${j}`} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{mission}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* ── FORMATIONS ─────────────────────────────────────────── */}
        {data.formations.length > 0 && (
          <View style={styles.section}>
            <SectionTitle>Formation</SectionTitle>
            {data.formations.map((edu, i) => (
              <View key={`edu-${i}`} style={styles.experience} wrap={false}>
                <View style={styles.experienceHeader}>
                  <Text style={styles.role}>{edu.diplome}</Text>
                  <Text style={styles.period}>{edu.periode}</Text>
                </View>
                <Text style={styles.location}>{edu.etablissement}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── COMPÉTENCES ────────────────────────────────────────── */}
        {data.competences.length > 0 && (
          <View style={styles.section}>
            <SectionTitle>Compétences</SectionTitle>
            {renderSkills()}
          </View>
        )}

        {/* ── LANGUES ────────────────────────────────────────────── */}
        {data.langues.length > 0 && (
          <View style={styles.section}>
            <SectionTitle>Langues</SectionTitle>
            {data.langues.map((lang, i) => (
              <Text key={`lang-${i}`} style={styles.langLine}>
                {lang.nom} — {lang.niveau}
              </Text>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}

/* Résistance aux imports — double export : le composant est disponible en
   nommé (import { CvPdfDocument }) ET par défaut (import CvPdfDocument),
   quel que soit le style des fichiers appelants (pdf-client, builder…). */
export default CvPdfDocument;
