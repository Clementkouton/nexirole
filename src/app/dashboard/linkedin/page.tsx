"use client";

/**
 * NexiRole — OPTIMISEUR DE PROFIL LINKEDIN IA (page /dashboard/linkedin).
 *
 * L'utilisateur colle son parcours (ou choisit un CV de sa bibliothèque),
 * indique son poste cible, la langue et le ton → l'IA (Groq, même moteur que
 * le reste de l'app) renvoie un profil LinkedIn structuré :
 *   - un score de visibilité SEO recruteur (0-100 %) + checklist rapide,
 *   - 3 titres (Headline) avec compteur 220 caractères et copie en un clic,
 *   - la section « À propos » complète, éditable avant publication,
 *   - 4 puces d'expérience orientées résultats chiffrés,
 *   - les 10 compétences clés à ajouter en priorité (badges cliquables).
 *
 * Style : même langage visuel que /dashboard/negociation (cartes blanches
 * border-slate-200, en-tête à carré navy #051937 + accent or #FFC107).
 * Notifications via sonner (Toaster monté dans src/app/layout.tsx).
 * Icônes : exclusivement @tabler/icons-react.
 */

import { useEffect, useRef, useState } from "react";
import { Input, Label, Textarea, cx } from "@/components/ui";
import { toast } from "sonner";
import {
  IconAlertTriangle,
  IconBrandLinkedin,
  IconCheck,
  IconCopy,
  IconCrown,
  IconFileText,
  IconGauge,
  IconInfoCircle,
  IconListCheck,
  IconLoader2,
  IconSparkles,
  IconTargetArrow,
  IconTrendingUp,
} from "@tabler/icons-react";

/* ── Types ───────────────────────────────────────────────────────────── */

/** Résultat structuré renvoyé par POST /api/linkedin-optimizer. */
type ProfilLinkedin = {
  score_visibilite: number;
  headlines: string[];
  about_section: string;
  experiences_bullets: string[];
  top_skills: string[];
  checklist_profil: string[];
};

/** CV de la bibliothèque (GET /api/cv). */
type CvBibliotheque = { id: string; name: string; updatedAt?: string };

type TonValue =
  | "Expert & Crédible"
  | "Dynamique & Startup"
  | "Leadership & Exécutif";

const TONS: Array<{ value: TonValue; label: string }> = [
  { value: "Expert & Crédible", label: "Expert & Crédible" },
  { value: "Dynamique & Startup", label: "Dynamique & Startup" },
  { value: "Leadership & Exécutif", label: "Leadership & Exécutif" },
];

const LANGUES: Array<{ value: "fr" | "en"; label: string }> = [
  { value: "fr", label: "Français" },
  { value: "en", label: "Anglais International" },
];

const LIMITE_HEADLINE = 220;
const LIMITE_ABOUT = 2600;

/* ── Aides réseau & presse-papier ────────────────────────────────────── */

async function lireErreur(res: Response, fallback: string): Promise<string> {
  let brut = "";
  try {
    brut = await res.text();
  } catch {
    return fallback;
  }
  try {
    const data = JSON.parse(brut) as { error?: string; detail?: string };
    const base = data.error || fallback;
    return data.detail ? `${base} [Détail : ${data.detail}]` : base;
  } catch {
    return `${fallback} (réponse non JSON — regarde le terminal « npm run dev »)`;
  }
}

/** Copie robuste dans le presse-papier (fallback navigateurs anciens). */
async function copierTexte(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    try {
      const zone = document.createElement("textarea");
      zone.value = texte;
      zone.style.position = "fixed";
      zone.style.opacity = "0";
      document.body.appendChild(zone);
      zone.select();
      const reussi = document.execCommand("copy");
      zone.remove();
      return reussi;
    } catch {
      return false;
    }
  }
}

async function copierEtNotifier(texte: string) {
  const ok = await copierTexte(texte);
  if (ok) {
    toast.success("Copié !");
  } else {
    toast.error("Copie impossible : sélectionne le texte et copie-le manuellement.");
  }
}

/* ── Conversion d'un CV (bibliothèque) en texte lisible ──────────────── */

function ch(...valeurs: unknown[]): string {
  for (const valeur of valeurs) {
    if (typeof valeur === "string" && valeur.trim() !== "") return valeur.trim();
  }
  return "";
}

