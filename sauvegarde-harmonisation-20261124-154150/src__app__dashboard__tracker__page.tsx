"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CORRECTIF « RangeError: Invalid time value » (conservé)
// Toutes les dates passent désormais par toDate() (validation stricte) avant
// tout formatage. Une date absente, null ou invalide affiche « — » au lieu de
// faire planter la page. L'API garantit en plus une date ISO toujours valide.
//
// HARMONISATION VISUELLE (modèle : src/app/dashboard/negociation/page.tsx)
// En-tête avec badge icône navy/or + bouton principal, 4 cartes KPIs, liste en
// lignes cartes avec barre d'actions unifiée :
//   - Voir détails & notes (dépliant inline : notes, lien de l'offre, dates) ;
//   - Éditer (modale complète → PATCH /api/tracker { id, ...champs }) ;
//   - Générer l'e-mail de relance IA (flux generate-followup conservé) ;
//   - Partager (copie « poste — entreprise — lien » + toast sonner) ;
//   - Supprimer (DELETE existant + window.confirm).
// Conservés à l'identique : changement rapide de statut (PATCH { id, status }),
// badges de statut colorés, tri par dernière action, actualisation, bannière
// d'erreur. Icônes : exclusivement @tabler/icons-react. Charte : navy #051937
// + or #FFC107.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  IconAlertTriangle,
  IconBellPin,
  IconBriefcase,
  IconCalendarEvent,
  IconCheck,
  IconClipboardList,
  IconCopy,
  IconEdit,
  IconExternalLink,
  IconEye,
  IconHourglass,
  IconInbox,
  IconLoader2,
  IconMailForward,
  IconPlus,
  IconRefresh,
  IconShare,
  IconTrash,
  IconTrophy,
  IconX,
} from "@tabler/icons-react";

/* ─────────────── Types & constantes ─────────────── */

type TrackerStatus = "A_POSTULER" | "ENVOYE" | "ENTRETIEN" | "OFFRE" | "REFUSEE";

interface TrackerApplication {
  id: string;
  jobTitle: string;
  companyName: string;
  jobUrl: string | null;
  status: TrackerStatus;
  lastActionDate: string;
  notes: string | null;
  createdAt: string;
}

interface FollowupEmailState {
  subject: string;
  body: string;
  days: number;
  source: string;
}

const STATUS_ORDER: TrackerStatus[] = ["A_POSTULER", "ENVOYE", "ENTRETIEN", "OFFRE", "REFUSEE"];

const STATUS_META: Record<TrackerStatus, { label: string; badge: string }> = {
  A_POSTULER: { label: "À postuler", badge: "bg-slate-100 text-slate-700" },
  ENVOYE: { label: "Envoyée", badge: "bg-blue-50 text-blue-700" },
  ENTRETIEN: { label: "Entretien", badge: "bg-violet-50 text-violet-700" },
  OFFRE: { label: "Offre", badge: "bg-emerald-50 text-emerald-700" },
  REFUSEE: { label: "Refusée", badge: "bg-rose-50 text-rose-700" },
};

