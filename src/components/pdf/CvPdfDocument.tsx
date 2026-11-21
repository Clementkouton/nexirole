import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

// ─────────────────────────────────────────────────────────────────────────────
// CvPdfDocument — CV A4 « modern-accent » (charte NexiRole : #051937 / #FFC107)
// Props :
//   cvData        → données structurées du CV (voir interface CvData)
//   templateId    → gabarit demandé (seul « modern-accent » est actif aujourd'hui ;
//                   la prop est acceptée pour les gabarits futurs)
//   qrCodeDataUrl → Data URL du QR code (générée par le cv-builder via « qrcode »)
//   publicUrl     → URL publique du CV (affichée sous le QR et en pied de page)
// ─────────────────────────────────────────────────────────────────────────────

const NAVY = "#051937";
const GOLD = "#FFC107";
const SLATE = "#475569";
const LIGHT_SLATE = "#CBD5E1";

export interface CvIdentite {
  fullName: string;
  jobTitle: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  photoUrl: string;
}
export interface CvExperience {
  poste: string;
  entreprise: string;
  periode: string;
  description: string;
}
export interface CvFormation {
  diplome: string;
  etablissement: string;
  periode: string;
}
export interface CvLangue {
  nom: string;
  niveau: string;
}
export interface CvData {
  identite: CvIdentite;
  resume: string;
  experiences: CvExperience[];
  formations: CvFormation[];
  competences: string[];
  langues: CvLangue[];
  showQrOnPdf?: boolean;
}
export interface CvPdfDocumentProps {
  cvData: CvData;
  templateId?: string;
  qrCodeDataUrl?: string | null;
  publicUrl?: string | null;
}

