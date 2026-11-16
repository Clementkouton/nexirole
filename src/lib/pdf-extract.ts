/**
 * Extraction de texte des CV PDF — côté serveur uniquement.
 * `pdf-parse` (v2) est déclaré dans `serverExternalPackages` de next.config.ts.
 */

import { PDFParse } from "pdf-parse";

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text
      .replace(/\r/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .trim();
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

export function decodeBase64ToBuffer(base64: string): Buffer {
  return Buffer.from(base64, "base64");
}
