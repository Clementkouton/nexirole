"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  IconCirclePlus,
  IconCopy,
  IconDownload,
  IconFileText,
  IconHistory,
  IconLoader2,
  IconPhoto,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";

/**
 * PARTIE 2 — Onglet « Mon Historique & Suivi » du tableau de bord :
 *  1. Dossiers générés : rechargés en un clic vers « CV & Lettre par offre »
 *     (pour changer de modèle), retéléchargeables en PDF (CV + lettre),
 *     ajoutables au suivi, supprimables.
 *  2. Suivi des candidatures : tableau interactif avec changement de statut
 *     instantané (À postuler / Envoyé / Entretien / Refus / Offre).
 *  3. CV analysés : sauvegarde automatique de chaque import de CV.
 */

/* ------------------------------------------------------------------ */
/*  Types (sérialisation API des modèles Prisma)                       */
/* ------------------------------------------------------------------ */

interface HistoryApplication {
  id: string;
  jobTitle: string;
  companyName: string;
  jobUrl: string | null;
  templateId: string;
  withPhoto: boolean;
  cvJson: unknown;
  coverLetter: string;
  interviewKitJson: unknown;
  candidateJson: unknown;
  initialScore: number | null;
  optimizedScore: number | null;
  createdAt: string;
}

interface SavedResumeItem {
  id: string;
  fileName: string;
  extractedText: string;
  detectedSkills: string[];
  profileSummary: string | null;
  createdAt: string;
}

interface TrackerItem {
  id: string;
  jobTitle: string;
  companyName: string;
  jobUrl: string | null;
  status: TrackerStatus;
  notes: string | null;
  followUpDate: string | null;
  updatedAt: string;
}

type TrackerStatus = "A_POSTULER" | "ENVOYE" | "ENTRETIEN" | "REFUS" | "OFFRE";

const STATUS_META: Record<TrackerStatus, { label: string; chip: string }> = {
  A_POSTULER: { label: "À postuler", chip: "bg-slate-100 text-slate-700" },
  ENVOYE: { label: "Envoyé", chip: "bg-blue-100 text-blue-700" },
  ENTRETIEN: { label: "Entretien", chip: "bg-amber-100 text-amber-700" },
  REFUS: { label: "Refus", chip: "bg-red-100 text-red-700" },
  OFFRE: { label: "Offre reçue", chip: "bg-emerald-100 text-emerald-700" },
};

const STATUS_ORDER: TrackerStatus[] = ["A_POSTULER", "ENVOYE", "ENTRETIEN", "REFUS", "OFFRE"];

const STORAGE_KEY = "nexirole:dossier-offer";
const OPEN_EVENT = "nexirole:open-dossier";

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return "";
  }
}

