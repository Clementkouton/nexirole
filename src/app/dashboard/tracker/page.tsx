"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  IconBriefcase,
  IconCalendarCheck,
  IconCheck,
  IconClipboardList,
  IconClock,
  IconExternalLink,
  IconLoader2,
  IconMailForward,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";

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

const STATUS_META: Record<TrackerStatus, { label: string; badge: string }> = {
  A_POSTULER: { label: "À postuler", badge: "bg-slate-100 text-slate-600" },
  ENVOYE: { label: "Envoyée", badge: "bg-blue-50 text-blue-700" },
  ENTRETIEN: { label: "Entretien", badge: "bg-[#FFC107]/15 text-[#B7791F]" },
  OFFRE: { label: "Offre", badge: "bg-green-50 text-green-700" },
  REFUSEE: { label: "Refusée", badge: "bg-red-50 text-red-600" },
};

const STATUS_ORDER: TrackerStatus[] = ["A_POSTULER", "ENVOYE", "ENTRETIEN", "OFFRE", "REFUSEE"];

const FOLLOWUP_THRESHOLD_DAYS = 7;

const KEYFRAMES = `
@keyframes nxr-fade-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
.nxr-fade-up { animation: nxr-fade-up 0.45s ease-out both; }
`;

function daysSince(dateIso: string): number {
  const diff = Date.now() - new Date(dateIso).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function formatDate(dateIso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dateIso));
}

function sortApplications(list: TrackerApplication[]): TrackerApplication[] {
  return [...list].sort(
    (a, b) => new Date(b.lastActionDate).getTime() - new Date(a.lastActionDate).getTime()
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent}`}>{icon}</div>
      <p className="mt-3 text-2xl font-bold text-[#051937]">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: TrackerStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_META[status].badge}`}
    >
      {STATUS_META[status].label}
    </span>
  );
}

