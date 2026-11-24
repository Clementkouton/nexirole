"use client";

/**
 * NexiRole — COACH DE NÉGOCIATION SALARIALE IA (page /dashboard/negociation).
 *
 * Refonte « Historique & Dossiers » : la page s'organise autour de DEUX vues
 * fluides :
 *
 *   Vue A — Tableau de bord & liste des coachings (par défaut) :
 *     3 cartes statistiques (coachings sauvegardés, dernière cible calculée,
 *     marché le plus ciblé) + liste complète des coachings enregistrés avec
 *     barre d'actions : Voir / Éditer / Télécharger PDF / Partager / Supprimer.
 *
 *   Vue B — Formulaire de création / édition & résultat détaillé :
 *     sélecteur « Pays et Devise » mondial (combobox avec recherche
 *     instantanée : 197 pays, drapeau + nom + devise, filtre par pays ou
 *     devise), puis analyse complète (3 fourchettes, marché, 3 arguments,
 *     3 onglets de scripts) avec barre d'actions : Retour à mes coachings,
 *     Sauvegardé automatiquement / Enregistrer les modifications,
 *     Télécharger en PDF, Partager.
 *
 * PERSISTANCE : chaque simulation générée est automatiquement sauvegardée
 * en base (modèle SalaryNegotiation) — PATCH /api/salary-coach/[id] pour
 * l'édition, DELETE pour la suppression, GET /api/salary-coach pour la liste.
 *
 * LIMITES PAR PLAN (inchangées) : bannière de quota au chargement (GET),
 * carte d'upgrade dorée sur 403 QUOTA_EXCEEDED, plans payants illimités.
 *
 * Export PDF : composant @react-pdf/renderer chargé STRICTEMENT côté client
 * par import dynamique au clic (aucun import statique → jamais rendu côté
 * serveur). Icônes : exclusivement @tabler/icons-react. Charte : navy
 * #051937 + or #FFC107.
 */

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  cx,
} from "@/components/ui";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBolt,
  IconCalendarEvent,
  IconCertificate,
  IconChartBar,
  IconCheck,
  IconChevronDown,
  IconCircleCheck,
  IconCoin,
  IconCopy,
  IconCrown,
  IconDeviceFloppy,
  IconEdit,
  IconEye,
  IconFileTypePdf,
  IconGift,
  IconInfoCircle,
  IconLoader2,
  IconMail,
  IconMapPin,
  IconMessageCircle,
  IconPlus,
  IconSearch,
  IconShieldCheck,
  IconSparkles,
  IconTargetArrow,
  IconTrendingUp,
  IconTrash,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import {
  PAYS_DEVISES,
  rechercherPaysDevises,
  trouverPaysParNom,
  type PaysDevise,
} from "@/lib/countries-currencies";

/* ── Types ───────────────────────────────────────────────────────────── */

/** Réponse IA structurée (stockée dans SalaryNegotiation.resultJson). */
type ResultatNegociation = {
  fourchette_min: string;
  fourchette_cible: string;
  fourchette_max: string;
  analyse_marche: string;
  arguments_valeur: Array<{ titre: string; explication: string }>;
  scripts_reponse: {
    question_entretien: string;
    contre_proposition_email: string;
    alternatives_avantages: Array<{ titre: string; description: string }>;
  };
};

/** Enregistrement SalaryNegotiation (dates sérialisées en ISO par l'API). */
type Coaching = {
  id: string;
  jobTitle: string;
  experienceYears: number;
  countryName: string;
  currencyCode: string;
  currencySymbol: string;
  keySkills: string;
  currentOffer: string | null;
  resultJson: unknown;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
};

/** État du quota renvoyé par GET /api/salary-coach (inchangé). */
type EtatQuota = {
  plan: string;
  planLabel: string;
  used: number;
  limit: number;
  unlimited: boolean;
  remaining: number | null;
  reached: boolean;
  compteurDedie: boolean;
  isActive: boolean;
  daysRemaining: number | null;
};

type Stats = {
  total: number;
  derniereCible: string | null;
  paysPrincipal: {
    pays: string;
    drapeau: string | null;
    devise: string;
    nombre: number;
  } | null;
};

const ICONS_ARGUMENTS = [IconBolt, IconCertificate, IconUsers];

/* ── Aides réseau & normalisation (aucune confiance aveugle au JSON) ─── */

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

