"use client";

/**
 * NexiRole — COACH DE NÉGOCIATION SALARIALE IA (page /dashboard/negociation).
 *
 * Simulation de négociation : l'utilisateur décrit son poste, son expérience,
 * sa zone géographique et ses compétences → l'IA (Groq, même moteur que le
 * reste de l'app) renvoie une analyse structurée :
 *   - 3 fourchettes salariales (minimum / cible recommandée / plafond senior),
 *   - une analyse du marché local,
 *   - 3 arguments de valeur chiffrés,
 *   - des scripts prêts à l'emploi (réponse orale d'entretien, e-mail de
 *     contre-proposition avec copie en un clic, avantages alternatifs).
 *
 * LIMITES PAR PLAN : au chargement, la page interroge GET /api/salary-coach
 * (état du quota) et affiche :
 *   - plan Découverte : compteur « X/2 simulations ce mois-ci » + lien vers
 *     les offres,
 *   - plans payants (Pass Boost / Carrière Pro) : bannière « illimité » avec
 *     les jours restants,
 *   - limite atteinte (403 QUOTA_EXCEEDED) : carte d'upgrade dorée avec
 *     bouton vers /pricing.
 *
 * Aucune écriture en base, aucun composant externe : mini-bibliothèque UI
 * maison (@/components/ui), icônes @tabler/icons-react et charte NexiRole
 * (navy #051937 + or #FFC107).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Input, Label, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, cx } from "@/components/ui";
import {
  IconAlertTriangle,
  IconBolt,
  IconCertificate,
  IconCheck,
  IconChartBar,
  IconCoin,
  IconCopy,
  IconCrown,
  IconGift,
  IconInfoCircle,
  IconLoader2,
  IconMail,
  IconMessageCircle,
  IconShieldCheck,
  IconSparkles,
  IconTargetArrow,
  IconTrendingUp,
  IconUsers,
} from "@tabler/icons-react";

/* ── Types ───────────────────────────────────────────────────────────── */

type RegionValue =
  | "afrique_ouest_fcfa"
  | "france_europe_eur"
  | "amerique_nord_usd"
  | "remote_usd";

