/**
 * cv-enrich.ts - couche de tolerance pour l affichage public des CV.
 *
 * enrichCv() complete la sortie du normalisateur existant (src/lib/cv-normalize.ts) :
 *  1. il retrouve les sections manquantes (experiences, formations, competences,
 *     langues) dans la donnee brute, en acceptant les cles anglaises et francaises,
 *     le singulier et le pluriel, ainsi que les formes imbriquees
 *     ({ items: [...] }, carte nom -> niveau, carte d objets, objet unique) ;
 *  2. il expose chaque champ sous tous ses alias habituels (title/poste/role,
 *     company/entreprise, period/dates/periode...) afin que les 7 templates web
 *     et les 5 templates PDF affichent le contenu quel que soit le nom de cle
 *     utilise a la source ;
 *  3. il ne modifie jamais les donnees stockees : tout se fait en memoire.
 */

type Dict = Record<string, unknown>;

/** Vrai si la valeur est un objet pur (ni tableau, ni null). */
export function isDict(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Vrai si la valeur est un tableau non vide. */
export function isNonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

/** Convertit proprement une valeur en chaine non vide, sinon undefined. */
function str(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/** Premiere chaine non vide trouvee parmi les cles donnees. */
function firstString(source: Dict, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = str(source[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

/** Remplit les alias absents avec la valeur canonique (n ecrase jamais une valeur existante). */
function fillAliases(target: Dict, canonical: string | undefined, keys: readonly string[]): void {
  if (canonical === undefined) return;
  for (const key of keys) {
    const current = target[key];
    if (current === undefined || current === null || (typeof current === "string" && current.trim().length === 0)) {
      target[key] = canonical;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Recherche de sections                                              */
/* ------------------------------------------------------------------ */

const EXPERIENCE_KEYS: readonly string[] = [
  "experiences", "experience", "workExperiences", "workExperience", "work",
  "jobs", "job", "emplois", "emploi", "professionalExperiences",
  "experiencesProfessionnelles", "experiencesPro", "parcours",
  "parcoursProfessionnel", "positions", "career",
];

const EDUCATION_KEYS: readonly string[] = [
  "educations", "education", "formations", "formation", "studies", "study",
  "academicBackground", "academics", "diplomas", "diplomes", "schools",
];

const SKILL_KEYS: readonly string[] = [
  "skills", "skill", "competences", "competence", "competencies", "competency",
  "technicalSkills", "hardSkills", "softSkills", "technologies", "tools",
];

const LANGUAGE_KEYS: readonly string[] = [
  "languages", "language", "langues", "langue", "spokenLanguages",
];

const SUMMARY_KEYS: readonly string[] = [
  "summary", "profil", "profile", "bio", "about", "objectif",
  "presentation", "accroche", "resume",
];

const PERSONAL_KEYS: readonly string[] = [
  "personal", "infosPersonnelles", "identite", "contact", "contacts", "profile",
];

/**
 * Ramene une valeur a une forme de tableau : tableau deja correct, tableau
 * imbrique dans un objet a une seule cle ({ items: [...] }), carte nom ->
 * niveau ({ Francais: "courant" }), carte d objets, ou objet unique.
 */
function toArrayShape(raw: unknown): unknown[] | undefined {
  if (isNonEmptyArray(raw)) return raw;
  if (!isDict(raw)) return undefined;
  const keys = Object.keys(raw);
  if (keys.length === 1) {
    const inner = toArrayShape(raw[keys[0]]);
    if (inner !== undefined) return inner;
  }
  const values = Object.values(raw);
  if (values.length === 0) return undefined;
  const dictValues = values.filter(isDict);
  if (dictValues.length === values.length && values.length >= 2) return dictValues;
  const stringValues = values.filter(
    (value) => typeof value === "string" && (value as string).trim().length > 0,
  );
  if (stringValues.length === values.length && values.length >= 2) {
    return Object.entries(raw).map(([name, level]) => ({
      name,
      level: typeof level === "string" ? level : undefined,
      value: level,
    }));
  }
  return [raw];
}

/** Cherche chaque cle, dans chaque source, dans l ordre de priorite. */
function pickStage(sources: Dict[], keys: readonly string[]): unknown[] | undefined {
  for (const key of keys) {
    for (const source of sources) {
      const found = toArrayShape(source[key]);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** Recherche en profondeur bornee : premiere section sous une des cles donnees. */
function deepPick(root: Dict, keys: readonly string[], maxDepth: number): unknown[] | undefined {
  let level: Dict[] = [root];
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next: Dict[] = [];
    for (const node of level) {
      for (const key of keys) {
        const found = toArrayShape(node[key]);
        if (found !== undefined) return found;
      }
    }
    for (const node of level) {
      for (const value of Object.values(node)) {
        if (isDict(value)) {
          next.push(value);
        } else if (Array.isArray(value)) {
          for (const element of value) {
            if (isDict(element)) next.push(element);
          }
        }
      }
    }
    level = next;
  }
  return undefined;
}

/** Heuristique de forme : poste + entreprise, ou poste + periode/description. */
export function looksLikeExperienceItem(item: unknown): boolean {
  if (!isDict(item)) return false;
  const role = firstString(item, ["title", "poste", "role", "position", "fonction", "intitule", "jobTitle"]);
  const employer = firstString(item, ["company", "entreprise", "employer", "societe", "organisation", "employeur"]);
  const period = firstString(item, ["period", "dates", "periode", "startDate", "debut", "endDate", "fin", "duration", "duree"]);
  const description = firstString(item, ["description", "descriptions", "missions", "realisations", "summary", "details", "contenu"]);
  if (role !== undefined && employer !== undefined) return true;
  return role !== undefined && (period !== undefined || description !== undefined);
}

/** Recherche par forme : premier tableau dont tous les elements passent le garde-fou. */
function shapedPick(root: Dict, guard: (item: unknown) => boolean, maxDepth: number): unknown[] | undefined {
  let level: Dict[] = [root];
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next: Dict[] = [];
    for (const node of level) {
      for (const value of Object.values(node)) {
        if (isNonEmptyArray(value) && value.some(isDict) && value.every(guard)) return value;
        if (isDict(value)) {
          next.push(value);
        } else if (Array.isArray(value)) {
          for (const element of value) {
            if (isDict(element)) next.push(element);
          }
        }
      }
    }
    level = next;
  }
  return undefined;
}

function pickDict(sources: Dict[], keys: readonly string[]): Dict | undefined {
  for (const key of keys) {
    for (const source of sources) {
      const candidate = source[key];
      if (isDict(candidate)) return candidate;
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Enrichissement des elements                                        */
/* ------------------------------------------------------------------ */

const TITLE_KEYS: readonly string[] = ["title", "poste", "role", "position", "fonction", "intitule", "jobTitle", "job"];
const COMPANY_KEYS: readonly string[] = ["company", "entreprise", "employer", "societe", "organisation", "employeur", "structure"];
const PERIOD_KEYS: readonly string[] = ["period", "dates", "dateLabel", "periode", "duree", "duration", "dateRange"];
const START_KEYS: readonly string[] = ["startDate", "start", "debut", "dateDebut", "from", "dateStart"];
const END_KEYS: readonly string[] = ["endDate", "end", "fin", "dateFin", "to", "dateEnd"];
const LOCATION_KEYS: readonly string[] = ["location", "ville", "city", "lieu", "adresse", "pays", "country"];
const DESCRIPTION_SOURCES: readonly string[] = [
  "description", "descriptions", "missions", "realisations", "achievements",
  "bullets", "responsabilites", "details", "contenu", "summary",
];

/** Lit une description chaine ou liste et fournit les deux formes (string + string[]). */
function readDescription(item: Dict): { description: string | undefined; descriptions: string[] | undefined } {
  for (const key of DESCRIPTION_SOURCES) {
    const value = item[key];
    if (typeof value === "string") {
      const text = value.trim();
      if (text.length === 0) continue;
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
      return { description: text, descriptions: lines.length > 0 ? lines : [text] };
    }
    if (Array.isArray(value) && value.length > 0) {
      const parts: string[] = [];
      for (const element of value) {
        if (typeof element === "string" && element.trim().length > 0) {
          parts.push(element.trim());
          continue;
        }
        if (isDict(element)) {
          const text = firstString(element, ["text", "description", "label", "value", "titre", "intitule"]);
          if (text !== undefined) parts.push(text);
        }
      }
      if (parts.length > 0) return { description: parts.join("\n"), descriptions: parts };
    }
  }
  return { description: undefined, descriptions: undefined };
}

function joinPeriod(start: string | undefined, end: string | undefined): string | undefined {
  if (start === undefined && end === undefined) return undefined;
  return [start, end].filter((part): part is string => part !== undefined).join(" - ");
}

/** Expose un element d experience sous tous ses alias usuels. */
export function enrichExperienceItem(item: unknown): Dict {
  if (!isDict(item)) {
    const text = str(item);
    const out: Dict = {};
    fillAliases(out, text, TITLE_KEYS);
    if (text !== undefined) {
      out["description"] = text;
      out["descriptions"] = [text];
    }
    return out;
  }
  const out: Dict = { ...item };
  const title = firstString(item, TITLE_KEYS);
  const company = firstString(item, COMPANY_KEYS);
  const location = firstString(item, LOCATION_KEYS);
  const start = firstString(item, START_KEYS);
  const end = firstString(item, END_KEYS);
  const period = firstString(item, PERIOD_KEYS) ?? joinPeriod(start, end);
  const { description, descriptions } = readDescription(item);
  fillAliases(out, title, TITLE_KEYS);
  fillAliases(out, company, COMPANY_KEYS);
  fillAliases(out, period, PERIOD_KEYS);
  fillAliases(out, location, LOCATION_KEYS);
  fillAliases(out, start, START_KEYS);
  fillAliases(out, end, END_KEYS);
  fillAliases(out, description, ["description", "contenu", "descriptionText"]);
  if (descriptions !== undefined && !isNonEmptyArray(out["descriptions"])) out["descriptions"] = descriptions;
  if (descriptions !== undefined && !isNonEmptyArray(out["bullets"])) out["bullets"] = descriptions;
  return out;
}

const DEGREE_KEYS: readonly string[] = ["degree", "diplome", "diploma", "title", "formation", "intitule", "qualification", "programme", "mention"];
const SCHOOL_KEYS: readonly string[] = ["school", "etablissement", "institution", "university", "universite", "ecole", "college", "lycee", "organisation", "structure"];
const FIELD_KEYS: readonly string[] = ["field", "fieldOfStudy", "specialite", "domaine", "filiere", "study"];

/** Expose un element de formation sous tous ses alias usuels. */
export function enrichEducationItem(item: unknown): Dict {
  if (!isDict(item)) {
    const text = str(item);
    const out: Dict = {};
    fillAliases(out, text, DEGREE_KEYS);
    return out;
  }
  const out: Dict = { ...item };
  const degree = firstString(item, DEGREE_KEYS) ?? firstString(item, FIELD_KEYS);
  const school = firstString(item, SCHOOL_KEYS);
  const field = firstString(item, FIELD_KEYS);
  const location = firstString(item, LOCATION_KEYS);
  const start = firstString(item, START_KEYS);
  const end = firstString(item, END_KEYS);
  const period = firstString(item, PERIOD_KEYS) ?? joinPeriod(start, end);
  const { description, descriptions } = readDescription(item);
  fillAliases(out, degree, DEGREE_KEYS);
  fillAliases(out, school, SCHOOL_KEYS);
  fillAliases(out, field, FIELD_KEYS);
  fillAliases(out, period, PERIOD_KEYS);
  fillAliases(out, location, LOCATION_KEYS);
  fillAliases(out, start, START_KEYS);
  fillAliases(out, end, END_KEYS);
  fillAliases(out, description, ["description", "contenu"]);
  if (descriptions !== undefined && !isNonEmptyArray(out["descriptions"])) out["descriptions"] = descriptions;
  return out;
}

const LANGUAGE_NAME_KEYS: readonly string[] = ["name", "langue", "language", "title", "label", "intitule"];
const LEVEL_KEYS: readonly string[] = ["level", "niveau", "proficiency", "certification"];

/** Expose un element de langue sous tous ses alias usuels. */
export function enrichLanguageItem(item: unknown): Dict {
  if (!isDict(item)) {
    const text = str(item);
    const out: Dict = {};
    fillAliases(out, text, LANGUAGE_NAME_KEYS);
    return out;
  }
  const out: Dict = { ...item };
  const name = firstString(item, LANGUAGE_NAME_KEYS);
  const level = firstString(item, LEVEL_KEYS);
  fillAliases(out, name, LANGUAGE_NAME_KEYS);
  fillAliases(out, level, LEVEL_KEYS);
  return out;
}

/** Expose un element de competence ; les chaines simples restent inchangees. */
export function enrichSkillItem(item: unknown): unknown {
  if (!isDict(item)) return item;
  const out: Dict = { ...item };
  const name = firstString(item, ["name", "label", "title", "text", "competence", "skill", "intitule", "value"]);
  fillAliases(out, name, ["name", "label", "title", "competence"]);
  const level = firstString(item, LEVEL_KEYS);
  fillAliases(out, level, ["level", "niveau"]);
  return out;
}

/** Expose le bloc d informations personnelles sous tous ses alias usuels. */
export function enrichPersonal(personal: Dict): Dict {
  const out: Dict = { ...personal };
  let name = firstString(personal, ["name", "fullName", "nomComplet", "nom", "displayName"]);
  if (name === undefined) {
    const firstName = firstString(personal, ["firstName", "prenom"]);
    const lastName = firstString(personal, ["lastName", "nomDeFamille", "famille"]);
    const joined = [firstName, lastName]
      .filter((part): part is string => part !== undefined)
      .join(" ")
      .trim();
    if (joined.length > 0) name = joined;
  }
  fillAliases(out, name, ["name", "fullName", "nom", "nomComplet", "displayName"]);
  fillAliases(out, firstString(personal, ["title", "jobTitle", "poste", "fonction", "titre", "intitule"]), ["title", "jobTitle", "poste", "titre"]);
  fillAliases(out, firstString(personal, ["email", "mail", "courriel"]), ["email", "mail", "courriel"]);
  fillAliases(out, firstString(personal, ["phone", "telephone", "tel", "mobile", "portable"]), ["phone", "telephone", "tel", "mobile"]);
  fillAliases(out, firstString(personal, ["location", "ville", "city", "adresse", "pays", "country"]), ["location", "ville", "city"]);
  fillAliases(out, firstString(personal, ["photo", "photoUrl", "avatar", "image", "photoProfil"]), ["photo", "photoUrl", "avatar", "image"]);
  fillAliases(out, firstString(personal, ["website", "siteWeb", "site", "url", "portfolio", "websiteUrl"]), ["website", "siteWeb", "site", "url"]);
  fillAliases(out, firstString(personal, ["linkedin", "linkedinUrl", "urlLinkedin", "profilLinkedin"]), ["linkedin", "linkedinUrl"]);
  fillAliases(out, firstString(personal, ["github", "githubUrl", "urlGithub"]), ["github", "githubUrl"]);
  return out;
}

/* ------------------------------------------------------------------ */
/* Enrichissement global                                              */
/* ------------------------------------------------------------------ */

/**
 * Enrichit le CV normalise. raw (donnee brute d origine) est facultatif :
 * quand la sortie du normalisateur a perdu une section, elle est recheree
 * dans raw avant d etre exposee sous toutes ses formes d alias.
 */
export function enrichCv<T>(cv: T, raw?: unknown): T {
  if (!isDict(cv)) return cv;
  const base: Dict = cv;
  const origin: Dict | undefined = isDict(raw) ? raw : undefined;
  const sources: Dict[] = origin ? [base, origin] : [base];
  const out: Dict = { ...base };

  const experiences =
    pickStage(sources, EXPERIENCE_KEYS) ??
    deepPick(base, EXPERIENCE_KEYS, 3) ??
    (origin ? deepPick(origin, EXPERIENCE_KEYS, 3) : undefined) ??
    shapedPick(base, looksLikeExperienceItem, 3) ??
    (origin ? shapedPick(origin, looksLikeExperienceItem, 3) : undefined);
  if (experiences !== undefined) {
    const items = experiences.map(enrichExperienceItem);
    out["experiences"] = items;
    out["experience"] = items;
    if (out["workExperiences"] === undefined) out["workExperiences"] = items;
  }

  const educations =
    pickStage(sources, EDUCATION_KEYS) ??
    deepPick(base, EDUCATION_KEYS, 3) ??
    (origin ? deepPick(origin, EDUCATION_KEYS, 3) : undefined);
  if (educations !== undefined) {
    const items = educations.map(enrichEducationItem);
    out["educations"] = items;
    out["education"] = items;
    if (out["formations"] === undefined) out["formations"] = items;
  }

  const skills =
    pickStage(sources, SKILL_KEYS) ??
    deepPick(base, SKILL_KEYS, 3) ??
    (origin ? deepPick(origin, SKILL_KEYS, 3) : undefined);
  if (skills !== undefined) {
    const items = skills.map(enrichSkillItem);
    out["skills"] = items;
    if (out["competences"] === undefined) out["competences"] = items;
  }

  const languages =
    pickStage(sources, LANGUAGE_KEYS) ??
    deepPick(base, LANGUAGE_KEYS, 3) ??
    (origin ? deepPick(origin, LANGUAGE_KEYS, 3) : undefined);
  if (languages !== undefined) {
    const items = languages.map(enrichLanguageItem);
    out["languages"] = items;
    if (out["langues"] === undefined) out["langues"] = items;
  }

  const summary = firstString(base, SUMMARY_KEYS) ?? (origin ? firstString(origin, SUMMARY_KEYS) : undefined);
  if (summary !== undefined) {
    if (out["summary"] === undefined) out["summary"] = summary;
    if (out["profil"] === undefined) out["profil"] = summary;
    if (out["profile"] === undefined) out["profile"] = summary;
  }

  const personalDict = pickDict(sources, PERSONAL_KEYS);
  if (personalDict !== undefined) {
    out["personal"] = enrichPersonal(personalDict);
  } else {
    const merged: Dict = origin ? { ...origin, ...base } : { ...base };
    const name = firstString(merged, ["name", "fullName", "nom"]);
    const email = firstString(merged, ["email", "mail"]);
    if (name !== undefined || email !== undefined) out["personal"] = enrichPersonal(merged);
  }

  return out as unknown as T;
}

export default enrichCv;