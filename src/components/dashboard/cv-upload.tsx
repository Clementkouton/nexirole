"use client";

import { useCallback, useRef, useState } from "react";
import {
  IconAlertCircle,
  IconFileText,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import type { CvFileValue } from "@/lib/types";

interface CvUploadProps {
  value: CvFileValue | null;
  onChange: (value: CvFileValue | null) => void;
  label?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function CvUpload({ value, onChange, label }: CvUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readFile = useCallback(
    (file: File) => {
      setError(null);
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        setError("Format non supporté — importez un fichier PDF.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError("Fichier trop volumineux — 10 Mo maximum.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        const base64 = result.includes(",") ? result.slice(result.indexOf(",") + 1) : result;
        onChange({ name: file.name, size: file.size, base64 });
      };
      reader.onerror = () => {
        setError("La lecture du fichier a échoué. Réessayez.");
      };
      reader.readAsDataURL(file);
    },
    [onChange]
  );

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) readFile(file);
          e.target.value = "";
        }}
        aria-hidden
      />

      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-navy/[0.06]">
            <IconFileText className="size-5 text-navy" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-navy">{value.name}</p>
            <p className="text-xs text-slate-500">
              CV chargé · {formatSize(value.size)} · prêt pour l&apos;analyse
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="flex size-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
            aria-label="Retirer le CV"
          >
            <IconTrash className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) readFile(file);
          }}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragging
              ? "border-gold bg-gold-soft/60"
              : "border-slate-300 bg-white hover:border-navy/40 hover:bg-slate-50"
          }`}
          aria-label="Importer votre CV PDF"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-navy/[0.06]">
            <IconUpload className="size-5 text-navy" />
          </span>
          <span className="text-sm font-semibold text-navy">
            {label ?? "Importez votre CV PDF"}
          </span>
          <span className="text-xs text-slate-500">
            Glissez-déposez ou cliquez — PDF texte, 10 Mo max
          </span>
        </button>
      )}

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600">
          <IconAlertCircle className="size-3.5" />
          {error}
        </p>
      )}
    </div>
  );
}