type Analyse = {
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

/** État du quota renvoyé par GET /api/salary-coach. */
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

const REGIONS: Array<{ value: RegionValue; label: string }> = [
  { value: "afrique_ouest_fcfa", label: "Afrique de l'Ouest (FCFA)" },
  { value: "france_europe_eur", label: "France / Europe (EUR)" },
  { value: "amerique_nord_usd", label: "Amérique du Nord (USD)" },
  { value: "remote_usd", label: "Remote International (USD)" },
];

const ICONS_ARGUMENTS = [IconBolt, IconCertificate, IconUsers];

/**
 * Lit le corps d'une réponse d'erreur SANS planter, que le serveur renvoie
 * du JSON ({ error, diagnostic }) ou du HTML (erreur de compilation dev).
 */
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

/** Parse le corps d'une réponse en JSON, sans jamais lever d'exception. */
async function lireJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Normalise l'état du quota reçu de l'API (aucune confiance aveugle au JSON). */
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

/* ── Page ────────────────────────────────────────────────────────────── */

export default function NegociationPage() {
  const [jobTitle, setJobTitle] = useState("");
  const [experienceYears, setExperienceYears] = useState("3");
  const [marketRegion, setMarketRegion] = useState<RegionValue>("afrique_ouest_fcfa");
  const [keySkills, setKeySkills] = useState("");
  const [currentOffer, setCurrentOffer] = useState("");

  const [generation, setGeneration] = useState(false);
  const [erreur, setErreur] = useState("");
  const [analyse, setAnalyse] = useState<Analyse | null>(null);
  const [copie, setCopie] = useState<"" | "oral" | "email">("");

  const [quota, setQuota] = useState<EtatQuota | null>(null);
  const [blocage, setBlocage] = useState<{ message: string; planLabel: string | null } | null>(null);

  const resultatsRef = useRef<HTMLDivElement | null>(null);
  const demarrageFaitRef = useRef(false);

  /** État du plan pour la bannière (silencieux : c'est de l'indicatif). */
  async function chargerQuota() {
    try {
      const res = await fetch("/api/salary-coach");
      if (!res.ok) return;
      const data = await lireJson(res);
      if (!data || data.indisponible === true) return;
      setQuota(normaliserQuota(data));
    } catch {
      // Bannière indicative uniquement : silence en cas de souci réseau.
    }
  }

  useEffect(() => {
    if (demarrageFaitRef.current) return;
    demarrageFaitRef.current = true;
    void chargerQuota();
  }, []);

  async function calculer() {
    setErreur("");
    setBlocage(null);
    if (jobTitle.trim().length < 2) {
      setErreur("Indique d'abord le poste visé (2 caractères minimum).");
      return;
    }
    if (keySkills.trim().length < 2) {
      setErreur("Liste au moins une compétence clé (ex. : gestion de projet, Excel, prospection).");
      return;
    }
    const exp = Number(experienceYears);
    if (!Number.isFinite(exp) || exp < 0 || exp > 50) {
      setErreur("Années d'expérience : nombre entre 0 et 50.");
      return;
    }

    setGeneration(true);
    try {
      const res = await fetch("/api/salary-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: jobTitle.trim(),
          experienceYears: exp,
          marketRegion,
          keySkills: keySkills.trim(),
          currentOffer: currentOffer.trim(),
        }),
      });
      if (!res.ok) {
        /* Limite du plan atteinte → carte d'upgrade dorée (pas une simple
           erreur rouge) + rafraîchissement de la bannière de quota. */
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
            void chargerQuota();
            return;
          }
        }
        setErreur(
          await lireErreur(res, "Analyse impossible (erreur " + res.status + ").")
        );
        return;
      }
      const data = (await res.json()) as { analyse?: Analyse };
      if (!data.analyse) {
        setErreur("Réponse inattendue du serveur.");
        return;
      }
      setAnalyse(data.analyse);
      void chargerQuota();
      setTimeout(
        () => resultatsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        80
      );
    } catch {
      setErreur("Connexion au serveur impossible. Vérifie ta connexion et réessaie.");
    } finally {
      setGeneration(false);
    }
  }

  async function copier(texte: string, cle: "oral" | "email") {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(cle);
      setTimeout(() => setCopie(""), 2000);
    } catch {
      setErreur("Copie impossible : sélectionne le texte et copie-le manuellement.");
    }
  }

  const limiteAtteinte = (quota && !quota.unlimited && quota.reached) || blocage !== null;
  const planLabelBlocage = blocage?.planLabel ?? quota?.planLabel ?? "Découverte";

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* ── En-tête ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#051937] text-[#FFC107]">
            <IconCoin size={26} stroke={1.8} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#051937]">
              Coach de Négociation Salariale IA
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Fourchettes du marché, arguments chiffrés et scripts prêts à l&apos;emploi — en une simulation.
            </p>
          </div>
        </div>
        <span className="rounded-full bg-[#FFC107] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[#051937]">
          Exclusivité Carrière Pro
        </span>
      </div>

      {/* ── Bannière de quota du plan ───────────────────────────────── */}
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

      {/* ── Limite du plan atteinte : carte d'upgrade ───────────────── */}
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
              Coach de Négociation illimité
            </li>
            <li className="flex items-center gap-2">
              <IconCheck size={16} className="shrink-0" />
              Dossiers IA et recherches d&apos;offres illimités
            </li>
            <li className="flex items-center gap-2">
              <IconCheck size={16} className="shrink-0" />
              Requêtes IA prioritaires (20 par heure)
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

      {/* ── Formulaire de simulation ────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[#051937]">Simulation de négociation</h2>
        <p className="mt-1 text-sm text-slate-500">
          Plus tes informations sont précises, plus la fourchette et les arguments seront crédibles.
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
            <Label htmlFor="zone">Zone géographique / Devise</Label>
            <select
              id="zone"
              value={marketRegion}
              onChange={(e) => setMarketRegion(e.target.value as RegionValue)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-[#051937] shadow-sm outline-none transition-colors focus:border-[#051937]/40 focus:ring-2 focus:ring-[#051937]/10"
            >
              {REGIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 md:row-span-2">
            <Label htmlFor="competences">Compétences clés</Label>
            <Textarea
              id="competences"
              value={keySkills}
              onChange={(e) => setKeySkills(e.target.value)}
              placeholder="Sépare par des virgules : gestion de projet, Excel avancé, prospection téléphonique, SQL..."
              rows={5}
              maxLength={800}
            />
            <p className="text-xs text-slate-400">
              Ce sont elles qui alimentent tes 3 arguments de valeur chiffrés.
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
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => void calculer()}
            disabled={generation}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#051937] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:bg-[#0b2a5b] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generation ? (
              <IconLoader2 size={18} className="animate-spin" />
            ) : (
              <IconSparkles size={18} />
            )}
            {generation
              ? "Analyse en cours... (10 à 20 s)"
              : "Calculer ma fourchette & générer mes scripts"}
          </button>
        </div>
      </section>

      {/* ── Erreur ──────────────────────────────────────────────────── */}
      {erreur ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>{erreur}</span>
        </div>
      ) : null}

      {/* ── Résultats ───────────────────────────────────────────────── */}
      <div ref={resultatsRef} />

      {analyse ? (
        <div className="space-y-8">
          {/* Trois cartes de fourchette */}
          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500">
                <IconShieldCheck size={20} className="text-[#051937]" />
                <span className="text-xs font-semibold uppercase tracking-wide">Minimum acceptable</span>
              </div>
              <p className="mt-3 text-xl font-bold text-[#051937]">{analyse.fourchette_min}</p>
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
              <p className="mt-3 text-2xl font-extrabold text-[#051937]">{analyse.fourchette_cible}</p>
              <p className="mt-1 text-xs text-[#051937]/70">Le montant à demander, sans hésiter.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500">
                <IconTrendingUp size={20} className="text-[#051937]" />
                <span className="text-xs font-semibold uppercase tracking-wide">Plafond Senior</span>
              </div>
              <p className="mt-3 text-xl font-bold text-[#051937]">{analyse.fourchette_max}</p>
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
              {analyse.analyse_marche}
            </p>
          </section>

          {/* Les 3 arguments chiffrés */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-[#051937]">
              Tes 3 arguments de valeur (à ressortir tel quel)
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {analyse.arguments_valeur.map((arg, i) => {
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

              {/* Script oral */}
              <TabsContent value="oral" className="mt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">
                    À prononcer tel quel quand on te demande tes prétentions.
                  </p>
                  <button
                    type="button"
                    onClick={() => void copier(analyse.scripts_reponse.question_entretien, "oral")}
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
                  {analyse.scripts_reponse.question_entretien}
                </div>
              </TabsContent>

              {/* E-mail de contre-proposition */}
              <TabsContent value="email" className="mt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">
                    À adapter (nom, offre) puis à envoyer depuis ta boîte mail.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      void copier(analyse.scripts_reponse.contre_proposition_email, "email")
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
                  {analyse.scripts_reponse.contre_proposition_email}
                </div>
              </TabsContent>

              {/* Avantages alternatifs */}
              <TabsContent value="alternatives" className="mt-4">
                <p className="text-xs text-slate-400">
                  Si le fixe est bloqué, réclame ces leviers — ils ont une vraie valeur.
                </p>
                <div className="mt-3 space-y-3">
                  {analyse.scripts_reponse.alternatives_avantages.map((alt, i) => (
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
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-sm text-slate-500">
          Remplis la simulation ci-dessus puis lance le calcul : tu obtiendras tes
          trois fourchettes, une analyse du marché local, trois arguments chiffrés
          construits sur tes compétences, et tes scripts de négociation prêts à
          l&apos;emploi.
        </section>
      )}
    </div>
  );
}
