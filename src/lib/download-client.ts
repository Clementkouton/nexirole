/** Téléchargement de PDF via la route /api/download-pdf (côté client). */

export async function downloadPdf(
  kind: "cv" | "cover-letter",
  data: unknown,
  fallbackName: string
): Promise<void> {
  const res = await fetch("/api/download-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, data }),
  });

  if (!res.ok) {
    let message = "La génération du PDF a échoué.";
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      /* corps non JSON */
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fallbackName.replace(/[\\/:*?"<>|]/g, "-")}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
