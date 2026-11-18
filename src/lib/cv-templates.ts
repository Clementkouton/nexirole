/**
 * Bibliothèque des 4 templates ATS professionnels NexiRole (inspiration Teal HQ).
 * Chaque template porte :
 *  - ses métadonnées de filtrage (style, catégorie, professions),
 *  - son thème PDF (@react-pdf/renderer),
 *  - sa détection de recommandation selon le métier détecté dans le CV.
 * Icônes et couleurs : navy #051937 (primaire), or #FFC107 (accent).
 */

export type TemplateId =
  | "modern-accent"
  | "sleek-executive"
  | "bold-minimalism"
  | "clean-ats";

export interface CvTemplate {
  id: TemplateId;
  name: string;
  style: string;
  category: string;
  professions: string[];
  description: string;
  /* Thème PDF */
  headerVariant: "banner" | "centered-rule" | "swiss" | "linear";
  fontFamily: "Helvetica" | "Times-Roman";
  navy: string;
  accent: string;
  text: string;
  muted: string;
  line: string;
  nameSize: number;
  sectionGap: number;
  uppercaseSections: boolean;
  sectionLetterSpacing: number;
  skillBadges: boolean;
  photoShape: "circle" | "rounded" | "square";
}

export const CV_TEMPLATES: CvTemplate[] = [
  {
    id: "modern-accent",
    name: "Modern Color Accent",
    style: "Moderne",
    category: "Tech, Développement Web, Digital & Startups",
    professions: [
      "developer", "développeur", "developpeur", "full stack", "frontend", "backend",
      "web", "software", "ingénieur", "ingenieur", "tech", "devops", "mobile",
      "data", "startup", "digital", "react", "python", "wordpress", "php", "it",
    ],
    description:
      "En-tête structuré avec bandeau Bleu Marine #051937 et filet Jaune Or #FFC107, hiérarchie claire, compétences en badges sobres.",
    headerVariant: "banner",
    fontFamily: "Helvetica",
    navy: "#051937",
    accent: "#FFC107",
    text: "#1e293b",
    muted: "#64748b",
    line: "#e2e8f0",
    nameSize: 20,
    sectionGap: 10,
    uppercaseSections: false,
    sectionLetterSpacing: 0.6,
    skillBadges: true,
    photoShape: "circle",
  },
  {
    id: "sleek-executive",
    name: "Sleek Executive",
    style: "Classique & Institutionnel",
    category: "Finance, Direction, Droit, Administration & Gestion",
    professions: [
      "finance", "comptable", "comptabilité", "comptabilite", "auditeur", "audit",
      "banque", "contrôleur", "controleur", "gestion", "management", "manager",
      "directeur", "direction", "juriste", "juridique", "avocat", "droit",
      "administratif", "administration", "rh", "human resources", "executive",
      "consultant senior", "trésorier", "tresorier", "business", "mba",
    ],
    description:
      "Mise en page 1 colonne sobre, filets horizontaux fins gris ardoise, alignement strict des dates à droite, typographie classique irréprochable.",
    headerVariant: "centered-rule",
    fontFamily: "Times-Roman",
    navy: "#051937",
    accent: "#8a6d00",
    text: "#1f2937",
    muted: "#475569",
    line: "#cbd5e1",
    nameSize: 22,
    sectionGap: 12,
    uppercaseSections: false,
    sectionLetterSpacing: 1,
    skillBadges: false,
    photoShape: "rounded",
  },
  {
    id: "bold-minimalism",
    name: "Bold Minimalism",
    style: "Minimaliste Suisse",
    category: "Design, Produit (PM), Consulting & Ingénierie",
    professions: [
      "design", "designer", "ux", "ui", "graphique", "graphiste", "créatif",
      "creatif", "produit", "product", "pm", "product owner", "chef de projet",
      "consulting", "conseil", "stratégie", "strategie", "innovation",
      "ingénierie", "ingenierie", "architecte", "marketing",
    ],
    description:
      "Grille aérée avec beaucoup d'espace blanc, titres de sections en majuscules espacées (letter-spacing), contraste typographique fort sans fioritures.",
    headerVariant: "swiss",
    fontFamily: "Helvetica",
    navy: "#111827",
    accent: "#111827",
    text: "#111827",
    muted: "#6b7280",
    line: "#d1d5db",
    nameSize: 26,
    sectionGap: 16,
    uppercaseSections: true,
    sectionLetterSpacing: 2.5,
    skillBadges: false,
    photoShape: "square",
  },
  {
    id: "clean-ats",
    name: "Clean Balanced ATS",
    style: "Compact & Polyvalent",
    category: "Profils Seniors, Opérations, Support & Multi-secteurs",
    professions: [
      "opérations", "operations", "logistique", "supply", "support", "service client",
      "commercial", "vente", "sales", "assistant", "assistanat", "senior",
      "technicien", "qualité", "qualite", "sécurité", "securite", "maintenance",
      "enseignant", "formateur", "santé", "sante", "hôtellerie", "hotellerie",
      "restauration", "btp", "agriculture",
    ],
    description:
      "Marges et espacements optimisés pour faire tenir un parcours riche sur une seule page A4 avec une lecture linéaire 100 % lisible par les robots ATS.",
    headerVariant: "linear",
    fontFamily: "Helvetica",
    navy: "#051937",
    accent: "#FFC107",
    text: "#1e293b",
    muted: "#475569",
    line: "#e2e8f0",
    nameSize: 17,
    sectionGap: 7,
    uppercaseSections: true,
    sectionLetterSpacing: 1.4,
    skillBadges: false,
    photoShape: "circle",
  },
];

export function getTemplate(id: TemplateId): CvTemplate {
  return CV_TEMPLATES.find((t) => t.id === id) ?? CV_TEMPLATES[0];
}

export function isTemplateId(value: string): value is TemplateId {
  return CV_TEMPLATES.some((t) => t.id === value);
}

/** Liste plate des professions pour le filtre du sélecteur. */
export function allProfessions(): string[] {
  const set = new Set<string>();
  for (const template of CV_TEMPLATES) {
    for (const p of template.professions) set.add(p);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
}

export function allStyles(): string[] {
  return Array.from(new Set(CV_TEMPLATES.map((t) => t.style)));
}

export function allCategories(): string[] {
  return Array.from(new Set(CV_TEMPLATES.map((t) => t.category)));
}

/**
 * Recommande un template selon le métier détecté dans le CV.
 * Chaque mot-clé du métier trouvé dans le titre déduit compte pour 2,
 * chaque profession du template pour 1 : le meilleur score gagne.
 */
export function recommendTemplateForJob(jobTitle: string | null | undefined): TemplateId {
  if (!jobTitle) return "modern-accent";
  const haystack = jobTitle
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  let bestId: TemplateId = "modern-accent";
  let bestScore = -1;
  for (const template of CV_TEMPLATES) {
    let score = 0;
    for (const p of template.professions) {
      const needle = p
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      if (haystack.includes(needle)) score += needle.length > 5 ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = template.id;
    }
  }
  return bestId;
}