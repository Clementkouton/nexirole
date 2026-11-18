"use client";

/**
 * Sélecteur des 4 templates ATS professionnels :
 *  - filtres Style / Catégorie / Profession,
 *  - badge « Recommandé pour votre profil » selon le métier détecté,
 *  - interrupteur Avec / Sans photo + sélecteur d'image (JPG/PNG),
 *  - mini-aperçus stylisés cliquables.
 */

import { useMemo, useRef, useState } from "react";
import {
  IconCheck,
  IconIdBadge,
  IconPhoto,
  IconPhotoOff,
  IconSparkles,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import {
  CV_TEMPLATES,
  allCategories,
  allProfessions,
  allStyles,
  recommendTemplateForJob,
  type TemplateId,
} from "@/lib/cv-templates";
import { cx } from "@/lib/ui-classes";

interface TemplateSelectorProps {
  selected: TemplateId;
  onSelect: (id: TemplateId) => void;
  photoEnabled: boolean;
  onPhotoToggle: (enabled: boolean) => void;
  photoUrl: string | null;
  onPhotoChange: (dataUrl: string | null) => void;
  detectedJobTitle?: string | null;
  disabled?: boolean;
}

/* Mini-aperçu symbolique propre à chaque template */
function MiniPreview({ id, active }: { id: TemplateId; active: boolean }) {
  const navy = id === "bold-minimalism" ? "#111827" : "#051937";
  const accent = id === "bold-minimalism" ? "#111827" : "#FFC107";

  return (
    <div
      className={cx(
        "relative h-24 w-full overflow-hidden rounded-lg border bg-white",
        active ? "border-navy/50" : "border-slate-200"
      )}
      aria-hidden
    >
      {id === "modern-accent" && (
        <div className="h-7 w-full bg-navy p-1.5">
          <div className="h-1.5 w-14 rounded bg-white/90" />
          <div className="mt-1 h-1 w-10 rounded bg-gold" />
          <div className="absolute right-1 top-1 size-4 rounded-full bg-white/30" />
        </div>
      )}
      {id === "sleek-executive" && (
        <div className="border-b border-slate-300 p-2 text-center">
          <div className="mx-auto h-1.5 w-16 rounded bg-navy/80" />
          <div className="mx-auto mt-1 h-1 w-12 rounded bg-slate-300" />
        </div>
      )}
      {id === "bold-minimalism" && (
        <div className="border-b-2 border-slate-800 p-2">
          <div className="h-2 w-20 bg-slate-800" />
          <div className="mt-1 h-1 w-14 rounded bg-slate-400" />
        </div>
      )}
      {id === "clean-ats" && (
        <div className="border-b-2 border-gold p-2">
          <div className="h-1.5 w-16 rounded bg-navy/90" />
          <div className="mt-1 h-1 w-24 rounded bg-slate-300" />
        </div>
      )}
      <div className="space-y-1 p-2">
        <div className="h-1 w-8 rounded" style={{ backgroundColor: accent }} />
        <div className="h-1 w-full rounded bg-slate-200" />
        <div className="h-1 w-4/5 rounded bg-slate-200" />
        <div className="h-1 w-3/5 rounded bg-slate-200" />
        {id === "modern-accent" && (
          <div className="flex gap-1 pt-0.5">
            <div className="h-2 w-8 rounded-sm border border-slate-200 bg-slate-50" />
            <div className="h-2 w-10 rounded-sm border border-slate-200 bg-slate-50" />
          </div>
        )}
      </div>
    </div>
  );
}

export function TemplateSelector({
  selected,
  onSelect,
  photoEnabled,
  onPhotoToggle,
  photoUrl,
  onPhotoChange,
  detectedJobTitle,
  disabled = false,
}: TemplateSelectorProps) {
  const [styleFilter, setStyleFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [professionFilter, setProfessionFilter] = useState("all");
  const fileRef = useRef<HTMLInputElement>(null);

  const styles = useMemo(() => allStyles(), []);
  const categories = useMemo(() => allCategories(), []);
  const professions = useMemo(() => allProfessions(), []);

  const recommendedId = useMemo(
    () => recommendTemplateForJob(detectedJobTitle),
    [detectedJobTitle]
  );

  const visible = CV_TEMPLATES.filter((t) => {
    if (styleFilter !== "all" && t.style !== styleFilter) return false;
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    if (professionFilter !== "all" && !t.professions.includes(professionFilter))
      return false;
    return true;
  });

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png)$/.test(file.type)) {
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onPhotoChange(String(reader.result));
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-navy">
          <IconIdBadge className="size-4.5 text-gold" />
          Template du dossier
        </h3>

        {/* Interrupteur photo */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={photoEnabled}
            disabled={disabled}
            onClick={() => onPhotoToggle(!photoEnabled)}
            className={cx(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
              photoEnabled ? "bg-navy" : "bg-slate-300"
            )}
          >
            <span
              className={cx(
                "inline-block size-4.5 transform rounded-full bg-white shadow transition-transform",
                photoEnabled ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-navy">
            {photoEnabled ? (
              <IconPhoto className="size-4 text-gold" />
            ) : (
              <IconPhotoOff className="size-4 text-slate-400" />
            )}
            {photoEnabled ? "Avec photo" : "Sans photo"}
          </span>

          {photoEnabled && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={handleFile}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-navy transition hover:bg-slate-50 disabled:opacity-60"
              >
                <IconUpload className="size-3.5" />
                Choisir (JPG/PNG)
              </button>
              {photoUrl && (
                <span className="flex items-center gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl}
                    alt="Aperçu photo"
                    className="size-9 rounded-full border border-slate-200 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => onPhotoChange(null)}
                    className="inline-flex size-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    aria-label="Retirer la photo"
                  >
                    <IconTrash className="size-3.5" />
                  </button>
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Filtres Style / Catégorie / Profession */}
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <select
          value={styleFilter}
          onChange={(e) => setStyleFilter(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-navy outline-none focus:border-navy/40"
        >
          <option value="all">Style : Tous</option>
          {styles.map((s) => (
            <option key={s} value={s}>
              Style : {s}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-navy outline-none focus:border-navy/40"
        >
          <option value="all">Catégorie : Toutes</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={professionFilter}
          onChange={(e) => setProfessionFilter(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-navy outline-none focus:border-navy/40"
        >
          <option value="all">Profession : Toutes</option>
          {professions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {detectedJobTitle && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-slate-500">
          <IconSparkles className="size-3.5 text-gold" />
          Métier détecté dans votre CV :{" "}
          <span className="font-semibold text-navy">{detectedJobTitle}</span>
        </p>
      )}

      {/* Cartes de templates */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {visible.map((template) => {
          const active = template.id === selected;
          const isRecommended = template.id === recommendedId;
          return (
            <button
              key={template.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(template.id)}
              className={cx(
                "group relative rounded-xl border p-2.5 text-left transition-all disabled:opacity-60",
                active
                  ? "border-navy bg-navy/5 shadow-md ring-2 ring-gold/60"
                  : "border-slate-200 bg-white hover:border-navy/40 hover:shadow-sm"
              )}
            >
              {isRecommended && (
                <span className="absolute -top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-navy shadow">
                  <IconCheck className="size-3" />
                  Recommandé pour votre profil
                </span>
              )}
              {active && (
                <span className="absolute -top-2 right-2 z-10 inline-flex size-5 items-center justify-center rounded-full bg-navy text-white shadow">
                  <IconCheck className="size-3" />
                </span>
              )}
              <MiniPreview id={template.id} active={active} />
              <p className="mt-2 text-sm font-bold text-navy">{template.name}</p>
              <p className="text-[11px] font-medium text-gold">{template.style}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">
                {template.category}
              </p>
            </button>
          );
        })}
        {visible.length === 0 && (
          <p className="col-span-full rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
            Aucun template ne correspond à ces filtres — réinitialisez-les.
          </p>
        )}
      </div>
    </section>
  );
}