export default function TrackerPage() {
  const [applications, setApplications] = useState<TrackerApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newJobUrl, setNewJobUrl] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newStatus, setNewStatus] = useState<TrackerStatus>("A_POSTULER");

  const [followUp, setFollowUp] = useState<{
    subject: string;
    body: string;
    jobTitle: string;
    companyName: string;
    days: number;
  } | null>(null);
  const [followUpLoadingId, setFollowUpLoadingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadApplications = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/tracker", { cache: "no-store" });
      if (!response.ok) throw new Error("failed");
      const data = (await response.json()) as { applications?: TrackerApplication[] };
      setApplications(data.applications ?? []);
    } catch {
      setLoadError("Impossible de charger vos candidatures.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  const stats = useMemo(() => {
    const pending = applications.filter(
      (item) => item.status === "A_POSTULER" || item.status === "ENVOYE"
    ).length;
    const interviews = applications.filter(
      (item) => item.status === "ENTRETIEN" || item.status === "OFFRE"
    ).length;
    const followUps = applications.filter(
      (item) => item.status === "ENVOYE" && daysSince(item.lastActionDate) > FOLLOWUP_THRESHOLD_DAYS
    ).length;
    return { total: applications.length, pending, interviews, followUps };
  }, [applications]);

  async function handleStatusChange(application: TrackerApplication, nextStatus: TrackerStatus) {
    if (application.status === nextStatus) return;
    setActionError(null);
    const previous = applications;
    setApplications((current) =>
      current.map((item) =>
        item.id === application.id
          ? { ...item, status: nextStatus, lastActionDate: new Date().toISOString() }
          : item
      )
    );
    try {
      const response = await fetch("/api/tracker", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: application.id, status: nextStatus }),
      });
      if (!response.ok) throw new Error("failed");
      const data = (await response.json()) as { application?: TrackerApplication };
      const updated = data.application;
      if (updated) {
        setApplications((current) =>
          sortApplications(current.map((item) => (item.id === updated.id ? updated : item)))
        );
      }
    } catch {
      setApplications(previous);
      setActionError("Changement de statut impossible. Réessayez.");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Supprimer cette candidature du suivi ?")) return;
    setDeletingId(id);
    setActionError(null);
    try {
      const response = await fetch("/api/tracker", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error("failed");
      setApplications((current) => current.filter((item) => item.id !== id));
    } catch {
      setActionError("Suppression impossible. Réessayez.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleGenerateFollowUp(application: TrackerApplication) {
    setFollowUpLoadingId(application.id);
    setActionError(null);
    setCopied(false);
    try {
      const response = await fetch("/api/tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate-followup", id: application.id }),
      });
      const data = (await response.json()) as {
        subject?: string;
        body?: string;
        error?: string;
      };
      if (!response.ok || !data.subject || !data.body) {
        throw new Error(data.error ?? "Génération de la relance impossible. Réessayez.");
      }
      setFollowUp({
        subject: data.subject,
        body: data.body,
        jobTitle: application.jobTitle,
        companyName: application.companyName,
        days: daysSince(application.lastActionDate),
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Génération de la relance impossible.");
    } finally {
      setFollowUpLoadingId(null);
    }
  }

  async function handleAddSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (addSubmitting) return;
    setActionError(null);
    if (!newJobTitle.trim() || !newCompanyName.trim()) {
      setActionError("Le poste et l'entreprise sont obligatoires.");
      return;
    }
    setAddSubmitting(true);
    try {
      const response = await fetch("/api/tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: newJobTitle.trim(),
          companyName: newCompanyName.trim(),
          jobUrl: newJobUrl.trim(),
          notes: newNotes.trim(),
          status: newStatus,
        }),
      });
      const data = (await response.json()) as {
        application?: TrackerApplication;
        error?: string;
      };
      const created = data.application;
      if (!response.ok || !created) {
        throw new Error(data.error ?? "Ajout impossible. Réessayez.");
      }
      setApplications((current) => sortApplications([created, ...current]));
      setShowAddModal(false);
      setNewJobTitle("");
      setNewCompanyName("");
      setNewJobUrl("");
      setNewNotes("");
      setNewStatus("A_POSTULER");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Ajout impossible.");
    } finally {
      setAddSubmitting(false);
    }
  }

  async function handleCopyFollowUp() {
    if (!followUp) return;
    try {
      await navigator.clipboard.writeText(`Objet : ${followUp.subject}\n\n${followUp.body}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setActionError("Copie impossible : sélectionnez le texte manuellement.");
    }
  }

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#051937] focus:bg-white focus:ring-2 focus:ring-[#051937]/10";

  return (
    <div className="bg-[#F8FAFC]">
      <style>{KEYFRAMES}</style>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#051937]">Suivi de candidatures</h1>
            <p className="mt-1 text-sm text-slate-500">
              Pilotez chaque opportunité et ne laissez plus aucune relance au hasard.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#051937] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0B2A5B]"
          >
            <IconPlus className="h-4 w-4" />
            Nouvelle candidature
          </button>
        </div>

        {loadError ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => void loadApplications()}
              className="font-semibold underline underline-offset-2"
            >
              Réessayer
            </button>
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <IconLoader2 className="h-8 w-8 animate-spin text-[#051937]/40" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                icon={<IconBriefcase className="h-5 w-5" />}
                label="Total suivies"
                value={stats.total}
                accent="bg-[#051937]/5 text-[#051937]"
              />
              <StatCard
                icon={<IconClock className="h-5 w-5" />}
                label="En attente"
                value={stats.pending}
                accent="bg-blue-50 text-blue-600"
              />
              <StatCard
                icon={<IconCalendarCheck className="h-5 w-5" />}
                label="Entretiens décrochés"
                value={stats.interviews}
                accent="bg-[#FFC107]/15 text-[#B7791F]"
              />
              <StatCard
                icon={<IconMailForward className="h-5 w-5" />}
                label="Relances suggérées"
                value={stats.followUps}
                accent="bg-amber-50 text-amber-600"
              />
            </div>

            {actionError ? (
              <div className="mt-6 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                <span>{actionError}</span>
              </div>
            ) : null}

            {applications.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-50">
                  <IconClipboardList className="h-8 w-8 text-slate-300" />
                </span>
                <h2 className="mt-4 text-lg font-bold text-[#051937]">Aucune candidature suivie</h2>
                <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                  Ajoutez vos candidatures pour suivre chaque étape et ne plus jamais oublier une
                  relance.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#051937] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0B2A5B]"
                >
                  <IconPlus className="h-4 w-4" />
                  Ajouter ma première candidature
                </button>
              </div>
            ) : (
              <div className="mt-8 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                <div className="hidden border-b border-slate-100 bg-slate-50/60 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-400 sm:px-6 lg:grid lg:grid-cols-12 lg:gap-4">
                  <span className="lg:col-span-4">Poste &amp; entreprise</span>
                  <span className="lg:col-span-2">Statut</span>
                  <span className="lg:col-span-2">Changer l'étape</span>
                  <span className="lg:col-span-3">Relance IA</span>
                  <span className="lg:col-span-1 text-right">Actions</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {applications.map((application) => {
                    const elapsed = daysSince(application.lastActionDate);
                    const needsFollowUp =
                      application.status === "ENVOYE" && elapsed > FOLLOWUP_THRESHOLD_DAYS;
                    return (
                      <div key={application.id} className="nxr-fade-up">
                        <div className="px-4 py-4 sm:px-6 lg:grid lg:grid-cols-12 lg:items-center lg:gap-4">
                          <div className="min-w-0 lg:col-span-4">
                            <p className="truncate text-sm font-bold text-[#051937]">
                              {application.jobTitle}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-slate-500">
                              {application.companyName}
                            </p>
                            {application.jobUrl ? (
                              <a
                                href={application.jobUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
                              >
                                <IconExternalLink className="h-3.5 w-3.5" />
                                Voir l'offre
                              </a>
                            ) : null}
                            {application.notes ? (
                              <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                                {application.notes}
                              </p>
                            ) : null}
                            <p className="mt-1 text-[11px] text-slate-400">
                              Dernière action : {formatDate(application.lastActionDate)}
                            </p>
                          </div>

                          <div className="mt-3 lg:mt-0 lg:col-span-2">
                            <StatusBadge status={application.status} />
                          </div>

                          <div className="mt-3 lg:mt-0 lg:col-span-2">
                            <select
                              value={application.status}
                              onChange={(event) =>
                                void handleStatusChange(application, event.target.value as TrackerStatus)
                              }
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-[#051937] outline-none transition focus:border-[#051937] focus:ring-2 focus:ring-[#051937]/10"
                            >
                              {STATUS_ORDER.map((status) => (
                                <option key={status} value={status}>
                                  {STATUS_META[status].label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="mt-3 flex flex-col items-start gap-2 lg:mt-0 lg:col-span-3">
                            {needsFollowUp ? (
                              <>
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">
                                  <IconMailForward className="h-3.5 w-3.5" />
                                  Relance suggérée ({elapsed} jour{elapsed > 1 ? "s" : ""})
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void handleGenerateFollowUp(application)}
                                  disabled={followUpLoadingId === application.id}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-3 py-2 text-[11px] font-bold text-[#051937] transition hover:bg-[#FFD54F] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {followUpLoadingId === application.id ? (
                                    <>
                                      <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                                      Génération…
                                    </>
                                  ) : (
                                    <>
                                      <IconMailForward className="h-3.5 w-3.5" />
                                      Générer l'e-mail de relance IA
                                    </>
                                  )}
                                </button>
                              </>
                            ) : (
                              <p className="text-xs text-slate-400">
                                Envoyée il y a {elapsed} jour{elapsed > 1 ? "s" : ""}
                              </p>
                            )}
                          </div>

                          <div className="mt-3 flex lg:mt-0 lg:col-span-1 lg:justify-end">
                            <button
                              type="button"
                              onClick={() => void handleDelete(application.id)}
                              disabled={deletingId === application.id}
                              aria-label="Supprimer la candidature"
                              className="rounded-lg border border-slate-200 p-2 text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingId === application.id ? (
                                <IconLoader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <IconTrash className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {showAddModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#051937]/40 px-4"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowAddModal(false);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl nxr-fade-up">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#051937]">Nouvelle candidature</h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Fermer"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-[#051937]"
              >
                <IconX className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAddSubmit} className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Intitulé du poste *
                </span>
                <input
                  type="text"
                  value={newJobTitle}
                  onChange={(event) => setNewJobTitle(event.target.value)}
                  placeholder="Développeur Front-End"
                  required
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Entreprise *</span>
                <input
                  type="text"
                  value={newCompanyName}
                  onChange={(event) => setNewCompanyName(event.target.value)}
                  placeholder="TechCorp"
                  required
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  URL de l'offre (optionnel)
                </span>
                <input
                  type="url"
                  value={newJobUrl}
                  onChange={(event) => setNewJobUrl(event.target.value)}
                  placeholder="https://..."
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Statut initial
                </span>
                <select
                  value={newStatus}
                  onChange={(event) => setNewStatus(event.target.value as TrackerStatus)}
                  className={inputClass}
                >
                  {STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_META[status].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Notes (optionnel)
                </span>
                <textarea
                  rows={3}
                  value={newNotes}
                  onChange={(event) => setNewNotes(event.target.value)}
                  placeholder="Contact : Mme Diallo, entretien prévu le 12…"
                  className={inputClass}
                />
              </label>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={addSubmitting}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#051937] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0B2A5B] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {addSubmitting ? (
                    <>
                      <IconLoader2 className="h-4 w-4 animate-spin" />
                      Ajout en cours…
                    </>
                  ) : (
                    "Ajouter au suivi"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {followUp ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#051937]/40 px-4"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) setFollowUp(null);
          }}
        >
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl nxr-fade-up">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#051937]">Relance IA générée</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {followUp.jobTitle} · {followUp.companyName} — candidature envoyée il y a{" "}
                  {followUp.days} jour{followUp.days > 1 ? "s" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFollowUp(null)}
                aria-label="Fermer"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-[#051937]"
              >
                <IconX className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5">
              <p className="mb-1.5 text-sm font-medium text-slate-700">Objet</p>
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-[#051937]">
                {followUp.subject}
              </p>
            </div>
            <div className="mt-4">
              <p className="mb-1.5 text-sm font-medium text-slate-700">Corps de l'e-mail</p>
              <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 font-sans text-sm leading-relaxed text-slate-700">
                {followUp.body}
              </pre>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => void handleCopyFollowUp()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#FFC107] px-4 py-3 text-sm font-bold text-[#051937] transition hover:bg-[#FFD54F]"
              >
                {copied ? (
                  <>
                    <IconCheck className="h-4 w-4" />
                    Copié !
                  </>
                ) : (
                  <>
                    <IconMailForward className="h-4 w-4" />
                    Copier tout en un clic
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setFollowUp(null)}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}