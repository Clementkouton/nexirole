import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { getTemplate, type TemplateId } from "@/lib/cv-templates";

/**
 * Document PDF de la lettre de motivation — habillage du template choisi.
 * Chargé UNIQUEMENT côté client (import dynamique depuis src/lib/pdf-client.tsx).
 */

interface LetterPdfDocumentProps {
  data: {
    identite: {
      nom_complet: string;
      email?: string;
      telephone?: string;
      ville?: string;
      linkedin?: string;
    };
    lettre_motivation: {
      objet?: string;
      salutation?: string;
      paragraphes: string[];
      politesse: string;
    };
    offre?: {
      entreprise?: string;
      titre: string;
      lieu?: string;
    } | null;
  };
  templateId: TemplateId;
}

export function LetterPdfDocument({ data, templateId }: LetterPdfDocumentProps) {
  const t = getTemplate(templateId);
  const letter = data.lettre_motivation;

  const contacts: string[] = [];
  if (data.identite.email) contacts.push(data.identite.email);
  if (data.identite.telephone) contacts.push(data.identite.telephone);
  if (data.identite.ville) contacts.push(data.identite.ville);
  if (data.identite.linkedin) contacts.push(data.identite.linkedin);

  const styles = StyleSheet.create({
    page: {
      paddingTop: 46,
      paddingHorizontal: 52,
      paddingBottom: 42,
      fontFamily: t.fontFamily,
      fontSize: 10.5,
      color: t.text,
      lineHeight: 1.6,
    },
    header: {
      paddingBottom: 10,
      marginBottom: 18,
      borderBottomWidth: 2,
      borderBottomColor: t.headerVariant === "swiss" ? "#111827" : t.accent,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
    },
    name: {
      fontSize: 15,
      fontWeight: "bold",
      color: t.headerVariant === "swiss" ? "#111827" : t.navy,
      marginBottom: 2,
    },
    contact: { fontSize: 8.5, color: t.muted },
    date: { fontSize: 8.5, color: t.muted, textAlign: "right" },
    recipient: { marginBottom: 16 },
    recipientTitle: { fontSize: 10.5, fontWeight: "bold", color: t.navy },
    recipientLine: { fontSize: 9.5, color: t.muted },
    subject: {
      fontSize: 11,
      fontWeight: "bold",
      color: t.navy,
      marginBottom: 14,
      textDecoration: "underline",
    },
    paragraph: {
      fontSize: 10.5,
      color: t.text,
      textAlign: "justify",
      marginBottom: 10,
    },
    politeness: { fontSize: 10.5, color: t.text, marginTop: 10, marginBottom: 22 },
    signature: {
      fontSize: 11,
      fontWeight: "bold",
      color: t.headerVariant === "swiss" ? "#111827" : t.navy,
    },
  });

  const today = new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Document title="Lettre de motivation" author={data.identite.nom_complet}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.name}>{data.identite.nom_complet}</Text>
            <Text style={styles.contact}>{contacts.join("  •  ")}</Text>
          </View>
          <Text style={styles.date}>{today}</Text>
        </View>

        {data.offre ? (
          <View style={styles.recipient}>
            <Text style={styles.recipientTitle}>
              {data.offre.entreprise || "À l'attention du service recrutement"}
            </Text>
            <Text style={styles.recipientLine}>
              {data.offre.titre}
              {data.offre.lieu ? ` — ${data.offre.lieu}` : ""}
            </Text>
          </View>
        ) : null}

        {letter.objet ? (
          <Text style={styles.subject}>Objet : {letter.objet}</Text>
        ) : null}

        {letter.salutation ? (
          <Text style={[styles.paragraph, { marginBottom: 8 }]}>
            {letter.salutation}
          </Text>
        ) : null}

        {letter.paragraphes.map((paragraph, i) => (
          <Text key={`p-${i}`} style={styles.paragraph}>
            {paragraph}
          </Text>
        ))}

        <Text style={styles.politeness}>{letter.politesse}</Text>
        <Text style={styles.signature}>{data.identite.nom_complet}</Text>
      </Page>
    </Document>
  );
}