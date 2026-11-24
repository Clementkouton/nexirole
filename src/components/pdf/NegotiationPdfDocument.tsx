import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

/**
 * NexiRole — PDF « Dossier de Négociation Salariale » (A4, 2 pages).
 *
 * Chargé STRICTEMENT côté client (import dynamique depuis la page du Coach,
 * jamais importé en haut de fichier côté serveur : @react-pdf/renderer ne
 * supporte pas le rendu Node côté Next.js build).
 *
 * Charte NexiRole : navy #051937 + or #FFC107, police Helvetica (texte
 * sélectionnable, accents français complets).
 *
 * PARTICULARITÉ TYPOGRAPHIQUE : les polices standard PDF couvrent Latin-1
 * (é, è, à, ç...) + € + guillemets, mais PAS les symboles de devises
 * exotiques (₦ naira, ₹ roupie, ₩ won, ₺ livre turque...). Les montants
 * sont donc nettoyés : tout symbole exotique est remplacé par le code
 * ISO 4217 (ex. « 450 000 ₦ / mois » → « 450 000 NGN / mois ») et les
 * caractères hors Latin-1 sont retirés du texte courant. Aucun crash
 * possible, quel que soit le pays sélectionné.
 */

const NAVY = "#051937";
const GOLD = "#FFC107";
const SLATE = "#475569";
const INK = "#1e293b";
const BORDER = "#cbd5e1";
const GOLD_TINT = "#fff8e1";

/** Caractères sûrs pour Helvetica/WinAnsi : Latin-1, €, guillemets et tirets typographiques. */
const SURE = /[^\u0000-\u00FF\u20AC\u2013\u2014\u2018\u2019\u201C\u201D\u2026]/g;
/* Version SANS /g pour les tests sur un seul caractère (une regex globale
   avec .test() conserve un lastIndex et donne des résultats faux). */
const SURE_UNITAIRE = /[^\u0000-\u00FF\u20AC\u2013\u2014\u2018\u2019\u201C\u201D\u2026]/;

/** Texte courant : retire les caractères non couverts (emojis, symboles exotiques). */
function textePdf(valeur: string): string {
  return String(valeur ?? "")
    .replace(SURE, "")
    .replace(/\r/g, "");
}

/**
 * Montant : remplace le PREMIER symbole de devise non couvert par le code
 * ISO 4217 (les suivants sont retirés) pour rester lisible et imprimable.
 */
function montantPdf(valeur: string, codeDevise: string): string {
  let sortie = "";
  let remplace = false;
  for (const caractere of String(valeur ?? "")) {
    if (!SURE_UNITAIRE.test(caractere)) {
      sortie += caractere;
    } else if (caractere === "\n") {
      sortie += " ";
    } else if (!remplace) {
      sortie += codeDevise;
      remplace = true;
    }
  }
  return sortie.trim();
}

export interface AnalyseNegociationPdf {
  fourchette_min: string;
  fourchette_cible: string;
  fourchette_max: string;
  analyse_marche: string;
  arguments_valeur: Array<{ titre: string; explication: string }>;
  scripts_reponse: {
    question_entretien: string;
    contre_proposition_email: string;
    alternatives_avantages: Array<{ titre: string; description: string }>;
  };
}

