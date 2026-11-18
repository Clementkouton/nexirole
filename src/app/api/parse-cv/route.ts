import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { generateStructured } from "@/lib/ai";
import { hasGroqKey } from "@/lib/ai-guard";
import { extractPdfText } from "@/lib/pdf-extract";
import { prisma } from "@/lib/prisma";
import { sanitizeExtractedText, validatePdfBuffer } from "@/lib/file-security";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Lecture multi-formats du CV (côté serveur) :
 *  - PDF  : extraction texte via pdf-parse (déjà installé)
 *  - Image (PNG / JPEG / WEBP) : transcription via le modèle vision Groq
 *  - Word (.docx) : extraction via mammoth (npm install mammoth)
 *  - TXT / MD : lecture directe
 * Puis extraction des mots-clés (métier, lieu, compétences) par l'IA,
 * avec repli local si l'IA est indisponible.
 *
 * PARTIE 2 : le CV analysé est sauvegardé AUTOMATIQUEMENT dans l'historique
 * (modèle SavedResume) pour l'utilisateur connecté.
 * PARTIE 3 : validation stricte des PDF (5 Mo, MIME, octets magiques %PDF-)
 * + nettoyage anti-injection du texte extrait + limite 12 requêtes/h/IP.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SIZE = 10 * 1024 * 1024;
const MAX_SAVED_CHARS = 8000;

const keywordsSchema = z.object({
  metier: z.string().max(120),
  lieu: z.string().max(120),
  competences: z.array(z.string().max(80)).max(12),
});

const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "are", "our", "this", "that", "have",
  "from", "will", "your", "all", "not", "but", "has", "was", "who", "its",
  "can", "may", "also", "more", "than", "les", "des", "une", "dans", "pour",
  "avec", "sur", "aux", "par", "est", "sont", "nous", "vous", "leur", "vos",
  "plus", "tout", "tous", "cette", "cela", "chez", "sans", "ans", "ans.",
  "curriculum", "vitae", "resume", "candidat", "candidature", "poste",
  "experience", "experiences", "formation", "formations", "profil",
]);

function clamp(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

function cleanText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ------------------------------------------------------------------ */
/*  Extraction par format                                              */
/* ------------------------------------------------------------------ */

/** Transcription d'une image de CV via le modèle vision de Groq. */
async function extractImageText(
  base64: string,
  mime: string
): Promise<string> {
  if (!hasGroqKey()) {
    throw new ParseError(
      "La lecture d'une image de CV nécessite la clé GROQ_API_KEY dans .env.local. En attendant, importez une version PDF de votre CV."
    );
  }
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(50_000),
    body: JSON.stringify({
      model: process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0.1,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: 'Transcris l\'intégralité du texte de ce document (CV ou lettre). Conserve les sections et la structure en lignes. Réponds UNIQUEMENT avec un objet JSON de la forme {"text": "..."}. Si l\'image contient peu de texte, transcris quand même tout ce qui est lisible.',
            },
            {
              type: "image_url",
              image_url: { url: `data:${mime};base64,${base64}` },
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new ParseError(
      "La transcription de l'image a échoué (service IA indisponible ou image illisible). Essayez une version PDF de votre CV."
    );
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(content) as { text?: string };
    return cleanText(parsed.text ?? "");
  } catch {
    // Le modèle a répondu hors JSON : on prend le texte brut.
    return cleanText(content);
  }
}

/** Extraction du texte d'un .docx via mammoth. */
async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    const mammothModule = await import("mammoth");
    const mammoth = (mammothModule as unknown as { default?: typeof mammothModule }).default ?? mammothModule;
    const result = await mammoth.extractRawText({ buffer });
    return cleanText(result.value ?? "");
  } catch {
    throw new ParseError(
      "La lecture du fichier Word a échoué. Si le problème persiste, exportez-le en PDF et réessayez. (Vérifiez aussi que « npm install mammoth » a bien été exécuté.)"
    );
  }
}

class ParseError extends Error {}