function tab(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      item !== null && typeof item === "object" && !Array.isArray(item)
  );
}

function strList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .map((item) => item.trim())
    .slice(0, max);
}

/** CvBuilderData (créateur) → texte CV lisible pour l'IA. */
function cvEnTexte(data: unknown): string {
  const d = data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
  const personal = tab([d.personal])[0] ?? {};
  const identite = tab([d.identite])[0] ?? {};
  const lignes: string[] = [];

  const nom = ch(personal.fullName, personal.nom, identite.nom_complet);
  const titrePro = ch(personal.title, identite.titre, d.title, d.titre);
  if (nom || titrePro) lignes.push([nom, titrePro].filter(Boolean).join(" — "));

  const contacts = [
    ch(personal.email, identite.email) && `E-mail : ${ch(personal.email, identite.email)}`,
    ch(personal.phone, personal.telephone, identite.telephone) &&
      `Téléphone : ${ch(personal.phone, personal.telephone, identite.telephone)}`,
    ch(personal.location, personal.ville, identite.ville) &&
      `Ville : ${ch(personal.location, personal.ville, identite.ville)}`,
    ch(personal.linkedin, identite.linkedin) &&
      `LinkedIn : ${ch(personal.linkedin, identite.linkedin)}`,
  ].filter(Boolean) as string[];
  if (contacts.length > 0) lignes.push(contacts.join(" | "));

  const resume = ch(d.summary, d.resume);
  if (resume) lignes.push(`Profil : ${resume}`);

  const experiences = tab(d.experiences);
  if (experiences.length > 0) {
    lignes.push("Expériences professionnelles :");
    for (const exp of experiences) {
      const enTete = [
        ch(exp.role, exp.poste),
        ch(exp.company, exp.entreprise),
        ch(exp.period, exp.periode),
        ch(exp.location, exp.lieu),
      ]
        .filter(Boolean)
        .join(" — ");
      lignes.push(`- ${enTete || "Expérience"}`);
      for (const mission of strList(exp.achievements ?? exp.missions, 6)) {
        lignes.push(`  • ${mission}`);
      }
    }
  }

  const formations = tab(d.education ?? d.formations);
  if (formations.length > 0) {
    lignes.push("Formation :");
    for (const formation of formations) {
      const ligne = [
        ch(formation.degree, formation.diplome),
        ch(formation.school, formation.ecole, formation.etablissement),
        ch(formation.period, formation.periode),
      ]
        .filter(Boolean)
        .join(" — ");
      lignes.push(`- ${ligne || "Formation"}`);
    }
  }

  const competences = strList(d.skills ?? d.competences, 20);
  if (competences.length > 0) lignes.push(`Compétences : ${competences.join(", ")}`);

  const langues = tab(d.languages ?? d.langues);
  if (langues.length > 0) {
    const langueLignes = langues
      .map((l) => `${ch(l.name, l.nom)} (${ch(l.level, l.niveau) || "niveau non précisé"})`)
      .filter((ligne) => !ligne.startsWith(" ("))
      .join(", ");
    if (langueLignes) lignes.push(`Langues : ${langueLignes}`);
  }

  return lignes.join("\n").slice(0, 12000);
}

/* ── Affichage du score ──────────────────────────────────────────────── */

function appreciationScore(score: number): { label: string; couleur: string } {
  if (score >= 85)
    return { label: "Excellent — ton profil est prêt pour la recherche recruteur.", couleur: "text-emerald-600" };
  if (score >= 70)
    return { label: "Solide — quelques ajustements te placeront devant la concurrence.", couleur: "text-[#051937]" };
  if (score >= 50)
    return { label: "Correct — mais l'algorithme te sous-affiche encore. Applique la checklist.", couleur: "text-amber-600" };
  return { label: "Faible — ta visibilité recruteur est faible. Commence par la checklist.", couleur: "text-red-600" };
}

/* ── Page ────────────────────────────────────────────────────────────── */

