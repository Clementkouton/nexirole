/* =====================================================================
   extraire-sections-cv.cjs  -  NexiRole  -  LECTURE SEULE - 2026-11-22
   ---------------------------------------------------------------------
   But : extraire de diagnostic-cv-resultat.json les structures EXACTES
   dont l'assistant a besoin pour corriger le pipeline CV :

     1. cvData brut : cles de premier niveau + sous-arbres des sections
        (experiences / educations / skills / languages + alias)
     2. sortie de normalizeCvBase ("base") et de normalizeCv ("wrapper")
     3. analyse fine : champs vides, formes d'items, [object Object]
     4. copie numerotee de src/lib/cv-normalize.ts

   Le rapport JSON complet n'est pas colle tel quel car la photo en
   base64 (31 000+ caracteres) sature les extraits : ce script remplace
   les valeurs longues par un marqueur court.

   Fichiers produits (lecture seule ailleurs) :
     - elements-pour-correctif.txt  <- A COLLER A L'ASSISTANT
     - cv-enrich-copie.txt          <- copie de secours (sur demande)

   Prerequis : node diagnostic-cv-data.cjs a deja tourne (le fichier
   diagnostic-cv-resultat.json existe a la racine du projet).
   Usage :  node extraire-sections-cv.cjs
   ===================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");

const RESULT_FILE = "diagnostic-cv-resultat.json";
const OUT_FILE = "elements-pour-correctif.txt";
const ENRICH_COPY_FILE = "cv-enrich-copie.txt";
const NORMALIZE_FILE = path.join(process.cwd(), "src", "lib", "cv-normalize.ts");
const ENRICH_FILE = path.join(process.cwd(), "src", "lib", "cv-enrich.ts");

/* alias ajoutes par enrichCv -> champ principal correspondant */
const ALIAS_MAP = {
  experience: "experiences",
  workExperiences: "experiences",
  education: "educations",
  formations: "educations",
  competences: "skills",
  langues: "languages",
  profil: "summary",
  profile: "summary",
};

const lines = [];
function out(t) {
  const line = t === undefined ? "" : String(t);
  lines.push(line);
  console.log(line);
}

function hr(title) {
  out("");
  out("=== " + title + " " + "=".repeat(Math.max(1, 62 - title.length)));
}

/* remplace les apercus tres longs (photo base64...) par un marqueur court */
function redactSummary(node) {
  if (Array.isArray(node)) return node.map(redactSummary);
  if (node && typeof node === "object") {
    const copy = {};
    const keys = Object.keys(node);
    for (const k of keys) {
      const v = node[k];
      if (k === "apercu" && typeof v === "string" && typeof node.longueur === "number" && node.longueur > 500) {
        copy[k] = "<valeur longue omise (" + node.longueur + " caracteres)>";
      } else {
        copy[k] = redactSummary(v);
      }
    }
    return copy;
  }
  return node;
}

function subtree(obj, key) {
  if (!obj || typeof obj !== "object") return null;
  return obj[key] !== undefined ? redactSummary(obj[key]) : null;
}

function fieldType(v) {
  if (!v || typeof v !== "object") return typeof v;
  if (v.type === "array") return "array(" + v.longueur + ")";
  if (v.type === "string") return "string(" + v.longueur + ")";
  if (v.type === "object") return "object";
  return String(v.type);
}

function printField(label, node) {
  if (node === null || node === undefined) {
    out(label + " : (absent)");
    return;
  }
  if (node.type === "string" || node.type === "number" || node.type === "boolean" || node.type === "null" || node.type === "undefined") {
    out(label + " : " + JSON.stringify(node));
  } else {
    out(label + " :");
    out(JSON.stringify(node, null, 1));
  }
}

/* scan des flags objectObject poses par le resume du diagnostic */
function scanObjectObject(node, p, acc) {
  if (Array.isArray(node)) {
    node.forEach(function (x, i) {
      scanObjectObject(x, p + "[" + i + "]", acc);
    });
    return acc;
  }
  if (node && typeof node === "object") {
    if (node.objectObject === true) acc.push(p || "(racine)");
    Object.keys(node).forEach(function (k) {
      if (k === "objectObject") return;
      scanObjectObject(node[k], p ? p + "." + k : k, acc);
    });
  }
  return acc;
}

