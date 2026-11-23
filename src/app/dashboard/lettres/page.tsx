"use client";

/* =====================================================================
   NexiRole - Lettres de motivation (IA)
   Page : /dashboard/lettres
   - Liste des lettres, creation par formulaire + generation IA
   - Editeur avec SAUVEGARDE AUTOMATIQUE en base (1,2 s apres la frappe)
   - Regle d'or appliquee ici : avant Copier / Imprimer / Regenerer /
     Retour, le contenu est TOUJORS sauvegarde en base d'abord.
   - Export PDF via la fenetre d'impression du navigateur (zero dependance)
   ===================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  FileText,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";

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

type IaStatus = {
  ai: { provider: string; model: string } | null;
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
  { value: "professionnel", label: "Professionnel et pose" },
  { value: "enthousiaste", label: "Enthousiaste et dynamique" },
  { value: "direct", label: "Direct et efficace" },
  { value: "creatif", label: "Creatif mais credible" },
];

const LANGUES: Array<{ value: string; label: string }> = [
  { value: "fr", label: "Francais" },
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

export default function LettresPage() {
  const [lettres, setLettres] = useState<LettreListItem[]>([]);
  const [vue, setVue] = useState<"liste" | "formulaire" | "editeur">("liste");
  const [chargement, setChargement] = useState(true);
  const [generation, setGeneration] = useState(false);
  const [erreur, setErreur] = useState("");
  const [ia, setIa] = useState<IaStatus | null>(null);
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

  /** Regle d'or : on sauvegarde en base AVANT toute action. */
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
      if (res.status === 401) {
        setErreur("Session expiree - reconnecte-toi puis recharge la page.");
        return;
      }
      const data = (await res.json()) as { lettres?: LettreListItem[]; error?: string };
      if (!res.ok) {
        setErreur(data.error || "Chargement impossible.");
        return;
      }
      setLettres(data.lettres || []);
    } catch {
      setErreur("Chargement impossible (reseau).");
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    void chargerLettres();
    void (async () => {
      try {
        const r = await fetch("/api/lettre/ia-status");
        setIa((await r.json()) as IaStatus);
      } catch {
        // statut IA indisponible : non bloquant
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
      const data = (await res.json()) as { lettre?: Lettre; error?: string };
      if (!res.ok || !data.lettre) {
        setErreur(data.error || "Lettre introuvable.");
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
      const data = (await res.json()) as { lettre?: Lettre; error?: string };
      if (!res.ok || !data.lettre) {
        setErreur(data.error || "Generation impossible.");
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
      setErreur("Generation impossible (reseau).");
    } finally {
      setGeneration(false);
    }
  }

  async function regenerer() {
    if (!lettre) return;
    if (!window.confirm("Remplacer le contenu actuel par une nouvelle generation IA ?")) return;
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
      const data = (await res.json()) as { lettre?: Lettre; error?: string };
      if (!res.ok || !data.lettre) {
        setErreur(data.error || "Generation impossible.");
        return;
      }
      const nouveau = data.lettre.content;
      setContenu(nouveau);
      contenuRef.current = nouveau;
      majEtat("sale");
      programmerSauvegarde();
    } catch {
      setErreur("Generation impossible (reseau).");
    } finally {
      setGeneration(false);
    }
  }

  async function supprimer() {
    if (!lettre) return;
    if (!window.confirm("Supprimer definitivement cette lettre ?")) return;
    try {
      await fetch("/api/lettre/" + lettre.id, { method: "DELETE" });
    } catch {
      // on retourne a la liste meme si l'appel echoue
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
      ? "Modifications non enregistrees..."
      : etat === "sauvegarde"
        ? "Enregistrement..."
        : derniereSauvegarde
          ? "Enregistre a " + derniereSauvegarde
          : "Enregistre";

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <style>{CSS_IMPRESSION}</style>

      {/* Zone d'impression : visible uniquement a l'impression / export PDF */}
      <div className="zone-impression hidden">
        <pre className="whitespace-pre-wrap font-serif text-[13pt] leading-relaxed">{contenu}</pre>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Lettres de motivation</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {ia && ia.ai ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800">
              IA prete : {ia.ai.provider} · {ia.ai.model}
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800">
              IA non detectee - ajoute ta cle (ex. GROQ_API_KEY) dans .env puis redemarre
            </span>
          )}
          {ia && !ia.db.ok ? (
            <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-800">
              Base : lance « npx prisma db push »
            </span>
          ) : null}
        </div>
      </div>

      {erreur ? (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{erreur}</span>
        </div>
      ) : null}

      {/* ------------------------------ LISTE ------------------------------ */}
      {vue === "liste" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Mes lettres ({lettres.length})</h2>
            <Button
              onClick={() => {
                setErreur("");
                setVue("formulaire");
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Nouvelle lettre
            </Button>
          </div>

          {chargement ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
            </div>
          ) : lettres.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Aucune lettre pour l&apos;instant. Clique sur « Nouvelle lettre » pour generer ta
                premiere lettre de motivation avec l&apos;IA.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {lettres.map((l) => (
                <Card
                  key={l.id}
                  className="cursor-pointer transition hover:border-primary/40 hover:shadow-sm"
                  onClick={() => void ouvrirLettre(l.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{l.title}</p>
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
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* ---------------------------- FORMULAIRE --------------------------- */}
      {vue === "formulaire" ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="poste">Poste vise</Label>
                <Input
                  id="poste"
                  value={form.position}
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                  placeholder="Ex. Developpeur Full-Stack"
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
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {LANGUES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="offre">Offre d&apos;emploi (colle le texte de l&apos;annonce)</Label>
              <Textarea
                id="offre"
                rows={6}
                value={form.jobOffer}
                onChange={(e) => setForm({ ...form, jobOffer: e.target.value })}
                placeholder="Colle ici le texte complet de l'annonce..."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cv">Texte de ton CV (copie-le depuis le CV Builder)</Label>
              <Textarea
                id="cv"
                rows={6}
                value={form.cvText}
                onChange={(e) => setForm({ ...form, cvText: e.target.value })}
                placeholder="Colle ici le contenu de ton CV..."
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setVue("liste")} disabled={generation}>
                Annuler
              </Button>
              <Button
                onClick={() => void generer()}
                disabled={generation || (!form.jobOffer.trim() && !form.cvText.trim())}
              >
                {generation ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {generation ? "Generation en cours (10 a 30 s)..." : "Generer avec l'IA"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ----------------------------- EDITEUR ----------------------------- */}
      {vue === "editeur" && lettre ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => void retourListe()}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Mes lettres
            </Button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {etat === "sauvegarde" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : etat === "propre" ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span>{texteEtat}</span>
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
                <Check className="mr-2 h-4 w-4 text-emerald-600" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              {copie ? "Copie" : "Copier"}
            </Button>
            <Button variant="outline" onClick={() => void imprimer()}>
              <Printer className="mr-2 h-4 w-4" /> Imprimer / PDF
            </Button>
            <Button variant="outline" onClick={() => void regenerer()} disabled={generation}>
              {generation ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Regenerer
            </Button>
            <Button variant="destructive" onClick={() => void supprimer()}>
              <Trash2 className="mr-2 h-4 w-4" /> Supprimer
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Astuce : l&apos;export PDF utilise la fenetre d&apos;impression du navigateur - choisis
            « Enregistrer au format PDF ». Le contenu est toujours sauvegarde en base avant
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
