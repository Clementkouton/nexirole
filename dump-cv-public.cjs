/* dump-cv-public.cjs - diagnostic lecture seule (aucune ecriture en base) */
const fs = require("fs");
const path = require("path");

function trunc(value, max) {
  const text = String(value);
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function readEnvFile(file) {
  const result = {};
  if (!fs.existsSync(file)) return result;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

function describeValue(value) {
  if (value === undefined || value === null) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[] (vide)";
    const first = value[0];
    if (first !== null && typeof first === "object") {
      return "Array(" + value.length + ") - cles du 1er item: " + Object.keys(first).join(", ");
    }
    return "Array(" + value.length + ") - ex: " + trunc(JSON.stringify(first), 80);
  }
  if (typeof value === "object") return "Object - cles: " + Object.keys(value).join(", ");
  return trunc(String(value), 120);
}

(async () => {
  const envLocal = readEnvFile(path.join(process.cwd(), ".env.local"));
  const env = readEnvFile(path.join(process.cwd(), ".env"));
  const databaseUrl = process.env.DATABASE_URL || envLocal.DATABASE_URL || env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("[dump] DATABASE_URL introuvable dans .env.local / .env - etape ignoree");
    return;
  }
  process.env.DATABASE_URL = databaseUrl;

  let PrismaClient = null;
  const candidates = [
    "./src/generated/prisma",
    "./src/generated/prisma/index.js",
    "./src/generated/prisma/client",
    "@prisma/client",
  ];
  for (const candidate of candidates) {
    try {
      const mod = require(candidate);
      const Client = mod.PrismaClient || (mod.default && mod.default.PrismaClient);
      if (Client) {
        PrismaClient = Client;
        console.log("[dump] client Prisma charge via: " + candidate);
        break;
      }
    } catch (error) {
      /* candidat suivant */
    }
  }
  if (!PrismaClient) {
    console.log("[dump] client Prisma non charge (relancez npx prisma generate) - etape ignoree");
    return;
  }

  let prisma;
  try {
    prisma = new PrismaClient();
  } catch (error) {
    console.log("[dump] initialisation impossible: " + trunc(error && error.message ? error.message : error, 200));
    return;
  }

  try {
    let rows = null;
    let usedRaw = false;
    try {
      rows = await prisma.publicResume.findMany({ orderBy: { updatedAt: "desc" }, take: 5 });
    } catch (errorModel) {
      rows = await prisma.$queryRawUnsafe('SELECT * FROM "PublicResume" ORDER BY "updatedAt" DESC LIMIT 5');
      usedRaw = true;
    }
    if (!rows || rows.length === 0) {
      console.log("[dump] aucune ligne dans PublicResume");
      return;
    }
    for (const row of rows) {
      console.log("--------------------------------------------------");
      if (usedRaw) console.log("colonnes: " + Object.keys(row).join(", "));
      console.log(
        "slug: " + row.slug +
        " | isPublic: " + row.isPublic +
        " | templateId: " + row.templateId +
        " | vues: " + row.viewsCount +
        " | maj: " + (row.updatedAt ? new Date(row.updatedAt).toISOString() : "?")
      );
      let parsed = null;
      try {
        parsed = typeof row.cvData === "string" ? JSON.parse(row.cvData) : row.cvData;
      } catch (error) {
        console.log("cvData: JSON invalide");
        continue;
      }
      if (!parsed || typeof parsed !== "object") {
        console.log("cvData: vide");
        continue;
      }
      console.log("cvData - cles racine: " + Object.keys(parsed).join(", "));
      for (const key of Object.keys(parsed)) {
        console.log("  " + key + " => " + describeValue(parsed[key]));
      }
      const exps = parsed.experiences || parsed.experience || parsed.work || null;
      console.log("cvData.experiences brut: " + trunc(JSON.stringify(exps), 1500));
      const personal = parsed.personal || parsed.infos || null;
      console.log("cvData.personal brut: " + trunc(JSON.stringify(personal), 600));
      if (parsed.theme) console.log("cvData.theme: " + trunc(JSON.stringify(parsed.theme), 200));
    }
  } catch (error) {
    console.log("[dump] erreur: " + trunc(error && error.message ? error.message : error, 300));
  } finally {
    try {
      if (prisma && prisma.$disconnect) await prisma.$disconnect();
    } catch (error) {
      /* ignore */
    }
  }
})();