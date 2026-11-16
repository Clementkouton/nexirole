import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { OptimizedCv } from "@/lib/schemas";

/**
 * Template PDF de CV — compatible ATS.
 * Design sobre : texte sélectionnable, colonnes limitées, polices système
 * (Helvetica), hiérarchie claire. Couleurs NexiRole utilisées avec parcimonie.
 */

const NAVY = "#051937";
const SLATE = "#475569";
const BORDER = "#cbd5e1";

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingHorizontal: 44,
    paddingBottom: 34,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1e293b",
    lineHeight: 1.45,
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: NAVY,
    paddingBottom: 12,
    marginBottom: 14,
  },
  name: {
    fontSize: 21,
    fontWeight: "bold",
    color: NAVY,
    marginBottom: 3,
    letterSpacing: 0.2,
  },
  jobTitle: {
    fontSize: 12,
    color: SLATE,
    marginBottom: 8,
  },
  contactRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
  },
  contactItem: {
    fontSize: 8.5,
    color: SLATE,
  },
  separator: {
    color: BORDER,
    fontSize: 8.5,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: NAVY,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  section: {
    marginBottom: 12,
  },
  summary: {
    fontSize: 9.5,
    color: "#334155",
    textAlign: "justify",
  },
  experience: {
    marginBottom: 8,
  },
  experienceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 1,
  },
  role: {
    fontSize: 10.5,
    fontWeight: "bold",
    color: NAVY,
  },
  period: {
    fontSize: 8.5,
    color: SLATE,
  },
  companyLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  company: {
    fontSize: 9.5,
    color: "#8a6d00",
    fontWeight: "bold",
  },
  location: {
    fontSize: 8.5,
    color: SLATE,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 2,
    paddingRight: 6,
  },
  bulletDot: {
    width: 10,
    color: NAVY,
    fontSize: 9.5,
  },
  bulletText: {
    flex: 1,
    fontSize: 9.5,
    color: "#334155",
  },
  skillsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  skillChip: {
    backgroundColor: "#f1f5f9",
    borderStyle: "solid",
    borderWidth: 0.8,
    borderColor: BORDER,
    borderRadius: 3,
    paddingVertical: 2.5,
    paddingHorizontal: 6,
    fontSize: 8.5,
    color: NAVY,
  },
  education: {
    marginBottom: 5,
  },
  degree: {
    fontSize: 10,
    fontWeight: "bold",
    color: NAVY,
  },
  schoolLine: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  school: {
    fontSize: 9.5,
    color: "#334155",
  },
  languageRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  languageName: {
    fontSize: 9.5,
    color: "#334155",
    fontWeight: "bold",
  },
  languageLevel: {
    fontSize: 9.5,
    color: SLATE,
  },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.8,
    borderTopColor: BORDER,
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7.5,
    color: "#94a3b8",
  },
});

function ContactItem({ text, last }: { text: string; last?: boolean }) {
  if (!text) return null;
  return (
    <Text style={styles.contactItem}>
      {text}
      {!last ? <Text style={styles.separator}>{"   •   "}</Text> : null}
    </Text>
  );
}

export interface CvPdfTemplateProps {
  cv: OptimizedCv;
  candidateName: string;
  contact: {
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
  };
}

export function CvPdfTemplate({ cv, candidateName, contact }: CvPdfTemplateProps) {
  const hasLanguages = cv.languages && cv.languages.length > 0;

  return (
    <Document
      title={`CV — ${candidateName}`}
      author={candidateName}
      subject={cv.title}
      creator="NexiRole"
    >
      <Page size="A4" style={styles.page}>
        {/* En-tête */}
        <View style={styles.header}>
          <Text style={styles.name}>{candidateName || "Candidat"}</Text>
          <Text style={styles.jobTitle}>{cv.title}</Text>
          <View style={styles.contactRow}>
            <ContactItem text={contact.email ?? ""} />
            <ContactItem text={contact.phone ?? ""} />
            <ContactItem text={contact.location ?? ""} />
            <ContactItem text={contact.linkedin ?? ""} last />
          </View>
        </View>

        {/* Résumé */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profil professionnel</Text>
          <Text style={styles.summary}>{cv.summary}</Text>
        </View>

        {/* Compétences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Compétences clés</Text>
          <View style={styles.skillsWrap}>
            {cv.skills.map((skill) => (
              <Text key={skill} style={styles.skillChip}>
                {skill}
              </Text>
            ))}
          </View>
        </View>

        {/* Expériences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Expériences professionnelles</Text>
          {cv.experiences.map((exp, i) => (
            <View key={`${exp.role}-${exp.company}-${i}`} style={styles.experience}>
              <View style={styles.experienceHeader}>
                <Text style={styles.role}>{exp.role}</Text>
                <Text style={styles.period}>{exp.period}</Text>
              </View>
              <View style={styles.companyLine}>
                <Text style={styles.company}>{exp.company}</Text>
                <Text style={styles.location}>{exp.location}</Text>
              </View>
              {exp.achievements.map((achievement, j) => (
                <View key={j} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>{"•"}</Text>
                  <Text style={styles.bulletText}>{achievement}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* Formations */}
        {cv.education.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Formation</Text>
            {cv.education.map((edu, i) => (
              <View key={`${edu.degree}-${i}`} style={styles.education}>
                <View style={styles.experienceHeader}>
                  <Text style={styles.degree}>{edu.degree}</Text>
                  <Text style={styles.period}>{edu.period}</Text>
                </View>
                <Text style={styles.school}>{edu.school}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Langues */}
        {hasLanguages && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Langues</Text>
            {cv.languages!.map((lang) => (
              <View key={lang.name} style={styles.languageRow}>
                <Text style={styles.languageName}>{lang.name}</Text>
                <Text style={styles.languageLevel}>{lang.level}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Pied de page */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{candidateName} — {cv.title}</Text>
          <Text style={styles.footerText}>Optimisé avec NexiRole</Text>
        </View>
      </Page>
    </Document>
  );
}
