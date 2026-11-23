import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import {
  cvPdfPayloadSchema,
  coverLetterPdfPayloadSchema,
  downloadPdfRequestSchema,
} from "@/lib/schemas";
import { CvPdfTemplate } from "@/components/pdf/CvPdfTemplate";
import { CoverLetterPdfTemplate } from "@/components/pdf/CoverLetterPdfTemplate";

export const maxDuration = 60;

function sanitizeFilename(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return cleaned.length > 0 ? cleaned : "document";
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête JSON invalide." },
      { status: 400 }
    );
  }

  const parsed = downloadPdfRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paramètres de téléchargement invalides." },
      { status: 400 }
    );
  }

  const { kind, data } = parsed.data;

  try {
    let buffer: Buffer;
    let filename: string;

    if (kind === "cv") {
      const cvData = cvPdfPayloadSchema.safeParse(data);
      if (!cvData.success) {
        return NextResponse.json(
          { error: "Données du CV invalides pour la génération PDF." },
          { status: 422 }
        );
      }
      const candidateName = cvData.data.candidateName?.trim() || "Candidat";
      buffer = await renderToBuffer(
        React.createElement(CvPdfTemplate, {
          cv: cvData.data.cv,
          candidateName,
          contact: cvData.data.contact ?? {},
        }) as Parameters<typeof renderToBuffer>[0]
      );
      filename = `CV-${candidateName}`;
    } else {
      const letterData = coverLetterPdfPayloadSchema.safeParse(data);
      if (!letterData.success) {
        return NextResponse.json(
          { error: "Données de la lettre invalides pour la génération PDF." },
          { status: 422 }
        );
      }
      const candidateName = letterData.data.candidateName?.trim() || "Candidat";
      buffer = await renderToBuffer(
        React.createElement(CoverLetterPdfTemplate, {
          letter: letterData.data.letter,
          candidateName,
          jobTitle: letterData.data.jobTitle,
          company: letterData.data.company,
          contact: letterData.data.contact ?? {},
        }) as Parameters<typeof renderToBuffer>[0]
      );
      filename = `Lettre-Motivation-${candidateName}`;
    }

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${sanitizeFilename(filename)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[download-pdf]", error);
    return NextResponse.json(
      { error: "La génération du PDF a échoué. Réessayez." },
      { status: 500 }
    );
  }
}
