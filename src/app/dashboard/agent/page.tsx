"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconBriefcase,
  IconCircleCheck,
  IconExternalLink,
  IconLoader2,
  IconMapPin,
  IconRefresh,
  IconRobot,
  IconSearch,
  IconSparkles,
  IconUpload,
} from "@tabler/icons-react";
import { openDossierPanel } from "@/lib/dashboard-client";

interface JobView {
  raw: Record<string, unknown>;
  titre: string;
  entreprise: string;
  lieu: string;
  url: string;
  score?: number;
  description: string;
  raisons: string[];
  source: string;
}

function describeJob(job: Record<string, unknown>): JobView {
  const j = job as Record<string, any>;
  const nested = (j.job ?? {}) as Record<string, any>;
  const scoreBrut = j.score ?? j.match_score ?? j.matchScore ?? j.compatibilite;
  const score =
    typeof scoreBrut === "number"
      ? scoreBrut
      : typeof scoreBrut === "string" && scoreBrut.trim() !== "" && !Number.isNaN(Number(scoreBrut))
        ? Number(scoreBrut)
        : undefined;
  return {
    raw: job,
    titre: String(j.titre ?? j.title ?? j.poste ?? nested.title ?? "Offre sans titre"),
    entreprise: String(j.entreprise ?? j.company ?? j.societe ?? nested.company_name ?? nested.company ?? ""),
    lieu: String(j.lieu ?? j.location ?? j.ville ?? nested.location ?? j.candidate_required_location ?? ""),
    url: String(j.url ?? j.lien ?? j.link ?? nested.url ?? j.url_publication ?? ""),
    score,
    description: String(j.description ?? j.resume ?? j.extrait ?? j.snippet ?? "").slice(0, 220),
    raisons: Array.isArray(j.raisons)
      ? j.raisons
          .filter((raison: unknown) => typeof raison === "string" && raison.trim().length > 0)
          .slice(0, 4)
      : [],
    source: String(j.source ?? j.origine ?? j.board ?? ""),
  };
}

/** Retrouve les mots-clés du CV dans n'importe quelle entrée localStorage "nexirole:*". */
function readCvHints(): { titre: string; competences: string } {
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.toLowerCase().includes("nexirole")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw || raw.length > 20000) continue;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const titre = parsed.titre ?? parsed.title ?? parsed.poste ?? parsed.metier;
      const keywords = parsed.keywords ?? parsed.competences ?? parsed.motsCles;
      if ((typeof titre === "string" && titre.trim()) || Array.isArray(keywords)) {
        return {
          titre: typeof titre === "string" ? titre : "",
          competences: Array.isArray(keywords)
            ? keywords.filter((mot): mot is string => typeof mot === "string").join(", ")
            : "",
        };
      }
    }
  } catch {
    /* ignore */
  }
  return { titre: "", competences: "" };
}

