"use client";

/**
 * Téléchargements PDF haute qualité — 100 % côté navigateur.
 * @react-pdf/renderer et les documents PDF sont chargés UNIQUEMENT par
 * imports dynamiques : aucun composant PDF n'entre dans le bundle serveur,
 * donc aucune erreur SSR au `next build` (correction du « 1 Issue »).
 */

import type { CvPdfDocument } from "@/components/pdf/CvPdfDocument";
import type { LetterPdfDocument } from "@/components/pdf/LetterPdfDocument";
import { getTemplate, type TemplateId } from "@/lib/cv-templates";

type DossierData = Parameters<typeof CvPdfDocument>[0]["data"];
type LetterData = Parameters<typeof LetterPdfDocument>[0]["data"];

function sanitizeFilename(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 70);
  return cleaned.length > 0 ? cleaned : "document";
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sanitizeFilename(filename)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** CV : CV_NexiRole_[Template].pdf */
export async function downloadCvPdf(
  data: DossierData,
  templateId: TemplateId,
  photo: string | null
): Promise<void> {
  const [{ pdf }, { CvPdfDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/pdf/CvPdfDocument"),
  ]);
  const blob = await pdf(
    <CvPdfDocument data={data} templateId={templateId} photo={photo} />
  ).toBlob();
  triggerDownload(blob, `CV_NexiRole_${getTemplate(templateId).name}`);
}

/** Lettre : Lettre_NexiRole_[Template].pdf */
export async function downloadLetterPdf(
  data: LetterData,
  templateId: TemplateId
): Promise<void> {
  const [{ pdf }, { LetterPdfDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/pdf/LetterPdfDocument"),
  ]);
  const blob = await pdf(
    <LetterPdfDocument data={data} templateId={templateId} />
  ).toBlob();
  triggerDownload(blob, `Lettre_NexiRole_${getTemplate(templateId).name}`);
}

/** Kit : Kit_Entretien_NexiRole.pdf */
export async function downloadKitPdf(
  data: DossierData,
  templateId: TemplateId
): Promise<void> {
  const [{ pdf }, { KitPdfDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/pdf/KitPdfDocument"),
  ]);
  const blob = await pdf(
    <KitPdfDocument data={data} templateId={templateId} />
  ).toBlob();
  triggerDownload(blob, "Kit_Entretien_NexiRole");
}