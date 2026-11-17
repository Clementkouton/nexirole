// src/app/api/parse-cv/route.ts
import { NextResponse } from "next/server";
import { extractPdfText } from "@/lib/pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucun fichier reçu — relance l'import." }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 10 Mo)." }, { status: 400 });
    }

    const name = file.name.toLowerCase();

    if (name.endsWith(".pdf")) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const text = await extractPdfText(buffer);
      if (!text || text.trim().length < 40) {
        return NextResponse.json(
          { error: "PDF illisible ou vide (probablement un scan image). Utilise l'option « Texte » ou un PDF natif." },
          { status: 422 }
        );
      }
      return NextResponse.json({ text: text.trim(), name: file.name });
    }

    if (name.endsWith(".txt") || name.endsWith(".md")) {
      const text = await file.text();
      return NextResponse.json({ text: text.trim(), name: file.name });
    }

    return NextResponse.json({ error: "Format non supporté — utilise un PDF ou un fichier texte." }, { status: 415 });
  } catch (err) {
    return NextResponse.json({ error: `Extraction impossible : ${(err as Error).message}` }, { status: 500 });
  }
}