(async () => {
  out("=== NexiRole - extraction des sections CV (LECTURE SEULE) ===");
  if (!fs.existsSync(RESULT_FILE)) {
    out("[!] " + RESULT_FILE + " introuvable - lancez d'abord: node diagnostic-cv-data.cjs");
    return;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(RESULT_FILE, "utf8"));
  } catch (e) {
    out("[!] JSON illisible: " + (e && e.message ? e.message : e));
    return;
  }

  const brut = data.donneesBrutes && typeof data.donneesBrutes === "object" ? data.donneesBrutes : null;
  const base = data.pipeline && data.pipeline.base && typeof data.pipeline.base === "object" ? data.pipeline.base : null;
  const wrapper = data.pipeline && data.pipeline.wrapper && typeof data.pipeline.wrapper === "object" ? data.pipeline.wrapper : null;

  hr("CVDATA BRUT - cles de premier niveau");
  if (brut) {
    Object.keys(brut).forEach(function (k) {
      if (k === "type") return;
      out("  " + k + " : " + fieldType(brut[k]));
    });
  } else {
    out("(donneesBrutes absente du rapport)");
  }

  hr("CVDATA BRUT - sections (experiences / educations / skills / languages)");
  ["experiences", "educations", "skills", "languages"].forEach(function (k) {
    printField("brut." + k, subtree(brut, k));
  });
  ["experience", "workExperiences", "education", "formations", "competences", "langues"].forEach(function (k) {
    const s = subtree(brut, k);
    if (s) printField("brut." + k, s);
  });

  hr("PIPELINE normalizeCvBase (sortie 'base')");
  if (base) {
    Object.keys(base).forEach(function (k) {
      if (k === "type") return;
      printField("base." + k, subtree(base, k));
    });
  } else {
    out("(base absente" + (data.pipeline && data.pipeline.baseErreur ? " : " + data.pipeline.baseErreur : "") + ")");
  }

  hr("PIPELINE normalizeCv (wrapper enrichi - CE QUE LA PAGE AFFICHE)");
  if (wrapper) {
    Object.keys(wrapper).forEach(function (k) {
      if (k === "type") return;
      const mainKey = ALIAS_MAP[k];
      if (mainKey) {
        const mainNode = subtree(wrapper, mainKey);
        const aliasNode = subtree(wrapper, k);
        if (mainNode && aliasNode && JSON.stringify(aliasNode) === JSON.stringify(mainNode)) {
          out("wrapper." + k + " (alias) : identique a " + mainKey);
          return;
        }
      }
      printField("wrapper." + k, subtree(wrapper, k));
    });
  } else {
    out("(wrapper absent" + (data.pipeline && data.pipeline.wrapperErreur ? " : " + data.pipeline.wrapperErreur : "") + ")");
  }

  hr("ANALYSE FINES");
  if (brut && brut.experiences && brut.experiences.type === "array") {
    out("cvData brut : experiences = array(" + brut.experiences.longueur + ")  <- normalizeCvBase en rend " + (base && base.experiences ? base.experiences.longueur : "?"));
    if (Array.isArray(brut.experiences.elements) && brut.experiences.elements[0]) {
      const it = brut.experiences.elements[0];
      if (it.type === "object") {
        out("  brut.experiences[0] : objet { " + Object.keys(it).filter(function (k) { return k !== "type"; }).join(", ") + " }");
      } else {
        out("  brut.experiences[0] : " + it.type + " \"" + String(it.apercu || "").slice(0, 100) + "\"");
      }
    }
  }
  if (brut && brut.skills && brut.skills.type === "array" && Array.isArray(brut.skills.elements) && brut.skills.elements[0]) {
    const it = brut.skills.elements[0];
    if (it.type === "string") {
      out("[!] brut.skills[0] est une STRING: \"" + String(it.apercu).slice(0, 120) + "\"");
      out("    si c'est une liste separee par des virgules, la page n'affiche qu'une competence geante");
    } else if (it.type === "object") {
      out("brut.skills[0] : objet { " + Object.keys(it).filter(function (k) { return k !== "type"; }).join(", ") + " }");
    }
  }
  if (wrapper && wrapper.experiences && Array.isArray(wrapper.experiences.elements) && wrapper.experiences.elements[0]) {
    const it = wrapper.experiences.elements[0];
    if (it.type === "object") {
      const fields = Object.keys(it).filter(function (k) { return k !== "type"; });
      out("experience AFFICHEE (wrapper.experiences[0]) : " + fields.map(function (f) {
        const v = it[f];
        return f + "=" + (v && v.type === "string" ? "string(" + v.longueur + ")" : v && v.type === "object" ? "object" : v && v.type === "array" ? "array(" + v.longueur + ")" : "?");
      }).join(", "));
      const vides = fields.filter(function (f) {
        return it[f] && it[f].type === "string" && it[f].longueur === 0;
      });
      if (vides.length > 0) out("  [!] champs VIDES dans l'experience affichee: " + vides.join(", "));
      else out("  [OK] aucun champ vide dans l'experience affichee");
    }
  }
  const ooBase = base ? scanObjectObject(base, "", []) : [];
  const ooWrap = wrapper ? scanObjectObject(wrapper, "", []) : [];
  if (ooBase.length > 0) out("[!] objectObject dans BASE aux chemins: " + ooBase.join(", "));
  if (ooWrap.length > 0) out("[!] objectObject dans WRAPPER aux chemins: " + ooWrap.join(", "));
  if (ooBase.length === 0 && ooWrap.length === 0) out("[OK] aucun [object Object] dans base/wrapper");

  hr("CONTENU DE src/lib/cv-normalize.ts (numerote)");
  if (fs.existsSync(NORMALIZE_FILE)) {
    fs.readFileSync(NORMALIZE_FILE, "utf8").split(/\r?\n/).forEach(function (l, i) {
      out(String(i + 1).padStart(4, " ") + " | " + l);
    });
  } else {
    out("[!] introuvable: " + NORMALIZE_FILE);
  }

  try {
    if (fs.existsSync(ENRICH_FILE)) {
      fs.writeFileSync(ENRICH_COPY_FILE, fs.readFileSync(ENRICH_FILE, "utf8"), "utf8");
      out("");
      out("[OK] copie de secours creee: " + ENRICH_COPY_FILE + " (l'assistant la demandera si besoin)");
    }
  } catch (e) {
    /* ignore */
  }

  fs.writeFileSync(OUT_FILE, lines.join("\r\n"), "utf8");
  hr("TERMINE");
  out("[OK] rapport dedie sauvegarde: " + OUT_FILE + " <- A COLLER A L'ASSISTANT");
  out("     (" + lines.length + " lignes)");
})().catch(function (e) {
  console.error("[!] erreur inattendue: " + (e && e.message ? e.message : e));
  process.exitCode = 1;
});
