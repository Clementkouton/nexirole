// src/lib/pdf.ts
import { extractText, getDocumentProxy } from "unpdf";

/** Extrait le texte d'un buffer PDF (multi-pages fusionnées). */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}