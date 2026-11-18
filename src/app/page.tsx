import { Hero } from "@/components/landing/hero";
import { BentoFeatures } from "@/components/landing/bento-features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Faq } from "@/components/landing/faq";
import { SiteFooter } from "@/components/landing/site-footer";

/**
 * PARTIE 4 — Données structurées JSON-LD (SoftwareApplication) pour
 * enrichir l'affichage dans les résultats de recherche Google.
 */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "NexiRole",
  url: "https://nexirole.vercel.app",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Assistant carrière / générateur de CV IA",
  operatingSystem: "Web",
  description:
    "NexiRole analyse les offres d'emploi en direct (Remotive, Arbeitnow), score votre CV et génère CV optimisé ATS, lettre de motivation et kit d'entretien sur mesure grâce à l'IA.",
  inLanguage: "fr-FR",
  browserRequirements: "Requires JavaScript",
  offers: [
    {
      "@type": "Offer",
      name: "Découverte",
      price: "0",
      priceCurrency: "USD",
      description: "3 recherches en direct par mois, 2 dossiers complets par mois.",
    },
    {
      "@type": "Offer",
      name: "Pass Boost — 30 jours",
      price: "9.90",
      priceCurrency: "USD",
      description:
        "Recherches illimitées, 30 dossiers complets par mois, 4 templates ATS, export PDF A4.",
    },
    {
      "@type": "Offer",
      name: "Carrière Pro — 90 jours",
      price: "24.90",
      priceCurrency: "USD",
      description:
        "Tout illimité pendant 3 mois, traitement IA prioritaire, historique illimité.",
    },
  ],
  featureList: [
    "Recherche d'offres d'emploi en direct",
    "Générateur de CV optimisé ATS par IA",
    "Lettre de motivation personnalisée",
    "Kit de préparation d'entretien",
    "Suivi des candidatures",
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD SoftwareApplication : Google affiche le nom, le type et les offres.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Hero />
      <BentoFeatures />
      <HowItWorks />
      <Faq />
      <SiteFooter />
    </>
  );
}