const RELANCE_THRESHOLD_DAYS = 7;

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-[#051937] placeholder:text-slate-400 transition focus:border-[#FFC107] focus:outline-none focus:ring-2 focus:ring-[#FFC107]/30";

const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500";

/* ─────────────── Utilitaires anti-crash (LE correctif) ─────────────── */

/** Valide une valeur quelconque et renvoie une Date fiable, ou null. */
function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Formate une date en « 12 nov. 2025 » — jamais d'exception, « — » en repli. */
function formatDate(value: unknown): string {
  const date = toDate(value);
  return date
    ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(date)
    : "—";
}

/** Nombre de jours écoulés, ou null si la date est absente/invalide. */
function daysSince(value: unknown): number | null {
  const date = toDate(value);
  if (!date) return null;
  const diff = Date.now() - date.getTime();
  if (diff <= 0) return 0;
  return Math.floor(diff / 86_400_000);
}

function getRelanceDays(app: TrackerApplication): number | null {
  if (app.status !== "ENVOYE") return null;
  return daysSince(app.lastActionDate);
}

function sortApplications(list: TrackerApplication[]): TrackerApplication[] {
  return [...list].sort((a, b) => {
    const timeA = toDate(a.lastActionDate)?.getTime() ?? 0;
    const timeB = toDate(b.lastActionDate)?.getTime() ?? 0;
    return timeB - timeA;
  });
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function normalizeStatus(value: unknown): TrackerStatus {
  return typeof value === "string" && (STATUS_ORDER as string[]).includes(value)
    ? (value as TrackerStatus)
    : "A_POSTULER";
}

/** Normalise n'importe quelle réponse serveur en objet fiable (jamais de crash). */
function normalizeApplication(raw: unknown, index: number): TrackerApplication {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fallbackDate = new Date().toISOString();
  return {
    id: asString(record.id, `application-${index}-${fallbackDate}`),
    jobTitle: asString(record.jobTitle, "Poste inconnu"),
    companyName: asString(record.companyName, "Entreprise inconnue"),
    jobUrl: asNullableString(record.jobUrl),
    status: normalizeStatus(record.status),
    lastActionDate:
      toDate(record.lastActionDate)?.toISOString() ?? toDate(record.createdAt)?.toISOString() ?? fallbackDate,
    notes: asNullableString(record.notes),
    createdAt: toDate(record.createdAt)?.toISOString() ?? fallbackDate,
  };
}

function pickString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value: unknown = record[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

/* ── Aide erreurs (copie du helper lireErreur de la page négociation) ────── */

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

/* ─────────────── Page ─────────────── */

const EMPTY_FORM = { jobTitle: "", companyName: "", jobUrl: "", notes: "" };

export default function TrackerPage() {
  const [applications, setApplications] = useState<TrackerApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [followupTarget, setFollowupTarget] = useState<TrackerApplication | null>(null);
  const [followupEmail, setFollowupEmail] = useState<FollowupEmailState | null>(null);
  const [isFollowupLoading, setIsFollowupLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<"objet" | "corps" | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Dépliant « Voir détails & notes » : identifiant de la ligne ouverte.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Modale d'édition complète (PATCH /api/tracker { id, ...champs }).
  const [editTarget, setEditTarget] = useState<TrackerApplication | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

  const loadApplications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/tracker", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(await lireErreur(response, "Impossible de charger le suivi des candidatures."));
      }
      const payload: unknown = await response.json();
      let rawList: unknown[] = [];
      if (Array.isArray(payload)) {
        rawList = payload;
      } else if (payload && typeof payload === "object") {
        const candidate: unknown = (payload as Record<string, unknown>).applications;
        if (Array.isArray(candidate)) rawList = candidate;
      }
      setApplications(sortApplications(rawList.map(normalizeApplication)));
    } catch (caught) {
      setApplications([]);
      setError(caught instanceof Error ? caught.message : "Une erreur inattendue est survenue.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  const stats = useMemo(() => {
    let enAttente = 0;
    let entretiens = 0;
    let relances = 0;
    for (const app of applications) {
      if (app.status === "A_POSTULER" || app.status === "ENVOYE") enAttente += 1;
      if (app.status === "ENTRETIEN" || app.status === "OFFRE") entretiens += 1;
      const relanceDays = getRelanceDays(app);
      if (relanceDays !== null && relanceDays >= RELANCE_THRESHOLD_DAYS) relances += 1;
    }
    return { total: applications.length, enAttente, entretiens, relances };
  }, [applications]);

  /* ── Presse-papiers (partage + copies de l'e-mail de relance) ── */

  const copierTexte = useCallback(async (texte: string): Promise<boolean> => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(texte);
        return true;
      }
      const area = document.createElement("textarea");
      area.value = texte;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const success = document.execCommand("copy");
      document.body.removeChild(area);
      return success;
    } catch {
      return false;
    }
  }, []);

  const copyToClipboard = useCallback(
    async (text: string, field: "objet" | "corps") => {
      const success = await copierTexte(text);
      if (success) {
        setCopiedField(field);
        window.setTimeout(() => setCopiedField(null), 2000);
      } else {
        setError("Copie impossible : sélectionnez le texte et copiez-le manuellement (Ctrl+C).");
      }
    },
    [copierTexte],
  );

  /** Partage : copie « poste — entreprise — lien » dans le presse-papiers + toast. */
  async function handleShare(app: TrackerApplication) {
    const texte = [app.jobTitle, app.companyName, app.jobUrl ?? ""]
      .filter((part) => part.trim() !== "")
      .join(" — ");
    const success = await copierTexte(texte);
    if (success) {
      toast.success("Résumé de la candidature copié — prêt à coller (e-mail, WhatsApp, notes…).");
    } else {
      toast.error("Copie impossible : vérifiez les autorisations du presse-papiers puis réessayez.");
    }
  }

  /* ── Création (flux existant, modale inchangée) ── */

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const jobTitle = form.jobTitle.trim();
    const companyName = form.companyName.trim();
    if (!jobTitle || !companyName) {
      setError("L'intitulé du poste et le nom de l'entreprise sont obligatoires.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle,
          companyName,
          jobUrl: form.jobUrl.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      if (!response.ok) {
        throw new Error(await lireErreur(response, "Impossible d'enregistrer la candidature."));
      }
      const payload: unknown = await response.json().catch(() => null);
      const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const rawCreated: unknown = "application" in record ? record.application : payload;
      if (
        rawCreated &&
        typeof rawCreated === "object" &&
        typeof (rawCreated as Record<string, unknown>).jobTitle === "string"
      ) {
        const created = normalizeApplication(rawCreated, 0);
        setApplications((previous) => sortApplications([created, ...previous]));
      } else {
        await loadApplications();
      }
      setShowAddModal(false);
      setForm({ ...EMPTY_FORM });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible d'enregistrer la candidature.");
    } finally {
      setIsSubmitting(false);
    }
  }

  /* ── Changement rapide de statut (conservé à l'identique) ── */

  async function handleStatusChange(app: TrackerApplication, nextStatus: TrackerStatus) {
    if (nextStatus === app.status) return;
    const snapshot = applications;
    const refreshedDate = new Date().toISOString();
    setApplications((previous) =>
      previous.map((item) =>
        item.id === app.id ? { ...item, status: nextStatus, lastActionDate: refreshedDate } : item,
      ),
    );
    try {
      const response = await fetch("/api/tracker", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: app.id, status: nextStatus }),
      });
      if (!response.ok) {
        throw new Error(await lireErreur(response, "La mise à jour du statut a échoué."));
      }
    } catch (caught) {
      setApplications(snapshot);
      setError(caught instanceof Error ? caught.message : "La mise à jour du statut a échoué.");
    }
  }

  /* ── Édition complète (modale → PATCH { id, jobTitle, companyName, jobUrl, notes }) ── */

  function openEditModal(app: TrackerApplication) {
    setEditTarget(app);
    setEditForm({
      jobTitle: app.jobTitle,
      companyName: app.companyName,
      jobUrl: app.jobUrl ?? "",
      notes: app.notes ?? "",
    });
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget) return;
    const jobTitle = editForm.jobTitle.trim();
    const companyName = editForm.companyName.trim();
    if (!jobTitle || !companyName) {
      toast.error("L'intitulé du poste et le nom de l'entreprise sont obligatoires.");
      return;
    }
    setIsEditSubmitting(true);
    try {
      const response = await fetch("/api/tracker", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editTarget.id,
          jobTitle,
          companyName,
          jobUrl: editForm.jobUrl.trim(),
          notes: editForm.notes.trim(),
        }),
      });
      if (!response.ok) {
        throw new Error(await lireErreur(response, "La mise à jour de la candidature a échoué."));
      }
      const payload: unknown = await response.json().catch(() => null);
      const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const rawUpdated: unknown = "application" in record ? record.application : null;
      if (rawUpdated && typeof rawUpdated === "object") {
        const updated = normalizeApplication(rawUpdated, 0);
        setApplications((previous) =>
          sortApplications(previous.map((item) => (item.id === updated.id ? updated : item))),
        );
      } else {
        await loadApplications();
      }
      setEditTarget(null);
      toast.success("Candidature mise à jour.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "La mise à jour de la candidature a échoué.");
    } finally {
      setIsEditSubmitting(false);
    }
  }

  /* ── Suppression (flux existant conservé) ── */

  async function handleDelete(app: TrackerApplication) {
    const confirmed = window.confirm(
      `Supprimer définitivement la candidature « ${app.jobTitle} — ${app.companyName} » ?`,
    );
    if (!confirmed) return;
    setDeletingId(app.id);
    try {
      const response = await fetch(`/api/tracker?id=${encodeURIComponent(app.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await lireErreur(response, "La suppression a échoué."));
      setApplications((previous) => previous.filter((item) => item.id !== app.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La suppression a échoué.");
    } finally {
      setDeletingId(null);
    }
  }

  /* ── E-mail de relance IA (flux generate-followup conservé) ── */

  async function openFollowupModal(app: TrackerApplication) {
    setFollowupTarget(app);
    setFollowupEmail(null);
    setCopiedField(null);
    setIsFollowupLoading(true);
    try {
      const response = await fetch("/api/tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate-followup", applicationId: app.id }),
      });
      if (!response.ok) {
        throw new Error(
          await lireErreur(
            response,
            "La génération de l'e-mail de relance a échoué. Réessayez dans quelques instants.",
          ),
        );
      }
      const payload: unknown = await response.json().catch(() => null);
      if (!payload || typeof payload !== "object") {
        throw new Error("L'IA n'a pas pu rédiger l'e-mail. Réessayez dans quelques instants.");
      }
      const record = payload as Record<string, unknown>;
      const subject = pickString(record, ["subject", "objet"]);
      const body = pickString(record, ["body", "corps", "message"]);
      if (!subject || !body) {
        throw new Error("L'IA n'a pas pu rédiger l'e-mail. Réessayez dans quelques instants.");
      }
      const daysRaw: unknown = record.daysSinceLastAction;
      const days =
        typeof daysRaw === "number" && Number.isFinite(daysRaw)
          ? Math.max(0, Math.floor(daysRaw))
          : (daysSince(app.lastActionDate) ?? 0);
      const sourceRaw: unknown = record.source;
      setFollowupEmail({ subject, body, days, source: typeof sourceRaw === "string" ? sourceRaw : "groq" });
    } catch (caught) {
      setFollowupTarget(null);
      setError(caught instanceof Error ? caught.message : "Une erreur inattendue est survenue.");
    } finally {
      setIsFollowupLoading(false);
    }
  }

  /* ── Dépliant « Voir détails & notes » ── */

  function toggleDetails(appId: string) {
    setExpandedId((previous) => (previous === appId ? null : appId));
  }

  const statCards = [
    {
      label: "Total suivies",
      value: stats.total,
      icon: IconBriefcase,
      hint: "Toutes vos candidatures suivies",
    },
    {
      label: "En attente",
      value: stats.enAttente,
      icon: IconHourglass,
      hint: "À postuler ou envoyées sans réponse",
    },
    {
      label: "Entretiens décrochés",
      value: stats.entretiens,
      icon: IconTrophy,
      hint: "Entretiens et offres obtenus",
    },
    {
      label: "Relances suggérées",
      value: stats.relances,
      icon: IconBellPin,
      hint: `Envoyées sans réponse depuis plus de ${RELANCE_THRESHOLD_DAYS} jours`,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* ── En-tête harmonisée ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#051937] text-[#FFC107]">
            <IconClipboardList size={24} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#051937]">Suivi de candidatures</h1>
            <p className="mt-1 text-sm text-slate-500">
              Pilotez chaque opportunité de « À postuler » jusqu&apos;à l&apos;offre, et laissez l&apos;IA
              rédiger vos relances.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#051937] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b2a5b]"
        >
          <IconPlus size={18} />
          Ajouter une candidature
        </button>
      </div>

      {/* ── Bandeau d'erreur ───────────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p className="flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Fermer l'alerte"
            className="shrink-0 rounded-md p-1 transition hover:bg-red-100"
          >
            <IconX size={14} />
          </button>
        </div>
      )}

      {/* ── 4 cartes KPIs harmonisées ──────────────────────────────────── */}
      <section className="grid gap-4 md:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <card.icon size={20} className="text-[#051937]" />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {card.label}
              </span>
            </div>
            <p className="mt-3 text-2xl font-extrabold text-[#051937]">{card.value}</p>
            <p className="mt-1 text-xs text-slate-400">{card.hint}</p>
          </div>
        ))}
      </section>

      {/* ── Liste des candidatures (lignes style négociation) ──────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[#051937]">
            Pipeline des candidatures
            {applications.length > 0 ? (
              <span className="ml-2 text-sm font-normal text-slate-400">({applications.length})</span>
            ) : null}
          </h2>
          <button
            type="button"
            onClick={() => void loadApplications()}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#051937] transition-colors hover:bg-[#051937]/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <IconRefresh size={14} className={isLoading ? "animate-spin" : undefined} />
            Actualiser
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
            <IconLoader2 size={18} className="animate-spin" />
            Chargement du suivi des candidatures...
          </div>
        ) : applications.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#051937]/5 text-[#051937]">
              <IconInbox size={26} />
            </span>
            <p className="mt-3 text-sm font-semibold text-[#051937]">
              Aucune candidature suivie pour le moment
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Ajoutez votre première candidature pour suivre son avancement et recevoir des suggestions de
              relance par IA.
            </p>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#051937] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b2a5b]"
            >
              <IconPlus size={16} />
              Ajouter une candidature
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {applications.map((app) => {
              const relanceDays = getRelanceDays(app);
              const showRelance = relanceDays !== null && relanceDays >= RELANCE_THRESHOLD_DAYS;
              const detailsOpen = expandedId === app.id;
              return (
                <div key={app.id} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-[#051937]">{app.jobTitle}</h3>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1.5">
                          <IconBriefcase size={13} />
                          {app.companyName}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <IconCalendarEvent size={13} />
                          Dernière action : {formatDate(app.lastActionDate)}
                        </span>
                        {showRelance ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                            <IconBellPin size={12} />
                            Relance suggérée ({relanceDays} jours)
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Badge + changement rapide de statut (conservés) */}
                      <div className="flex flex-col items-start gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_META[app.status].badge}`}
                        >
                          {STATUS_META[app.status].label}
                        </span>
                        <select
                          value={app.status}
                          onChange={(event) =>
                            void handleStatusChange(app, event.target.value as TrackerStatus)
                          }
                          aria-label={`Changer le statut de ${app.jobTitle}`}
                          className="max-w-[160px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-[#051937] transition focus:border-[#FFC107] focus:outline-none focus:ring-2 focus:ring-[#FFC107]/30"
                        >
                          {STATUS_ORDER.map((status) => (
                            <option key={status} value={status}>
                              {STATUS_META[status].label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {/* Barre d'actions unifiée */}
                      <div className="flex items-center gap-1 sm:gap-2">
                        <button
                          type="button"
                          onClick={() => toggleDetails(app.id)}
                          title="Voir détails & notes"
                          aria-label="Voir détails & notes"
                          aria-expanded={detailsOpen}
                          className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5"
                        >
                          <IconEye size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(app)}
                          title="Éditer la candidature"
                          aria-label="Éditer la candidature"
                          className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5"
                        >
                          <IconEdit size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void openFollowupModal(app)}
                          title="Générer un e-mail de relance IA"
                          aria-label="Générer un e-mail de relance IA"
                          className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5"
                        >
                          <IconMailForward size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleShare(app)}
                          title="Partager : copier « poste — entreprise — lien »"
                          aria-label="Partager la candidature"
                          className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5"
                        >
                          <IconShare size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(app)}
                          disabled={deletingId === app.id}
                          title="Supprimer définitivement"
                          aria-label="Supprimer définitivement"
                          className="rounded-lg border border-red-200 p-2 text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingId === app.id ? (
                            <IconLoader2 size={18} className="animate-spin" />
                          ) : (
                            <IconTrash size={18} />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Dépliant inline : notes complètes, lien de l'offre, dates */}
                  {detailsOpen && (
                    <div className="space-y-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                          {app.notes ? app.notes : "Aucune note pour cette candidature."}
                        </p>
                      </div>
                      {app.jobUrl && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Lien de l&apos;offre
                          </p>
                          <a
                            href={app.jobUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 break-all text-sm font-medium text-[#B78103] hover:underline"
                          >
                            <IconExternalLink size={14} />
                            {app.jobUrl}
                          </a>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                        <span>
                          Dernière action :{" "}
                          <strong className="font-semibold text-[#051937]">
                            {formatDate(app.lastActionDate)}
                          </strong>
                        </span>
                        <span>
                          Créée le :{" "}
                          <strong className="font-semibold text-[#051937]">{formatDate(app.createdAt)}</strong>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modale : nouvelle candidature (flux existant conservé) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => !isSubmitting && setShowAddModal(false)}
            className="absolute inset-0 bg-[#051937]/60 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[#051937]">Nouvelle candidature</h3>
                <p className="mt-0.5 text-xs text-slate-500">Elle apparaîtra avec le statut « À postuler ».</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Fermer la fenêtre"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-[#051937]"
              >
                <IconX size={18} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="mt-5 space-y-4">
              <div>
                <label htmlFor="tracker-job-title" className={labelClass}>
                  Intitulé du poste *
                </label>
                <input
                  id="tracker-job-title"
                  value={form.jobTitle}
                  onChange={(event) => setForm({ ...form, jobTitle: event.target.value })}
                  placeholder="Développeur Full-Stack"
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="tracker-company" className={labelClass}>
                  Entreprise *
                </label>
                <input
                  id="tracker-company"
                  value={form.companyName}
                  onChange={(event) => setForm({ ...form, companyName: event.target.value })}
                  placeholder="NexiRole SAS"
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="tracker-url" className={labelClass}>
                  Lien de l&apos;offre (optionnel)
                </label>
                <input
                  id="tracker-url"
                  type="url"
                  value={form.jobUrl}
                  onChange={(event) => setForm({ ...form, jobUrl: event.target.value })}
                  placeholder="https://exemple.com/offre"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="tracker-notes" className={labelClass}>
                  Notes (optionnel)
                </label>
                <textarea
                  id="tracker-notes"
                  rows={3}
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  placeholder="Points clés du poste, contacts, salaire annoncé..."
                  className={inputClass}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#FFC107] px-4 py-2 text-sm font-semibold text-[#051937] transition hover:bg-[#FFB300] disabled:opacity-60"
                >
                  {isSubmitting && <IconLoader2 size={16} className="animate-spin" />}
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale : édition complète d'une candidature */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => !isEditSubmitting && setEditTarget(null)}
            className="absolute inset-0 bg-[#051937]/60 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[#051937]">Modifier la candidature</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {editTarget.jobTitle} — {editTarget.companyName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                disabled={isEditSubmitting}
                aria-label="Fermer la fenêtre"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-[#051937] disabled:opacity-50"
              >
                <IconX size={18} />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="mt-5 space-y-4">
              <div>
                <label htmlFor="tracker-edit-job-title" className={labelClass}>
                  Intitulé du poste *
                </label>
                <input
                  id="tracker-edit-job-title"
                  value={editForm.jobTitle}
                  onChange={(event) => setEditForm({ ...editForm, jobTitle: event.target.value })}
                  placeholder="Développeur Full-Stack"
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="tracker-edit-company" className={labelClass}>
                  Entreprise *
                </label>
                <input
                  id="tracker-edit-company"
                  value={editForm.companyName}
                  onChange={(event) => setEditForm({ ...editForm, companyName: event.target.value })}
                  placeholder="NexiRole SAS"
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="tracker-edit-url" className={labelClass}>
                  Lien de l&apos;offre (optionnel)
                </label>
                <input
                  id="tracker-edit-url"
                  type="url"
                  value={editForm.jobUrl}
                  onChange={(event) => setEditForm({ ...editForm, jobUrl: event.target.value })}
                  placeholder="https://exemple.com/offre"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="tracker-edit-notes" className={labelClass}>
                  Notes (optionnel)
                </label>
                <textarea
                  id="tracker-edit-notes"
                  rows={3}
                  value={editForm.notes}
                  onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })}
                  placeholder="Points clés du poste, contacts, salaire annoncé..."
                  className={inputClass}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  disabled={isEditSubmitting}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isEditSubmitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#FFC107] px-4 py-2 text-sm font-semibold text-[#051937] transition hover:bg-[#FFB300] disabled:opacity-60"
                >
                  {isEditSubmitting && <IconLoader2 size={16} className="animate-spin" />}
                  Enregistrer les modifications
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale : e-mail de relance IA (flux existant conservé) */}
      {followupTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => !isFollowupLoading && setFollowupTarget(null)}
            className="absolute inset-0 bg-[#051937]/60 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[#051937]">E-mail de relance généré par l&apos;IA</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {followupTarget.jobTitle} — {followupTarget.companyName}
                  {followupEmail
                    ? ` · dernière action il y a ${followupEmail.days} jour${followupEmail.days > 1 ? "s" : ""}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFollowupTarget(null)}
                disabled={isFollowupLoading}
                aria-label="Fermer la fenêtre"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-[#051937] disabled:opacity-50"
              >
                <IconX size={18} />
              </button>
            </div>

            {isFollowupLoading ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <IconLoader2 size={28} className="animate-spin text-[#FFC107]" />
                <p className="text-sm font-medium text-[#051937]">NexiRole IA rédige votre e-mail de relance…</p>
                <p className="text-xs text-slate-400">Ton professionnel, poli et persuasif — prêt à copier.</p>
              </div>
            ) : followupEmail ? (
              <div className="mt-5 space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Objet</span>
                    <button
                      type="button"
                      onClick={() => void copyToClipboard(followupEmail.subject, "objet")}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      {copiedField === "objet" ? <IconCheck size={13} /> : <IconCopy size={13} />}
                      {copiedField === "objet" ? "Copié !" : "Copier"}
                    </button>
                  </div>
                  <p className="mt-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-[#051937]">
                    {followupEmail.subject}
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Corps de l&apos;e-mail
                    </span>
                    <button
                      type="button"
                      onClick={() => void copyToClipboard(followupEmail.body, "corps")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-3 py-1.5 text-xs font-semibold text-[#051937] transition hover:bg-[#FFB300]"
                    >
                      {copiedField === "corps" ? <IconCheck size={13} /> : <IconCopy size={13} />}
                      {copiedField === "corps" ? "Copié !" : "Copier le corps"}
                    </button>
                  </div>
                  <pre className="mt-1.5 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-sans text-sm leading-relaxed text-slate-700">
                    {followupEmail.body}
                  </pre>
                </div>
                <p className="text-[11px] text-slate-400">
                  Relisez et personnalisez avant l&apos;envoi —{" "}
                  {followupEmail.source === "groq"
                    ? "généré par NexiRole IA (Groq)."
                    : "modèle NexiRole de secours."}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