/* ------------------------------------------------------------------ */
/*  Repli local : extraction de mots-clés sans IA                      */
/* ------------------------------------------------------------------ */

function localKeywords(text: string): z.infer<typeof keywordsSchema> {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const metier = (lines.find((l) => l.length > 3 && l.length < 80) ?? "").slice(0, 80);

  const idx = lines.findIndex((l) => /comp[ée]tences|skills/i.test(l));
  const pool = idx >= 0 ? lines.slice(idx + 1, idx + 6).join(", ") : text.slice(0, 2000);

  const lowerToOriginal = new Map<string, string>();
  for (const token of pool.match(/[A-Za-zÀ-ÿ0-9+#.][A-Za-zÀ-ÿ0-9+#.\- ]{2,40}/g) ?? []) {
    const clean = token.trim();
    if (!clean) continue;
    const key = clean
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (!lowerToOriginal.has(key)) lowerToOriginal.set(key, clean);
  }

  const frequencies = new Map<string, number>();
  for (const key of lowerToOriginal.keys()) {
    const normalized = key.split(/[^a-z0-9+#]+/).filter(Boolean);
    for (const word of normalized) {
      if (word.length < 3 || STOPWORDS.has(word) || /^\d+$/.test(word)) continue;
      frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
    }
  }

  const competences = [...frequencies.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => lowerToOriginal.get(word) ?? word);

  const lieuMatch = text.match(
    /(Paris|Lyon|Marseille|Toulouse|Bordeaux|Lille|Nantes|Strasbourg|Rennes|Nice|Montpellier|France|Belgique|Suisse|Luxembourg|Montréal|Canada|Maroc|Tunisie|Algérie|Sénégal|Cameroun|Côte d'Ivoire|Remote|Télétravail)/i
  );

  return {
    metier,
    lieu: lieuMatch ? lieuMatch[1] : "",
    competences,
  };
}

/* ------------------------------------------------------------------ */
/*  Sauvegarde automatique de l'historique (PARTIE 2)                  */
/* ------------------------------------------------------------------ */

async function saveResumeHistory(
  userId: string,
  fileName: string,
  text: string,
  keywords: z.infer<typeof keywordsSchema>
): Promise<void> {
  try {
    const lines = text.split("\n").filter((l) => l.trim().length > 3);
    await prisma.savedResume.create({
      data: {
        userId,
        fileName: fileName.slice(0, 120) || "cv-importe",
        extractedText: clamp(text, MAX_SAVED_CHARS),
        detectedSkills: keywords.competences.slice(0, 12),
        profileSummary: clamp(lines.slice(0, 3).join(" — "), 240),
      },
    });
  } catch (error) {
    console.error("[parse-cv] sauvegarde de l'historique échouée :", error);
  }
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  /* PARTIE 3 : 12 analyses de CV max par heure et par IP */
  const rl = rateLimit(`parse-cv:${getClientIp(request)}`, 12, 60 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json(
      {
        error: `Trop d'analyses de CV. Réessayez dans ${Math.ceil(rl.retryAfterSec / 60)} minute(s).`,
        code: "RATE_LIMITED",
      },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  let file: File;
  try {
    const formData = await request.formData();
    const entry = formData.get("file");
    if (!(entry instanceof File)) {
      return NextResponse.json(
        { error: "Aucun fichier reçu. Réessayez." },
        { status: 400 }
      );
    }
    file = entry;
  } catch {
    return NextResponse.json(
      { error: "Requête invalide (fichier illisible)." },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "Fichier trop volumineux — 10 Mo maximum." },
      { status: 413 }
    );
  }

  const name = file.name.toLowerCase();
  const mime = (file.type || "").toLowerCase();

  const isPdf = mime === "application/pdf" || name.endsWith(".pdf");
  const isDocx =
    name.endsWith(".docx") ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const isTxt = name.endsWith(".txt") || name.endsWith(".md") || mime.startsWith("text/");
  const imageMime = mime.startsWith("image/")
    ? mime
    : name.endsWith(".png")
      ? "image/png"
      : name.endsWith(".webp")
        ? "image/webp"
        : name.endsWith(".jpg") || name.endsWith(".jpeg")
          ? "image/jpeg"
          : "";

  if (!isPdf && !isDocx && !isTxt && !imageMime) {
    return NextResponse.json(
      {
        error:
          "Format non pris en charge. Utilisez un PDF, une image (PNG, JPG, WEBP), un fichier Word (.docx) ou un fichier texte. Les anciens fichiers .doc doivent être convertis en PDF ou .docx.",
      },
      { status: 415 }
    );
  }

  /* Extraction du texte brut selon le format */
  let text = "";
  try {
    if (isPdf) {
      const buffer = Buffer.from(await file.arrayBuffer());
      /* PARTIE 3 — Validation stricte : 5 Mo max + octets magiques %PDF-
           avant d'appeler pdf-parse (bloque les fichiers déguisés).      */
      const check = validatePdfBuffer(buffer, null);
      if (!check.ok) {
        return NextResponse.json(
          { error: check.error, code: "PDF_REJECTED" },
          { status: check.status }
        );
      }
      text = await extractPdfText(buffer);
    } else if (imageMime) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString("base64");
      text = await extractImageText(base64, imageMime);
    } else if (isDocx) {
      const buffer = Buffer.from(await file.arrayBuffer());
      text = await extractDocxText(buffer);
    } else {
      const buffer = Buffer.from(await file.arrayBuffer());
      text = cleanText(buffer.toString("utf8"));
    }
  } catch (error) {
    if (error instanceof ParseError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("[parse-cv] échec extraction :", error);
    return NextResponse.json(
      {
        error:
          "La lecture du fichier a échoué. Pour un PDF, vérifiez qu'il s'agit d'un PDF texte (et non d'un scan) — sinon envoyez-le en image PNG/JPG.",
      },
      { status: 422 }
    );
  }

  if (text.trim().length < 40) {
    return NextResponse.json(
      {
        error:
          "Le fichier ne contient pas assez de texte exploitable. Si c'est un scan ou une photo, assurez-vous que le texte est net et lisible, ou utilisez une version PDF.",
      },
      { status: 422 }
    );
  }

  /* PARTIE 3 — Nettoyage anti-injection de prompt du texte extrait */
  text = sanitizeExtractedText(text, 12_000);

  /* Extraction des mots-clés */
  let keywords: z.infer<typeof keywordsSchema>;
  if (hasGroqKey() && text.trim().length >= 80) {
    try {
      const result = await generateStructured({
        schema: keywordsSchema,
        system:
          "Tu extrais des mots-clés d'un CV en français. À partir du texte du CV : \"metier\" = intitulé du poste actuel ou visé (courte expression, sans phrase) ; \"lieu\" = ville/pays du candidat si identifiable, sinon chaîne vide ; \"competences\" = 6 à 10 compétences techniques ou métiers clés réellement présentes dans le CV, chacune en 1 à 4 mots. N'invente rien, réponds avec un JSON strict.",
        prompt: clamp(text, 6000),
        temperature: 0.1,
        maxOutputTokens: 800,
      });
      keywords = result.data as z.infer<typeof keywordsSchema>;
      keywords.competences = keywords.competences
        .map((c) => c.trim())
        .filter(Boolean)
        .slice(0, 12);
    } catch (error) {
      console.error("[parse-cv] extraction IA indisponible, repli local :", error);
      keywords = localKeywords(text);
    }
  } else {
    keywords = localKeywords(text);
  }

  /* PARTIE 2 — Sauvegarde automatique pour l'utilisateur connecté */
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (userId) {
    await saveResumeHistory(userId, file.name, text, keywords);
  }

  return NextResponse.json({
    ok: true,
    name: file.name,
    text: clamp(text, 12000),
    keywords: {
      metier: keywords.metier,
      lieu: keywords.lieu,
      competences: keywords.competences,
    },
  });
}
