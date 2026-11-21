"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { toDataURL } from "qrcode";
import {
  IconAward,
  IconBriefcase,
  IconCheck,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconEye,
  IconEyeOff,
  IconFileText,
  IconLanguage,
  IconLink,
  IconLoader2,
  IconPlus,
  IconQrcode,
  IconRefresh,
  IconSchool,
  IconTrash,
  IconUpload,
  IconUser,
  IconWorld,
} from "@tabler/icons-react";
import CvPdfDocument, { type CvData } from "@/components/pdf/CvPdfDocument";

// ─────────────────────────────────────────────────────────────────────────────
// CV BUILDER — édition du CV structuré + publication du CV en ligne + QR PDF
// Brouillon conservé dans localStorage (« nexirole-cv-draft ») et synchronisé
// avec PublicResume via /api/public-cv (GET au chargement, POST à la publication).
// ─────────────────────────────────────────────────────────────────────────────

interface DraftExperience {
  poste: string;
  entreprise: string;
  periode: string;
  description: string;
}
interface DraftFormation {
  diplome: string;
  etablissement: string;
  periode: string;
}
interface DraftLangue {
  nom: string;
  niveau: string;
}
interface DraftCv {
  fullName: string;
  jobTitle: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  photoUrl: string;
  resume: string;
  experiences: DraftExperience[];
  formations: DraftFormation[];
  competencesTexte: string;
  langues: DraftLangue[];
  showQrOnPdf: boolean;
}
interface InfoPublique {
  slug: string;
  publicUrl: string;
  viewsCount: number;
  isPublic: boolean;
}

const DRAFT_VIDE: DraftCv = {
  fullName: "",
  jobTitle: "",
  email: "",
  phone: "",
  location: "",
  website: "",
  photoUrl: "",
  resume: "",
  experiences: [],
  formations: [],
  competencesTexte: "",
  langues: [],
  showQrOnPdf: true,
};

const CLE_BROUILLON = "nexirole-cv-draft";

