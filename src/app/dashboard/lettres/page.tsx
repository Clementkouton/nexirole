"use client";

/**
 * NexiRole — LETTRES DE MOTIVATION (page /dashboard/lettres).
 *
 * - Liste des lettres, création par formulaire + génération IA (Groq).
 * - Éditeur avec SAUVEGARDE AUTOMATIQUE en base (1,2 s après la frappe).
 * - Règle d'or appliquée ici : avant Copier / Imprimer / Régénérer /
 *   Retour, le contenu est TOUJOURS sauvegardé en base d'abord —
 *   l'export et la base sont donc toujours identiques.
 * - Export PDF via la fenêtre d'impression du navigateur (zéro dépendance).
 *
 * Utilise la mini-bibliothèque UI maison (@/components/ui) et la charte
 * NexiRole (navy / or) — aucun composant externe.
 *
 * v2 (correctif) : les messages d'erreur réels du serveur sont affichés
 * fidèlement (plus de « réseau » trompeur), le chargement initial ne part
 * qu'une seule fois même en mode StrictMode, et l'API reconnaît
 * l'utilisateur via 3 voies (voir src/lib/utilisateur-actuel.ts).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, Textarea, Label, Skeleton, cx } from "@/components/ui";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCheck,
  IconCopy,
  IconFileText,
  IconLoader2,
  IconPlus,
  IconPrinter,
  IconRefresh,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-react";

type Lettre = {
  id: string;
  title: string;
  company: string;
  position: string;
  tone: string;
  language: string;
  jobOffer: string;
  cvText: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

type LettreListItem = Pick<
  Lettre,
  "id" | "title" | "company" | "position" | "tone" | "language" | "createdAt" | "updatedAt"
>;

type StatutIaDb = {
  ia: { pret: boolean; provider: string; model: string };
  db: { ok: boolean; message: string };
};

type Etat = "propre" | "sale" | "sauvegarde";

type NouveauFormulaire = {
  company: string;
  position: string;
  tone: string;
  language: string;
  jobOffer: string;
  cvText: string;
};

const TONS: Array<{ value: string; label: string }> = [
  { value: "professionnel", label: "Professionnel et posé" },
  { value: "enthousiaste", label: "Enthousiaste et dynamique" },
  { value: "direct", label: "Direct et efficace" },
  { value: "creatif", label: "Créatif mais crédible" },
];

const LANGUES: Array<{ value: string; label: string }> = [
  { value: "fr", label: "Français" },
  { value: "en", label: "Anglais" },
];

const CSS_IMPRESSION = `
@media print {
  body * { visibility: hidden !important; }
  .zone-impression, .zone-impression * { visibility: visible !important; }
  .zone-impression {
    display: block !important;
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    padding: 32px;
    background: #ffffff;
    color: #000000;
  }
}
`;

/**
 * Lit le corps d'une réponse d'erreur SANS planter, que le serveur renvoie
 * du JSON ({ error, diagnostic }) ou du HTML (erreur de compilation dev).
 * Le « diagnostic » de l'API (si présent) est ajouté entre crochets.
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

export default function LettresPage() {
  const [lettres, setLettres] = useState<LettreListItem[]>([]);
  const [vue, setVue] = useState<"liste" | "formulaire" | "editeur">("liste");
  const [chargement, setChargement] = useState(true);
  const [generation, setGeneration] = useState(false);
  const [erreur, setErreur] = useState("");
  const [statut, setStatut] = useState<StatutIaDb | null>(null);
  const [copie, setCopie] = useState(false);

  const [form, setForm] = useState<NouveauFormulaire>({
    company: "",
    position: "",
    tone: "professionnel",
    language: "fr",
    jobOffer: "",
    cvText: "",
  });

  const [lettre, setLettre] = useState<Lettre | null>(null);
  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState("");
  const [etat, setEtat] = useState<Etat>("propre");
  const [derniereSauvegarde, setDerniereSauvegarde] = useState("");

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contenuRef = useRef("");
  const titreRef = useRef("");
  const lettreIdRef = useRef<string | null>(null);
  const etatRef = useRef<Etat>("propre");
  // StrictMode (dev) monte le composant 2 fois : ce garde évite 2 appels API.
  const demarrageFaitRef = useRef(false);

  function majEtat(v: Etat) {
    etatRef.current = v;
    setEtat(v);
  }

  const sauvegarder = useCallback(async () => {
    const id = lettreIdRef.current;
    if (!id) return;
    majEtat("sauvegarde");
    try {
      const res = await fetch("/api/lettre/" + id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titreRef.current, content: contenuRef.current }),
      });
      if (!res.ok) throw new Error("echec sauvegarde");
      majEtat("propre");
      setDerniereSauvegarde(new Date().toLocaleTimeString("fr-FR"));
    } catch {
      majEtat("sale");
    }
  }, []);

  function programmerSauvegarde() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void sauvegarder();
    }, 1200);
  }

  function handleContenu(v: string) {
    setContenu(v);
    contenuRef.current = v;
    majEtat("sale");
    programmerSauvegarde();
  }

  function handleTitre(v: string) {
    setTitre(v);
    titreRef.current = v;
    majEtat("sale");
    programmerSauvegarde();
  }

  /** Règle d'or : on sauvegarde en base AVANT toute action. */
  async function avantExport() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (etatRef.current !== "propre") {
      await sauvegarder();
    }
  }

  async function chargerLettres() {
    setChargement(true);
    try {
      const res = await fetch("/api/lettre");
      if (!res.ok) {
        setErreur(
          await lireErreur(
            res,
            res.status === 401
              ? "Session expirée — déconnecte-toi, reconnecte-toi, puis recharge la page."
              : "Chargement impossible (erreur " + res.status + ")."
          )
        );
        return;
      }
      const data = (await res.json()) as { lettres?: LettreListItem[] };
      setLettres(data.lettres || []);
    } catch {
      setErreur("Chargement impossible (réseau).");
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    if (demarrageFaitRef.current) return;
    demarrageFaitRef.current = true;
    void chargerLettres();
    void (async () => {
      try {
        const r = await fetch("/api/lettre/ia-status");
        if (!r.ok) return;
        setStatut((await r.json()) as StatutIaDb);
      } catch {
        // statut indisponible : non bloquant
      }
    })();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ouvrirLettre(id: string) {
    setErreur("");
    try {
      const res = await fetch("/api/lettre/" + id);
      if (!res.ok) {
        setErreur(await lireErreur(res, "Lettre introuvable."));
        return;
      }
      const data = (await res.json()) as { lettre?: Lettre };
      if (!data.lettre) {
        setErreur("Réponse inattendue du serveur.");
        return;
      }
      const l = data.lettre;
      setLettre(l);
      lettreIdRef.current = l.id;
      setTitre(l.title);
      titreRef.current = l.title;
      setContenu(l.content);
      contenuRef.current = l.content;
      majEtat("propre");
      setDerniereSauvegarde("");
      setVue("editeur");
    } catch {
      setErreur("Ouverture impossible.");
    }
  }

  async function generer() {
    setErreur("");
    setGeneration(true);
    try {
      const res = await fetch("/api/lettre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        setErreur(await lireErreur(res, "Génération impossible."));
        return;
      }
      const data = (await res.json()) as { lettre?: Lettre };
      if (!data.lettre) {
        setErreur("Réponse inattendue du serveur.");
        return;
      }
      const l = data.lettre;
      setLettre(l);
      lettreIdRef.current = l.id;
      setTitre(l.title);
      titreRef.current = l.title;
      setContenu(l.content);
      contenuRef.current = l.content;
      majEtat("propre");
      setDerniereSauvegarde("");
      await chargerLettres();
      setVue("editeur");
    } catch {
      setErreur("Génération impossible (réseau).");
    } finally {
      setGeneration(false);
    }
  }

  async function regenerer() {
    if (!lettre) return;
    if (!window.confirm("Remplacer le contenu actuel par une nouvelle génération IA ?")) return;
    setErreur("");
    setGeneration(true);
    try {
      const res = await fetch("/api/lettre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: lettre.company,
          position: lettre.position,
          tone: lettre.tone,
          language: lettre.language,
          jobOffer: lettre.jobOffer,
          cvText: lettre.cvText,
        }),
      });
      if (!res.ok) {
        setErreur(await lireErreur(res, "Génération impossible."));
        return;
      }
      const data = (await res.json()) as { lettre?: Lettre };
      if (!data.lettre) {
        setErreur("Réponse inattendue du serveur.");
        return;
      }
      const nouveau = data.lettre.content;
      setContenu(nouveau);
      contenuRef.current = nouveau;
      majEtat("sale");
      programmerSauvegarde();
    } catch {
      setErreur("Génération impossible (réseau).");
    } finally {
      setGeneration(false);
    }
  }

  async function supprimer() {
    if (!lettre) return;
    if (!window.confirm("Supprimer définitivement cette lettre ?")) return;
    try {
      await fetch("/api/lettre/" + lettre.id, { method: "DELETE" });
    } catch {
      // on retourne à la liste même si l'appel échoue
    }
    setLettre(null);
    lettreIdRef.current = null;
    setVue("liste");
    await chargerLettres();
  }

  async function copier() {
    await avantExport();
    try {
      await navigator.clipboard.writeText(contenuRef.current);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      setErreur("Copie impossible dans ce navigateur.");
    }
  }

  async function imprimer() {
    await avantExport();
    window.print();
  }

  async function retourListe() {
    await avantExport();
    setLettre(null);
    lettreIdRef.current = null;
    setVue("liste");
    await chargerLettres();
  }

  const texteEtat =
    etat === "sale"
      ? "Modifications non enregistrées…"
      : etat === "sauvegarde"
        ? "Enregistrement…"
        : derniereSauvegarde
          ? "Enregistré à " + derniereSauvegarde
          : "Enregistré";

  return (
    <div className="space-y-6 py-2">
      <style>{CSS_IMPRESSION}</style>

      {/* Zone d'impression : visible uniquement à l'impression / export PDF */}
      <div className="zone-impression hidden">
        <pre className="whitespace-pre-wrap font-serif text-[13pt] leading-relaxed">{contenu}</pre>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-navy">Lettres de motivation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Générées par l&apos;IA, éditées ici, sauvegardées automatiquement en base.
          </p>
        </div>
        {vue === "liste" ? (
          <Button
            onClick={() => {
              setErreur("");
              setVue("formulaire");
            }}
          >
            <IconPlus size={16} /> Nouvelle lettre
          </Button>
        ) : null}
      </div>

      {/* Badges de diagnostic : IA + base */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {statut === null ? null : statut.ia.pret ? (
          <span className="rounded-full bg-navy-50 px-3 py-1 font-semibold text-navy">
            IA prête : {statut.ia.provider} · {statut.ia.model}
          </span>
        ) : (
          <span className="rounded-full bg-gold-soft px-3 py-1 font-semibold text-gold-dark">
            IA non configurée — ajoute GROQ_API_KEY dans .env.local puis redémarre
          </span>
        )}
        {statut && !statut.db.ok ? (
          <span className="rounded-full bg-red-50 px-3 py-1 font-semibold text-red-700">
            Base : lance « npx prisma db push »
          </span>
        ) : null}
      </div>

      {erreur ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{erreur}</span>
        </div>
      ) : null}

      {/* ------------------------------ LISTE ------------------------------ */}
      {vue === "liste" ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-navy">Mes lettres ({lettres.length})</h2>

          {chargement ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : lettres.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-muted-foreground shadow-sm">
              Aucune lettre pour l&apos;instant. Clique sur « Nouvelle lettre » pour générer ta
              première lettre de motivation avec l&apos;IA.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {lettres.map((l) => (
                <div
                  key={l.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => void ouvrirLettre(l.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") void ouvrirLettre(l.id);
                  }}
                  className="w-full cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-navy/40 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-navy-50">
                      <IconFileText size={18} className="text-navy" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy">{l.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[l.position, l.company].filter(Boolean).join(" · ") || "Sans destination"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(l.updatedAt).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* ---------------------------- FORMULAIRE --------------------------- */}
      {vue === "formulaire" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="poste">Poste visé</Label>
                <Input
                  id="poste"
                  value={form.position}
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                  placeholder="Ex. Développeur Full-Stack"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entreprise">Entreprise</Label>
                <Input
                  id="entreprise"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="Ex. NexiRole SAS"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ton">Ton</Label>
                <select
                  id="ton"
                  value={form.tone}
                  onChange={(e) => setForm({ ...form, tone: e.target.value })}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-navy shadow-sm outline-none transition-colors focus:border-navy/40 focus:ring-2 focus:ring-navy/10"
                >
                  {TONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="langue">Langue</Label>
                <select
                  id="langue"
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-navy shadow-sm outline-none transition-colors focus:border-navy/40 focus:ring-2 focus:ring-navy/10"
                >
                  {LANGUES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="offre">Offre d&apos;emploi (colle le texte de l&apos;annonce)</Label>
                <Textarea
                  id="offre"
                  rows={6}
                  value={form.jobOffer}
                  onChange={(e) => setForm({ ...form, jobOffer: e.target.value })}
                  placeholder="Colle ici le texte complet de l'annonce…"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cv">Texte de ton CV (copie-le depuis le Créateur de CV)</Label>
                <Textarea
                  id="cv"
                  rows={6}
                  value={form.cvText}
                  onChange={(e) => setForm({ ...form, cvText: e.target.value })}
                  placeholder="Colle ici le contenu de ton CV…"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setVue("liste")} disabled={generation}>
                <IconArrowLeft size={16} /> Annuler
              </Button>
              <Button
                onClick={() => void generer()}
                disabled={generation || (!form.jobOffer.trim() && !form.cvText.trim())}
              >
                {generation ? <IconLoader2 size={16} className="animate-spin" /> : <IconSparkles size={16} />}
                {generation ? "Génération en cours (10 à 30 s)…" : "Générer avec l'IA"}
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Astuce : plus l&apos;offre et le CV sont détaillés, plus la lettre est précise et
            convaincante.
          </p>
        </div>
      ) : null}

      {/* ----------------------------- ÉDITEUR ----------------------------- */}
      {vue === "editeur" && lettre ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => void retourListe()}>
              <IconArrowLeft size={16} /> Mes lettres
            </Button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className={cx(
                  "size-2 rounded-full",
                  etat === "propre"
                    ? "bg-emerald-500"
                    : etat === "sauvegarde"
                      ? "animate-pulse bg-gold"
                      : "bg-red-500"
                )}
              />
              <span>{texteEtat}</span>
              {etat === "propre" ? <IconCheck size={14} className="text-emerald-600" /> : null}
            </div>
          </div>

          <Input
            value={titre}
            onChange={(e) => handleTitre(e.target.value)}
            placeholder="Titre de la lettre"
            className="text-base font-semibold"
          />

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void copier()}>
              {copie ? (
                <IconCheck size={16} className="text-emerald-600" />
              ) : (
                <IconCopy size={16} />
              )}
              {copie ? "Copié" : "Copier"}
            </Button>
            <Button onClick={() => void imprimer()}>
              <IconPrinter size={16} /> Imprimer / PDF
            </Button>
            <Button variant="outline" onClick={() => void regenerer()} disabled={generation}>
              {generation ? (
                <IconLoader2 size={16} className="animate-spin" />
              ) : (
                <IconRefresh size={16} />
              )}
              Régénérer
            </Button>
            <Button
              variant="outline"
              className="border-red-200 text-red-700"
              onClick={() => void supprimer()}
            >
              <IconTrash size={16} /> Supprimer
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Astuce : l&apos;export PDF utilise la fenêtre d&apos;impression du navigateur — choisis
            « Enregistrer au format PDF ». Le contenu est toujours sauvegardé en base avant
            l&apos;export.
          </p>

          <Textarea
            value={contenu}
            onChange={(e) => handleContenu(e.target.value)}
            rows={22}
            className="min-h-[520px] font-serif text-[15px] leading-relaxed"
          />
        </div>
      ) : null}
    </div>
  );
}
