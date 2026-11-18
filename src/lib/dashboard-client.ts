/**
 * NexiRole — Utilitaires client du tableau de bord.
 * - Normalisation tolérante de la réponse /api/history (plusieurs formes gérées)
 * - Enregistrement des dossiers générés : miroir localStorage (garanti) + POST serveur (best-effort)
 * - Pont avec le panneau Dossier existant (localStorage "nexirole:dossier-offer" + CustomEvent)
 */

export interface HistoryDossier {
  id: string;
  titre: string;
  entreprise?: string;
  url?: string;
  createdAt: string;
  source: "serveur" | "local";
  signature: string;
  raw?: unknown;
}

export interface HistoryScan {
  id: string;
  titre: string;
  metier?: string;
  keywords: string[];
  offres?: number;
  createdAt: string;
  source: "serveur";
  raw?: unknown;
}

export interface HistoryData {
  dossiers: HistoryDossier[];
  scans: HistoryScan[];
}

const LOCAL_DOSSIERS_KEY = "nexirole:history-dossiers";
export const DOSSIER_OFFER_KEY = "nexirole:dossier-offer";
export const DOSSIER_OPEN_EVENT = "nexirole:open-dossier";

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

export function formatDateFr(value?: string | number | Date | null): string {
  if (value === null || value === undefined || value === "") return "—";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

export function normalizeHistory(json: unknown): HistoryData {
  const scansRaw: unknown[] = [];
  const dossiersRaw: unknown[] = [];

  if (Array.isArray(json)) {
    for (const item of json) {
      if ((item as Record<string, unknown>)?.type === "dossier") dossiersRaw.push(item);
      else scansRaw.push(item);
    }
  } else if (json && typeof json === "object") {
    const source = json as Record<string, unknown>;
    scansRaw.push(...asArray(source.scans));
    dossiersRaw.push(...asArray(source.dossiers));
    if (scansRaw.length === 0 && dossiersRaw.length === 0) {
      for (const item of asArray(source.items)) {
        if ((item as Record<string, unknown>)?.type === "dossier") dossiersRaw.push(item);
        else scansRaw.push(item);
      }
    }
  }

  const scans: HistoryScan[] = scansRaw.map((item, index) => {
    const raw = (item ?? {}) as Record<string, any>;
    const keywords = asArray(raw.keywords ?? raw.competences ?? raw.motsCles ?? raw.mots_cles)
      .map((mot) => (typeof mot === "string" ? mot : String(mot ?? "")))
      .filter((mot) => mot.trim().length > 0)
      .slice(0, 6);
    const offresBrut = raw.offres ?? raw.nombreOffres ?? raw.nombre_offres ?? raw.count ?? raw.resultsCount ?? raw.total;
    const offres = typeof offresBrut === "number" ? offresBrut : undefined;
    return {
      id: String(raw.id ?? raw._id ?? `scan-${index}`),
      titre: pickString(raw.titre, raw.title, raw.label) ?? "Scan de l'agent",
      metier: pickString(raw.metier, raw.query, raw.poste, raw.recherche),
      keywords,
      offres,
      createdAt: String(raw.createdAt ?? raw.created_at ?? raw.date ?? ""),
      source: "serveur",
      raw: item,
    };
  });

  const dossiers: HistoryDossier[] = dossiersRaw.map((item, index) => {
    const raw = (item ?? {}) as Record<string, any>;
    const titre = pickString(raw.titre, raw.title, raw.offreTitre, raw.offre?.titre, raw.offre?.title) ?? "Dossier généré";
    const entreprise = pickString(raw.entreprise, raw.company, raw.societe, raw.offre?.entreprise, raw.offre?.company);
    const url = pickString(raw.url, raw.lien, raw.link, raw.offre?.url, raw.offre?.lien);
    return {
      id: String(raw.id ?? raw._id ?? `dossier-${index}`),
      titre,
      entreprise,
      url,
      createdAt: String(raw.createdAt ?? raw.created_at ?? raw.date ?? ""),
      source: "serveur",
      signature: `${titre}|${entreprise ?? ""}`.toLowerCase(),
      raw: item,
    };
  });

  return { dossiers, scans };
}

export function readLocalDossiers(): HistoryDossier[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_DOSSIERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as HistoryDossier[]) : [];
  } catch {
    return [];
  }
}

function writeLocalDossiers(list: HistoryDossier[]): void {
  try {
    window.localStorage.setItem(LOCAL_DOSSIERS_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* quota dépassé : on ignore */
  }
}

export function removeLocalDossier(id: string): void {
  writeLocalDossiers(readLocalDossiers().filter((item) => item.id !== id));
}

function saveLocalDossier(entry: { titre: string; entreprise?: string; url?: string }): boolean {
  const signature = `${entry.titre}|${entry.entreprise ?? ""}`.toLowerCase();
  const existing = readLocalDossiers();
  if (existing.some((item) => item.signature === signature)) return false;
  writeLocalDossiers([
    {
      id: `local-${Date.now()}`,
      titre: entry.titre || "Dossier généré",
      entreprise: entry.entreprise,
      url: entry.url,
      createdAt: new Date().toISOString(),
      source: "local",
      signature,
      raw: entry,
    },
    ...existing,
  ]);
  return true;
}

export function offerSignature(offer: unknown): string {
  const o = (offer ?? {}) as Record<string, unknown>;
  const titre = pickString(o.titre, o.title, o.poste) ?? "";
  const entreprise = pickString(o.entreprise, o.company, o.societe) ?? "";
  return `${titre}|${entreprise}`.toLowerCase();
}

/**
 * Enregistre un dossier généré dans l'historique :
 * 1. miroir localStorage → l'entrée apparaît TOUJOURS dans l'Historique ;
 * 2. POST /api/history best-effort → persistance serveur si l'endpoint l'accepte.
 */
export async function saveDossierToHistory(offer: unknown): Promise<void> {
  const o = (offer ?? {}) as Record<string, unknown>;
  const titre = pickString(o.titre, o.title, o.poste) ?? "Offre sans titre";
  const entreprise = pickString(o.entreprise, o.company, o.societe);
  const url = pickString(o.url, o.lien, o.link);
  saveLocalDossier({ titre, entreprise, url });
  try {
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "dossier", titre, entreprise, url }),
    });
  } catch {
    /* sans le POST serveur, le miroir local suffit pour l'affichage */
  }
}

export async function fetchHistory(): Promise<HistoryData> {
  let data: HistoryData = { dossiers: [], scans: [] };
  try {
    const response = await fetch("/api/history", { cache: "no-store" });
    if (response.ok) {
      const json = await response.json().catch(() => null);
      data = normalizeHistory(json);
    }
  } catch {
    /* hors ligne : on garde les données locales */
  }
  const locales = readLocalDossiers();
  const vues = new Set(data.dossiers.map((dossier) => dossier.signature));
  data.dossiers = [...data.dossiers, ...locales.filter((local) => !vues.has(local.signature))];
  return data;
}

export function readDossierOffer(): unknown | null {
  try {
    const raw = window.localStorage.getItem(DOSSIER_OFFER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function openDossierPanel(offer: unknown): void {
  try {
    window.localStorage.setItem(DOSSIER_OFFER_KEY, JSON.stringify(offer));
  } catch {
    /* quota dépassé : on ignore */
  }
  window.dispatchEvent(new CustomEvent(DOSSIER_OPEN_EVENT, { detail: offer }));
}