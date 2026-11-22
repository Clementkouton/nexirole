/* =====================================================================
   diagnostic-cv-data.cjs  -  NexiRole  -  LECTURE SEULE (aucune ecriture)
   ---------------------------------------------------------------------
   Pourquoi ce client passe par le serveur dev ?
   Avec Prisma 7 + generateur "prisma-client", le client est genere en
   TypeScript/ESM dans src/generated/prisma: un script .cjs ne peut pas
   le charger via require(), meme apres npx prisma generate.
   La route /api/diagnostic-cv (lecture seule, desactivee en production)
   tourne dans le meme runtime que l'application (singleton @/lib/prisma
   + adapter pg): le diagnostic est donc fiable a 100%.
   ---------------------------------------------------------------------
   La route compare:
     - les donnees brutes PublicResume.cvData (slug kouton-clement)
     - la sortie de normalizeCvBase et du wrapper normalizeCv (+ enrichCv)
   et detecte: pertes de champs, "[object Object]", import manquant.
   ---------------------------------------------------------------------
   Usage:
     node diagnostic-cv-data.cjs
     node diagnostic-cv-data.cjs http://localhost:3000
     node diagnostic-cv-data.cjs http://localhost:3000 mon-slug
   Pre-requis: le serveur dev doit tourner (npm run dev).
   ===================================================================== */
"use strict";

const fs = require("fs");

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");
const SLUG = process.argv[3] || "kouton-clement";
const SECTION_WORDS = ["Experience", "Formation", "Langues", "Competences", "Projets", "Certifications"];

function stripAccents(s) {
  return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function hr(title) {
  console.log("");
  console.log("=== " + title + " " + "=".repeat(Math.max(1, 62 - title.length)));
}

function msg(e) {
  return e && e.message ? String(e.message) : String(e);
}

function printCounts(label, obj) {
  if (!obj || typeof obj !== "object") return;
  Object.keys(obj).forEach(function (k) {
    if (k === "type" || k === "elements") return;
    const v = obj[k];
    if (v && v.type === "array") console.log("  " + label + " - " + k + ": " + v.longueur + " element(s)");
    else if (v && v.type === "string") console.log("  " + label + " - " + k + ": string(" + v.longueur + ")");
  });
}

function saveRaw(endpoint, status, text) {
  try {
    fs.writeFileSync("diagnostic-cv-resultat.json", JSON.stringify({ endpoint: endpoint, status: status, body: String(text).slice(0, 4000) }, null, 2), "utf8");
    console.log("[OK] reponse brute sauvegardee: diagnostic-cv-resultat.json");
  } catch (e) {
    /* ignore */
  }
}

async function main() {
  console.log("=== NexiRole - diagnostic du CV public (LECTURE SEULE) ===");
  console.log("base: " + BASE);
  console.log("slug: " + SLUG);

  const endpoint = BASE + "/api/diagnostic-cv?slug=" + encodeURIComponent(SLUG);
  let data = null;
  try {
    const res = await fetch(endpoint, { headers: { Accept: "application/json" } });
    const text = await res.text();
    if (!res.ok) {
      hr("ECHEC HTTP " + res.status);
      console.log(String(text).slice(0, 1200));
      console.log("-> Regardez le terminal du serveur dev (npm run dev): l'erreur y est affichee.");
      saveRaw(endpoint, res.status, text);
      return;
    }
    data = JSON.parse(text);
  } catch (e) {
    hr("SERVEUR INJOIGNABLE");
    console.log("[!] " + msg(e));
    console.log("-> Demarrez d'abord le serveur:  npm run dev");
    console.log("-> Puis relancez:                node diagnostic-cv-data.cjs");
    return;
  }

  hr("PRISMA / BASE DE DONNEES");
  console.log("voie:               " + (data.voieUtilisee || "?"));
  console.log("table analysee:     " + (data.table || "(aucune)"));
  console.log("colonne de donnees: " + (data.colonneDonnees || "(ligne entiere passee au pipeline)"));
  if (data.erreurDb) console.log("[!] DB: " + data.erreurDb);
  if (Array.isArray(data.tablesAvecSlug) && data.tablesAvecSlug.length > 0) {
    console.log("tables candidates:  " + data.tablesAvecSlug.join(", "));
  }
  if (Array.isArray(data.recherche)) {
    data.recherche.forEach(function (r) {
      const etat = r.lignes !== undefined ? r.lignes + " ligne(s)" : r.erreur || r.statut || "?";
      console.log("  - " + r.table + " -> " + etat);
    });
  }

  hr("PIPELINE normalizeCv (normalizeCvBase + enrichCv)");
  const p = data.pipeline || {};
  if (p.baseErreur) console.log("[!] normalizeCvBase: " + p.baseErreur);
  if (p.wrapperErreur) console.log("[!] normalizeCv (wrapper): " + p.wrapperErreur);
  printCounts("brut   (normalizeCvBase)", p.base);
  printCounts("enrichi(normalizeCv)   ", p.wrapper);
  if (p.theme) console.log("theme: " + JSON.stringify(p.theme));

  hr("PROBLEMES DETECTES");
  const issues = Array.isArray(data.issues) ? data.issues : [];
  const notes = Array.isArray(data.notes) ? data.notes : [];
  if (issues.length === 0) console.log("(aucun probleme detecte dans les donnees et le pipeline)");
  issues.forEach(function (x) {
    console.log("[!] " + x);
  });
  notes.forEach(function (x) {
    console.log("(i) " + x);
  });

  hr("PAGE PUBLIQUE /u/" + SLUG);
  try {
    const res2 = await fetch(BASE + "/u/" + encodeURIComponent(SLUG));
    const html = await res2.text();
    const clean = stripAccents(html);
    console.log("HTTP " + res2.status + " - " + html.length + " octets");
    if (html.indexOf("[object Object]") !== -1) console.log("[!] '[object Object]' present dans le HTML rendu");
    if (/Application error/i.test(html) || /Internal Server Error/i.test(html)) console.log("[!] marqueur d'erreur Next detecte dans la page");
    SECTION_WORDS.forEach(function (w) {
      const n = clean.split(w).length - 1;
      if (n > 0) console.log("  - '" + w + "' trouve " + n + " fois");
    });
  } catch (e) {
    console.log("[!] page non testee (" + msg(e) + ")");
  }

  try {
    fs.writeFileSync("diagnostic-cv-resultat.json", JSON.stringify(data, null, 2), "utf8");
    console.log("");
    console.log("[OK] rapport complet sauvegarde: diagnostic-cv-resultat.json");
  } catch (e) {
    console.log("[!] sauvegarde impossible: " + msg(e));
  }

  hr("VERDICT");
  if (issues.length === 0 && !p.wrapperErreur && !p.baseErreur) {
    console.log("[OK] Donnees presentes et pipeline sans perte detectee.");
    console.log("-> Si la page /u/" + SLUG + " reste incomplete, le probleme est dans le rendu (template).");
    console.log("-> Envoyez diagnostic-cv-resultat.json a l'assistant pour la suite.");
  } else {
    console.log("-> Corrigez les points [!] ci-dessus (l'installateur gere deja l'import manquant).");
    console.log("-> Envoyez ensuite diagnostic-cv-resultat.json a l'assistant pour la suite.");
  }
}

main().catch(function (e) {
  console.error("[!] erreur inattendue: " + msg(e));
  process.exitCode = 1;
});