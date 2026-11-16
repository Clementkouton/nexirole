import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { CoverLetter } from "@/lib/schemas";

/**
 * Template PDF de Lettre de Motivation — mise en page courrier
 * professionnel français, sobre et compatible ATS.
 */

const NAVY = "#051937";
const SLATE = "#475569";
const BORDER = "#cbd5e1";

const styles = StyleSheet.create({
  page: {
    paddingTop: 46,
    paddingHorizontal: 52,
    paddingBottom: 40,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    color: "#1e293b",
    lineHeight: 1.55,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 22,
  },
  candidateBlock: {
    maxWidth: "60%",
  },
  name: {
    fontSize: 17,
    fontWeight: "bold",
    color: NAVY,
    marginBottom: 4,
  },
  jobTitle: {
    fontSize: 10,
    color: SLATE,
    marginBottom: 6,
  },
  contactLine: {
    fontSize: 8.5,
    color: SLATE,
    marginBottom: 1.5,
  },
  recipientBlock: {
    maxWidth: "38%",
    fontSize: 9.5,
    color: "#334155",
    textAlign: "right",
  },
  company: {
    fontSize: 11,
    fontWeight: "bold",
    color: NAVY,
  },
  goldRule: {
    height: 3,
    backgroundColor: NAVY,
    marginBottom: 24,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  place: {
    fontSize: 9.5,
    color: SLATE,
  },
  date: {
    fontSize: 9.5,
    color: SLATE,
  },
  subject: {
    fontSize: 10.5,
    fontWeight: "bold",
    color: NAVY,
    marginBottom: 16,
  },
  greeting: {
    marginBottom: 12,
    color: "#1e293b",
  },
  paragraph: {
    marginBottom: 10,
    textAlign: "justify",
    color: "#334155",
  },
  closing: {
    marginTop: 4,
    marginBottom: 24,
    textAlign: "justify",
    color: "#334155",
  },
  signature: {
    fontSize: 10.5,
    fontWeight: "bold",
    color: NAVY,
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 52,
    right: 52,
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

export interface CoverLetterPdfTemplateProps {
  letter: CoverLetter;
  candidateName: string;
  jobTitle?: string;
  company?: string;
  contact: {
    email?: string;
    phone?: string;
    location?: string;
  };
}

function formatDateFr(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function CoverLetterPdfTemplate({
  letter,
  candidateName,
  jobTitle,
  company,
  contact,
}: CoverLetterPdfTemplateProps) {
  return (
    <Document
      title={`Lettre de motivation — ${candidateName}`}
      author={candidateName}
      subject={letter.subject}
      creator="NexiRole"
    >
      <Page size="A4" style={styles.page}>
        {/* En-tête : expéditeur / destinataire */}
        <View style={styles.header}>
          <View style={styles.candidateBlock}>
            <Text style={styles.name}>{candidateName || "Candidat"}</Text>
            {jobTitle ? <Text style={styles.jobTitle}>{jobTitle}</Text> : null}
            {contact.email ? (
              <Text style={styles.contactLine}>{contact.email}</Text>
            ) : null}
            {contact.phone ? (
              <Text style={styles.contactLine}>{contact.phone}</Text>
            ) : null}
            {contact.location ? (
              <Text style={styles.contactLine}>{contact.location}</Text>
            ) : null}
          </View>
          <View style={styles.recipientBlock}>
            {company ? <Text style={styles.company}>{company}</Text> : null}
            <Text>À l&apos;attention du service recrutement</Text>
          </View>
        </View>

        <View style={styles.goldRule} />

        {/* Lieu + date */}
        <View style={styles.metaRow}>
          <Text style={styles.place}>{contact.location || "France"}</Text>
          <Text style={styles.date}>Le {formatDateFr(new Date())}</Text>
        </View>

        {/* Objet */}
        <Text style={styles.subject}>Objet : {letter.subject}</Text>

        {/* Corps */}
        <Text style={styles.greeting}>{letter.greeting}</Text>
        {letter.paragraphs.map((paragraph, i) => (
          <Text key={i} style={styles.paragraph}>
            {paragraph}
          </Text>
        ))}
        <Text style={styles.closing}>{letter.closing}</Text>

        <Text style={styles.signature}>{candidateName}</Text>

        {/* Pied de page */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {candidateName} — Candidature {jobTitle ? `: ${jobTitle}` : ""}
          </Text>
          <Text style={styles.footerText}>Rédigée avec NexiRole</Text>
        </View>
      </Page>
    </Document>
  );
}