async function downloadPdf(kind: "cv" | "cover-letter", data: unknown, filename: string) {
  const res = await fetch("/api/download-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, data }),
  });
  if (!res.ok) throw new Error("pdf-failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filename}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Composant principal                                                */
/* ------------------------------------------------------------------ */

type SubTab = "dossiers" | "suivi" | "cv";

export function HistoryPanel() {
  const [subTab, setSubTab] = useState<SubTab>("dossiers");

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-navy p-6 text-white shadow-lg">
        <div className="flex items-center gap-2 text-gold">
          <IconHistory className="size-5" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Mon Historique &amp; Suivi
          </span>
        </div>
        <h1 className="mt-3 font-heading text-2xl font-bold sm:text-3xl">
          Tous vos dossiers, au même endroit
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">
          Retéléchargez vos CV et lettres, rechargez un dossier pour changer de
          modèle, et pilotez l&apos;avancement de chaque candidature jusqu&apos;à l&apos;offre.
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["dossiers", "Dossiers générés"],
            ["suivi", "Suivi des candidatures"],
            ["cv", "CV analysés"],
          ] as Array<[SubTab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              subTab === id
                ? "bg-navy text-white shadow"
                : "border border-slate-200 bg-white text-slate-600 hover:text-navy"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === "dossiers" ? <DossiersSection /> : null}
      {subTab === "suivi" ? <TrackerSection /> : null}
      {subTab === "cv" ? <ResumesSection /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  1. Dossiers générés                                                */
/* ------------------------------------------------------------------ */

function DossiersSection() {
  const [items, setItems] = useState<HistoryApplication[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/history?type=applications", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { items: HistoryApplication[] };
      setItems(data.items);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reloadIntoDossier = (item: HistoryApplication) => {
    // Même contrat que l'Agent : l'onglet « CV & Lettre par offre »
    // reprend l'offre (valable 2 minutes) via localStorage + événement.
    const payload = {
      offerUrl: item.jobUrl ?? "",
      offerTitle: item.jobTitle,
      offerDescription: "",
      createdAt: Date.now(),
      fromHistoryId: item.id,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new Event(OPEN_EVENT));
    toast.success("Dossier rechargé dans « CV & Lettre par offre »");
  };

  const download = async (
    item: HistoryApplication,
    kind: "cv" | "cover-letter"
  ) => {
    setBusyId(`${item.id}:${kind}`);
    try {
      const candidate = (item.candidateJson ?? {}) as {
        fullName?: string;
        email?: string;
        phone?: string;
        location?: string;
        linkedin?: string;
      };
      const baseName =
        candidate.fullName?.trim().replace(/\s+/g, "-") ||
        item.jobTitle.replace(/\s+/g, "-").slice(0, 40) ||
        "NexiRole";
      if (kind === "cv") {
        await downloadPdf("cv", {
          cv: item.cvJson,
          candidateName: candidate.fullName,
          contact: {
            email: candidate.email,
            phone: candidate.phone,
            location: candidate.location,
            linkedin: candidate.linkedin,
          },
        }, `CV-${baseName}`);
      } else {
        let letter: unknown = {};
        try {
          letter = JSON.parse(item.coverLetter) as unknown;
        } catch {
          letter = {};
        }
        await downloadPdf("cover-letter", {
          letter,
          candidateName: candidate.fullName,
          jobTitle: item.jobTitle,
          company: item.companyName,
          contact: { email: candidate.email, phone: candidate.phone, location: candidate.location },
        }, `Lettre-${baseName}`);
      }
      toast.success("PDF téléchargé");
    } catch {
      toast.error("La génération du PDF a échoué. Réessayez.");
    } finally {
      setBusyId(null);
    }
  };

  const addToTracker = async (item: HistoryApplication) => {
    try {
      const res = await fetch("/api/tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: item.jobTitle,
          companyName: item.companyName,
          jobUrl: item.jobUrl ?? "",
          status: "A_POSTULER",
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Ajouté au suivi des candidatures");
    } catch {
      toast.error("Impossible d'ajouter au suivi.");
    }
  };

  const remove = async (item: HistoryApplication) => {
    if (!window.confirm(`Supprimer définitivement le dossier « ${item.jobTitle} » ?`)) return;
    try {
      const res = await fetch(`/api/history?type=applications&id=${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setItems((prev) => prev?.filter((entry) => entry.id !== item.id) ?? null);
      toast.success("Dossier supprimé de l'historique");
    } catch {
      toast.error("Suppression impossible.");
    }
  };

  if (items === null) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 text-slate-500">
        <IconLoader2 className="size-6 animate-spin" />
        <span className="ml-2 text-sm">Chargement de vos dossiers…</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <IconFileText className="mx-auto size-10 text-slate-300" />
        <p className="mt-3 font-semibold text-navy">Aucun dossier pour le moment</p>
        <p className="mt-1 text-sm text-slate-500">
          Chaque dossier généré dans « CV &amp; Lettre par offre » est automatiquement
          sauvegardé ici.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-heading font-bold text-navy">{item.jobTitle}</h3>
              <p className="text-sm text-slate-500">
                {item.companyName} · généré le {formatDate(item.createdAt)}
                {item.jobUrl ? (
                  <>
                    {" · "}
                    <a
                      href={item.jobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-navy underline underline-offset-2"
                    >
                      voir l&apos;offre
                    </a>
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => reloadIntoDossier(item)}
                className="inline-flex items-center gap-1.5 rounded-full bg-navy px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-navy-800"
              >
                <IconRefresh className="size-3.5" />
                Recharger
              </button>
              <button
                type="button"
                disabled={busyId === `${item.id}:cv`}
                onClick={() => download(item, "cv")}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {busyId === `${item.id}:cv` ? (
                  <IconLoader2 className="size-3.5 animate-spin" />
                ) : (
                  <IconFileText className="size-3.5" />
                )}
                CV PDF
              </button>
              <button
                type="button"
                disabled={busyId === `${item.id}:cover-letter`}
                onClick={() => download(item, "cover-letter")}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {busyId === `${item.id}:cover-letter` ? (
                  <IconLoader2 className="size-3.5 animate-spin" />
                ) : (
                  <IconDownload className="size-3.5" />
                )}
                Lettre PDF
              </button>
              <button
                type="button"
                onClick={() => addToTracker(item)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <IconCirclePlus className="size-3.5" />
                + Suivi
              </button>
              <button
                type="button"
                onClick={() => remove(item)}
                aria-label="Supprimer le dossier"
                className="inline-flex items-center rounded-full border border-red-200 p-2 text-red-500 transition hover:bg-red-50"
              >
                <IconTrash className="size-3.5" />
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  2. Suivi des candidatures                                          */
/* ------------------------------------------------------------------ */

function TrackerSection() {
  const [items, setItems] = useState<TrackerItem[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    jobTitle: "",
    companyName: "",
    jobUrl: "",
    status: "A_POSTULER" as TrackerStatus,
    followUpDate: "",
    notes: "",
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tracker", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { items: TrackerItem[] };
      setItems(data.items);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = async (item: TrackerItem, status: TrackerStatus) => {
    // Mise à jour optimiste : le statut change instantanément
    setItems((prev) =>
      prev?.map((entry) => (entry.id === item.id ? { ...entry, status } : entry)) ?? prev
    );
    try {
      const res = await fetch("/api/tracker", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, status }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Statut : ${STATUS_META[status].label}`);
    } catch {
      // Rollback en cas d'échec
      setItems((prev) =>
        prev?.map((entry) =>
          entry.id === item.id ? { ...entry, status: item.status } : entry
        ) ?? prev
      );
      toast.error("Impossible de changer le statut.");
    }
  };

  const remove = async (item: TrackerItem) => {
    try {
      const res = await fetch(`/api/tracker?id=${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setItems((prev) => prev?.filter((entry) => entry.id !== item.id) ?? null);
    } catch {
      toast.error("Suppression impossible.");
    }
  };

  const submit = async () => {
    if (!form.jobTitle.trim() || !form.companyName.trim()) {
      toast.error("Poste et entreprise sont obligatoires.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: form.jobTitle.trim(),
          companyName: form.companyName.trim(),
          jobUrl: form.jobUrl.trim() || "",
          status: form.status,
          followUpDate: form.followUpDate
            ? new Date(`${form.followUpDate}T12:00:00Z`).toISOString()
            : null,
          notes: form.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "failed");
      }
      setForm({
        jobTitle: "",
        companyName: "",
        jobUrl: "",
        status: "A_POSTULER",
        followUpDate: "",
        notes: "",
      });
      setFormOpen(false);
      await load();
      toast.success("Candidature ajoutée au suivi");
    } catch (error) {
      toast.error(
        error instanceof Error && error.message !== "failed"
          ? error.message
          : "Impossible d'ajouter la candidature."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-800"
        >
          <IconCirclePlus className="size-4" />
          {formOpen ? "Fermer" : "Ajouter une candidature"}
        </button>
      </div>

      {formOpen ? (
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
          <input
            type="text"
            value={form.jobTitle}
            onChange={(evt) => setForm({ ...form, jobTitle: evt.target.value })}
            placeholder="Intitulé du poste *"
            className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-navy"
          />
          <input
            type="text"
            value={form.companyName}
            onChange={(evt) => setForm({ ...form, companyName: evt.target.value })}
            placeholder="Entreprise *"
            className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-navy"
          />
          <input
            type="url"
            value={form.jobUrl}
            onChange={(evt) => setForm({ ...form, jobUrl: evt.target.value })}
            placeholder="Lien de l'offre (facultatif)"
            className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-navy sm:col-span-2"
          />
          <select
            value={form.status}
            onChange={(evt) => setForm({ ...form, status: evt.target.value as TrackerStatus })}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy"
          >
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {STATUS_META[status].label}
              </option>
            ))}
          </select>
          <div>
            <label className="text-xs font-semibold text-slate-500">Date de relance</label>
            <input
              type="date"
              value={form.followUpDate}
              onChange={(evt) => setForm({ ...form, followUpDate: evt.target.value })}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-navy"
            />
          </div>
          <textarea
            value={form.notes}
            onChange={(evt) => setForm({ ...form, notes: evt.target.value })}
            placeholder="Notes (contact, échanges, salaire…)"
            rows={3}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-navy sm:col-span-2"
          />
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-navy px-5 text-sm font-semibold text-white transition hover:bg-navy-800 disabled:opacity-60 sm:col-span-2"
          >
            {saving ? <IconLoader2 className="size-4 animate-spin" /> : <IconCirclePlus className="size-4" />}
            Enregistrer
          </button>
        </div>
      ) : null}

      {items === null ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 text-slate-500">
          <IconLoader2 className="size-6 animate-spin" />
          <span className="ml-2 text-sm">Chargement du suivi…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <IconHistory className="mx-auto size-10 text-slate-300" />
          <p className="mt-3 font-semibold text-navy">Aucune candidature suivie</p>
          <p className="mt-1 text-sm text-slate-500">
            Ajoutez vos candidatures manuellement ou via le bouton « + Suivi » d&apos;un dossier.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Poste</th>
                <th className="px-4 py-3">Entreprise</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Relance</th>
                <th className="px-4 py-3">MAJ</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-semibold text-navy">
                    {item.jobUrl ? (
                      <a
                        href={item.jobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-slate-300 underline-offset-2 hover:text-gold"
                      >
                        {item.jobTitle}
                      </a>
                    ) : (
                      item.jobTitle
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.companyName}</td>
                  <td className="px-4 py-3">
                    <select
                      value={item.status}
                      onChange={(evt) =>
                        void changeStatus(item, evt.target.value as TrackerStatus)
                      }
                      className={`rounded-full border-0 px-3 py-1.5 text-xs font-bold ${STATUS_META[item.status].chip}`}
                    >
                      {STATUS_ORDER.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_META[status].label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.followUpDate ? formatDate(item.followUpDate) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(item.updatedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => remove(item)}
                      aria-label="Supprimer"
                      className="inline-flex rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <IconTrash className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  3. CV analysés                                                     */
/* ------------------------------------------------------------------ */

function ResumesSection() {
  const [items, setItems] = useState<SavedResumeItem[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/history?type=resumes", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { items: SavedResumeItem[] };
      setItems(data.items);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (item: SavedResumeItem) => {
    try {
      const res = await fetch(`/api/history?type=resumes&id=${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setItems((prev) => prev?.filter((entry) => entry.id !== item.id) ?? null);
    } catch {
      toast.error("Suppression impossible.");
    }
  };

  if (items === null) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 text-slate-500">
        <IconLoader2 className="size-6 animate-spin" />
        <span className="ml-2 text-sm">Chargement…</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <IconPhoto className="mx-auto size-10 text-slate-300" />
        <p className="mt-3 font-semibold text-navy">Aucun CV analysé pour l&apos;instant</p>
        <p className="mt-1 text-sm text-slate-500">
          Chaque CV importé (PDF, image, Word) est sauvegardé automatiquement ici avec
          ses compétences détectées.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="flex items-center gap-2 font-heading font-bold text-navy">
                <IconFileText className="size-4 shrink-0 text-slate-400" />
                {item.fileName}
              </h3>
              <p className="mt-0.5 text-sm text-slate-500">
                Analysé le {formatDate(item.createdAt)}
              </p>
              {item.profileSummary ? (
                <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                  {item.profileSummary}
                </p>
              ) : null}
              {item.detectedSkills.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.detectedSkills.slice(0, 10).map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(item.extractedText)
                    .then(() => toast.success("Texte du CV copié"))
                    .catch(() => toast.error("Copie impossible"));
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <IconCopy className="size-3.5" />
                Copier le texte
              </button>
              <button
                type="button"
                onClick={() => remove(item)}
                aria-label="Supprimer le CV analysé"
                className="inline-flex items-center rounded-full border border-red-200 p-2 text-red-500 transition hover:bg-red-50"
              >
                <IconTrash className="size-3.5" />
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
