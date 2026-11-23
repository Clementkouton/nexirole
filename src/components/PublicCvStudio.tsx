"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconUpload, IconTrash, IconCopy, IconCheck, IconEye, IconQrcode, IconWorld,
  IconLink, IconLoader2, IconPalette, IconExternalLink, IconAlertTriangle, IconLock, IconPhoto,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { IconCircleCheck } from "@tabler/icons-react";

const WEB_TEMPLATES: { id: string; label: string }[] = [
  { id: "classique", label: "Classique Navy" },
  { id: "moderne", label: "Moderne Sidebar" },
  { id: "executif", label: "Exécutif Or" },
  { id: "minimal", label: "Minimalisme" },
  { id: "colonne", label: "Double Colonne" },
  { id: "timeline", label: "Frise Chrono" },
  { id: "compact", label: "Compact ATS" },
];
const QR_TEMPLATES: { id: string; label: string }[] = [
  { id: "executif", label: "QR Exécutif" },
  { id: "moderne", label: "QR Moderne" },
  { id: "classique", label: "QR Classique" },
  { id: "minimal", label: "QR Minimal" },
  { id: "compact", label: "QR Compact" },
];
const ACCENTS = ["#FFC107", "#051937", "#0F4C81", "#059669", "#7C3AED", "#DC2626", "#EA580C", "#0891B2", "#4F46E5", "#DB2777"];

type PublicRow = { slug: string; isPublic: boolean; viewsCount: number; cvData: unknown } | null;

function asRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function sniffCvFromLocalStorage(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  try {
    let best: Record<string, unknown> | null = null;
    let bestScore = 0;
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw || raw.length < 20) continue;
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { continue; }
      let obj = asRec(parsed);
      if (!obj) continue;
      if (asRec(obj.cv)) obj = asRec(obj.cv) as Record<string, unknown>;
      let score = 0;
      const haystack = (Object.keys(obj).join(" ") + " " + key).toLowerCase();
      if (/cv|resume|candidat|profil/.test(haystack)) score += 2;
      if (obj.personal || obj.fullName || obj.name || obj.firstName) score += 2;
      if (Array.isArray(obj.experiences) || Array.isArray(obj.experience) || Array.isArray(obj.educations) || Array.isArray(obj.education)) score += 2;
      if (score > bestScore) { bestScore = score; best = obj; }
    }
    return bestScore >= 3 ? best : null;
  } catch { return null; }
}

function resizeImage(file: File, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("canvas")); return; }
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function WebThumb({ id, accent }: { id: string; accent: string }) {
  const bar = (w: string, c?: string) => <div className="h-1 rounded-full" style={{ width: w, backgroundColor: c ?? "#CBD5E1" }} />;
  if (id === "moderne") return <div className="flex h-14 w-12 overflow-hidden rounded border border-slate-200 bg-white"><div className="w-4 shrink-0" style={{ backgroundColor: "#051937" }} /><div className="flex flex-1 flex-col gap-1 p-1">{bar("90%", accent)}{bar("70%")}{bar("85%")}{bar("60%")}</div></div>;
  if (id === "colonne") return <div className="flex h-14 w-12 overflow-hidden rounded border border-slate-200 bg-white"><div className="flex flex-1 flex-col gap-1 p-1">{bar("90%", accent)}{bar("80%")}{bar("70%")}</div><div className="flex flex-1 flex-col gap-1 p-1">{bar("80%")}{bar("90%")}{bar("60%")}</div></div>;
  if (id === "executif") return <div className="h-14 w-12 overflow-hidden rounded border border-slate-200 bg-white"><div className="h-4 shrink-0" style={{ backgroundColor: "#051937" }} /><div className="flex flex-col gap-1 p-1">{bar("95%", accent)}{bar("80%")}{bar("70%")}{bar("85%")}</div></div>;
  if (id === "minimal") return <div className="h-14 w-12 rounded border border-slate-200 bg-white p-1.5"><div className="mb-1 h-1.5 w-8 rounded" style={{ backgroundColor: accent }} />{bar("70%")}{bar("90%")}{bar("60%")}{bar("80%")}</div>;
  if (id === "timeline") return <div className="h-14 w-12 rounded border border-slate-200 bg-white p-1.5"><div className="ml-1 border-l-2 pl-1.5" style={{ borderColor: accent }}>{bar("80%")}{bar("60%")}</div><div className="mt-1 ml-1 border-l-2 pl-1.5" style={{ borderColor: accent }}>{bar("75%")}{bar("55%")}</div></div>;
  if (id === "compact") return <div className="h-14 w-12 overflow-hidden rounded border border-slate-200 bg-white"><div className="h-2.5 shrink-0" style={{ backgroundColor: "#051937" }} /><div className="flex flex-col gap-1 p-1">{bar("95%")}{bar("85%")}{bar("90%")}{bar("75%")}{bar("80%")}</div></div>;
  return <div className="h-14 w-12 overflow-hidden rounded border border-slate-200 bg-white"><div className="h-4 shrink-0" style={{ backgroundColor: "#051937" }} /><div className="mx-auto mt-1 h-1 w-6 rounded" style={{ backgroundColor: accent }} /><div className="flex flex-col gap-1 p-1.5">{bar("90%")}{bar("75%")}{bar("85%")}</div></div>;
}

