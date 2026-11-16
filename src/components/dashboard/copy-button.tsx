"use client";

import { useState } from "react";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { toast } from "sonner";

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Repli pour environnements sans Clipboard API (HTTP non sécurisé, anciens navigateurs)
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function CopyButton({ text, label = "Copier le texte", className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyToClipboard(text);
        if (ok) {
          setCopied(true);
          toast.success("Texte copié dans le presse-papiers");
          window.setTimeout(() => setCopied(false), 2000);
        } else {
          toast.error("La copie a échoué — sélectionnez le texte manuellement.");
        }
      }}
      className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-slate-50 ${
        className ?? ""
      }`}
      aria-label={label}
    >
      {copied ? (
        <IconCheck className="size-3.5 text-emerald-600" />
      ) : (
        <IconCopy className="size-3.5 text-gold-dark" />
      )}
      {copied ? "Copié !" : label}
    </button>
  );
}
