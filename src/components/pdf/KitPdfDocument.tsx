import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { DossierData } from "@/lib/types";
import { getTemplate, type TemplateId } from "@/lib/cv-templates";

/**
 * Document PDF du Kit d'entretien : score de compatibilité, conseils
 * d'adaptation, messages recruteur LinkedIn/Email, questions-réponses.
 * Chargé UNIQUEMENT côté client (import dynamique depuis src/lib/pdf-client.tsx).
 */

interface KitPdfDocumentProps {
  data: DossierData;
  templateId: TemplateId;
}

export function KitPdfDocument({ data, templateId }: KitPdfDocumentProps) {
  const t = getTemplate(templateId);
  const kit = data.kit_entretien;

  const styles = StyleSheet.create({
    page: {
      paddingTop: 40,
      paddingHorizontal: 46,
      paddingBottom: 36,
      fontFamily: t.fontFamily,
      fontSize: 9.8,
      color: t.text,
      lineHeight: 1.5,
    },
    banner: {
      backgroundColor: t.navy,
      borderRadius: 8,
      paddingHorizontal: 18,
      paddingVertical: 14,
      marginBottom: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    bannerTitle: {
      fontSize: 15,
      fontWeight: "bold",
      color: "#ffffff",
      marginBottom: 2,
    },
    bannerSubtitle: { fontSize: 9, color: t.accent },
    scoreBadge: {
      backgroundColor: t.accent,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    scoreText: { fontSize: 14, fontWeight: "bold", color: t.navy },
    section: { marginBottom: 12 },
    sectionTitle: {
      fontSize: 11,
      fontWeight: "bold",
      color: t.navy,
      textTransform: t.uppercaseSections ? "uppercase" : "none",
      letterSpacing: t.sectionLetterSpacing,
      marginBottom: 6,
      paddingBottom: 3,
      borderBottomWidth: 1,
      borderBottomColor: t.line,
    },
    bulletRow: { flexDirection: "row", marginBottom: 3, paddingRight: 8 },
    bulletDot: { fontSize: 9.5, color: t.navy, marginRight: 6 },
    bulletText: { fontSize: 9.5, color: t.text, flex: 1 },
    messageBlock: {
      backgroundColor: "#f8fafc",
      borderWidth: 0.8,
      borderColor: t.line,
      borderRadius: 6,
      padding: 10,
      marginBottom: 4,
    },
    messageLabel: {
      fontSize: 8.5,
      fontWeight: "bold",
      color: t.muted,
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    messageText: { fontSize: 9.5, color: t.text },
    question: { fontSize: 10.2, fontWeight: "bold", color: t.navy, marginBottom: 3 },
    answer: { fontSize: 9.5, color: t.text, marginBottom: 3 },
    tip: { fontSize: 8.8, color: t.muted, fontStyle: "italic", marginBottom: 8 },
    itemCard: {
      borderWidth: 0.8,
      borderColor: t.line,
      borderRadius: 6,
      padding: 10,
      marginBottom: 8,
      backgroundColor: "#ffffff",
    },
  });

  return (
    <Document title="Kit d'entretien NexiRole" author={data.identite.nom_complet}>
      <Page size="A4" style={styles.page}>
        <View style={styles.banner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Kit d'entretien</Text>
            <Text style={styles.bannerSubtitle}>
              {data.identite.nom_complet}
              {data.offre ? `  •  ${data.offre.titre} @ ${data.offre.entreprise}` : ""}
            </Text>
          </View>
          {kit?.score !== undefined ? (
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreText}>{kit.score}%</Text>
            </View>
          ) : null}
        </View>

        {kit?.score !== undefined && (
          <View style={styles.section}>
            <Text style={styles.bulletText}>
              Compatibilité estimée entre votre profil et l&apos;offre : {kit.score} sur 100.
              {kit.score >= 80
                ? " Profil très aligné : candidatez immédiatement."
                : kit.score >= 60
                  ? " Profil solide : quelques écarts comblables, suivez les conseils ci-dessous."
                  : " Pertinence partielle : adaptez votre CV avec les conseils ci-dessous avant de candidater."}
            </Text>
          </View>
        )}

        {kit && kit.conseils.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Conseils d&apos;adaptation</Text>
            {kit.conseils.map((conseil, i) => (
              <View key={`c-${i}`} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{conseil}</Text>
              </View>
            ))}
          </View>
        )}

        {kit && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Messages recruteur</Text>
            <View style={styles.messageBlock}>
              <Text style={styles.messageLabel}>Message LinkedIn</Text>
              <Text style={styles.messageText}>{kit.message_linkedin}</Text>
            </View>
            <View style={styles.messageBlock}>
              <Text style={styles.messageLabel}>Message Email</Text>
              <Text style={styles.messageText}>{kit.message_email}</Text>
            </View>
          </View>
        )}

        {kit && kit.questions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Questions d&apos;entretien</Text>
            {kit.questions.map((q, i) => (
              <View key={`q-${i}`} style={styles.itemCard} wrap={false}>
                <Text style={styles.question}>
                  Q{i + 1}. {q.question}
                </Text>
                <Text style={styles.answer}>{q.reponse_suggeree}</Text>
                <Text style={styles.tip}>Astuce : {q.astuce}</Text>
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}