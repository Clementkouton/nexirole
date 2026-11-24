"use client";

/* ==================================================================
   NexiRole — Bibliothèque de CV (/dashboard/cv-builder)
   Hub du créateur, harmonisé sur le design system de la page
   Négociation (en-tête badge navy/or + bouton principal, 4 cartes
   KPI, liste épurée avec barre d'actions contextuelle) :

   - Bouton « Générer / Créer un CV » : POST /api/cv puis redirection
     vers /dashboard/cv-builder/createur?cv=<id> (flux inchangé) ;
   - 4 KPIs (calculs du GET /api/cv) : CV au total, CV publiés en
     ligne, Vues totales, Corbeille ;
   - Liste « Mes CV » avec barre d'actions : Voir l'aperçu (modale,
     GET /api/cv/[id] + rendu des sections du data JSON), Renommer
     (PATCH /api/cv/[id]), Éditer dans le studio (lien createur),
     Télécharger PDF (/api/public-cv/pdf?cv=<id>), Publier / Partager
     le lien public /u/<slug> (publication existante via
     /api/public-cv/builder + copie presse-papier + toast), Mettre à
     la corbeille (DELETE /api/cv/[id], soft delete 30 jours) ;
   - Corbeille : restauration (POST /api/cv/[id]/restore) et purge
     définitive (DELETE /api/cv/[id]/purge), purge automatique côté
     GET /api/cv.

   Publication : réutilise /api/public-cv/builder (payload identique
   au bouton « Publier » du créateur) puis met à jour les drapeaux.
   Icônes : exclusivement @tabler/icons-react. Charte : navy #051937
   + or #FFC107.
   ================================================================== */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  IconBriefcase,
  IconCalendarEvent,
  IconEdit,
  IconEye,
  IconFileTypePdf,
  IconFileText,
  IconLanguage,
  IconLink,
  IconLoader2,
  IconMail,
  IconMapPin,
  IconPencil,
  IconPhone,
  IconPlus,
  IconRestore,
  IconSchool,
  IconShare,
  IconTrash,
  IconUser,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { buildPublishPayload } from "@/lib/cv-publish-payload";

interface CvRow {
  id: string;
  name: string;
  isPublic: boolean;
  publishedSlug: string | null;
  views: number;
  updatedAt: string;
}

interface TrashRow {
  id: string;
  name: string;
  trashedAt: string | null;
  purgeAt: string | null;
}

interface Stats {
  total: number;
  publies: number;
  corbeille: number;
  vues: number;
}

/* Aperçu simplifié : sections principales du JSON « data » du CV. */
interface ApercuData {
  personal: {
    fullName: string;
    title: string;
    email: string;
    phone: string;
    location: string;
    linkedin: string;
  };
  summary: string;
  experiences: Array<{
    role: string;
    company: string;
    period: string;
    location: string;
    achievements: string[];
  }>;
  education: Array<{ degree: string; school: string; period: string }>;
  skills: string[];
  languages: Array<{ name: string; level: string }>;
}

const STATS_VIDES: Stats = { total: 0, publies: 0, corbeille: 0, vues: 0 };

/* ── Aides réseau & formatage (style page négociation) ───────────── */