async function lireJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normaliserQuota(data: Record<string, unknown> | null): EtatQuota | null {
  if (!data) return null;
  const planBrut = data.plan;
  if (typeof planBrut !== "string") return null;
  const nombre = (v: unknown, defaut: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : defaut;
  const limite = nombre(data.limit, -1);
  return {
    plan: planBrut,
    planLabel: typeof data.planLabel === "string" ? data.planLabel : planBrut,
    used: nombre(data.used, 0),
    limit: limite,
    unlimited: data.unlimited === true || limite < 0,
    remaining: typeof data.remaining === "number" ? data.remaining : null,
    reached: data.reached === true,
    compteurDedie: data.compteurDedie === true,
    isActive: data.isActive === true,
    daysRemaining: typeof data.daysRemaining === "number" ? data.daysRemaining : null,
  };
}

/** Valide le résultat IA stocké en base avant tout affichage. */
function normaliserResultat(valeur: unknown): ResultatNegociation | null {
  if (!valeur || typeof valeur !== "object") return null;
  const brut = valeur as Record<string, unknown>;
  const scripts = brut.scripts_reponse;
  if (!scripts || typeof scripts !== "object") return null;
  const s = scripts as Record<string, unknown>;
  const argumentsBrut = brut.arguments_valeur;
  const alternativesBrut = s.alternatives_avantages;
  if (
    typeof brut.fourchette_min !== "string" ||
    typeof brut.fourchette_cible !== "string" ||
    typeof brut.fourchette_max !== "string" ||
    typeof brut.analyse_marche !== "string" ||
    typeof s.question_entretien !== "string" ||
    typeof s.contre_proposition_email !== "string" ||
    !Array.isArray(argumentsBrut) ||
    !Array.isArray(alternativesBrut)
  ) {
    return null;
  }
  return {
    fourchette_min: brut.fourchette_min,
    fourchette_cible: brut.fourchette_cible,
    fourchette_max: brut.fourchette_max,
    analyse_marche: brut.analyse_marche,
    arguments_valeur: argumentsBrut
      .filter(
        (a): a is { titre: string; explication: string } =>
          Boolean(a) &&
          typeof (a as { titre?: unknown }).titre === "string" &&
          typeof (a as { explication?: unknown }).explication === "string"
      )
      .slice(0, 3),
    scripts_reponse: {
      question_entretien: s.question_entretien,
      contre_proposition_email: s.contre_proposition_email,
      alternatives_avantages: alternativesBrut
        .filter(
          (a): a is { titre: string; description: string } =>
            Boolean(a) &&
            typeof (a as { titre?: unknown }).titre === "string" &&
            typeof (a as { description?: unknown }).description === "string"
        )
        .slice(0, 3),
    },
  };
}

function normaliserCoaching(brut: Record<string, unknown>): Coaching | null {
  if (typeof brut.id !== "string") return null;
  const texte = (v: unknown, defaut: string): string =>
    typeof v === "string" ? v : defaut;
  return {
    id: brut.id,
    jobTitle: texte(brut.jobTitle, "Coaching"),
    experienceYears:
      typeof brut.experienceYears === "number" ? brut.experienceYears : 0,
    countryName: texte(brut.countryName, ""),
    currencyCode: texte(brut.currencyCode, ""),
    currencySymbol: texte(brut.currencySymbol, ""),
    keySkills: texte(brut.keySkills, ""),
    currentOffer: typeof brut.currentOffer === "string" ? brut.currentOffer : null,
    resultJson: brut.resultJson ?? null,
    shareToken: typeof brut.shareToken === "string" ? brut.shareToken : null,
    createdAt: typeof brut.createdAt === "string" ? brut.createdAt : "",
    updatedAt: typeof brut.updatedAt === "string" ? brut.updatedAt : "",
  };
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Nom de fichier sûr : Negociation_NexiRole_[Poste].pdf */
function nomFichierPdf(jobTitle: string): string {
  const propre = jobTitle
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
  return `Negociation_NexiRole_${propre || "coaching"}.pdf`;
}

/** Résumé prêt à coller dans WhatsApp / e-mail. */
function construireTextePartage(
  coaching: Coaching,
  resultat: ResultatNegociation,
  drapeau: string
): string {
  const lignes = [
    `Négociation salariale — ${coaching.jobTitle}`,
    `${drapeau} ${coaching.countryName} (${coaching.currencyCode}) · ${coaching.experienceYears} an(s) d'expérience`,
    "",
    `Minimum acceptable : ${resultat.fourchette_min}`,
    `Cible recommandée : ${resultat.fourchette_cible}`,
    `Plafond senior : ${resultat.fourchette_max}`,
    "",
    `Analyse du marché : ${resultat.analyse_marche}`,
    "",
    `Mes 3 arguments de valeur :`,
    ...resultat.arguments_valeur.map((a, i) => `${i + 1}. ${a.titre} — ${a.explication}`),
    "",
    `Préparé avec NexiRole — Coach de Négociation Salariale IA`,
  ];
  return lignes.join("\n");
}

/* ── Combobox « Pays et Devise » avec recherche instantanée ──────────── */

function ComboboxPays({
  valeur,
  onSelectionne,
  invalide,
}: {
  valeur: PaysDevise | null;
  onSelectionne: (pays: PaysDevise) => void;
  invalide?: boolean;
}) {
  const [ouverte, setOuverte] = useState(false);
  const [recherche, setRecherche] = useState("");
  const conteneurRef = useRef<HTMLDivElement | null>(null);
  const champRef = useRef<HTMLInputElement | null>(null);

  /* Fermeture au clic extérieur + à la touche Échap. */
  useEffect(() => {
    if (!ouverte) return;
    function surClicExterieur(event: MouseEvent) {
      if (conteneurRef.current && !conteneurRef.current.contains(event.target as Node)) {
        setOuverte(false);
      }
    }
    function surEchap(event: KeyboardEvent) {
      if (event.key === "Escape") setOuverte(false);
    }
    document.addEventListener("mousedown", surClicExterieur);
    document.addEventListener("keydown", surEchap);
    const delai = window.setTimeout(() => champRef.current?.focus(), 30);
    return () => {
      document.removeEventListener("mousedown", surClicExterieur);
      document.removeEventListener("keydown", surEchap);
      window.clearTimeout(delai);
    };
  }, [ouverte]);

  const resultats = useMemo(() => rechercherPaysDevises(recherche), [recherche]);

  return (
    <div ref={conteneurRef} className="relative">
      <button
        type="button"
        onClick={() => setOuverte((v) => !v)}
        className={cx(
          "flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-3.5 py-2.5 text-left text-sm shadow-sm transition-colors",
          invalide
            ? "border-red-300 focus:border-red-400"
            : "border-slate-200 hover:border-[#051937]/30 focus:border-[#051937]/40"
        )}
      >
        {valeur ? (
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="text-lg leading-none">
              {valeur.flag}
            </span>
            <span className="truncate font-medium text-[#051937]">{valeur.name}</span>
            <span className="shrink-0 rounded-md bg-[#051937]/5 px-1.5 py-0.5 text-xs font-semibold text-[#051937]">
              {valeur.currencyCode} ({valeur.currencySymbol})
            </span>
          </span>
        ) : (
          <span className="flex items-center gap-2 text-slate-400">
            <IconSearch size={16} />
            Choisir un pays ou une devise (197 pays)...
          </span>
        )}
        <IconChevronDown
          size={16}
          className={cx("shrink-0 text-slate-400 transition-transform", ouverte && "rotate-180")}
        />
      </button>

      {ouverte ? (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <IconSearch size={16} className="shrink-0 text-slate-400" />
            <input
              ref={champRef}
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher : Bénin, Côte d'Ivoire, France, FCFA, EUR, USD..."
              className="w-full bg-transparent text-sm text-[#051937] outline-none placeholder:text-slate-400"
            />
            {recherche ? (
              <button
                type="button"
                onClick={() => setRecherche("")}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-[#051937]"
                aria-label="Effacer la recherche"
              >
                <IconX size={14} />
              </button>
            ) : null}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {resultats.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">
                Aucun pays trouvé pour « {recherche} ».
              </p>
            ) : (
              resultats.map((pays) => (
                <button
                  key={pays.code}
                  type="button"
                  onClick={() => {
                    onSelectionne(pays);
                    setOuverte(false);
                    setRecherche("");
                  }}
                  className={cx(
                    "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-[#FFC107]/10",
                    valeur?.code === pays.code && "bg-[#FFC107]/15"
                  )}
                >
                  <span aria-hidden className="text-lg leading-none">
                    {pays.flag}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-[#051937]">
                    {pays.name}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {pays.currencyCode} · {pays.currencyName} ({pays.currencySymbol})
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-400">
            {PAYS_DEVISES.length} pays — devise officielle pré-remplie automatiquement.
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ── Toast local (notifications « Copié », suppression, PDF...) ──────── */

function Toast({
  toast,
  onFerme,
}: {
  toast: { message: string; type: "succes" | "erreur" } | null;
  onFerme: () => void;
}) {
  if (!toast) return null;
  return (
    <div
      role="status"
      className={cx(
        "fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-2 rounded-xl px-4 py-3 text-sm shadow-lg",
        toast.type === "succes"
          ? "bg-[#051937] text-white"
          : "border border-red-200 bg-white text-red-700"
      )}
    >
      {toast.type === "succes" ? (
        <IconCircleCheck size={18} className="mt-0.5 shrink-0 text-[#FFC107]" />
      ) : (
        <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
      )}
      <span className="leading-relaxed">{toast.message}</span>
      <button
        type="button"
        onClick={onFerme}
        className={cx(
          "rounded-md p-0.5",
          toast.type === "succes" ? "text-white/70 hover:text-white" : "text-red-400 hover:text-red-600"
        )}
        aria-label="Fermer la notification"
      >
        <IconX size={14} />
      </button>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────── */

export default function NegociationPage() {
  /* Vue courante : tableau de bord (liste) ou simulateur. */
  const [vue, setVue] = useState<"liste" | "simulateur">("liste");

  /* Données : historique + statistiques + quota du plan. */
  const [coachings, setCoachings] = useState<Coaching[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [quota, setQuota] = useState<EtatQuota | null>(null);
  const [chargementListe, setChargementListe] = useState(true);
  const [erreurListe, setErreurListe] = useState("");

  /* Formulaire (création ou édition). */
  const [modeEditionId, setModeEditionId] = useState<string | null>(null);
  const [consulteId, setConsulteId] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [experienceYears, setExperienceYears] = useState("3");
  const [pays, setPays] = useState<PaysDevise | null>(null);
  const [keySkills, setKeySkills] = useState("");
  const [currentOffer, setCurrentOffer] = useState("");

  /* Génération / enregistrement / consultation. */
  const [generation, setGeneration] = useState(false);
  const [erreur, setErreur] = useState("");
  const [blocage, setBlocage] = useState<{ message: string; planLabel: string | null } | null>(null);
  const [coachingActif, setCoachingActif] = useState<Coaching | null>(null);

  /* Actions sur les coachings. */
  const [pdfEnCours, setPdfEnCours] = useState(false);
  const [suppressionId, setSuppressionId] = useState<string | null>(null);
  const [copie, setCopie] = useState<"" | "oral" | "email">("");
  const [toast, setToast] = useState<{ message: string; type: "succes" | "erreur" } | null>(null);

  const resultatsRef = useRef<HTMLDivElement | null>(null);
  const demarrageFaitRef = useRef(false);

  function afficherToast(message: string, type: "succes" | "erreur" = "succes") {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3500);
  }

  /** Historique + stats + quota (GET /api/salary-coach). */
  async function chargerDonnees() {
    try {
      const res = await fetch("/api/salary-coach");
      if (!res.ok) {
        setErreurListe(
          await lireErreur(res, "Impossible de charger tes coachings (erreur " + res.status + ").")
        );
        return;
      }
      const data = await lireJson(res);
      if (!data) {
        setErreurListe("Réponse inattendue du serveur.");
        return;
      }
      setErreurListe("");
      setQuota(normaliserQuota(data));
      const listeBrute = Array.isArray(data.coachings) ? data.coachings : [];
      const liste: Coaching[] = [];
      for (const brut of listeBrute) {
        if (brut && typeof brut === "object") {
          const coaching = normaliserCoaching(brut as Record<string, unknown>);
          if (coaching) liste.push(coaching);
        }
      }
      setCoachings(liste);
      const statsBrutes = data.stats as Stats | undefined;
      setStats(
        statsBrutes && typeof statsBrutes === "object"
          ? {
              total:
                typeof statsBrutes.total === "number" ? statsBrutes.total : liste.length,
              derniereCible:
                typeof statsBrutes.derniereCible === "string"
                  ? statsBrutes.derniereCible
                  : null,
              paysPrincipal:
                statsBrutes.paysPrincipal && typeof statsBrutes.paysPrincipal === "object"
                  ? (statsBrutes.paysPrincipal as Stats["paysPrincipal"])
                  : null,
            }
          : { total: liste.length, derniereCible: null, paysPrincipal: null }
      );
    } catch {
      setErreurListe("Connexion au serveur impossible. Vérifie ta connexion et recharge.");
    } finally {
      setChargementListe(false);
    }
  }

  useEffect(() => {
    if (demarrageFaitRef.current) return;
    demarrageFaitRef.current = true;
    void chargerDonnees();
  }, []);

  /* ── Navigation entre les vues ─────────────────────────────────────── */

  function ouvrirNouveauCoaching() {
    setJobTitle("");
    setExperienceYears("3");
    setPays(null);
    setKeySkills("");
    setCurrentOffer("");
    setModeEditionId(null);
    setConsulteId(null);
    setCoachingActif(null);
    setBlocage(null);
    setErreur("");
    setVue("simulateur");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function ouvrirEdition(coaching: Coaching) {
    setJobTitle(coaching.jobTitle);
    setExperienceYears(String(coaching.experienceYears));
    setPays(trouverPaysParNom(coaching.countryName) ?? null);
    setKeySkills(coaching.keySkills);
    setCurrentOffer(coaching.currentOffer ?? "");
    setModeEditionId(coaching.id);
    setConsulteId(null);
    setCoachingActif(null);
    setBlocage(null);
    setErreur("");
    setVue("simulateur");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function ouvrirConsultation(coaching: Coaching) {
    setConsulteId(coaching.id);
    setModeEditionId(null);
    setCoachingActif(coaching);
    setVue("simulateur");
    setTimeout(
      () => resultatsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      80
    );
  }

  function retourListe() {
    setVue("liste");
    setCoachingActif(null);
    setModeEditionId(null);
    setConsulteId(null);
    setErreur("");
    setBlocage(null);
    void chargerDonnees();
  }

  /* ── Génération (POST) + édition (PATCH regenerer) ─────────────────── */

  function validerFormulaire(): { ok: true } | { ok: false; message: string } {
    if (jobTitle.trim().length < 2) {
      return { ok: false, message: "Indique d'abord le poste visé (2 caractères minimum)." };
    }
    if (!pays) {
      return {
        ok: false,
        message: "Sélectionne ton pays (ou ta zone) dans la liste « Pays et Devise » — tape pour rechercher (ex. : Bénin, France, FCFA).",
      };
    }
    if (keySkills.trim().length < 2) {
      return {
        ok: false,
        message: "Liste au moins une compétence clé (ex. : gestion de projet, Excel, prospection).",
      };
    }
    const exp = Number(experienceYears);
    if (!Number.isFinite(exp) || exp < 0 || exp > 50) {
      return { ok: false, message: "Années d'expérience : nombre entre 0 et 50." };
    }
    return { ok: true };
  }

  async function envoyer(methode: "POST" | "PATCH"): Promise<Record<string, unknown> | null> {
    const validation = validerFormulaire();
    if (!validation.ok) {
      setErreur(validation.message);
      return null;
    }
    setErreur("");
    setBlocage(null);
    setGeneration(true);
    try {
      const corps = {
        jobTitle: jobTitle.trim(),
        experienceYears: Number(experienceYears),
        countryName: pays?.name ?? "",
        currencyCode: pays?.currencyCode ?? "",
        keySkills: keySkills.trim(),
        currentOffer: currentOffer.trim(),
        ...(methode === "PATCH" ? { regenerer: true } : {}),
      };
      const res = await fetch(
        methode === "POST" ? "/api/salary-coach" : `/api/salary-coach/${modeEditionId}`,
        {
          method: methode,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corps),
        }
      );
      if (!res.ok) {
        /* Limite du plan atteinte → carte d'upgrade dorée. */
        if (res.status === 403) {
          const data = await lireJson(res);
          if (data && data.code === "QUOTA_EXCEEDED") {
            setBlocage({
              message:
                typeof data.error === "string"
                  ? data.error
                  : "Limite du plan atteinte. Passez à un plan supérieur pour continuer.",
              planLabel: typeof data.planLabel === "string" ? data.planLabel : null,
            });
            void chargerDonnees();
            return null;
          }
        }
        setErreur(await lireErreur(res, "Analyse impossible (erreur " + res.status + ")."));
        return null;
      }
      const data = await lireJson(res);
      const coachingBrut = data?.coaching as Record<string, unknown> | undefined;
      const coaching = coachingBrut ? normaliserCoaching(coachingBrut) : null;
      if (!coaching) {
        setErreur("Réponse inattendue du serveur.");
        return null;
      }
      return coaching as unknown as Record<string, unknown>;
    } catch {
      setErreur("Connexion au serveur impossible. Vérifie ta connexion et réessaie.");
      return null;
    } finally {
      setGeneration(false);
    }
  }

  async function calculer() {
    const coaching = (await envoyer("POST")) as unknown as Coaching | null;
    if (!coaching) return;
    setModeEditionId(null);
    setConsulteId(null);
    setCoachingActif(coaching);
    void chargerDonnees();
    afficherToast("Analyse générée et sauvegardée automatiquement dans ton historique.");
    setTimeout(
      () => resultatsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      80
    );
  }

  async function enregistrerModifications() {
    if (!modeEditionId) return;
    const coaching = (await envoyer("PATCH")) as unknown as Coaching | null;
    if (!coaching) return;
    setModeEditionId(null);
    setConsulteId(coaching.id);
    setCoachingActif(coaching);
    void chargerDonnees();
    afficherToast("Modifications enregistrées — analyse recalculée pour ton nouveau profil.");
    setTimeout(
      () => resultatsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      80
    );
  }

  /* ── Suppression ───────────────────────────────────────────────────── */

  async function supprimer(coaching: Coaching) {
    const confirme = window.confirm(
      `Supprimer définitivement le coaching « ${coaching.jobTitle} » (${coaching.countryName}) ? Cette action est irréversible.`
    );
    if (!confirme) return;
    setSuppressionId(coaching.id);
    try {
      const res = await fetch(`/api/salary-coach/${coaching.id}`, { method: "DELETE" });
      if (!res.ok) {
        afficherToast(
          await lireErreur(res, "Suppression impossible (erreur " + res.status + ")."),
          "erreur"
        );
        return;
      }
      afficherToast("Coaching supprimé de ton historique.");
      if (coachingActif?.id === coaching.id) {
        setCoachingActif(null);
        if (vue === "simulateur") {
          setVue("liste");
          setConsulteId(null);
        }
      }
      void chargerDonnees();
    } catch {
      afficherToast("Connexion au serveur impossible — suppression non effectuée.", "erreur");
    } finally {
      setSuppressionId(null);
    }
  }

  /* ── Export PDF (import dynamique, STRICTEMENT côté client) ────────── */

  async function telechargerPdf(coaching: Coaching) {
    const resultat = normaliserResultat(coaching.resultJson);
    if (!resultat) {
      afficherToast("Ce coaching ne contient pas de résultat exploitable.", "erreur");
      return;
    }
    setPdfEnCours(true);
    try {
      const [{ pdf }, { NegotiationPdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/pdf/NegotiationPdfDocument"),
      ]);
      const element = createElement(NegotiationPdfDocument, {
        data: {
          jobTitle: coaching.jobTitle,
          experienceYears: coaching.experienceYears,
          countryName: coaching.countryName,
          currencyCode: coaching.currencyCode,
          currencySymbol: coaching.currencySymbol,
          keySkills: coaching.keySkills,
          analyse: resultat,
          dateGeneration: formatDate(coaching.updatedAt || coaching.createdAt),
        },
      });
      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = nomFichierPdf(coaching.jobTitle);
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(url);
      afficherToast("PDF téléchargé — ton dossier de négociation est prêt.");
    } catch (error) {
      console.error("[negociation:PDF]", error);
      afficherToast("La génération du PDF a échoué. Réessaie dans quelques instants.", "erreur");
    } finally {
      setPdfEnCours(false);
    }
  }

  /* ── Partage (résumé prêt à envoyer, copié dans le presse-papier) ──── */

  async function copierTexte(texte: string, cle: "" | "oral" | "email" = ""): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(texte);
      if (cle) {
        setCopie(cle);
        window.setTimeout(() => setCopie(""), 2000);
      }
      return true;
    } catch {
      /* Fallback navigateurs sans Clipboard API (contexte non sécurisé). */
      try {
        const zone = document.createElement("textarea");
        zone.value = texte;
        zone.style.position = "fixed";
        zone.style.opacity = "0";
        document.body.appendChild(zone);
        zone.select();
        const reussi = document.execCommand("copy");
        zone.remove();
        if (cle && reussi) {
          setCopie(cle);
          window.setTimeout(() => setCopie(""), 2000);
        }
        return reussi;
      } catch {
        return false;
      }
    }
  }

  async function partager(coaching: Coaching) {
    const resultat = normaliserResultat(coaching.resultJson);
    if (!resultat) {
      afficherToast("Ce coaching ne contient pas de résultat exploitable.", "erreur");
      return;
    }
    const drapeau = trouverPaysParNom(coaching.countryName)?.flag ?? "";
    const texte = construireTextePartage(coaching, resultat, drapeau);
    const reussi = await copierTexte(texte);
    afficherToast(
      reussi
        ? "Copié dans le presse-papier — colle-le dans WhatsApp ou ton e-mail."
        : "Copie impossible : sélectionne le texte et copie-le manuellement.",
      reussi ? "succes" : "erreur"
    );
  }

  async function copierScript(texte: string, cle: "oral" | "email") {
    const reussi = await copierTexte(texte, cle);
    if (!reussi) {
      afficherToast("Copie impossible : sélectionne le texte et copie-le manuellement.", "erreur");
    }
  }

  /* ── Valeurs dérivées ──────────────────────────────────────────────── */

  const limiteAtteinte = (quota && !quota.unlimited && quota.reached) || blocage !== null;
  const planLabelBlocage = blocage?.planLabel ?? quota?.planLabel ?? "Découverte";
  const modeEdition = modeEditionId !== null;
  const modeConsultation = consulteId !== null && coachingActif !== null;
  const resultatActif = coachingActif ? normaliserResultat(coachingActif.resultJson) : null;
  const drapeauPaysPrincipal = stats?.paysPrincipal
    ? trouverPaysParNom(stats.paysPrincipal.pays)?.flag ?? ""
    : "";

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* ── En-tête ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#051937] text-[#FFC107]">
            <IconCoin size={26} stroke={1.8} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#051937]">
              {vue === "liste"
                ? "Mes Coachings de Négociation"
                : modeEdition
                  ? "Modifier mon coaching"
                  : "Coach de Négociation Salariale IA"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {vue === "liste"
                ? "Ton historique complet : relis, édite, télécharge et partage tes dossiers de négociation."
                : modeEdition
                  ? "Ajuste les paramètres puis recalcule : l'analyse sera mise à jour dans ton historique."
                  : "Fourchettes du marché, arguments chiffrés et scripts prêts à l&apos;emploi — en une simulation."}
            </p>
          </div>
        </div>
        {vue === "liste" ? (
          <button
            type="button"
            onClick={ouvrirNouveauCoaching}
            className="inline-flex items-center gap-2 rounded-xl bg-[#051937] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b2a5b]"
          >
            <IconPlus size={16} />
            Nouveau coaching de négociation
          </button>
        ) : (
          <span className="rounded-full bg-[#FFC107] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[#051937]">
            Exclusivité Carrière Pro
          </span>
        )}
      </div>

      {/* ── Bannière de quota du plan (inchangée) ───────────────────── */}
      {quota && !quota.unlimited && !quota.reached ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
          <span className="flex items-center gap-2 text-slate-600">
            <IconInfoCircle size={18} className="shrink-0 text-[#051937]" />
            <span>
              Plan {quota.planLabel} :{" "}
              <strong className="text-[#051937]">
                {quota.used}/{quota.limit}
              </strong>{" "}
              {quota.compteurDedie
                ? "simulations du Coach ce mois-ci"
                : "générations IA ce mois-ci (quota partagé avec les dossiers)"}
              {quota.remaining === 1 ? " — plus qu'une !" : ""}
            </span>
          </span>
          <Link
            href="/pricing"
            className="text-xs font-semibold text-[#051937] underline decoration-[#FFC107] decoration-2 underline-offset-4 transition-colors hover:text-[#0b2a5b]"
          >
            Passer à un plan supérieur
          </Link>
        </div>
      ) : null}

      {quota && quota.unlimited ? (
        <div className="flex items-center gap-2 rounded-xl border border-[#FFC107]/60 bg-[#FFC107]/10 px-4 py-3 text-sm text-[#051937]">
          <IconCrown size={18} className="shrink-0" />
          <span>
            Plan {quota.planLabel} — simulations illimitées
            {quota.isActive && quota.daysRemaining !== null
              ? ` · ${quota.daysRemaining} jour(s) restants`
              : ""}
          </span>
        </div>
      ) : null}

      {/* ── Limite du plan atteinte : carte d&apos;upgrade ─────────────── */}
      {limiteAtteinte ? (
        <section className="rounded-2xl border-2 border-[#FFC107] bg-[#FFC107]/10 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#051937] text-[#FFC107]">
              <IconCrown size={22} />
            </span>
            <h2 className="text-lg font-bold text-[#051937]">
              Limite du plan {planLabelBlocage} atteinte
            </h2>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            {blocage?.message ??
              `Vous avez utilisé vos ${quota?.limit ?? 2} simulations offertes ce mois-ci. Passez à un plan supérieur pour continuer à simuler sans limite.`}
          </p>
          <ul className="mt-4 space-y-2 text-sm text-[#051937]">
            <li className="flex items-center gap-2">
              <IconCheck size={16} className="shrink-0" />
              Coach de Négociation illimité + historique complet
            </li>
            <li className="flex items-center gap-2">
              <IconCheck size={16} className="shrink-0" />
              Dossiers IA et recherches d&apos;offres illimités
            </li>
            <li className="flex items-center gap-2">
              <IconCheck size={16} className="shrink-0" />
              Export PDF et partage de tes dossiers de négociation
            </li>
          </ul>
          <Link
            href="/pricing"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#051937] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b2a5b]"
          >
            <IconSparkles size={16} />
            Découvrir les offres
          </Link>
        </section>
      ) : null}

      {/* ══ VUE A : Tableau de bord & liste des coachings ══════════════ */}
      {vue === "liste" ? (
        <div className="space-y-6">
          {erreurListe ? (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>{erreurListe}</span>
            </div>
          ) : null}

          {chargementListe ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
              <IconLoader2 size={18} className="animate-spin" />
              Chargement de ton historique...
            </div>
          ) : (
            <>
              {/* 3 cartes statistiques (KPIs) */}
              <section className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-500">
                    <IconDeviceFloppy size={20} className="text-[#051937]" />
                    <span className="text-xs font-semibold uppercase tracking-wide">
                      Coachings sauvegardés
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold text-[#051937]">
                    {stats?.total ?? coachings.length}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Toutes tes simulations, relissables à tout moment.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-500">
                    <IconTargetArrow size={20} className="text-[#051937]" />
                    <span className="text-xs font-semibold uppercase tracking-wide">
                      Dernière cible calculée
                    </span>
                  </div>
                  <p className="mt-3 text-xl font-bold text-[#051937]">
                    {stats?.derniereCible ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Le montant à demander sur ta dernière simulation.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-500">
                    <IconMapPin size={20} className="text-[#051937]" />
                    <span className="text-xs font-semibold uppercase tracking-wide">
                      Marché le plus ciblé
                    </span>
                  </div>
                  <p className="mt-3 text-xl font-bold text-[#051937]">
                    {stats?.paysPrincipal ? (
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="text-xl leading-none">
                          {drapeauPaysPrincipal}
                        </span>
                        {stats.paysPrincipal.pays}
                      </span>
                    ) : (
                      "—"
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {stats?.paysPrincipal
                      ? `${stats.paysPrincipal.nombre} simulation(s) en ${stats.paysPrincipal.devise}`
                      : "Lance ta première simulation pour voir ton marché."}
                  </p>
                </div>
              </section>

              {/* Liste des coachings enregistrés */}
              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-[#051937]">
                  Coachings enregistrés
                  {coachings.length > 0 ? (
                    <span className="ml-2 text-sm font-normal text-slate-400">
                      ({coachings.length})
                    </span>
                  ) : null}
                </h2>

                {coachings.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
                    <p className="text-sm text-slate-500">
                      Aucun coaching pour l&apos;instant. Lance ta première simulation :
                      tu obtiendras tes trois fourchettes, une analyse du marché local,
                      trois arguments chiffrés et tes scripts de négociation —
                      sauvegardés automatiquement ici.
                    </p>
                    <button
                      type="button"
                      onClick={ouvrirNouveauCoaching}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#051937] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b2a5b]"
                    >
                      <IconPlus size={16} />
                      Nouveau coaching de négociation
                    </button>
                  </div>
                ) : (
                  coachings.map((coaching) => {
                    const drapeau = trouverPaysParNom(coaching.countryName)?.flag ?? "";
                    return (
                      <div
                        key={coaching.id}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                      >
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-semibold text-[#051937]">
                            {coaching.jobTitle}
                          </h3>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1.5">
                              <span aria-hidden className="text-base leading-none">
                                {drapeau}
                              </span>
                              {coaching.countryName} · {coaching.currencyCode}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <IconCalendarEvent size={13} />
                              {formatDate(coaching.createdAt)}
                            </span>
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-lg bg-[#FFC107]/15 px-3 py-1.5 text-sm font-bold text-[#051937]">
                            {normaliserResultat(coaching.resultJson)?.fourchette_cible ?? "—"}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => ouvrirConsultation(coaching)}
                              title="Voir le rapport détaillé"
                              aria-label="Voir le rapport détaillé"
                              className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5"
                            >
                              <IconEye size={17} />
                            </button>
                            <button
                              type="button"
                              onClick={() => ouvrirEdition(coaching)}
                              title="Éditer et recalculer"
                              aria-label="Éditer et recalculer"
                              className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5"
                            >
                              <IconEdit size={17} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void telechargerPdf(coaching)}
                              disabled={pdfEnCours}
                              title="Télécharger le dossier en PDF"
                              aria-label="Télécharger le dossier en PDF"
                              className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {pdfEnCours ? (
                                <IconLoader2 size={17} className="animate-spin" />
                              ) : (
                                <IconFileTypePdf size={17} />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => void partager(coaching)}
                              title="Copier un résumé prêt à envoyer (WhatsApp / e-mail)"
                              aria-label="Copier un résumé prêt à envoyer"
                              className="rounded-lg border border-slate-200 p-2 text-[#051937] transition-colors hover:bg-[#051937]/5"
                            >
                              <IconShare size={17} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void supprimer(coaching)}
                              disabled={suppressionId === coaching.id}
                              title="Supprimer définitivement"
                              aria-label="Supprimer définitivement"
                              className="rounded-lg border border-red-200 p-2 text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {suppressionId === coaching.id ? (
                                <IconLoader2 size={17} className="animate-spin" />
                              ) : (
                                <IconTrash size={17} />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </section>
            </>
          )}
        </div>
      ) : (
        /* ══ VUE B : Formulaire & résultat détaillé ═════════════════════ */
        <div className="space-y-8">
          <button
            type="button"
            onClick={retourListe}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-[#051937]"
          >
            <IconArrowLeft size={16} />
            Retour à mes coachings
          </button>

          {/* Consultation : rappel des paramètres du coaching ouvert */}
          {modeConsultation && coachingActif ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[#051937]">
                  Paramètres de ce coaching
                </h2>
                <button
                  type="button"
                  onClick={() => ouvrirEdition(coachingActif)}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#051937]/20 px-4 py-2 text-sm font-semibold text-[#051937] transition-colors hover:bg-[#051937]/5"
                >
                  <IconEdit size={16} />
                  Éditer ce coaching
                </button>
              </div>
              <div className="mt-4 grid gap-4 text-sm md:grid-cols-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Poste visé</p>
                  <p className="mt-1 font-medium text-[#051937]">{coachingActif.jobTitle}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Pays & devise</p>
                  <p className="mt-1 font-medium text-[#051937]">
                    <span aria-hidden className="mr-1">
                      {trouverPaysParNom(coachingActif.countryName)?.flag ?? ""}
                    </span>
                    {coachingActif.countryName} · {coachingActif.currencyCode}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Expérience</p>
                  <p className="mt-1 font-medium text-[#051937]">
                    {coachingActif.experienceYears} an(s)
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Créé le</p>
                  <p className="mt-1 font-medium text-[#051937]">
                    {formatDate(coachingActif.createdAt)}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Compétences clés</p>
                  <p className="mt-1 font-medium text-[#051937]">{coachingActif.keySkills}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Offre déjà reçue</p>
                  <p className="mt-1 font-medium text-[#051937]">
                    {coachingActif.currentOffer || "—"}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {/* Formulaire (création ou édition) */}
          {!modeConsultation ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-[#051937]">
                {modeEdition ? "Modifier les paramètres du coaching" : "Simulation de négociation"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {modeEdition
                  ? "L'analyse sera recalculée avec tes nouveaux paramètres (1 simulation)."
                  : "Plus tes informations sont précises, plus la fourchette et les arguments seront crédibles."}
              </p>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="poste">Poste visé</Label>
                  <Input
                    id="poste"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="ex. : Développeur web, Commercial B2B, Comptable..."
                    maxLength={120}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="experience">Années d&apos;expérience</Label>
                  <Input
                    id="experience"
                    type="number"
                    min={0}
                    max={50}
                    step={1}
                    value={experienceYears}
                    onChange={(e) => setExperienceYears(e.target.value)}
                    placeholder="ex. : 3"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pays">Pays et Devise</Label>
                  <ComboboxPays
                    valeur={pays}
                    onSelectionne={(choix) => setPays(choix)}
                    invalide={Boolean(erreur && !pays)}
                  />
                  <p className="text-xs text-slate-400">
                    Tape pour rechercher parmi les 197 pays (ex. : « Bénin », « Côte », « FCFA », « EUR »).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="offre">Offre déjà reçue (optionnel)</Label>
                  <Textarea
                    id="offre"
                    value={currentOffer}
                    onChange={(e) => setCurrentOffer(e.target.value)}
                    placeholder="ex. : proposition à 300 000 FCFA / mois, fixe uniquement..."
                    rows={3}
                    maxLength={2000}
                  />
                  <p className="text-xs text-slate-400">
                    Si tu la remplis, l&apos;IA positionne les fourchettes par rapport à cette offre.
                  </p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="competences">Compétences clés</Label>
                  <Textarea
                    id="competences"
                    value={keySkills}
                    onChange={(e) => setKeySkills(e.target.value)}
                    placeholder="Sépare par des virgules : gestion de projet, Excel avancé, prospection téléphonique, SQL..."
                    rows={3}
                    maxLength={800}
                  />
                  <p className="text-xs text-slate-400">
                    Ce sont elles qui alimentent tes 3 arguments de valeur chiffrés.
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => void (modeEdition ? enregistrerModifications() : calculer())}
                  disabled={generation}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#051937] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:bg-[#0b2a5b] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generation ? (
                    <IconLoader2 size={18} className="animate-spin" />
                  ) : modeEdition ? (
                    <IconDeviceFloppy size={18} />
                  ) : (
                    <IconSparkles size={18} />
                  )}
                  {generation
                    ? "Analyse en cours... (10 à 20 s)"
                    : modeEdition
                      ? "Enregistrer les modifications"
                      : "Calculer ma fourchette & générer mes scripts"}
                </button>
              </div>
            </section>
          ) : null}

          {/* Erreur formulaire */}
          {erreur ? (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>{erreur}</span>
            </div>
          ) : null}

          {/* ── Résultat détaillé ────────────────────────────────────── */}
          <div ref={resultatsRef} />

          {coachingActif && resultatActif ? (
            <div className="space-y-8">
              {/* Barre d'actions sur le résultat généré */}
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <button
                  type="button"
                  onClick={retourListe}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  <IconArrowLeft size={14} />
                  Retour à mes coachings
                </button>
                {modeEdition ? (
                  <button
                    type="button"
                    onClick={() => void enregistrerModifications()}
                    disabled={generation}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#051937] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0b2a5b] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {generation ? (
                      <IconLoader2 size={14} className="animate-spin" />
                    ) : (
                      <IconDeviceFloppy size={14} />
                    )}
                    Enregistrer les modifications
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                    <IconCircleCheck size={14} />
                    Sauvegardé automatiquement
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void telechargerPdf(coachingActif)}
                  disabled={pdfEnCours}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#051937]/20 px-3 py-2 text-xs font-semibold text-[#051937] transition-colors hover:bg-[#051937]/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pdfEnCours ? (
                    <IconLoader2 size={14} className="animate-spin" />
                  ) : (
                    <IconFileTypePdf size={14} />
                  )}
                  Télécharger en PDF
                </button>
                <button
                  type="button"
                  onClick={() => void partager(coachingActif)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#051937]/20 px-3 py-2 text-xs font-semibold text-[#051937] transition-colors hover:bg-[#051937]/5"
                >
                  <IconShare size={14} />
                  Partager
                </button>
              </div>

              {/* Trois cartes de fourchette */}
              <section className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-500">
                    <IconShieldCheck size={20} className="text-[#051937]" />
                    <span className="text-xs font-semibold uppercase tracking-wide">Minimum acceptable</span>
                  </div>
                  <p className="mt-3 text-xl font-bold text-[#051937]">{resultatActif.fourchette_min}</p>
                  <p className="mt-1 text-xs text-slate-400">En dessous : il faut refuser.</p>
                </div>

                <div className="relative rounded-2xl border-2 border-[#FFC107] bg-[#FFC107]/10 p-5 shadow-sm">
                  <span className="absolute -top-3 left-4 rounded-full bg-[#FFC107] px-3 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#051937]">
                    Recommandée
                  </span>
                  <div className="flex items-center gap-2 text-[#051937]">
                    <IconTargetArrow size={20} />
                    <span className="text-xs font-semibold uppercase tracking-wide">Cible recommandée</span>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold text-[#051937]">{resultatActif.fourchette_cible}</p>
                  <p className="mt-1 text-xs text-[#051937]/70">Le montant à demander, sans hésiter.</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-500">
                    <IconTrendingUp size={20} className="text-[#051937]" />
                    <span className="text-xs font-semibold uppercase tracking-wide">Plafond Senior</span>
                  </div>
                  <p className="mt-3 text-xl font-bold text-[#051937]">{resultatActif.fourchette_max}</p>
                  <p className="mt-1 text-xs text-slate-400">Atteignable avec une négociation solide.</p>
                </div>
              </section>

              {/* Analyse du marché */}
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <IconChartBar size={20} className="text-[#051937]" />
                  <h2 className="text-lg font-semibold text-[#051937]">Analyse du marché</h2>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                  {resultatActif.analyse_marche}
                </p>
              </section>

              {/* Les 3 arguments chiffrés */}
              <section className="space-y-4">
                <h2 className="text-lg font-semibold text-[#051937]">
                  Tes 3 arguments de valeur (à ressortir tel quel)
                </h2>
                <div className="grid gap-4 md:grid-cols-3">
                  {resultatActif.arguments_valeur.map((arg, i) => {
                    const Icone = ICONS_ARGUMENTS[i % ICONS_ARGUMENTS.length];
                    return (
                      <div
                        key={arg.titre + String(i)}
                        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#051937] text-[#FFC107]">
                            <Icone size={20} stroke={1.8} />
                          </span>
                          <span className="text-2xl font-extrabold text-[#FFC107]">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                        </div>
                        <h3 className="mt-3 font-semibold text-[#051937]">{arg.titre}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">{arg.explication}</p>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Scripts prêts à l'emploi */}
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-[#051937]">Scripts prêts à l&apos;emploi</h2>

                <Tabs defaultValue="oral" className="mt-4">
                  <TabsList>
                    <TabsTrigger
                      value="oral"
                      className={cx(
                        "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                        "text-slate-600 hover:bg-slate-100",
                        "data-[state=active]:bg-[#051937] data-[state=active]:text-white"
                      )}
                    >
                      <IconMessageCircle size={16} />
                      Script oral d&apos;entretien
                    </TabsTrigger>
                    <TabsTrigger
                      value="email"
                      className={cx(
                        "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                        "text-slate-600 hover:bg-slate-100",
                        "data-[state=active]:bg-[#051937] data-[state=active]:text-white"
                      )}
                    >
                      <IconMail size={16} />
                      E-mail de contre-proposition
                    </TabsTrigger>
                    <TabsTrigger
                      value="alternatives"
                      className={cx(
                        "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                        "text-slate-600 hover:bg-slate-100",
                        "data-[state=active]:bg-[#051937] data-[state=active]:text-white"
                      )}
                    >
                      <IconGift size={16} />
                      Avantages alternatifs
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="oral" className="mt-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-400">
                        À prononcer tel quel quand on te demande tes prétentions.
                      </p>
                      <button
                        type="button"
                        onClick={() => void copierScript(resultatActif.scripts_reponse.question_entretien, "oral")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-[#051937] transition-colors hover:bg-slate-50"
                      >
                        {copie === "oral" ? (
                          <IconCheck size={14} className="text-[#FFC107]" />
                        ) : (
                          <IconCopy size={14} />
                        )}
                        {copie === "oral" ? "Copié !" : "Copier"}
                      </button>
                    </div>
                    <div className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-[#051937]">
                      {resultatActif.scripts_reponse.question_entretien}
                    </div>
                  </TabsContent>

                  <TabsContent value="email" className="mt-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-400">
                        À adapter (nom, offre) puis à envoyer depuis ta boîte mail.
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          void copierScript(resultatActif.scripts_reponse.contre_proposition_email, "email")
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-[#051937] transition-colors hover:bg-slate-50"
                      >
                        {copie === "email" ? (
                          <IconCheck size={14} className="text-[#FFC107]" />
                        ) : (
                          <IconCopy size={14} />
                        )}
                        {copie === "email" ? "Copié !" : "Copier"}
                      </button>
                    </div>
                    <div className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-[#051937]">
                      {resultatActif.scripts_reponse.contre_proposition_email}
                    </div>
                  </TabsContent>

                  <TabsContent value="alternatives" className="mt-4">
                    <p className="text-xs text-slate-400">
                      Si le fixe est bloqué, réclame ces leviers — ils ont une vraie valeur.
                    </p>
                    <div className="mt-3 space-y-3">
                      {resultatActif.scripts_reponse.alternatives_avantages.map((alt, i) => (
                        <div
                          key={alt.titre + String(i)}
                          className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#FFC107] text-[#051937]">
                            <IconCheck size={16} stroke={2.4} />
                          </span>
                          <div>
                            <h3 className="font-semibold text-[#051937]">{alt.titre}</h3>
                            <p className="mt-1 text-sm leading-relaxed text-slate-600">
                              {alt.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              </section>
            </div>
          ) : !modeConsultation && !modeEdition ? (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-sm text-slate-500">
              Remplis la simulation ci-dessus puis lance le calcul : tu obtiendras tes
              trois fourchettes, une analyse du marché local, trois arguments chiffrés
              construits sur tes compétences, et tes scripts de négociation prêts à
              l&apos;emploi — le tout sauvegardé automatiquement dans ton historique.
            </section>
          ) : null}
        </div>
      )}

      {/* ── Toast ───────────────────────────────────────────────────── */}
      <Toast toast={toast} onFerme={() => setToast(null)} />
    </div>
  );
}


