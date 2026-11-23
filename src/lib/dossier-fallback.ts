type KeywordInsights = {
  titre: string;
  motsCles: string[];
};

const TITLE_PATTERNS = [
  "full stack", "front end", "front-end", "back end", "back-end", "devops",
  "data analyst", "data scientist", "data engineer", "product manager",
  "project manager", "product owner", "ux designer", "ui designer",
  "graphic designer", "digital marketing", "community manager", "accountant",
  "financial analyst", "business analyst", "software engineer", "web developer",
  "mobile developer", "qa tester", "sysadmin", "cloud engineer",
  "développeur", "developpeur", "ingénieur", "ingenieur", "designer",
  "consultant", "commercial", "comptable", "juriste", "marketeur", "analyste",
];

const SKILL_HINTS = [
  "javascript", "typescript", "react", "next", "vue", "angular", "node",
  "python", "django", "java", "spring", "php", "laravel", "symfony",
  "wordpress", "sql", "postgresql", "mysql", "mongodb", "docker", "kubernetes",
  "aws", "azure", "git", "linux", "excel", "sap", "salesforce", "seo",
  "figma", "photoshop", "tailwind", "graphql", "rest", "scrum",
  "powerbi", "tableau", "comptabilité", "paie", "sage",
];

/**
 * Déduction heuristique locale (sans IA) du titre de poste et des
 * 3 compétences les plus fortes — utilisée en repli quand Groq est indisponible.
 */
export function extractKeywordsLocally(cvText: string): KeywordInsights {
  const head = cvText.slice(0, 1200).toLowerCase();

  let titre = "";
  for (const pattern of TITLE_PATTERNS) {
    if (head.includes(pattern)) {
      titre = pattern.replace(/(^|\s)\w/g, (m) => m.toUpperCase());
      break;
    }
  }

  const tokens = cvText
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length >= 3);

  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);

  const skills = SKILL_HINTS.filter((hint) =>
    counts.has(hint.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
  );
  const extras = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token)
    .filter((t) => !skills.includes(t));
  const motsCles = [...skills, ...extras].slice(0, 3);

  return {
    titre: titre || "Professionnel",
    motsCles: motsCles.length > 0 ? motsCles : ["polyvalent", "motivé", "autonome"],
  };
}