function texte(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function objet(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function liste(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Reconstruit un brouillon depuis un cvData quelconque (localStorage ou serveur). */
function draftDepuisCvData(raw: unknown): DraftCv {
  const source = objet(raw) ?? {};
  const identite = objet(source.identite) ?? objet(source.identity);
  const competencesBrut = source.competences ?? source.skills;
  let competencesTexte = "";
  if (typeof competencesBrut === "string") {
    competencesTexte = competencesBrut;
  } else if (Array.isArray(competencesBrut)) {
    competencesTexte = competencesBrut
      .map((item) => {
        if (typeof item === "string") return item.trim();
        const entry = objet(item);
        if (!entry) return "";
        const nom = texte(entry.nom ?? entry.name ?? entry.label);
        const niveau = texte(entry.niveau ?? entry.level);
        return nom !== "" && niveau !== "" ? `${nom} (${niveau})` : nom;
      })
      .filter(Boolean)
      .join(", ");
  }
  const flagQr: unknown = source.showQrOnPdf;
  return {
    fullName: texte(identite?.fullName ?? identite?.nom ?? identite?.name),
    jobTitle: texte(identite?.jobTitle ?? identite?.titre ?? identite?.poste),
    email: texte(identite?.email),
    phone: texte(identite?.phone ?? identite?.telephone),
    location: texte(identite?.location ?? identite?.ville ?? identite?.adresse),
    website: texte(identite?.website ?? identite?.siteWeb),
    photoUrl: texte(identite?.photoUrl ?? identite?.photo),
    resume: texte(source.resume ?? source["résumé"] ?? source.summary ?? source.profil),
    experiences: liste(source.experiences ?? source.experience)
      .map((item) => {
        const entry = objet(item);
        return {
          poste: texte(entry?.poste ?? entry?.titre ?? entry?.title),
          entreprise: texte(entry?.entreprise ?? entry?.company),
          periode: texte(entry?.periode ?? entry?.dates ?? entry?.period),
          description: texte(entry?.description ?? entry?.details),
        };
      })
      .filter((item) => item.poste !== "" || item.entreprise !== "" || item.description !== ""),
    formations: liste(source.formations ?? source.education)
      .map((item) => {
        const entry = objet(item);
        return {
          diplome: texte(entry?.diplome ?? entry?.titre ?? entry?.degree),
          etablissement: texte(entry?.etablissement ?? entry?.school ?? entry?.ecole),
          periode: texte(entry?.periode ?? entry?.dates ?? entry?.period),
        };
      })
      .filter((item) => item.diplome !== "" || item.etablissement !== ""),
    competencesTexte,
    langues: liste(source.langues ?? source.languages)
      .map((item) => {
        if (typeof item === "string") {
          const parts = item.split(/[:\-–—]/);
          return { nom: (parts[0] ?? "").trim(), niveau: (parts[1] ?? "").trim() };
        }
        const entry = objet(item);
        return {
          nom: texte(entry?.nom ?? entry?.name ?? entry?.langue),
          niveau: texte(entry?.niveau ?? entry?.level),
        };
      })
      .filter((item) => item.nom !== ""),
    showQrOnPdf: typeof flagQr === "boolean" ? flagQr : true,
  };
}

/** Construit le cvData canonique envoyé à l'API et au composant PDF. */
function buildCvData(draft: DraftCv): CvData {
  return {
    identite: {
      fullName: draft.fullName.trim(),
      jobTitle: draft.jobTitle.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      location: draft.location.trim(),
      website: draft.website.trim(),
      photoUrl: draft.photoUrl.trim(),
    },
    resume: draft.resume.trim(),
    experiences: draft.experiences
      .map((item) => ({
        poste: item.poste.trim(),
        entreprise: item.entreprise.trim(),
        periode: item.periode.trim(),
        description: item.description.trim(),
      }))
      .filter((item) => item.poste !== "" || item.entreprise !== "" || item.description !== ""),
    formations: draft.formations
      .map((item) => ({
        diplome: item.diplome.trim(),
        etablissement: item.etablissement.trim(),
        periode: item.periode.trim(),
      }))
      .filter((item) => item.diplome !== "" || item.etablissement !== ""),
    competences: draft.competencesTexte
      .split(/[,;]/)
      .map((item) => item.trim())
      .filter(Boolean),
    langues: draft.langues
      .map((item) => ({ nom: item.nom.trim(), niveau: item.niveau.trim() }))
      .filter((item) => item.nom !== ""),
    showQrOnPdf: draft.showQrOnPdf,
  };
}

async function genererQr(url: string): Promise<string | null> {
  try {
    return await toDataURL(url, { color: { dark: "#051937", light: "#FFFFFF" }, margin: 1, width: 320 });
  } catch {
    return null;
  }
}

async function lireErreur(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown };
    return typeof data.error === "string" ? data.error : "Opération impossible.";
  } catch {
    return "Opération impossible.";
  }
}

/* ─────────────────────────── Champs réutilisables ─────────────────────────── */

function Champ({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      {label ? (
        <span className="mb-1.5 block text-sm font-semibold text-[#051937]">{label}</span>
      ) : null}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/30"
      />
    </label>
  );
}

function Zone({
  label,
  value,
  onChange,
  rows = 4,
  placeholder,
  hint,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      {label ? (
        <span className="mb-1.5 block text-sm font-semibold text-[#051937]">{label}</span>
      ) : null}
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-700 outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/30"
      />
      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

function Carte({
  icon: Icon,
  titre,
  sousTitre,
  children,
}: {
  icon: typeof IconUser;
  titre: string;
  sousTitre?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FFC107]/20 text-[#051937]">
          <Icon size={20} stroke={1.8} />
        </span>
        <div>
          <h2 className="text-base font-bold text-[#051937]">{titre}</h2>
          {sousTitre ? <p className="text-xs text-slate-500">{sousTitre}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

/* ──────────────────────────────── La page ──────────────────────────────── */

export default function CvBuilderPage() {
  const [draft, setDraft] = useState<DraftCv>(DRAFT_VIDE);
  const [chargement, setChargement] = useState(true);
  const [publicInfo, setPublicInfo] = useState<InfoPublique | null>(null);
  const [publicationEnCours, setPublicationEnCours] = useState(false);
  const [messagePublication, setMessagePublication] = useState("");
  const [copie, setCopie] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [pdfSnapshot, setPdfSnapshot] = useState<CvData | null>(null);

  function majChamp(cle: "fullName" | "jobTitle" | "email" | "phone" | "location" | "website" | "photoUrl" | "resume" | "competencesTexte", valeur: string) {
    setDraft((actuel) => ({ ...actuel, [cle]: valeur }));
  }
  function majExperience(index: number, champ: keyof DraftExperience, valeur: string) {
    setDraft((actuel) => ({
      ...actuel,
      experiences: actuel.experiences.map((item, i) =>
        i === index ? ({ ...item, [champ]: valeur } as DraftExperience) : item,
      ),
    }));
  }
  function majFormation(index: number, champ: keyof DraftFormation, valeur: string) {
    setDraft((actuel) => ({
      ...actuel,
      formations: actuel.formations.map((item, i) =>
        i === index ? ({ ...item, [champ]: valeur } as DraftFormation) : item,
      ),
    }));
  }
  function majLangue(index: number, champ: keyof DraftLangue, valeur: string) {
    setDraft((actuel) => ({
      ...actuel,
      langues: actuel.langues.map((item, i) =>
        i === index ? ({ ...item, [champ]: valeur } as DraftLangue) : item,
      ),
    }));
  }
  function ajouterExperience() {
    setDraft((actuel) => ({
      ...actuel,
      experiences: [...actuel.experiences, { poste: "", entreprise: "", periode: "", description: "" }],
    }));
  }
  function supprimerExperience(index: number) {
    setDraft((actuel) => ({ ...actuel, experiences: actuel.experiences.filter((_, i) => i !== index) }));
  }
  function ajouterFormation() {
    setDraft((actuel) => ({
      ...actuel,
      formations: [...actuel.formations, { diplome: "", etablissement: "", periode: "" }],
    }));
  }
  function supprimerFormation(index: number) {
    setDraft((actuel) => ({ ...actuel, formations: actuel.formations.filter((_, i) => i !== index) }));
  }
  function ajouterLangue() {
    setDraft((actuel) => ({ ...actuel, langues: [...actuel.langues, { nom: "", niveau: "" }] }));
  }
  function supprimerLangue(index: number) {
    setDraft((actuel) => ({ ...actuel, langues: actuel.langues.filter((_, i) => i !== index) }));
  }

  // Chargement initial : brouillon localStorage, puis config serveur /api/public-cv
  useEffect(() => {
    let annule = false;
    (async () => {
      let brouillonLocal = false;
      try {
        const brut = window.localStorage.getItem(CLE_BROUILLON);
        if (brut) {
          const parse: unknown = JSON.parse(brut);
          if (!annule) {
            setDraft(draftDepuisCvData(parse));
            brouillonLocal = true;
          }
        }
      } catch {
        // brouillon illisible : on repart du CV vide
      }
      try {
        const res = await fetch("/api/public-cv");
        if (res.ok && !annule) {
          const data = (await res.json()) as {
            publicResume?: {
              slug: string;
              publicUrl: string;
              viewsCount: number;
              isPublic: boolean;
              cvData?: unknown;
            } | null;
          };
          if (data.publicResume) {
            setPublicInfo({
              slug: data.publicResume.slug,
              publicUrl: data.publicResume.publicUrl,
              viewsCount: data.publicResume.viewsCount,
              isPublic: data.publicResume.isPublic,
            });
            if (!brouillonLocal && data.publicResume.cvData) {
              setDraft(draftDepuisCvData(data.publicResume.cvData));
            }
          }
        }
      } catch {
        // session indisponible : l'éditeur reste utilisable
      }
      if (!annule) setChargement(false);
    })();
    return () => {
      annule = true;
    };
  }, []);

  // Persistance du brouillon
  useEffect(() => {
    if (chargement) return;
    try {
      window.localStorage.setItem(CLE_BROUILLON, JSON.stringify(draft));
    } catch {
      // quota dépassé : on ignore
    }
  }, [draft, chargement]);

  // Génération du QR code dès que l'URL publique existe et que l'interrupteur est actif
  useEffect(() => {
    const url = publicInfo?.publicUrl;
    if (!url || !draft.showQrOnPdf) {
      setQrCodeDataUrl(null);
      return;
    }
    let annule = false;
    genererQr(url).then((qr) => {
      if (!annule && qr !== null) setQrCodeDataUrl(qr);
    });
    return () => {
      annule = true;
    };
  }, [publicInfo?.publicUrl, draft.showQrOnPdf]);

  // Instantané du CV pour le PDF (avec temporisation : pas de régénération à chaque frappe)
  useEffect(() => {
    const timer = window.setTimeout(() => setPdfSnapshot(buildCvData(draft)), 700);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const pdfDocument = useMemo(
    () =>
      pdfSnapshot === null ? null : (
        <CvPdfDocument
          cvData={pdfSnapshot}
          templateId="modern-accent"
          qrCodeDataUrl={qrCodeDataUrl}
          publicUrl={publicInfo?.publicUrl ?? null}
        />
      ),
    [pdfSnapshot, qrCodeDataUrl, publicInfo?.publicUrl],
  );

  const pdfFileName = useMemo(() => {
    const base =
      (publicInfo?.slug || draft.fullName || "cv")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "cv";
    return `${base}-nexirole.pdf`;
  }, [publicInfo?.slug, draft.fullName]);

  async function publierOuMettreAJour() {
    setPublicationEnCours(true);
    setMessagePublication("");
    try {
      const res = await fetch("/api/public-cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvData: buildCvData(draft) }),
      });
      if (!res.ok) {
        setMessagePublication(await lireErreur(res));
        return;
      }
      const data = (await res.json()) as {
        publicResume?: { slug: string; publicUrl: string; viewsCount: number; isPublic: boolean };
      };
      if (!data.publicResume) {
        setMessagePublication("Réponse inattendue du serveur.");
        return;
      }
      setPublicInfo({
        slug: data.publicResume.slug,
        publicUrl: data.publicResume.publicUrl,
        viewsCount: data.publicResume.viewsCount,
        isPublic: data.publicResume.isPublic,
      });
    } catch {
      setMessagePublication("Réseau indisponible. Vérifiez votre connexion puis réessayez.");
    } finally {
      setPublicationEnCours(false);
    }
  }

  async function changerVisibilite(next: boolean) {
    if (!publicInfo) return;
    try {
      const res = await fetch("/api/public-cv", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: next }),
      });
      if (res.ok) setPublicInfo({ ...publicInfo, isPublic: next });
    } catch {
      // silencieux : l'interrupteur reste sur son état serveur au prochain chargement
    }
  }

  async function actualiserVues() {
    try {
      const res = await fetch("/api/public-cv");
      if (!res.ok) return;
      const data = (await res.json()) as { publicResume?: InfoPublique | null };
      if (data.publicResume) setPublicInfo(data.publicResume);
    } catch {
      // silencieux
    }
  }

  async function copierLien() {
    if (!publicInfo) return;
    try {
      await navigator.clipboard.writeText(publicInfo.publicUrl);
    } catch {
      const zone = document.createElement("textarea");
      zone.value = publicInfo.publicUrl;
      document.body.appendChild(zone);
      zone.select();
      document.execCommand("copy");
      document.body.removeChild(zone);
    }
    setCopie(true);
    window.setTimeout(() => setCopie(false), 2000);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#051937]">CV Builder</h1>
            <p className="mt-1 text-sm text-slate-500">
              Composez votre CV, publiez-le en ligne et téléchargez le PDF avec QR code.
            </p>
          </div>
          {pdfDocument !== null ? (
            <PDFDownloadLink
              document={pdfDocument}
              fileName={pdfFileName}
              className="inline-flex items-center gap-2 rounded-xl bg-[#051937] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0A2A5C]"
            >
              {({ loading, error }) => (
                <>
                  <IconDownload size={18} stroke={1.8} className="text-[#FFC107]" />
                  {error
                    ? "Erreur de génération du PDF"
                    : loading
                      ? "Génération du PDF…"
                      : "Télécharger mon CV (PDF)"}
                </>
              )}
            </PDFDownloadLink>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-xl bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500">
              <IconDownload size={18} stroke={1.8} />
              Préparation du PDF…
            </span>
          )}
        </header>

        {/* ─── Bloc « Lien Web Public & QR Code » ─── */}
        <Carte icon={IconWorld} titre="Lien Web Public & QR Code" sousTitre="Partagez votre CV en ligne et affichez son QR code sur le PDF.">
          {chargement ? (
            <p className="text-sm text-slate-500">Chargement de la configuration…</p>
          ) : publicInfo === null ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Publiez votre CV pour obtenir un lien public du type{" "}
                <span className="font-semibold text-[#051937]">nexirole.vercel.app/u/votre-nom</span>,
                avec compteur de vues et QR code intégré au PDF.
              </p>
              <button
                type="button"
                onClick={publierOuMettreAJour}
                disabled={publicationEnCours}
                className="inline-flex items-center gap-2 rounded-xl bg-[#FFC107] px-4 py-2.5 text-sm font-semibold text-[#051937] shadow-sm transition hover:bg-[#FFD056] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {publicationEnCours ? (
                  <IconLoader2 size={18} stroke={1.8} className="animate-spin" />
                ) : (
                  <IconUpload size={18} stroke={1.8} />
                )}
                {publicationEnCours ? "Publication…" : "Publier mon CV en ligne"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <IconLink size={16} stroke={1.8} className="shrink-0 text-[#051937]" />
                <span className="truncate text-sm text-slate-700">{publicInfo.publicUrl}</span>
                <span className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={copierLien}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#051937] transition hover:bg-slate-200"
                  >
                    {copie ? (
                      <IconCheck size={15} stroke={1.8} className="text-emerald-600" />
                    ) : (
                      <IconCopy size={15} stroke={1.8} />
                    )}
                    {copie ? "Copié" : "Copier"}
                  </button>
                  <a
                    href={publicInfo.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#051937] transition hover:bg-slate-200"
                  >
                    <IconExternalLink size={15} stroke={1.8} />
                    Ouvrir
                  </a>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <span className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <IconEye size={17} stroke={1.8} className="text-[#051937]" />
                  {publicInfo.viewsCount} vue{publicInfo.viewsCount > 1 ? "s" : ""}
                </span>
                <button
                  type="button"
                  onClick={actualiserVues}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#051937] transition hover:bg-slate-100"
                >
                  <IconRefresh size={15} stroke={1.8} />
                  Actualiser
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={publicInfo.isPublic}
                  onClick={() => changerVisibilite(!publicInfo.isPublic)}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#051937]"
                >
                  {publicInfo.isPublic ? (
                    <IconEye size={17} stroke={1.8} className="text-emerald-600" />
                  ) : (
                    <IconEyeOff size={17} stroke={1.8} className="text-slate-400" />
                  )}
                  {publicInfo.isPublic ? "Visible publiquement" : "Masqué (page en 404)"}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#051937]/5 text-[#051937]">
                    <IconQrcode size={18} stroke={1.8} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[#051937]">
                      Afficher le QR Code sur mon PDF
                    </p>
                    <p className="text-xs text-slate-500">
                      Un QR « Version en ligne » apparaîtra dans l&apos;en-tête du CV A4.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={draft.showQrOnPdf}
                  onClick={() => setDraft((actuel) => ({ ...actuel, showQrOnPdf: !actuel.showQrOnPdf }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                    draft.showQrOnPdf ? "bg-[#051937]" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                      draft.showQrOnPdf ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {draft.showQrOnPdf ? (
                qrCodeDataUrl !== null ? (
                  <div className="flex items-center gap-4">
                    <img
                      src={qrCodeDataUrl}
                      alt="QR code du CV public"
                      className="h-24 w-24 rounded-xl border border-slate-200"
                    />
                    <p className="text-xs text-slate-500">
                      Ce QR code est automatiquement intégré au PDF téléchargé.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Génération du QR code…</p>
                )
              ) : null}

              <button
                type="button"
                onClick={publierOuMettreAJour}
                disabled={publicationEnCours}
                className="inline-flex items-center gap-2 rounded-xl bg-[#FFC107] px-4 py-2.5 text-sm font-semibold text-[#051937] shadow-sm transition hover:bg-[#FFD056] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {publicationEnCours ? (
                  <IconLoader2 size={18} stroke={1.8} className="animate-spin" />
                ) : (
                  <IconRefresh size={18} stroke={1.8} />
                )}
                {publicationEnCours ? "Mise à jour…" : "Mettre à jour mon CV en ligne"}
              </button>
            </div>
          )}
          {messagePublication !== "" ? (
            <p className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {messagePublication}
            </p>
          ) : null}
        </Carte>

        {/* ─── Identité ─── */}
        <Carte icon={IconUser} titre="Identité" sousTitre="Nom, titre professionnel et coordonnées.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ label="Nom complet" value={draft.fullName} onChange={(v) => majChamp("fullName", v)} placeholder="Clément Kouton" />
            <Champ label="Titre professionnel" value={draft.jobTitle} onChange={(v) => majChamp("jobTitle", v)} placeholder="Développeur Full-Stack" />
            <Champ label="E-mail" type="email" value={draft.email} onChange={(v) => majChamp("email", v)} placeholder="clement@exemple.com" />
            <Champ label="Téléphone" value={draft.phone} onChange={(v) => majChamp("phone", v)} placeholder="+229 00 00 00 00" />
            <Champ label="Ville / Pays" value={draft.location} onChange={(v) => majChamp("location", v)} placeholder="Cotonou, Bénin" />
            <Champ label="Site web / LinkedIn" value={draft.website} onChange={(v) => majChamp("website", v)} placeholder="linkedin.com/in/clementkouton" />
            <div className="sm:col-span-2">
              <Champ label="URL de la photo" value={draft.photoUrl} onChange={(v) => majChamp("photoUrl", v)} placeholder="https://…/photo.jpg (ou data:image/…)" />
            </div>
          </div>
        </Carte>

        {/* ─── Résumé ─── */}
        <Carte icon={IconFileText} titre="Résumé" sousTitre="Le profil en quelques lignes, en haut du CV.">
          <Zone
            value={draft.resume}
            onChange={(v) => majChamp("resume", v)}
            rows={5}
            placeholder="Développeur full-stack passionné par les produits SaaS…"
          />
        </Carte>

        {/* ─── Expériences ─── */}
        <Carte icon={IconBriefcase} titre="Expériences professionnelles" sousTitre="Les plus récentes d'abord.">
          <div className="space-y-3">
            {draft.experiences.map((experience, index) => (
              <div key={index} className="relative rounded-xl border border-slate-200 p-4">
                <button
                  type="button"
                  onClick={() => supprimerExperience(index)}
                  aria-label="Supprimer cette expérience"
                  className="absolute right-2 top-2 rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-50"
                >
                  <IconTrash size={16} stroke={1.8} />
                </button>
                <div className="grid grid-cols-1 gap-3 pr-8 sm:grid-cols-2">
                  <Champ value={experience.poste} onChange={(v) => majExperience(index, "poste", v)} placeholder="Poste — Développeur Full-Stack" />
                  <Champ value={experience.entreprise} onChange={(v) => majExperience(index, "entreprise", v)} placeholder="Entreprise — NexiRole" />
                  <Champ value={experience.periode} onChange={(v) => majExperience(index, "periode", v)} placeholder="Période — 2025 — Aujourd'hui" />
                </div>
                <div className="mt-3 pr-8">
                  <Zone value={experience.description} onChange={(v) => majExperience(index, "description", v)} rows={3} placeholder="Missions, résultats, technologies…" />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={ajouterExperience}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#051937]/30 px-3 py-2 text-sm font-semibold text-[#051937] transition hover:bg-[#FFC107]/10"
            >
              <IconPlus size={16} stroke={1.8} />
              Ajouter une expérience
            </button>
          </div>
        </Carte>

        {/* ─── Formations ─── */}
        <Carte icon={IconSchool} titre="Formations" sousTitre="Diplômes et établissements.">
          <div className="space-y-3">
            {draft.formations.map((formation, index) => (
              <div key={index} className="relative rounded-xl border border-slate-200 p-4">
                <button
                  type="button"
                  onClick={() => supprimerFormation(index)}
                  aria-label="Supprimer cette formation"
                  className="absolute right-2 top-2 rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-50"
                >
                  <IconTrash size={16} stroke={1.8} />
                </button>
                <div className="grid grid-cols-1 gap-3 pr-8 sm:grid-cols-2">
                  <Champ value={formation.diplome} onChange={(v) => majFormation(index, "diplome", v)} placeholder="Diplôme — Master Génie Logiciel" />
                  <Champ value={formation.etablissement} onChange={(v) => majFormation(index, "etablissement", v)} placeholder="Établissement — Université" />
                  <Champ value={formation.periode} onChange={(v) => majFormation(index, "periode", v)} placeholder="Période — 2022 — 2024" />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={ajouterFormation}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#051937]/30 px-3 py-2 text-sm font-semibold text-[#051937] transition hover:bg-[#FFC107]/10"
            >
              <IconPlus size={16} stroke={1.8} />
              Ajouter une formation
            </button>
          </div>
        </Carte>

        {/* ─── Compétences ─── */}
        <Carte icon={IconAward} titre="Compétences" sousTitre="Elles s'affichent en badges sur le CV.">
          <Zone
            value={draft.competencesTexte}
            onChange={(v) => majChamp("competencesTexte", v)}
            rows={3}
            placeholder="Next.js, TypeScript, Prisma, Tailwind CSS"
            hint="Séparez chaque compétence par une virgule."
          />
        </Carte>

        {/* ─── Langues ─── */}
        <Carte icon={IconLanguage} titre="Langues" sousTitre="Langue et niveau de maîtrise.">
          <div className="space-y-3">
            {draft.langues.map((langue, index) => (
              <div key={index} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                <Champ value={langue.nom} onChange={(v) => majLangue(index, "nom", v)} placeholder="Langue — Français" />
                <Champ value={langue.niveau} onChange={(v) => majLangue(index, "niveau", v)} placeholder="Niveau — Courant" />
                <button
                  type="button"
                  onClick={() => supprimerLangue(index)}
                  aria-label="Supprimer cette langue"
                  className="justify-self-start rounded-lg p-2 text-rose-500 transition hover:bg-rose-50 sm:justify-self-center"
                >
                  <IconTrash size={16} stroke={1.8} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={ajouterLangue}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#051937]/30 px-3 py-2 text-sm font-semibold text-[#051937] transition hover:bg-[#FFC107]/10"
            >
              <IconPlus size={16} stroke={1.8} />
              Ajouter une langue
            </button>
          </div>
        </Carte>
      </div>
    </div>
  );
}