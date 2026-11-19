"use client";

// =============================================================
// NEXIROLE — Page « Mon Historique & Suivi » (/dashboard/historique)
// Cette page n'affiche AUCUN menu : la navigation unique est gérée
// par src/app/dashboard/layout.tsx (DashboardSidebar).
// =============================================================

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  IconAlertTriangle,
  IconClipboardList,
  IconExternalLink,
  IconFileText,
  IconFolder,
  IconHistory,
  IconInbox,
  IconLoader2,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { deleteJson, fetchJson, patchJson, postJson } from "@/lib/fetch-json";

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------
interface Dossier {
  id: string;
  jobTitle: string;
  company: string | null;
  jobUrl: string | null;
  coverLetterText: string | null;
  keywords: string | null;
  createdAt: string;
}

interface CvAnalyse {
  id: string;
  fileName: string;
  atsScore: number;
  createdAt: string;
}

interface Candidature {
  id: string;
  jobTitle: string;
  company: string | null;
  jobUrl: string | null;
  status: string;
  followUpAt: string | null;
  createdAt: string;
}

interface HistoryResponse {
  ok: boolean;
  dossiers: Dossier[];
  cvAnalyses: CvAnalyse[];
}

interface TrackerResponse {
  ok: boolean;
  candidatures: Candidature[];
}

const STATUS_OPTIONS = [
  { value: "A_POSTULER", label: "À postuler", badge: "bg-slate-100 text-slate-700" },
  { value: "ENVOYE", label: "Envoyé", badge: "bg-blue-100 text-blue-700" },
  { value: "ENTRETIEN", label: "Entretien", badge: "bg-amber-100 text-amber-800" },
  { value: "REFUS", label: "Refus", badge: "bg-red-100 text-red-700" },
  { value: "OFFRE", label: "Offre reçue", badge: "bg-emerald-100 text-emerald-700" },
] as const;

type TabId = "dossiers" | "suivi" | "cvs";
type TrackerStatus = (typeof STATUS_OPTIONS)[number]["value"];
type TrackerForm = { jobTitle: string; company: string; jobUrl: string; status: TrackerStatus; followUpAt: string };

const TABS: Array<{ id: TabId; label: string; Icon: typeof IconFolder }> = [
  { id: "dossiers", label: "Dossiers générés", Icon: IconFolder },
  { id: "suivi", label: "Suivi des candidatures", Icon: IconClipboardList },
  { id: "cvs", label: "CV analysés", Icon: IconFileText },
];

const EMPTY_FORM: TrackerForm = {
  jobTitle: "",
  company: "",
  jobUrl: "",
  status: "A_POSTULER",
  followUpAt: "",
};

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-[#051937] focus:outline-none";

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(
      new Date(value),
    );
  } catch {
    return value;
  }
}

function statusMeta(status: string) {
  return STATUS_OPTIONS.find((option) => option.value === status) ?? STATUS_OPTIONS[0];
}