export default function LinkedinPage() {
  /* Bibliothèque de CV (sélecteur rapide). */
  const [cvs, setCvs] = useState<CvBibliotheque[]>([]);
  const [cvChoisi, setCvChoisi] = useState("");
  const [cvChargement, setCvChargement] = useState(false);

  /* Paramètres de génération. */
  const [cvText, setCvText] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  const [tone, setTone] = useState<TonValue>("Expert & Crédible");

  /* Génération & résultats. */
  const [generation, setGeneration] = useState(false);
  const [erreur, setErreur] = useState("");
  const [blocage, setBlocage] = useState<string | null>(null);
  const [profil, setProfil] = useState<ProfilLinkedin | null>(null);
  const [aboutText, setAboutText] = useState("");

  const resultatsRef = useRef<HTMLDivElement | null>(null);

  /* Bibliothèque de CV chargée à l'ouverture (silencieux en cas d'échec :
     la zone de texte libre reste toujours utilisable). */
  useEffect(() => {
    let abandonne = false;
    (async () => {
      try {
        const res = await fetch("/api/cv", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as
          | { cvs?: CvBibliotheque[] }
          | null;
        if (!abandonne && Array.isArray(data?.cvs)) setCvs(data!.cvs);
      } catch {
        /* indicatif uniquement */
      }
    })();
    return () => {
      abandonne = true;
    };
  }, []);

  /* Sélecteur rapide : charge le contenu du CV choisi dans la zone de texte. */
  async function chargerCvBibliotheque(id: string) {
    setCvChoisi(id);
    if (!id) return;
    setCvChargement(true);
    try {
      const res = await fetch(`/api/cv/${id}`, { cache: "no-store" });
      if (!res.ok) {
        toast.error("Impossible de charger ce CV — réessaie.");
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | { cv?: { data?: unknown } | null }
        | null;
      if (data?.cv?.data) {
        const texte = cvEnTexte(data.cv.data);
        if (texte.length > 40) {
          setCvText(texte);
          toast.success("CV chargé — le champ reste modifiable avant génération.");
        } else {
          toast.error("Ce CV est encore trop vide — complète-le dans le studio de CV.");
        }
      }
    } catch {
      toast.error("Réseau indisponible : réessaie dans un instant.");
    } finally {
      setCvChargement(false);
    }
  }

  async function generer() {
    setErreur("");
    setBlocage(null);

    if (targetRole.trim().length < 2) {
      setErreur("Indique d'abord le poste ciblé (ex. : Développeur Fullstack, Chef de Projet Digital).");
      return;
    }
    if (cvText.trim().length < 50) {
      setErreur("Colle ton parcours (50 caractères minimum) ou choisis un CV de ta bibliothèque.");
      return;
    }

    setGeneration(true);
    try {
      const res = await fetch("/api/linkedin-optimizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cvText: cvText.trim().slice(0, 16000),
          targetRole: targetRole.trim(),
          language,
          tone,
        }),
      });

      if (!res.ok) {
        if (res.status === 403) {
          const data = (await res.json().catch(() => null)) as
            | { code?: string; error?: string }
            | null;
          if (data?.code === "QUOTA_EXCEEDED") {
            setBlocage(
              typeof data.error === "string"
                ? data.error
                : "Limite du plan atteinte. Passez à un plan supérieur pour continuer."
            );
            return;
          }
        }
        setErreur(
          await lireErreur(res, "Optimisation impossible (erreur " + res.status + ").")
        );
        return;
      }

      const data = (await res.json()) as { profil?: ProfilLinkedin };
      if (!data.profil || !Array.isArray(data.profil.headlines)) {
        setErreur("Réponse inattendue du serveur.");
        return;
      }

      setProfil(data.profil);
      setAboutText(data.profil.about_section);
      toast.success("Profil LinkedIn généré — copie chaque section en un clic.");
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

  const appreciation = profil ? appreciationScore(profil.score_visibilite) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* ── En-tête ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-[#051937] text-[#FFC107]">
            <IconBrandLinkedin size={26} stroke={1.8} />
            <span className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#FFC107]" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#051937]">
              Optimiseur de Profil LinkedIn IA
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Titre, résumé, compétences et puces d&apos;expérience optimisés pour la recherche recruteur — en une génération.
            </p>
          </div>
        </div>
        <span className="rounded-full bg-[#FFC107] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[#051937]">
          SEO Recruteur
        </span>
      </div>

      {/* ── Limite du plan atteinte : carte d'upgrade ───────────────── */}
      {blocage ? (
        <section className="rounded-2xl border-2 border-[#FFC107] bg-[#FFC107]/10 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#051937] text-[#FFC107]">
              <IconCrown size={22} />
            </span>
            <h2 className="text-lg font-bold text-[#051937]">Limite du plan atteinte</h2>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{blocage}</p>
          <a
            href="/pricing"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#051937] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b2a5b]"
          >
            <IconSparkles size={16} />
            Découvrir les offres
          </a>
        </section>
      ) : null}

      {/* ── Formulaire de génération ────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[#051937]">Ton profil LinkedIn sur mesure</h2>
        <p className="mt-1 text-sm text-slate-500">
          Plus ton parcours est détaillé, plus le titre, le résumé et les compétences seront percutants.
        </p>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {/* Sélecteur rapide de CV (bibliothèque) */}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="cv-choisi">Sélecteur rapide de CV (bibliothèque)</Label>
            <select
              id="cv-choisi"
              value={cvChoisi}
              onChange={(e) => void chargerCvBibliotheque(e.target.value)}
              disabled={cvChargement}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-[#051937] shadow-sm outline-none transition-colors focus:border-[#051937]/40 focus:ring-2 focus:ring-[#051937]/10 disabled:cursor-not-allowed disabled:bg-slate-50"
            >
              <option value="">
                {cvs.length === 0
                  ? "Aucun CV en bibliothèque — colle ton parcours ci-dessous"
                  : "— Choisir un CV enregistré —"}
              </option>
              {cvs.map((cv) => (
                <option key={cv.id} value={cv.id}>
                  {cv.name}
                </option>
              ))}
            </select>
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <IconInfoCircle size={14} className="shrink-0" />
              Le contenu du CV choisi remplit automatiquement la zone « Ton parcours » ci-dessous.
            </p>
          </div>

          {/* Paramètres */}
          <div className="space-y-2">
            <Label htmlFor="poste">Poste ciblé</Label>
            <Input
              id="poste"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="ex. : Développeur Fullstack, Chef de Projet Digital..."
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="langue">Langue du profil</Label>
            <select
              id="langue"
              value={language}
              onChange={(e) => setLanguage(e.target.value as "fr" | "en")}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-[#051937] shadow-sm outline-none transition-colors focus:border-[#051937]/40 focus:ring-2 focus:ring-[#051937]/10"
            >
              {LANGUES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="ton">Ton du profil</Label>
            <select
              id="ton"
              value={tone}
              onChange={(e) => setTone(e.target.value as TonValue)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-[#051937] shadow-sm outline-none transition-colors focus:border-[#051937]/40 focus:ring-2 focus:ring-[#051937]/10"
            >
              {TONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Parcours : bibliothèque ou texte libre */}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="parcours">Ton parcours (CV chargé ou texte libre)</Label>
            <Textarea
              id="parcours"
              value={cvText}
              onChange={(e) => setCvText(e.target.value)}
              placeholder="Colle ici ton CV, ton parcours ou décris ton profil : expériences, missions, résultats chiffrés, outils maîtrisés, formations..."
              rows={7}
              maxLength={16000}
              className="leading-relaxed"
            />
            <p className="text-xs text-slate-400">
              {cvChargement
                ? "Chargement du CV..."
                : `${cvText.trim().length.toLocaleString("fr-FR")} / 16 000 caractères`}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => void generer()}
            disabled={generation}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#051937] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b2a5b] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generation ? (
              <IconLoader2 size={18} className="animate-spin" />
            ) : (
              <IconSparkles size={18} />
            )}
            {generation
              ? "Optimisation en cours... (10 à 20 s)"
              : "Générer mon profil LinkedIn optimisé"}
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

      {profil ? (
        <div className="space-y-8">
          {/* Score SEO + Checklist rapide */}
          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500">
                <IconGauge size={20} className="text-[#051937]" />
                <span className="text-xs font-semibold uppercase tracking-wide">
                  Score SEO Recruteur
                </span>
              </div>
              <p className="mt-3 text-3xl font-extrabold text-[#051937]">
                {profil.score_visibilite}
                <span className="text-lg text-slate-400"> %</span>
              </p>
              <div
                className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-valuenow={profil.score_visibilite}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-[#FFC107] transition-all"
                  style={{ width: `${profil.score_visibilite}%` }}
                />
              </div>
              <p className={cx("mt-3 text-xs font-medium leading-relaxed", appreciation?.couleur)}>
                {appreciation?.label}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Estimation de l&apos;attractivité de ton profil actuel pour les recherches recruteurs.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2">
              <div className="flex items-center gap-2 text-slate-500">
                <IconListCheck size={20} className="text-[#051937]" />
                <span className="text-xs font-semibold uppercase tracking-wide">
                  Checklist d&apos;amélioration rapide
                </span>
              </div>
              <ul className="mt-4 space-y-3">
                {profil.checklist_profil.map((action, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-600">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FFC107]/20 text-[#051937]">
                      <IconCheck size={13} />
                    </span>
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Les 3 Titres LinkedIn (Headlines) */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <IconTargetArrow size={20} className="text-[#051937]" />
              <h2 className="text-lg font-bold text-[#051937]">Les 3 Titres LinkedIn (Headlines)</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {profil.headlines.map((headline, i) => (
                <div
                  key={i}
                  className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-[#051937] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#FFC107]">
                      Titre {i + 1}
                    </span>
                    <span
                      className={cx(
                        "text-xs font-medium",
                        headline.length > LIMITE_HEADLINE ? "text-red-600" : "text-slate-400"
                      )}
                    >
                      {headline.length}/{LIMITE_HEADLINE} caractères
                    </span>
                  </div>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-700">{headline}</p>
                  <button
                    type="button"
                    onClick={() => void copierEtNotifier(headline)}
                    className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#051937]/20 px-3 py-2 text-xs font-semibold text-[#051937] transition-colors hover:border-[#051937] hover:bg-[#051937] hover:text-white"
                  >
                    <IconCopy size={14} />
                    Copier
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Section « À propos » (Summary) — éditable */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <IconTrendingUp size={20} className="text-[#051937]" />
                <h2 className="text-lg font-bold text-[#051937]">
                  Section « À propos » (Summary)
                </h2>
              </div>
              <span
                className={cx(
                  "text-xs font-medium",
                  aboutText.length > LIMITE_ABOUT ? "text-red-600" : "text-slate-400"
                )}
              >
                {aboutText.length.toLocaleString("fr-FR")}/{LIMITE_ABOUT.toLocaleString("fr-FR")} caractères
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Prêt à publier — modifie librement le texte avant de le copier dans LinkedIn.
            </p>
            <Textarea
              value={aboutText}
              onChange={(e) => setAboutText(e.target.value)}
              rows={14}
              maxLength={LIMITE_ABOUT}
              className="mt-4 leading-relaxed"
              aria-label="Section À propos, modifiable"
            />
            <button
              type="button"
              onClick={() => void copierEtNotifier(aboutText)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#051937] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b2a5b]"
            >
              <IconCopy size={16} />
              Copier le résumé
            </button>
          </section>

          {/* Top 10 Compétences & Puces d'Expérience */}
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <IconSparkles size={20} className="text-[#051937]" />
                <h2 className="text-lg font-bold text-[#051937]">Top 10 Compétences</h2>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Clique une compétence pour la copier, puis ajoute-la dans « Compétences » sur LinkedIn.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {profil.top_skills.map((skill, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => void copierEtNotifier(skill)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-sm font-medium text-[#051937] transition-colors hover:border-[#FFC107] hover:bg-[#FFC107]/15"
                  >
                    <IconCopy size={12} className="text-slate-400" />
                    {skill}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <IconFileText size={20} className="text-[#051937]" />
                  <h2 className="text-lg font-bold text-[#051937]">Puces d&apos;Expérience</h2>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void copierEtNotifier(profil.experiences_bullets.join("\n"))
                  }
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#051937]/20 px-3 py-2 text-xs font-semibold text-[#051937] transition-colors hover:border-[#051937] hover:bg-[#051937] hover:text-white"
                >
                  <IconCopy size={14} />
                  Copier le bloc
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                4 puces d&apos;impact orientées résultats, prêtes à coller dans une expérience LinkedIn.
              </p>
              <ul className="mt-4 space-y-3">
                {profil.experiences_bullets.map((bulle, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3.5 py-3"
                  >
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#FFC107]" />
                    <p className="flex-1 text-sm leading-relaxed text-slate-600">{bulle}</p>
                    <button
                      type="button"
                      onClick={() => void copierEtNotifier(bulle)}
                      aria-label={`Copier la puce ${i + 1}`}
                      className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-[#051937]"
                    >
                      <IconCopy size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