function texte(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function objet(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function liste(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Tolère la forme canonique du builder ET un cvData brut (JSON de PublicResume). */
function normaliserCv(raw: unknown): CvData {
  const source = objet(raw) ?? {};
  const identiteBrut = objet(source.identite) ?? objet(source.identity);
  const identite: CvIdentite = {
    fullName: texte(identiteBrut?.fullName ?? identiteBrut?.nom ?? source.fullName),
    jobTitle: texte(identiteBrut?.jobTitle ?? identiteBrut?.titre ?? source.jobTitle),
    email: texte(identiteBrut?.email),
    phone: texte(identiteBrut?.phone ?? identiteBrut?.telephone),
    location: texte(identiteBrut?.location ?? identiteBrut?.ville),
    website: texte(identiteBrut?.website ?? identiteBrut?.siteWeb),
    photoUrl: texte(identiteBrut?.photoUrl ?? identiteBrut?.photo),
  };

  const experiences: CvExperience[] = liste(source.experiences ?? source.experience)
    .map((item) => {
      const entry = objet(item);
      return {
        poste: texte(entry?.poste ?? entry?.titre ?? entry?.title),
        entreprise: texte(entry?.entreprise ?? entry?.company),
        periode: texte(entry?.periode ?? entry?.dates ?? entry?.period),
        description: texte(entry?.description ?? entry?.details),
      };
    })
    .filter((item) => item.poste !== "" || item.entreprise !== "" || item.description !== "");

  const formations: CvFormation[] = liste(source.formations ?? source.education)
    .map((item) => {
      const entry = objet(item);
      return {
        diplome: texte(entry?.diplome ?? entry?.titre ?? entry?.degree),
        etablissement: texte(entry?.etablissement ?? entry?.school ?? entry?.ecole),
        periode: texte(entry?.periode ?? entry?.dates ?? entry?.period),
      };
    })
    .filter((item) => item.diplome !== "" || item.etablissement !== "");

  const competencesBrut = source.competences ?? source.skills;
  const competences: string[] = Array.isArray(competencesBrut)
    ? competencesBrut.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : typeof competencesBrut === "string"
      ? competencesBrut
          .split(/[,;]/)
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

  const langues: CvLangue[] = liste(source.langues ?? source.languages)
    .map((item) => {
      const entry = objet(item);
      if (!entry) return { nom: "", niveau: "" };
      return {
        nom: texte(entry.nom ?? entry.name ?? entry.langue),
        niveau: texte(entry.niveau ?? entry.level),
      };
    })
    .filter((item) => item.nom !== "");

  const flagQr: unknown = source.showQrOnPdf;
  return {
    identite,
    resume: texte(source.resume ?? source["résumé"] ?? source.summary ?? source.profil),
    experiences,
    formations,
    competences,
    langues,
    showQrOnPdf: typeof flagQr === "boolean" ? flagQr : true,
  };
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#FFFFFF", fontFamily: "Helvetica" },
  header: {
    backgroundColor: NAVY,
    paddingHorizontal: 32,
    paddingTop: 26,
    paddingBottom: 22,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  photo: { width: 62, height: 62, marginRight: 14, borderRadius: 8 },
  headerLeft: { flex: 1, paddingRight: 12 },
  name: { fontSize: 21, fontWeight: "bold", color: "#FFFFFF" },
  jobTitle: { fontSize: 12, color: GOLD, marginTop: 4, fontWeight: "bold" },
  contactLine: { fontSize: 8.5, color: LIGHT_SLATE, marginTop: 8, lineHeight: 1.5 },
  qrBox: { backgroundColor: "#FFFFFF", padding: 6, borderRadius: 6, alignItems: "center" },
  qrImage: { width: 54, height: 54 },
  qrCaption: { fontSize: 6.5, color: NAVY, marginTop: 3, fontWeight: "bold" },
  qrUrl: { fontSize: 5.5, color: SLATE, marginTop: 1 },
  body: { paddingHorizontal: 32, paddingTop: 20 },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 10.5,
    fontWeight: "bold",
    color: NAVY,
    letterSpacing: 1,
    paddingBottom: 3,
    marginBottom: 7,
    borderBottomWidth: 1.5,
    borderBottomColor: GOLD,
  },
  summaryText: { fontSize: 9, color: SLATE, lineHeight: 1.55 },
  item: { marginBottom: 9, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: GOLD },
  itemTitle: { fontSize: 10, fontWeight: "bold", color: NAVY },
  itemMeta: { fontSize: 8.5, color: SLATE, marginTop: 1 },
  itemDesc: { fontSize: 8.5, color: SLATE, marginTop: 2.5, lineHeight: 1.45 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap" },
  chip: {
    fontSize: 8,
    color: NAVY,
    backgroundColor: "#FFC10733",
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    borderRadius: 9,
    marginRight: 4,
    marginBottom: 4,
  },
  langueText: { fontSize: 9, color: SLATE, marginBottom: 3 },
  langueNom: { fontWeight: "bold", color: NAVY },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    borderTopWidth: 1.5,
    borderTopColor: GOLD,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7, color: SLATE },
});

export default function CvPdfDocument({
  cvData,
  qrCodeDataUrl = null,
  publicUrl = null,
}: CvPdfDocumentProps) {
  const cv = normaliserCv(cvData);
  const afficherQr = qrCodeDataUrl !== null && qrCodeDataUrl !== "" && cv.showQrOnPdf !== false;
  const contactParts = [
    cv.identite.email,
    cv.identite.phone,
    cv.identite.location,
    cv.identite.website,
  ].filter(Boolean);
  const urlCourte = publicUrl ? publicUrl.replace(/^https?:\/\//, "") : null;

  return (
    <Document
      title={cv.identite.fullName !== "" ? `CV — ${cv.identite.fullName}` : "CV"}
      author={cv.identite.fullName !== "" ? cv.identite.fullName : "NexiRole"}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          {cv.identite.photoUrl !== "" ? (
            <Image src={cv.identite.photoUrl} style={styles.photo} />
          ) : null}
          <View style={styles.headerLeft}>
            <Text style={styles.name}>
              {cv.identite.fullName !== "" ? cv.identite.fullName : "CV"}
            </Text>
            {cv.identite.jobTitle !== "" ? (
              <Text style={styles.jobTitle}>{cv.identite.jobTitle}</Text>
            ) : null}
            {contactParts.length > 0 ? (
              <Text style={styles.contactLine}>{contactParts.join("    ·    ")}</Text>
            ) : null}
          </View>
          {afficherQr ? (
            <View style={styles.qrBox}>
              <Image src={qrCodeDataUrl ?? ""} style={styles.qrImage} />
              <Text style={styles.qrCaption}>Version en ligne</Text>
              {urlCourte !== null ? <Text style={styles.qrUrl}>{urlCourte}</Text> : null}
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          {cv.resume !== "" ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>RÉSUMÉ</Text>
              <Text style={styles.summaryText}>{cv.resume}</Text>
            </View>
          ) : null}

          {cv.experiences.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>EXPÉRIENCES PROFESSIONNELLES</Text>
              {cv.experiences.map((experience, index) => (
                <View key={index} style={styles.item} wrap={false}>
                  <Text style={styles.itemTitle}>
                    {experience.poste !== "" ? experience.poste : "Expérience"}
                  </Text>
                  {experience.entreprise !== "" || experience.periode !== "" ? (
                    <Text style={styles.itemMeta}>
                      {[experience.entreprise, experience.periode].filter(Boolean).join("  ·  ")}
                    </Text>
                  ) : null}
                  {experience.description !== "" ? (
                    <Text style={styles.itemDesc}>{experience.description}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {cv.formations.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>FORMATIONS</Text>
              {cv.formations.map((formation, index) => (
                <View key={index} style={styles.item} wrap={false}>
                  <Text style={styles.itemTitle}>
                    {formation.diplome !== "" ? formation.diplome : "Formation"}
                  </Text>
                  {formation.etablissement !== "" || formation.periode !== "" ? (
                    <Text style={styles.itemMeta}>
                      {[formation.etablissement, formation.periode].filter(Boolean).join("  ·  ")}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {cv.competences.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>COMPÉTENCES</Text>
              <View style={styles.chipsWrap}>
                {cv.competences.map((competence, index) => (
                  <Text key={index} style={styles.chip}>
                    {competence}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}

          {cv.langues.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>LANGUES</Text>
              {cv.langues.map((langue, index) => (
                <Text key={index} style={styles.langueText}>
                  <Text style={styles.langueNom}>{langue.nom}</Text>
                  {langue.niveau !== "" ? `  —  ${langue.niveau}` : ""}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>CV généré avec NexiRole</Text>
          {urlCourte !== null ? <Text style={styles.footerText}>{urlCourte}</Text> : null}
        </View>
      </Page>
    </Document>
  );
}