// ---------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------
export default function HistoriquePage() {
  const [activeTab, setActiveTab] = useState<TabId>("dossiers");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [cvAnalyses, setCvAnalyses] = useState<CvAnalyse[]>([]);
  const [candidatures, setCandidatures] = useState<Candidature[]>([]);

  const [form, setForm] = useState<TrackerForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [historyResult, trackerResult] = await Promise.all([
      fetchJson<HistoryResponse>("/api/history", { cache: "no-store" }),
      fetchJson<TrackerResponse>("/api/tracker", { cache: "no-store" }),
    ]);

    if (historyResult.error || trackerResult.error) {
      setError(historyResult.error ?? trackerResult.error);
    }
    if (historyResult.data?.ok) {
      setDossiers(historyResult.data.dossiers ?? []);
      setCvAnalyses(historyResult.data.cvAnalyses ?? []);
    }
    if (trackerResult.data?.ok) {
      setCandidatures(trackerResult.data.candidatures ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleAddCandidature(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormFeedback(null);

    const result = await postJson("/api/tracker", {
      jobTitle: form.jobTitle.trim(),
      company: form.company.trim() || undefined,
      jobUrl: form.jobUrl.trim() || undefined,
      status: form.status,
      followUpAt: form.followUpAt || undefined,
    });

    setSubmitting(false);
    if (result.ok) {
      setForm(EMPTY_FORM);
      setFormFeedback({ type: "success", message: "Candidature ajoutée au suivi." });
      await loadAll();
    } else {
      setFormFeedback({ type: "error", message: result.error ?? "Enregistrement impossible." });
    }
  }

  async function handleStatusChange(id: string, status: TrackerStatus) {
    const result = await patchJson("/api/tracker", { id, status });
    if (result.ok) {
      await loadAll();
    } else {
      setError(result.error ?? "Mise à jour impossible.");
    }
  }

  async function handleDelete(id: string) {
    const result = await deleteJson(`/api/tracker?id=${encodeURIComponent(id)}`);
    if (result.ok) {
      await loadAll();
    } else {
      setError(result.error ?? "Suppression impossible.");
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* Bandeau de titre */}
      <header className="flex flex-col gap-4 rounded-2xl bg-[#051937] p-6 text-white sm:flex-row sm:items-center sm:gap-6 sm:p-8">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#FFC107] text-[#051937]">
          <IconHistory size={28} />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#FFC107]">Mon historique &amp; suivi</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Tous vos dossiers, au même endroit</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Retrouvez vos dossiers de candidature générés, suivez chaque envoi et consultez l&apos;analyse ATS de vos CV.
          </p>
        </div>
      </header>

      {/* Bandeau d'erreur (plus jamais de crash JSON) */}
      {error && (
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <IconAlertTriangle size={18} className="shrink-0" />
            {error}
          </span>
          <button
            type="button"
            onClick={() => void loadAll()}
            className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            <IconRefresh size={14} />
            Réessayer
          </button>
        </div>
      )}

      {/* Onglets */}
      <div className="mt-6 flex flex-wrap gap-2 rounded-2xl bg-white p-2 shadow-sm">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === id ? "bg-[#051937] text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      <section className="mt-6">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-24 animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
        ) : (
          <>
            {activeTab === "dossiers" && <DossiersTab dossiers={dossiers} />}
            {activeTab === "suivi" && (
              <SuiviTab
                candidatures={candidatures}
                form={form}
                setForm={setForm}
                submitting={submitting}
                formFeedback={formFeedback}
                onSubmit={handleAddCandidature}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            )}
            {activeTab === "cvs" && <CvTab cvAnalyses={cvAnalyses} />}
          </>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------
// Onglet 1 — Dossiers générés
// ---------------------------------------------------------------------
function DossiersTab({ dossiers }: { dossiers: Dossier[] }) {
  if (dossiers.length === 0) {
    return (
      <EmptyState
        message="Aucun dossier pour le moment"
        hint="Chaque dossier généré par l'Agent de recherche sera automatiquement sauvegardé ici."
      />
    );
  }
  return (
    <div className="space-y-3">
      {dossiers.map((dossier) => (
        <article key={dossier.id} className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-slate-900">{dossier.jobTitle}</h3>
              <p className="mt-0.5 text-sm text-slate-500">
                {dossier.company ?? "Entreprise non précisée"} · Généré le {formatDate(dossier.createdAt)}
              </p>
              {dossier.keywords && <p className="mt-2 text-xs text-slate-500">Mots-clés : {dossier.keywords}</p>}
            </div>
            {dossier.jobUrl && (
              <a
                href={dossier.jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <IconExternalLink size={14} />
                Voir l&apos;offre
              </a>
            )}
          </div>
          {dossier.coverLetterText && (
            <details className="mt-3 border-t border-slate-100 pt-3">
              <summary className="cursor-pointer text-sm font-medium text-[#051937]">Voir la lettre générée</summary>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                {dossier.coverLetterText}
              </p>
            </details>
          )}
        </article>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Onglet 2 — Suivi des candidatures
// ---------------------------------------------------------------------
interface SuiviTabProps {
  candidatures: Candidature[];
  form: TrackerForm;
  setForm: (form: TrackerForm) => void;
  submitting: boolean;
  formFeedback: { type: "success" | "error"; message: string } | null;
  onSubmit: (event: FormEvent) => Promise<void>;
  onStatusChange: (id: string, status: TrackerStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function SuiviTab({
  candidatures,
  form,
  setForm,
  submitting,
  formFeedback,
  onSubmit,
  onStatusChange,
  onDelete,
}: SuiviTabProps) {
  return (
    <div className="space-y-6">
      {/* Formulaire d'ajout */}
      <form onSubmit={(event) => void onSubmit(event)} className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Ajouter une candidature au suivi</h3>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Poste *">
            <input
              value={form.jobTitle}
              onChange={(event) => setForm({ ...form, jobTitle: event.target.value })}
              placeholder="Développeur web"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Entreprise">
            <input
              value={form.company}
              onChange={(event) => setForm({ ...form, company: event.target.value })}
              placeholder="Nom de l'entreprise"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Lien de l'offre">
            <input
              value={form.jobUrl}
              onChange={(event) => setForm({ ...form, jobUrl: event.target.value })}
              placeholder="https://remotive.com/…"
              type="url"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Statut">
            <select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value as TrackerStatus })}
              className={INPUT_CLASS}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date de suivi">
            <input
              value={form.followUpAt}
              onChange={(event) => setForm({ ...form, followUpAt: event.target.value })}
              type="date"
              className={INPUT_CLASS}
            />
          </Field>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting || form.jobTitle.trim().length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#051937] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0a2a5c] disabled:opacity-50"
            >
              {submitting ? <IconLoader2 size={16} className="animate-spin" /> : <IconPlus size={16} />}
              Ajouter au suivi
            </button>
          </div>
        </div>

        {formFeedback && (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-xs ${
              formFeedback.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {formFeedback.message}
          </p>
        )}
      </form>

      {/* Liste */}
      {candidatures.length === 0 ? (
        <EmptyState
          message="Aucune candidature suivie"
          hint="Ajoutez vos candidatures ci-dessus pour ne plus rien oublier (relances, entretiens, réponses)."
        />
      ) : (
        <div className="space-y-3">
          {candidatures.map((candidature) => {
            const meta = statusMeta(candidature.status);
            return (
              <article
                key={candidature.id}
                className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-slate-900">{candidature.jobTitle}</h3>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.badge}`}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {candidature.company ?? "Entreprise non précisée"}
                    {candidature.followUpAt ? ` · Relance le ${formatDate(candidature.followUpAt)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    value={candidature.status}
                    onChange={(event) => void onStatusChange(candidature.id, event.target.value as TrackerStatus)}
                    aria-label="Changer le statut"
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:border-[#051937] focus:outline-none"
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {candidature.jobUrl && (
                    <a
                      href={candidature.jobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Ouvrir l'offre"
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
                    >
                      <IconExternalLink size={16} />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => void onDelete(candidature.id)}
                    aria-label="Supprimer"
                    className="rounded-lg border border-red-200 p-1.5 text-red-500 hover:bg-red-50"
                  >
                    <IconTrash size={16} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Onglet 3 — CV analysés
// ---------------------------------------------------------------------
function CvTab({ cvAnalyses }: { cvAnalyses: CvAnalyse[] }) {
  if (cvAnalyses.length === 0) {
    return (
      <EmptyState
        message="Aucun CV analysé pour le moment"
        hint="Les CV que vous analyserez avec l'outil ATS apparaîtront ici avec leur score."
      />
    );
  }
  return (
    <div className="space-y-3">
      {cvAnalyses.map((cv) => {
        const scoreClass =
          cv.atsScore >= 70
            ? "bg-emerald-100 text-emerald-700"
            : cv.atsScore >= 50
              ? "bg-amber-100 text-amber-800"
              : "bg-red-100 text-red-700";
        return (
          <article
            key={cv.id}
            className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-slate-900">{cv.fileName}</h3>
              <p className="mt-0.5 text-xs text-slate-500">Analysé le {formatDate(cv.createdAt)}</p>
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${scoreClass}`}>
              Score ATS : {cv.atsScore}/100
            </span>
          </article>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------
// Composants internes
// ---------------------------------------------------------------------
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ message, hint }: { message: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <IconInbox size={40} className="text-slate-300" />
      <p className="mt-3 text-sm font-semibold text-slate-700">{message}</p>
      <p className="mt-1 max-w-md text-xs text-slate-500">{hint}</p>
    </div>
  );
}