function QrThumb({ label }: { label: string }) {
  const cells = [3, 7, 11, 15, 19, 6, 14, 18, 22, 9, 12, 17, 20, 25];
  return (
    <div className="flex h-12 w-12 flex-col items-center justify-center rounded border border-slate-200 bg-white p-1">
      <div className="grid grid-cols-5 gap-[1px]">
        {Array.from({ length: 25 }).map((_, i) => (
          <div key={i} className="h-1.5 w-1.5 rounded-[1px]" style={{ backgroundColor: cells.includes(i) ? "#051937" : "#E2E8F0" }} />
        ))}
      </div>
      <span className="mt-0.5 text-[7px] leading-none text-slate-400">{label}</span>
    </div>
  );
}

export function PublicCvStudio({ cvData }: { cvData?: unknown }) {
  const [row, setRow] = useState<PublicRow>(null);
  const [photo, setPhoto] = useState<string>("");
  const [webTpl, setWebTpl] = useState("classique");
  const [qrTpl, setQrTpl] = useState("executif");
  const [accent, setAccent] = useState("#FFC107");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const [tableMissing, setTableMissing] = useState(false);
  const [dataFound, setDataFound] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();


  const applyRow = useCallback((r: Record<string, unknown>) => {
    setRow({
      slug: typeof r.slug === "string" ? r.slug : "",
      isPublic: r.isPublic === true,
      viewsCount: Number(r.viewsCount ?? 0),
      cvData: r.cvData ?? {},
    });
    const theme = asRec(asRec(r.cvData)?.theme) ?? {};
    if (typeof theme.webTemplate === "string" && theme.webTemplate) setWebTpl(theme.webTemplate);
    if (typeof theme.qrTemplate === "string" && theme.qrTemplate) setQrTpl(theme.qrTemplate);
    if (typeof theme.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(theme.accentColor)) setAccent(theme.accentColor);
    const cd = asRec(r.cvData) ?? {};
    const personal = asRec(cd.personal) ?? {};
    const p = typeof personal.photo === "string" ? personal.photo : (typeof cd.photo === "string" ? cd.photo : "");
    if (p.startsWith("data:image")) setPhoto(p);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/public-cv", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { publicResume?: unknown; code?: string; error?: string } | null;
      if (data?.code === "P2021" || (res.status === 503 && data?.code === "P2021")) { setTableMissing(true); return; }
      const r = asRec(data?.publicResume);
      if (r && typeof r.slug === "string" && r.slug) { applyRow(r); setDataFound(true); return; }
    } catch { /* silencieux */ }
    if (cvData !== undefined || sniffCvFromLocalStorage()) setDataFound(true);
  }, [applyRow, cvData]);

  useEffect(() => { void load(); }, [load]);

  async function handlePhoto(file: File) {
    setErr("");
    if (!file.type.startsWith("image/")) { setErr("Choisis une image (PNG ou JPG)."); return; }
    try { setPhoto(await resizeImage(file, 384)); }
    catch { setErr("Impossible de lire cette image."); }
  }

  function handleApiError(status: number, data: { error?: string; code?: string } | null) {
    if (data?.code === "P2021") { setTableMissing(true); return; }
    if (status === 401) { setErr("Session expirée — recharge la page."); return; }
    setErr(data?.error || `Erreur ${status}.`);
  }

  async function publish() {
    setBusy(true); setErr("");
    try {
      const base = asRec(cvData) ?? sniffCvFromLocalStorage() ?? asRec(row?.cvData) ?? {};
      const personal = asRec(base.personal) ?? {};
      const prevPhoto = typeof personal.photo === "string" ? personal.photo : (typeof base.photo === "string" ? base.photo : "");
      const merged: Record<string, unknown> = { ...base, personal: { ...personal, photo: photo || prevPhoto } };
      if (photo) merged.photo = photo;
      merged.theme = { webTemplate: webTpl, qrTemplate: qrTpl, accentColor: accent };
      const res = await fetch("/api/public-cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvData: merged, isPublic: true, templateId: webTpl }),
      });
      const data = (await res.json().catch(() => null)) as { publicResume?: Record<string, unknown>; error?: string; code?: string } | null;
      if (!res.ok) { handleApiError(res.status, data); return; }
      const r = asRec(data?.publicResume);
      if (r) applyRow(r);
      setDataFound(true);
    } catch { setErr("Publication impossible (réseau)."); }
    finally { setBusy(false); }
  }

  async function togglePublic() {
    if (!row?.slug) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/public-cv", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !row.isPublic }),
      });
      const data = (await res.json().catch(() => null)) as { publicResume?: Record<string, unknown>; error?: string; code?: string } | null;
      if (!res.ok) { handleApiError(res.status, data); return; }
      const r = asRec(data?.publicResume);
      if (r) applyRow(r);
    } catch { setErr("Action impossible (réseau)."); }
    finally { setBusy(false); }
  }

  async function copyLink() {
    if (!row?.slug || typeof window === "undefined") return;
    const url = `${window.location.origin}/u/${row.slug}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt("Copie ce lien :", url); }
  }

  const publicLink = row?.slug && typeof window !== "undefined" ? `${window.location.origin}/u/${row.slug}` : "";
  const pdfQrUrl = row?.slug ? `/api/public-cv/pdf?slug=${encodeURIComponent(row.slug)}` : "";

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-[#051937]">
        <IconWorld size={18} stroke={1.6} className="text-[#FFC107]" /> Lien Web Public &amp; QR Code
      </h2>
      <p className="mb-4 text-xs text-slate-500">Photo, modèle Web (7), modèle PDF&nbsp;QR (5) et couleurs — puis publie.</p>

      {tableMissing ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <IconAlertTriangle size={16} stroke={1.6} className="mt-0.5 shrink-0" />
          <span>Table <strong>PublicResume</strong> absente de la base. Exécute <code className="rounded bg-amber-100 px-1">publier-public-resume.ps1</code> puis recharge.</span>
        </div>
      ) : null}
      {!dataFound && !row ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
          Ouvre l&apos;étape 1 du créateur (ou remplis ton CV) : les données seront détectées automatiquement ici.
        </div>
      ) : null}

      {/* Photo */}
      <div className="mb-5">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600"><IconPhoto size={14} stroke={1.6} /> Photo de profil</p>
        <div className="flex items-center gap-3">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="Photo" className="h-16 w-16 rounded-full border-2 object-cover" style={{ borderColor: accent }} />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-slate-300"><IconPhoto size={22} stroke={1.5} /></div>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePhoto(f); e.target.value = ""; }} />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-[#051937] hover:bg-slate-50">
            <IconUpload size={14} stroke={1.6} /> {photo ? "Changer" : "Importer"}
          </button>
          {photo ? (
            <button type="button" onClick={() => setPhoto("")} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
              <IconTrash size={14} stroke={1.6} /> Retirer
            </button>
          ) : null}
        </div>
      </div>

      {/* Modèles Web */}
      <div className="mb-5">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600"><IconWorld size={14} stroke={1.6} /> Modèle Web public ({WEB_TEMPLATES.length})</p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {WEB_TEMPLATES.map((t) => (
            <button key={t.id} type="button" onClick={() => setWebTpl(t.id)}
              className={`flex flex-col items-center gap-1 rounded-lg p-1.5 text-center transition ${webTpl === t.id ? "ring-2" : "hover:bg-slate-50"}`}
              style={webTpl === t.id ? { boxShadow: `0 0 0 2px ${accent}` } : undefined}>
              <WebThumb id={t.id} accent={accent} />
              <span className="text-[10px] leading-tight text-slate-600">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Modèles QR PDF */}
      <div className="mb-5">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600"><IconQrcode size={14} stroke={1.6} /> Modèle PDF avec QR ({QR_TEMPLATES.length})</p>
        <div className="flex flex-wrap gap-2">
          {QR_TEMPLATES.map((t) => (
            <button key={t.id} type="button" onClick={() => setQrTpl(t.id)}
              className={`flex flex-col items-center gap-1 rounded-lg p-1.5 transition ${qrTpl === t.id ? "" : "hover:bg-slate-50"}`}
              style={qrTpl === t.id ? { boxShadow: `0 0 0 2px ${accent}` } : undefined}>
              <QrThumb label={t.label.replace("QR ", "")} />
              <span className="text-[10px] leading-tight text-slate-600">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Couleurs */}
      <div className="mb-5">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600"><IconPalette size={14} stroke={1.6} /> Couleur d&apos;accent</p>
        <div className="flex flex-wrap items-center gap-2">
          {ACCENTS.map((c) => (
            <button key={c} type="button" onClick={() => setAccent(c)} aria-label={c}
              className={`h-7 w-7 rounded-full border-2 transition ${accent === c ? "scale-110 border-[#051937]" : "border-white shadow"}`}
              style={{ backgroundColor: c }} />
          ))}
          <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-slate-300" aria-label="Couleur personnalisée" />
        </div>
      </div>

      {err ? <p className="mb-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{err}</p> : null}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void publish()} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-[#051937] shadow hover:brightness-95 disabled:opacity-60"
          style={{ backgroundColor: "#FFC107" }}>
          {busy ? <IconLoader2 size={16} stroke={1.6} className="animate-spin" /> : <IconLink size={16} stroke={1.6} />}
          {row?.slug ? "Mettre à jour la publication" : "Publier le CV en ligne"}
        </button>
        {row?.slug ? (
          <>
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span className="truncate">/u/{row.slug}</span>
              <button type="button" onClick={() => void copyLink()} className="text-[#051937] hover:text-[#FFC107]" aria-label="Copier le lien">
                {copied ? <IconCheck size={14} stroke={1.8} /> : <IconCopy size={14} stroke={1.6} />}
              </button>
            </span>
            <a href={`/u/${row.slug}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-[#051937] hover:bg-slate-50">
              <IconExternalLink size={14} stroke={1.6} /> Ouvrir
            </a>
            <a href={pdfQrUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-[#051937] hover:brightness-95"
              style={{ backgroundColor: "#FFC107" }}>
              <IconQrcode size={14} stroke={1.6} /> PDF (QR)
            </a>
            <button type="button" onClick={() => void togglePublic()} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">
              <IconLock size={14} stroke={1.6} /> {row.isPublic ? "Mettre en privé" : "Rendre public"}
            </button>
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <IconEye size={14} stroke={1.6} /> {row.viewsCount} vue(s) {row.isPublic ? "" : "· privé"}
            </span>
          </>
        ) : null}
        <button type="button" onClick={() => router.push("/dashboard")}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#051937] px-4 py-2 text-sm font-bold text-white hover:brightness-110">
          <IconCircleCheck size={16} stroke={1.6} /> Terminer
        </button>
      </div>
    </section>
  );
}

export default PublicCvStudio;