export default function AgentRecherchePage() {
  const router = useRouter();
  const [titre, setTitre] = useState("");
  const [competencesText, setCompetencesText] = useState("");
  const [lieu, setLieu] = useState("");
  const [loading, setLoading] = useState(false);
  const [analyseCv, setAnalyseCv] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobView[]>([]);

  useEffect(() => {
    const hints = readCvHints();
    if (hints.titre) setTitre(hints.titre);
    if (hints.competences) setCompetencesText(hints.competences);
  }, []);

  const lancerRecherche = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    const keywords = competencesText
      .split(",")
      .map((mot) => mot.trim())
      .filter(Boolean);
    const body = {
      query: [titre, ...keywords].filter(Boolean).join(" "),
      titre: titre.trim() || undefined,
      keywords,
      competences: keywords,
      lieu: lieu.trim() || undefined,
      limit: 20,
    };
    try {
      const response = await fetch("/api/agent/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          (json as Record<string, any>)?.error ??
            (json as Record<string, any>)?.message ??
            `Erreur ${response.status} — copie ce message et colle-le-moi pour l'alignement exact.`,
        );
        return;
      }
      const liste = Array.isArray(json)
        ? json
        : ((json as Record<string, any>)?.results ??
           (json as Record<string, any>)?.jobs ??
           (json as Record<string, any>)?.offres ??
           []);
      const vues = Array.isArray(liste)
        ? liste
            .filter((offre) => offre && typeof offre === "object")
            .map((offre) => describeJob(offre as Record<string, unknown>))
        : [];
      setJobs(vues);
      if (vues.length === 0) setNotice("Aucune offre trouvée pour ces critères — essaie d'autres mots-clés.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau pendant la recherche.");
    } finally {
      setLoading(false);
    }
  };

  const extraireDepuisCv = async (file: File) => {
    setAnalyseCv(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/parse-cv", { method: "POST", body: form });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setError((json as Record<string, any>)?.error ?? `Analyse du CV impossible (HTTP ${response.status}).`);
        return;
      }
      const j = (json ?? {}) as Record<string, any>;
      const titreExtrait = j.titre ?? j.title ?? j.poste ?? j.metier ?? j.titre_poste ?? j.keywords?.titre ?? "";
      const mots = j.keywords ?? j.competences ?? j.motsCles ?? j.keywords?.competences ?? [];
      if (typeof titreExtrait === "string" && titreExtrait.trim()) setTitre(titreExtrait.trim());
      if (Array.isArray(mots) && mots.length > 0) {
        setCompetencesText(mots.filter((mot): mot is string => typeof mot === "string").join(", "));
      }
      setNotice("Mots-clés extraits du CV — vérifie puis lance la recherche.");
    } catch {
      setError("Erreur réseau pendant l'analyse du CV.");
    } finally {
      setAnalyseCv(false);
    }
  };

  const genererDossier = (job: JobView) => {
    openDossierPanel(job.raw);
    router.push("/dashboard/dossier");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#051937] md:text-3xl">Agent de recherche en direct</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Recherche en direct sur Remotive et Arbeitnow, offres notées par l&apos;IA selon ton profil.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void lancerRecherche();
        }}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="agent-titre" className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-slate-500">
              Métier / titre visé
            </label>
            <input
              id="agent-titre"
              value={titre}
              onChange={(event) => setTitre(event.target.value)}
              placeholder="Ex. Senior Java Developer"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-[#051937] outline-none transition focus:border-[#FFC107]"
            />
          </div>
          <div>
            <label htmlFor="agent-lieu" className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-slate-500">
              Lieu / télétravail (optionnel)
            </label>
            <input
              id="agent-lieu"
              value={lieu}
              onChange={(event) => setLieu(event.target.value)}
              placeholder="Ex. Remote, Cotonou, Paris"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-[#051937] outline-none transition focus:border-[#FFC107]"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="agent-competences" className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-slate-500">
              Compétences clés (séparées par des virgules)
            </label>
            <input
              id="agent-competences"
              value={competencesText}
              onChange={(event) => setCompetencesText(event.target.value)}
              placeholder="Ex. WordPress, PHP, MySQL"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-[#051937] outline-none transition focus:border-[#FFC107]"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-[#051937] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#0A2A5C] disabled:opacity-60"
          >
            {loading ? <IconLoader2 size={18} stroke={2} className="animate-spin" /> : <IconSearch size={18} stroke={2} />}
            {loading ? "Recherche en cours…" : "Lancer la recherche en direct"}
          </button>

          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-[#051937] transition hover:border-[#FFC107]">
            {analyseCv ? <IconLoader2 size={18} stroke={2} className="animate-spin" /> : <IconUpload size={18} stroke={1.8} />}
            {analyseCv ? "Analyse du CV…" : "Extraire depuis mon CV"}
            <input
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.txt"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void extraireDepuisCv(file);
                event.target.value = "";
              }}
            />
          </label>

          {jobs.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setJobs([]);
                setNotice(null);
                setError(null);
              }}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:border-[#FFC107]"
            >
              <IconRefresh size={18} stroke={1.8} />
              Nouvelle recherche
            </button>
          )}
        </div>

        <p className="mt-3 text-xs font-medium text-slate-400">
          Le premier scan peut prendre 30 à 90 s : l&apos;agent interroge deux plateformes puis note chaque offre avec l&apos;IA.
        </p>
      </form>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <IconAlertTriangle size={20} stroke={1.8} className="mt-0.5 shrink-0 text-red-600" />
          <p className="text-sm font-semibold text-red-700">{error}</p>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <IconCircleCheck size={20} stroke={1.8} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-sm font-semibold text-amber-800">{notice}</p>
        </div>
      )}

      {jobs.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm font-bold text-slate-500">
            {jobs.length} offre{jobs.length > 1 ? "s" : ""} trouvée{jobs.length > 1 ? "s" : ""}
          </p>
          {jobs.map((job, index) => (
            <article
              key={`${job.titre}-${index}`}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#FFC107]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-extrabold text-[#051937]">{job.titre}</h2>
                    {job.score !== undefined && (
                      <span className="rounded-full bg-[#FFC107] px-2.5 py-1 text-xs font-extrabold text-[#051937]">
                        {job.score <= 1 ? `${Math.round(job.score * 100)} %` : `${job.score}`} match
                      </span>
                    )}
                    {job.source && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {job.source}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
                    {job.entreprise && (
                      <span className="flex items-center gap-1.5">
                        <IconBriefcase size={14} stroke={1.8} />
                        {job.entreprise}
                      </span>
                    )}
                    {job.lieu && (
                      <span className="flex items-center gap-1.5">
                        <IconMapPin size={14} stroke={1.8} />
                        {job.lieu}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {job.url && (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:border-[#FFC107]"
                    >
                      <IconExternalLink size={15} stroke={1.8} />
                      Voir l&apos;offre
                    </a>
                  )}
                  <button
                    onClick={() => genererDossier(job)}
                    className="flex items-center gap-1.5 rounded-xl bg-[#FFC107] px-3.5 py-2 text-xs font-extrabold text-[#051937] transition hover:bg-[#FFD54F]"
                  >
                    <IconSparkles size={15} stroke={1.8} />
                    Générer le dossier
                  </button>
                </div>
              </div>

              {job.raisons.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {job.raisons.map((raison) => (
                    <span key={raison} className="rounded-full bg-[#051937]/5 px-2.5 py-1 text-xs font-bold text-[#051937]">
                      {raison}
                    </span>
                  ))}
                </div>
              )}
              {job.description && (
                <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600">{job.description}…</p>
              )}
            </article>
          ))}
        </div>
      )}

      {!loading && jobs.length === 0 && !error && !notice && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
          <IconRobot size={36} stroke={1.5} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-500">
            Lance ta première recherche : l&apos;agent remonte les offres les mieux notées pour ton profil.
          </p>
        </div>
      )}
    </div>
  );
}