export interface DonneesDossierNegociation {
  jobTitle: string;
  experienceYears: number;
  countryName: string;
  currencyCode: string;
  currencySymbol: string;
  keySkills: string;
  currentOffer?: string;
  analyse: AnalyseNegociationPdf;
  /** Date de génération, déjà formatée en français (ex. « 23 novembre 2026 »). */
  dateGeneration: string;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingHorizontal: 42,
    paddingBottom: 48,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: INK,
    lineHeight: 1.45,
  },
  /* En-tête navy de la page 1 */
  bandeau: {
    backgroundColor: NAVY,
    margin: -36,
    marginBottom: 16,
    paddingHorizontal: 42,
    paddingTop: 22,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  marque: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoCarre: {
    width: 26,
    height: 26,
    backgroundColor: GOLD,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  logoLettre: {
    color: NAVY,
    fontSize: 14,
    fontWeight: "bold",
  },
  nomMarque: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "bold",
    letterSpacing: 1.2,
  },
  sousTitreBandeau: {
    color: GOLD,
    fontSize: 8.5,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  /* Bloc méta : poste / pays & devise / expérience */
  metaRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  metaCase: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    padding: 8,
  },
  metaEtiquette: {
    fontSize: 7,
    color: SLATE,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  metaValeur: {
    fontSize: 9.5,
    color: NAVY,
    fontWeight: "bold",
    lineHeight: 1.25,
  },
  /* Tableau des fourchettes */
  titreSection: {
    fontSize: 10.5,
    fontWeight: "bold",
    color: NAVY,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  fourchettesRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  fourchetteCase: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    padding: 9,
  },
  fourchetteCible: {
    borderWidth: 1.5,
    borderColor: GOLD,
    backgroundColor: GOLD_TINT,
  },
  fourchetteEtiquette: {
    fontSize: 7,
    color: SLATE,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  fourchetteMontant: {
    fontSize: 11,
    fontWeight: "bold",
    color: NAVY,
    lineHeight: 1.3,
  },
  noteCase: {
    fontSize: 6.5,
    color: SLATE,
    marginTop: 3,
  },
  /* Sections texte */
  section: { marginBottom: 12 },
  paragraphe: { fontSize: 9.5, color: "#334155", textAlign: "justify" },
  argument: {
    flexDirection: "row",
    marginBottom: 7,
    paddingRight: 4,
  },
  argumentNumero: {
    width: 22,
    color: GOLD,
    fontSize: 11,
    fontWeight: "bold",
  },
  argumentCorps: { flex: 1 },
  argumentTitre: { fontSize: 9.5, fontWeight: "bold", color: NAVY, marginBottom: 1 },
  argumentTexte: { fontSize: 9, color: "#334155", textAlign: "justify" },
  competences: { fontSize: 8.5, color: SLATE, lineHeight: 1.4 },
  /* Page 2 : scripts */
  bandeauOr: {
    backgroundColor: GOLD,
    margin: -36,
    marginBottom: 14,
    paddingHorizontal: 42,
    paddingTop: 12,
    paddingBottom: 12,
  },
  bandeauOrTitre: {
    color: NAVY,
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  bandeauOrSous: { color: NAVY, fontSize: 8.5, marginTop: 2 },
  questionEncadre: {
    backgroundColor: "#f1f5f9",
    borderLeftWidth: 3,
    borderLeftColor: GOLD,
    borderRadius: 4,
    padding: 7,
    marginBottom: 6,
  },
  questionTexte: { fontSize: 9, fontStyle: "italic", color: NAVY, fontWeight: "bold" },
  scriptBloc: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    padding: 9,
    backgroundColor: "#f8fafc",
  },
  scriptTexte: { fontSize: 8.8, color: "#334155", lineHeight: 1.5 },
  objetMail: { fontWeight: "bold", color: NAVY },
  avantage: {
    flexDirection: "row",
    marginBottom: 5,
  },
  avantagePuce: {
    width: 12,
    height: 12,
    backgroundColor: GOLD,
    borderRadius: 3,
    marginRight: 7,
    marginTop: 2,
  },
  avantageCorps: { flex: 1 },
  avantageTitre: { fontSize: 9.5, fontWeight: "bold", color: NAVY },
  avantageTexte: { fontSize: 8.8, color: "#334155" },
  /* Pied de page */
  piedPage: {
    position: "absolute",
    bottom: 24,
    left: 42,
    right: 42,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  piedMarque: { fontSize: 7.5, color: SLATE },
  piedOr: { color: NAVY, fontWeight: "bold" },
});

function PiedDePage({ dateGeneration }: { dateGeneration: string }) {
  return (
    <View style={styles.piedPage} fixed>
      <Text style={styles.piedMarque}>
        Généré le {dateGeneration} avec NexiRole — Coach de Négociation Salariale IA
      </Text>
      <Text style={styles.piedMarque}>
        <Text style={styles.piedOr}>NEXIROLE</Text> · Dossier confidentiel
      </Text>
    </View>
  );
}

export function NegotiationPdfDocument({ data }: { data: DonneesDossierNegociation }) {
  const { analyse } = data;
  const devise = data.currencyCode;

  const poste = textePdf(data.jobTitle);
  const pays = textePdf(data.countryName);
  const competences = textePdf(data.keySkills);
  const offre = data.currentOffer ? montantPdf(data.currentOffer, devise) : "";

  return (
    <Document
      title={`Negociation NexiRole - ${poste}`}
      author="NexiRole — Coach de Négociation Salariale IA"
      creator="NexiRole"
    >
      {/* ── Page 1 : en-tête, fourchettes, marché, arguments ─────────────── */}
      <Page size="A4" style={styles.page}>
        <View style={styles.bandeau} fixed>
          <View style={styles.marque}>
            <View style={styles.logoCarre}>
              <Text style={styles.logoLettre}>N</Text>
            </View>
            <Text style={styles.nomMarque}>NEXIROLE</Text>
          </View>
          <Text style={styles.sousTitreBandeau}>Dossier de Négociation Salariale</Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaCase}>
            <Text style={styles.metaEtiquette}>Poste visé</Text>
            <Text style={styles.metaValeur}>{poste}</Text>
          </View>
          <View style={styles.metaCase}>
            <Text style={styles.metaEtiquette}>Pays & devise</Text>
            <Text style={styles.metaValeur}>
              {pays} · {devise}
            </Text>
          </View>
          <View style={styles.metaCase}>
            <Text style={styles.metaEtiquette}>Expérience</Text>
            <Text style={styles.metaValeur}>{data.experienceYears} an(s)</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.titreSection}>Les 3 fourchettes</Text>
          <View style={styles.fourchettesRow}>
            <View style={styles.fourchetteCase}>
              <Text style={styles.fourchetteEtiquette}>Minimum acceptable</Text>
              <Text style={styles.fourchetteMontant}>
                {montantPdf(analyse.fourchette_min, devise)}
              </Text>
              <Text style={styles.noteCase}>En dessous : il faut refuser.</Text>
            </View>
            <View style={[styles.fourchetteCase, styles.fourchetteCible]}>
              <Text style={[styles.fourchetteEtiquette, { color: NAVY }]}>
                Cible recommandée
              </Text>
              <Text style={[styles.fourchetteMontant, { fontSize: 12 }]}>
                {montantPdf(analyse.fourchette_cible, devise)}
              </Text>
              <Text style={[styles.noteCase, { color: NAVY }]}>
                Le montant à demander, sans hésiter.
              </Text>
            </View>
            <View style={styles.fourchetteCase}>
              <Text style={styles.fourchetteEtiquette}>Plafond Senior</Text>
              <Text style={styles.fourchetteMontant}>
                {montantPdf(analyse.fourchette_max, devise)}
              </Text>
              <Text style={styles.noteCase}>Atteignable avec une négociation solide.</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.titreSection}>Analyse du marché</Text>
          <Text style={styles.paragraphe}>{textePdf(analyse.analyse_marche)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.titreSection}>Tes 3 arguments de valeur</Text>
          {analyse.arguments_valeur.map((argument, index) => (
            <View key={index} style={styles.argument}>
              <Text style={styles.argumentNumero}>{String(index + 1).padStart(2, "0")}</Text>
              <View style={styles.argumentCorps}>
                <Text style={styles.argumentTitre}>{textePdf(argument.titre)}</Text>
                <Text style={styles.argumentTexte}>{textePdf(argument.explication)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.titreSection}>Compétences prises en compte</Text>
          <Text style={styles.competences}>
            {competences}
            {offre ? ` — Offre déjà reçue : ${offre}` : ""}
          </Text>
        </View>

        <PiedDePage dateGeneration={data.dateGeneration} />
      </Page>

      {/* ── Page 2 : script oral, e-mail, avantages alternatifs ──────────── */}
      <Page size="A4" style={styles.page}>
        <View style={styles.bandeauOr} fixed>
          <Text style={styles.bandeauOrTitre}>Scripts & leviers de négociation</Text>
          <Text style={styles.bandeauOrSous}>
            {poste} · {pays} · à préparer avant l&apos;entretien ou la réponse à l&apos;offre
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.titreSection}>Script oral — entretien</Text>
          <View style={styles.questionEncadre}>
            <Text style={styles.questionTexte}>
              « Quelles sont vos prétentions salariales ? »
            </Text>
          </View>
          <View style={styles.scriptBloc}>
            <Text style={styles.scriptTexte}>
              {textePdf(analyse.scripts_reponse.question_entretien)}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.titreSection}>E-mail de contre-proposition</Text>
          <View style={styles.scriptBloc}>
            <Text style={styles.scriptTexte}>
              {textePdf(analyse.scripts_reponse.contre_proposition_email)
                .split("\n")
                .map((ligne, index) =>
                  ligne.startsWith("Objet :") || ligne.startsWith("Objet:") ? (
                    <Text key={index} style={styles.objetMail}>
                      {ligne}
                      {"\n"}
                    </Text>
                  ) : (
                    <Text key={index}>
                      {ligne}
                      {"\n"}
                    </Text>
                  )
                )}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.titreSection}>Avantages alternatifs (si le fixe est bloqué)</Text>
          {analyse.scripts_reponse.alternatives_avantages.map((avantage, index) => (
            <View key={index} style={styles.avantage}>
              <View style={styles.avantagePuce} />
              <View style={styles.avantageCorps}>
                <Text style={styles.avantageTitre}>{textePdf(avantage.titre)}</Text>
                <Text style={styles.avantageTexte}>{textePdf(avantage.description)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.paragraphe}>
            Conseil NexiRole : cite d&apos;abord ta valeur (arguments de la page 1), annonce
            ensuite ta fourchette basée sur ta cible, puis laisse la fourchette haute comme
            marge de manœuvre. Ne donne jamais un chiffre unique sans période ni périmètre
            (brut/net, fixe/variable).
          </Text>
        </View>

        <PiedDePage dateGeneration={data.dateGeneration} />
      </Page>
    </Document>
  );
}

export default NegotiationPdfDocument;