/** Extrait le message d'erreur renvoyé par une route API (JSON attendu). */
async function lireErreur(res: Response, fallback: string): Promise<string> {
  let brut = "";
  try {
    brut = await res.text();
  } catch {
    return fallback;
  }
  try {
    const data = JSON.parse(brut) as { error?: string; diagnostic?: string };
    const base = data.error || fallback;
    return data.diagnostic ? `${base} [Détail : ${data.diagnostic}]` : base;
  } catch {
    return `${fallback} (réponse non JSON — regarde le terminal « npm run dev »)`;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function joursAvantPurge(purgeAt: string | null): number | null {
  if (!purgeAt) return null;
  const date = new Date(purgeAt);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(1, Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

async function copierTexte(texte: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texte);
      return true;
    }
  } catch {
    /* repli ci-dessous */
  }
  try {
    const area = document.createElement("textarea");
    area.value = texte;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    return true;
  } catch {
    return false;
  }
}

/** Normalise défensivement le JSON « data » stocké pour l'aperçu. */
function normaliserApercu(brut: unknown): ApercuData {
  const src =
    brut && typeof brut === "object" && !Array.isArray(brut)
      ? (brut as Record<string, unknown>)
      : {};
  const personalSrc =
    src.personal && typeof src.personal === "object" && !Array.isArray(src.personal)
      ? (src.personal as Record<string, unknown>)
      : {};
  const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const arr = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? (v as Record<string, unknown>[]) : [];

  return {
    personal: {
      fullName: txt(personalSrc.fullName),
      title: txt(personalSrc.title),
      email: txt(personalSrc.email),
      phone: txt(personalSrc.phone),
      location: txt(personalSrc.location),
      linkedin: txt(personalSrc.linkedin),
    },
    summary: txt(src.summary),
    experiences: arr(src.experiences)
      .map((e) => ({
        role: txt(e.role),
        company: txt(e.company),
        period: txt(e.period),
        location: txt(e.location),
        achievements: (Array.isArray(e.achievements) ? e.achievements : [])
          .map(txt)
          .filter(Boolean),
      }))
      .filter((e) => e.role !== "" || e.company !== "" || e.achievements.length > 0),
    education: arr(src.education)
      .map((e) => ({ degree: txt(e.degree), school: txt(e.school), period: txt(e.period) }))
      .filter((e) => e.degree !== "" || e.school !== ""),
    skills: (Array.isArray(src.skills) ? src.skills : []).map(txt).filter(Boolean),
    languages: arr(src.languages)
      .map((l) => ({ name: txt(l.name), level: txt(l.level) }))
      .filter((l) => l.name !== ""),
  };
}

export default function CvLibraryPage() {
  const [loading, setLoading] = useState(true);
  const [cvs, setCvs] = useState<CvRow[]>([]);
  const [corbeille, setCorbeille] = useState<TrashRow[]>([]);
  const [stats, setStats] = useState<Stats>(STATS_VIDES);
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmTrash, setConfirmTrash] = useState<CvRow | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<TrashRow | null>(null);
  const [apercu, setApercu] = useState<{ cvId: string; name: string; data: ApercuData } | null>(
    null
  );
  const [apercuEnCours, setApercuEnCours] = useState(false);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cv", { cache: "no-store" });
      if (!res.ok) {
        toast.error(await lireErreur(res, "Chargement de la bibliothèque impossible."));
        return;
      }
      const json = (await res.json().catch(() => null)) as
        | { cvs?: CvRow[]; corbeille?: TrashRow[]; stats?: Stats }
        | null;
      if (!json) {
        toast.error("Chargement de la bibliothèque impossible.");
        return;
      }
      setCvs(Array.isArray(json.cvs) ? json.cvs : []);
      setCorbeille(Array.isArray(json.corbeille) ? json.corbeille : []);
      setStats({ ...STATS_VIDES, ...(json.stats ?? {}) });
    } catch {
      toast.error("Serveur injoignable. Réessayez.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  /* ── Générer / Créer un CV (flux inchangé) ── */
  async function creerCv() {
    setBusy("__nouveau__");
    try {
      const res = await fetch("/api/cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        toast.error(await lireErreur(res, "Création du CV impossible."));
        return;
      }
      const json = (await res.json().catch(() => null)) as
        | { cv?: { id?: string } }
        | null;
      const id = json?.cv?.id;
      if (!id) {
        toast.error("Création du CV impossible.");
        return;
      }
      toast.success("Nouveau CV créé. Direction le créateur !");
      window.location.href = `/dashboard/cv-builder/createur?cv=${id}`;
    } catch {
      toast.error("Serveur injoignable. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  /* ── Aperçu : GET /api/cv/[id] + rendu simple dans une modale ── */
  async function ouvrirApercu(cv: CvRow) {
    setApercuEnCours(true);
    try {
      const res = await fetch(`/api/cv/${cv.id}`, { cache: "no-store" });
      if (!res.ok) {
        toast.error(await lireErreur(res, "Impossible de charger l'aperçu du CV."));
        return;
      }
      const json = (await res.json().catch(() => null)) as
        | { cv?: { data?: unknown } }
        | null;
      if (!json?.cv || json.cv.data === undefined) {
        toast.error("Aperçu indisponible pour ce CV.");
        return;
      }
      setApercu({ cvId: cv.id, name: cv.name, data: normaliserApercu(json.cv.data) });
    } catch {
      toast.error("Serveur injoignable. Réessayez.");
    } finally {
      setApercuEnCours(false);
    }
  }

  /* ── Publier en ligne (payload identique au bouton Publier du créateur) ── */
  /* Retourne le slug public en cas de succès (pour le partage du lien). */
  async function publier(cv: CvRow): Promise<string | null> {
    setBusy(cv.id);
    try {
      const resCv = await fetch(`/api/cv/${cv.id}`, { cache: "no-store" });
      if (!resCv.ok) {
        toast.error(await lireErreur(resCv, "Impossible de charger le contenu du CV."));
        return null;
      }
      const jsonCv = (await resCv.json().catch(() => null)) as
        | { cv?: { data?: unknown; design?: unknown; publishedSlug?: string | null } }
        | null;
      const cvFull = jsonCv?.cv;
      if (!cvFull) {
        toast.error("Impossible de charger le contenu du CV.");
        return null;
      }
      const payload = buildPublishPayload({
        data: cvFull.data,
        design: cvFull.design,
        slug: cvFull.publishedSlug ?? cv.publishedSlug,
      });
      const res = await fetch("/api/public-cv/builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as
        | { publicResume?: { slug?: string }; error?: string }
        | null;
      const slug = json?.publicResume?.slug;
      if (!res.ok || !slug) {
        toast.error(json?.error ?? "Publication en ligne impossible.");
        return null;
      }
      await fetch(`/api/cv/${cv.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: true, publishedSlug: slug }),
      });
      toast.success(`CV publié en ligne : /u/${slug}`);
      await charger();
      return slug;
    } catch {
      toast.error("Serveur injoignable. Réessayez.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  /* ── Copier le lien public ── */
  async function copierLien(cv: CvRow) {
    if (!cv.publishedSlug) {
      toast.error("Publiez d'abord ce CV en ligne pour obtenir son lien.");
      return;
    }
    const url = `${window.location.origin}/u/${cv.publishedSlug}`;
    const ok = await copierTexte(url);
    if (ok) toast.success("Lien public copié !");
    else toast.error(`Copie impossible — copiez manuellement : ${url}`);
  }

  /* ── Publier / Partager : publie si besoin puis copie le lien /u/<slug> ── */
  async function partager(cv: CvRow) {
    if (cv.isPublic && cv.publishedSlug) {
      await copierLien(cv);
      return;
    }
    const slug = await publier(cv);
    if (!slug) return;
    const url = `${window.location.origin}/u/${slug}`;
    const ok = await copierTexte(url);
    if (ok) toast.success(`Lien public copié : /u/${slug}`);
    else toast.error(`Publication réussie — copie impossible : ${url}`);
  }

  /* ── Renommer ── */
  async function validerRenommage() {
    if (!renaming) return;
    const name = renaming.name.trim();
    if (name === "") {
      toast.error("Le nom du CV ne peut pas être vide.");
      return;
    }
    setBusy(renaming.id);
    try {
      const res = await fetch(`/api/cv/${renaming.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        toast.error(await lireErreur(res, "Renommage impossible."));
        return;
      }
      toast.success("CV renommé.");
      setRenaming(null);
      await charger();
    } catch {
      toast.error("Serveur injoignable. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  /* ── Corbeille (dépublication + 30 jours) ── */
  async function mettreCorbeille(cv: CvRow) {
    setBusy(cv.id);
    try {
      const res = await fetch(`/api/cv/${cv.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(await lireErreur(res, "Mise à la corbeille impossible."));
        return;
      }
      toast.success("CV dépublié et envoyé dans la corbeille (30 jours).");
      setConfirmTrash(null);
      await charger();
    } catch {
      toast.error("Serveur injoignable. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  /* ── Restauration ── */
  async function restaurer(row: TrashRow) {
    setBusy(row.id);
    try {
      const res = await fetch(`/api/cv/${row.id}/restore`, { method: "POST" });
      if (!res.ok) {
        toast.error(await lireErreur(res, "Restauration impossible."));
        return;
      }
      toast.success("CV restauré dans votre bibliothèque.");
      await charger();
    } catch {
      toast.error("Serveur injoignable. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  /* ── Suppression définitive ── */
  async function purger(row: TrashRow) {
    setBusy(row.id);
    try {
      const res = await fetch(`/api/cv/${row.id}/purge`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(await lireErreur(res, "Suppression définitive impossible."));
        return;
      }
      toast.success("CV supprimé définitivement.");
      setConfirmPurge(null);
      await charger();
    } catch {
      toast.error("Serveur injoignable. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  const apercuVide = apercu
    ? !apercu.data.personal.fullName &&
      !apercu.data.summary &&
      apercu.data.experiences.length === 0 &&
      apercu.data.education.length === 0 &&
      apercu.data.skills.length === 0 &&
      apercu.data.languages.length === 0
    : false;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* ── En-tête + bouton principal ─────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#051937] text-[#FFC107]">
            <IconFileText size={24} stroke={1.8} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#051937]">
              Bibliothèque de CV
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Créez, modifiez et publiez vos CV — chaque modification dans le créateur est
              enregistrée automatiquement dans la base de données.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={creerCv}
          disabled={busy === "__nouveau__"}
          className="inline-flex items-center gap-2 rounded-xl bg-[#051937] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b2a5b] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "__nouveau__" ? (
            <IconLoader2 size={18} className="animate-spin" />
          ) : (
            <IconPlus size={18} />
          )}
          Générer / Créer un CV
        </button>
      </div>

      {/* ── 4 cartes KPIs ──────────────────────────────────────────── */}
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <IconFileText size={20} className="text-[#051937]" />
            <span className="text-xs font-semibold uppercase tracking-wide">CV au total</span>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-[#051937]">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <IconWorld size={20} className="text-[#051937]" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              CV publiés en ligne
            </span>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-[#051937]">{stats.publies}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <IconEye size={20} className="text-[#051937]" />
            <span className="text-xs font-semibold uppercase tracking-wide">Vues totales</span>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-[#051937]">{stats.vues}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <IconTrash size={20} className="text-[#051937]" />
            <span className="text-xs font-semibold uppercase tracking-wide">Corbeille</span>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-[#051937]">{stats.corbeille}</p>
        </div>
      </section>

      {/* ── Liste « Mes CV » ───────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#051937]">
          Mes CV
          {cvs.length > 0 ? (
            <span className="ml-2 text-sm font-normal text-slate-400">({cvs.length})</span>
          ) : null}
        </h2>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
            <IconLoader2 size={18} className="animate-spin" />
            Chargement de la bibliothèque…
          </div>
        ) : cvs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
            <IconFileText className="mx-auto size-8 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">
              Aucun CV pour le moment. Cliquez sur « Générer / Créer un CV » pour commencer :
              votre CV en cours dans le créateur sera automatiquement enregistré dans la
              bibliothèque.
            </p>
            <button
              type="button"
              onClick={creerCv}
              disabled={busy === "__nouveau__"}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#051937] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b2a5b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <IconPlus size={18} />
              Générer / Créer un CV
            </button>
          </div>
        ) : (
          cvs.map((cv) => (
            <div
              key={cv.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold text-[#051937]">{cv.name}</h3>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <IconCalendarEvent size={13} />
                    Modifié le {formatDate(cv.updatedAt)}
                  </span>
                  {cv.views > 0 ? <span>{cv.views} vue(s)</span> : null}
                  {cv.isPublic && cv.publishedSlug ? (
                    <a
                      href={`/u/${cv.publishedSlug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-[#051937] underline decoration-[#FFC107] decoration-2 underline-offset-2 transition-colors hover:text-[#0b2a5b]"
                    >
                      <IconWorld size={13} />
                      /u/{cv.publishedSlug}
                    </a>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {cv.isPublic && cv.publishedSlug ? (
                  <span className="rounded-lg bg-[#FFC107]/15 px-3 py-1.5 text-sm font-bold text-[#051937]">
                    Publié
                  </span>
                ) : (
                  <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-500">
                    Brouillon
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void ouvrirApercu(cv)}
                    disabled={apercuEnCours}
                    title="Voir l'aperçu"
                    aria-label="Voir l'aperçu"
                    className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {apercuEnCours ? (
                      <IconLoader2 size={18} className="animate-spin" />
                    ) : (
                      <IconEye size={18} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenaming({ id: cv.id, name: cv.name })}
                    title="Renommer"
                    aria-label="Renommer"
                    className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5"
                  >
                    <IconPencil size={18} />
                  </button>
                  <a
                    href={`/dashboard/cv-builder/createur?cv=${cv.id}`}
                    title="Éditer dans le studio"
                    aria-label="Éditer dans le studio"
                    className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5"
                  >
                    <IconEdit size={18} />
                  </a>
                  <a
                    href={`/api/public-cv/pdf?cv=${cv.id}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Télécharger le PDF"
                    aria-label="Télécharger le PDF"
                    className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5"
                  >
                    <IconFileTypePdf size={18} />
                  </a>
                  <button
                    type="button"
                    onClick={() => void partager(cv)}
                    disabled={busy === cv.id}
                    title={
                      cv.isPublic && cv.publishedSlug
                        ? "Copier le lien public (/u/…)"
                        : "Publier en ligne et copier le lien public"
                    }
                    aria-label={
                      cv.isPublic && cv.publishedSlug
                        ? "Copier le lien public"
                        : "Publier en ligne et copier le lien public"
                    }
                    className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === cv.id ? (
                      <IconLoader2 size={18} className="animate-spin" />
                    ) : (
                      <IconShare size={18} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmTrash(cv)}
                    title="Mettre à la corbeille"
                    aria-label="Mettre à la corbeille"
                    className="rounded-lg border border-red-200 p-2 text-red-600 transition-colors hover:bg-red-50"
                  >
                    <IconTrash size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      {/* ── Corbeille (30 jours) ───────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[#051937]">
            Corbeille
            {corbeille.length > 0 ? (
              <span className="ml-2 text-sm font-normal text-slate-400">
                ({corbeille.length})
              </span>
            ) : null}
          </h2>
          <p className="text-xs text-slate-400">
            Les CV supprimés sont dépubliés puis conservés 30 jours avant suppression
            définitive.
          </p>
        </div>

        {corbeille.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-sm text-slate-500">
            La corbeille est vide.
          </div>
        ) : (
          corbeille.map((row) => {
            const jours = joursAvantPurge(row.purgeAt);
            return (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-[#051937]">{row.name}</h3>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <IconCalendarEvent size={13} />
                      Supprimé le {formatDate(row.trashedAt)}
                    </span>
                    {jours !== null ? (
                      <span>Suppression définitive dans {jours} jour(s)</span>
                    ) : null}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void restaurer(row)}
                    disabled={busy === row.id}
                    title="Restaurer dans la bibliothèque"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-[#051937] transition-colors hover:bg-[#051937]/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === row.id ? (
                      <IconLoader2 size={16} className="animate-spin" />
                    ) : (
                      <IconRestore size={16} />
                    )}
                    Restaurer
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmPurge(row)}
                    title="Purger définitivement"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
                  >
                    <IconTrash size={16} />
                    Purger définitivement
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* ── Modale : aperçu du CV ──────────────────────────────────── */}
      {apercu ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-[#051937]">
                  {apercu.name}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">Aperçu du contenu enregistré</p>
              </div>
              <button
                type="button"
                onClick={() => setApercu(null)}
                className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100"
                aria-label="Fermer"
              >
                <IconX size={18} />
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {apercuVide ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-sm text-slate-500">
                  Ce CV est encore vide — ouvrez le studio pour le remplir.
                </p>
              ) : (
                <>
                  <section>
                    {apercu.data.personal.fullName ? (
                      <p className="text-lg font-bold text-[#051937]">
                        {apercu.data.personal.fullName}
                      </p>
                    ) : null}
                    {apercu.data.personal.title ? (
                      <p className="text-sm font-medium text-slate-600">
                        {apercu.data.personal.title}
                      </p>
                    ) : null}
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      {apercu.data.personal.email ? (
                        <span className="inline-flex items-center gap-1">
                          <IconMail size={13} />
                          {apercu.data.personal.email}
                        </span>
                      ) : null}
                      {apercu.data.personal.phone ? (
                        <span className="inline-flex items-center gap-1">
                          <IconPhone size={13} />
                          {apercu.data.personal.phone}
                        </span>
                      ) : null}
                      {apercu.data.personal.location ? (
                        <span className="inline-flex items-center gap-1">
                          <IconMapPin size={13} />
                          {apercu.data.personal.location}
                        </span>
                      ) : null}
                      {apercu.data.personal.linkedin ? (
                        <span className="inline-flex items-center gap-1">
                          <IconLink size={13} />
                          {apercu.data.personal.linkedin}
                        </span>
                      ) : null}
                    </p>
                  </section>

                  {apercu.data.summary ? (
                    <section>
                      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <IconUser size={14} className="text-[#051937]" />
                        Résumé
                      </h4>
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                        {apercu.data.summary}
                      </p>
                    </section>
                  ) : null}

                  {apercu.data.experiences.length > 0 ? (
                    <section>
                      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <IconBriefcase size={14} className="text-[#051937]" />
                        Expériences
                      </h4>
                      <div className="mt-2 space-y-3">
                        {apercu.data.experiences.map((exp, i) => (
                          <div key={i} className="rounded-xl border border-slate-200 p-3">
                            <p className="text-sm font-semibold text-[#051937]">
                              {exp.role || "Poste non renseigné"}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {[exp.company, exp.period, exp.location]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </p>
                            {exp.achievements.length > 0 ? (
                              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-600">
                                {exp.achievements.map((a, j) => (
                                  <li key={j}>{a}</li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {apercu.data.education.length > 0 ? (
                    <section>
                      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <IconSchool size={14} className="text-[#051937]" />
                        Formations
                      </h4>
                      <ul className="mt-2 space-y-1.5">
                        {apercu.data.education.map((edu, i) => (
                          <li key={i} className="text-sm text-slate-600">
                            <span className="font-semibold text-[#051937]">{edu.degree}</span>
                            {edu.school ? ` — ${edu.school}` : ""}
                            {edu.period ? (
                              <span className="text-xs text-slate-500"> · {edu.period}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {apercu.data.skills.length > 0 ? (
                    <section>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Compétences
                      </h4>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {apercu.data.skills.map((s, i) => (
                          <span
                            key={i}
                            className="rounded-lg bg-[#FFC107]/15 px-2.5 py-1 text-xs font-semibold text-[#051937]"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {apercu.data.languages.length > 0 ? (
                    <section>
                      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <IconLanguage size={14} className="text-[#051937]" />
                        Langues
                      </h4>
                      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                        {apercu.data.languages.map((l, i) => (
                          <li key={i}>{l.level ? `${l.name} — ${l.level}` : l.name}</li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <a
                href={`/dashboard/cv-builder/createur?cv=${apercu.cvId}`}
                className="inline-flex items-center gap-2 rounded-xl bg-[#051937] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b2a5b]"
              >
                <IconEdit size={16} />
                Éditer dans le studio
              </a>
              <button
                type="button"
                onClick={() => setApercu(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Modale : renommage ─────────────────────────────────────── */}
      {renaming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#051937]">Renommer le CV</h3>
              <button
                type="button"
                onClick={() => setRenaming(null)}
                className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100"
                aria-label="Fermer"
              >
                <IconX size={18} />
              </button>
            </div>
            <input
              type="text"
              value={renaming.name}
              onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
              maxLength={120}
              className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-[#051937] outline-none focus:border-[#FFC107]"
              placeholder="Nom du CV"
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenaming(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void validerRenommage()}
                disabled={busy === renaming.id}
                className="inline-flex items-center gap-2 rounded-lg bg-[#051937] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b2a5b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === renaming.id ? (
                  <IconLoader2 size={16} className="animate-spin" />
                ) : null}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Modale : confirmation mise à la corbeille ──────────────── */}
      {confirmTrash ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-[#051937]">
              Mettre « {confirmTrash.name} » à la corbeille ?
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Le CV sera dépublié immédiatement (son lien public ne sera plus accessible) et
              conservé 30 jours dans la corbeille. Vous pourrez le restaurer pendant cette
              période.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmTrash(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void mettreCorbeille(confirmTrash)}
                disabled={busy === confirmTrash.id}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === confirmTrash.id ? (
                  <IconLoader2 size={16} className="animate-spin" />
                ) : (
                  <IconTrash size={16} />
                )}
                Mettre à la corbeille
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Modale : confirmation purge définitive ─────────────────── */}
      {confirmPurge ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-[#051937]">
              Supprimer définitivement « {confirmPurge.name} » ?
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Cette action est irréversible : le CV sera supprimé de la base de données sans
              possibilité de restauration.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmPurge(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void purger(confirmPurge)}
                disabled={busy === confirmPurge.id}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === confirmPurge.id ? (
                  <IconLoader2 size={16} className="animate-spin" />
                ) : (
                  <IconTrash size={16} />
                )}
                Purger définitivement
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
