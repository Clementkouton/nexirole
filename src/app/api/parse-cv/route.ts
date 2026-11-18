import { NextResponse } from "next/server";

import { extractPdfText } from "@/lib/pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Aucun fichier reçu." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Fichier trop volumineux (10 Mo maximum)." },
        { status: 413 }
      );
    }

    const name = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    if (name.endsWith(".pdf")) {
      let text = "";
      try {
        text = await extractPdfText(buffer);
      } catch {
        text = "";
      }
      if (text.trim().length < 40) {
        return NextResponse.json(
          {
            error:
              "PDF illisible ou scan image : utilise le mode « Texte collé » pour copier ton CV.",
          },
          { status: 422 }
        );
      }
      return NextResponse.json({ text, name: file.name });
    }

    if (name.endsWith(".txt") || name.endsWith(".md")) {
      const text = buffer.toString("utf8");
      if (text.trim().length < 40) {
        return NextResponse.json(
          { error: "Fichier texte vide ou trop court." },
          { status: 422 }
        );
      }
      return NextResponse.json({ text, name: file.name });
    }

    return NextResponse.json(
      { error: "Format non supporté : PDF, TXT ou MD uniquement." },
      { status: 415 }
    );
  } catch (error) {
    console.error("[parse-cv]", error);
    return NextResponse.json(
      { error: "Échec de la lecture du CV." },
      { status: 500 }
    );
  }
}