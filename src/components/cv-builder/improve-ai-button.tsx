"use client";

import { useState } from "react";
import { IconLoader2, IconWand } from "@tabler/icons-react";
import { toast } from "sonner";

interface ImproveButtonProps {
  label: string;
  value: string;
  context?: string;
  onImproved: (text: string) => void;
  size?: "sm" | "xs";
}

export function ImproveAiButton({
  label,
  value,
  context,
  onImproved,
  size = "sm",
}: ImproveButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleImprove() {
    if (value.trim().length < 5) {
      toast.error("Écrivez d'abord quelques mots à améliorer.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/improve-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, text: value, context }),
      });
      const json = (await res.json().catch(() => null)) as
        | { improved?: string; error?: string }
        | null;
      if (!res.ok || !json?.improved) {
        toast.error(json?.error ?? "L'amélioration IA a échoué. Réessayez.");
        return;
      }
      onImproved(json.improved);
      toast.success("Texte amélioré par l'IA");
    } catch {
      toast.error("Impossible de joindre le serveur. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleImprove}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 rounded-full border border-gold/70 bg-gold-soft font-semibold text-accent-foreground transition-colors hover:bg-gold hover:text-navy disabled:cursor-not-allowed disabled:opacity-60 ${
        size === "xs" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
      }`}
      aria-label={`Améliorer avec l'IA : ${label}`}
    >
      {loading ? (
        <IconLoader2 className="size-3.5 animate-spin" />
      ) : (
        <IconWand className="size-3.5" />
      )}
      {loading ? "Amélioration…" : "Améliorer avec l'IA"}
    </button>
  );
}
