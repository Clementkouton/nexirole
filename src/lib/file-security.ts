/**
 * Sécurité des fichiers importés — PARTIE 3.
 *
 * Toute route recevant un fichier (ou un PDF encodé en base64) doit :
 *  1. limiter la taille (5 Mo max pour un PDF),
 *  2. vérifier le type MIME déclaré,
 *  3. vérifier les octets magiques « %PDF- » avant d'appeler pdf-parse,
 *  4. nettoyer et tronquer le texte extrait (anti-injection de prompt,
 *     anti-dépassement de contexte).
 */

export const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 Mo
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 Mo (transcription vision)
export const MAX_DOCX_BYTES = 10 * 1024 * 1024; // 10 Mo
export const MAX_TEXT_CHARS = 24_000; // plafond de contexte par document

export type FileCheck =
  | { ok: true }
  | { ok: false; status: number; error: string };

/** Vrai si le buffer commence par les octets magiques %PDF-. */
export function hasPdfMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 5) return false;
  return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

/**
 * Validation stricte d'un PDF : taille, MIME et octets magiques.
 * À appeler AVANT toute extraction de texte.
 */
export function validatePdfBuffer(
  buffer: Buffer,
  declaredMime?: string | null
): FileCheck {
  if (buffer.length === 0) {
    return { ok: false, status: 400, error: "Le fichier PDF est vide." };
  }
  if (buffer.length > MAX_PDF_BYTES) {
    return {
      ok: false,
      status: 413,
      error: "Le fichier PDF dépasse la taille maximale de 5 Mo.",
    };
  }
  if (declaredMime && declaredMime.toLowerCase() !== "application/pdf") {
    return {
      ok: false,
      status: 415,
      error: "Type de fichier non autorisé : un CV doit être un PDF (application/pdf).",
    };
  }
  if (!hasPdfMagicBytes(buffer)) {
    return {
      ok: false,
      status: 415,
      error:
        "Fichier invalide : le contenu ne correspond pas à un vrai document PDF (signature %PDF- absente).",
    };
  }
  return { ok: true };
}

/**
 * Nettoie un texte extrait avant de l'envoyer au moteur IA :
 * - supprime les caractères de contrôle et les séquences d'inversion Unicode,
 * - neutralise les pseudo-instructions d'injection de prompt connues,
 * - borne la longueur (MAX_TEXT_CHARS).
 */
export function sanitizeExtractedText(raw: string, maxChars = MAX_TEXT_CHARS): string {
  let text = raw
    // caractères de contrôle invisibles (hors \n et \t)
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, " ")
    // tricks d'affichage / bi-directionnalité
    .replace(/[\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    // zéro-width utilisés pour cacher des instructions
    .replace(/[\u200B-\u200F\u2060]/g, "");

  // Neutralisation des tentatives d'injection de prompt les plus fréquentes.
  text = text.replace(
    /ignore (all|any|les)? ?(previous|précédentes?|precedentes?) (instructions|consignes)/gi,
    "[instruction ignorée]"
  );
  text = text.replace(/you are now|tu es maintenant|nouveau système|new system prompt/gi, "[texte neutre]");
  text = text.replace(/<\|.*?\|>/g, "[texte neutre]");

  // Normalisation des espaces / lignes vides.
  text = text
    .replace(/\r/g, "\n")
    .replace(/[\u00a0]/g, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text.length > maxChars) {
    text = text.slice(0, maxChars) + "\n[… texte tronqué par NexiRole pour raisons de sécurité …]";
  }
  return text;
}

/** Limite générique de taille pour tout fichier (upload formData). */
export function validateFileSize(bytes: number, maxBytes: number, label: string): FileCheck {
  if (bytes === 0) {
    return { ok: false, status: 400, error: `Le fichier ${label} est vide.` };
  }
  if (bytes > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `Le fichier ${label} dépasse la taille maximale de ${Math.round(maxBytes / (1024 * 1024))} Mo.`,
    };
  }
  return { ok: true };
}
