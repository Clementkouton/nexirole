"use client";

/**
 * Réutilise ton panneau Dossier existant (4 modèles ATS + lettre + kit + PDF)
 * sans le réécrire. Si l'étape 0 a montré un autre chemin de fichier,
 * remplace UNIQUEMENT la ligne d'import ci-dessous.
 */
import { useEffect, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { IconFolder, IconRobot } from "@tabler/icons-react";
import * as PanelModule from "@/components/dashboard/dossier-panel";
import { offerSignature, readDossierOffer, saveDossierToHistory } from "@/lib/dashboard-client";

const panelExports = PanelModule as unknown as Record<string, unknown>;
const DossierPanel = (panelExports.DossierPanel ?? panelExports.default) as ComponentType | undefined;

function titreOffre(offer: Record<string, unknown> | null): string {
  if (!offer) return "";
  const brut = offer.titre ?? offer.title ?? offer.poste;
  return typeof brut === "string" ? brut : "";
}

function entrepriseOffre(offer: Record<string, unknown> | null): string {
  if (!offer) return "";
  const brut = offer.entreprise ?? offer.company ?? offer.societe;
  return typeof brut === "string" ? brut : "";
}

export default function DossierPage() {
  const [offer, setOffer] = useState<Record<string, unknown> | null>(null);
  const savedRef = useRef("");

  useEffect(() => {
    const current = readDossierOffer();
    if (!current) return;
    setOffer(current as Record<string, unknown>);
    // Ouvre le panneau existant avec l'offre chargée depuis l'Agent
    window.dispatchEvent(new CustomEvent("nexirole:open-dossier", { detail: current }));
    // FIX historique : enregistre le dossier (miroir local + POST serveur best-effort)
    const signature = offerSignature(current);
    if (savedRef.current !== signature) {
      savedRef.current = signature;
      void saveDossierToHistory(current);
    }
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#051937] md:text-3xl">Dossier &amp; documents</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">
          CV, lettre de motivation et kit d&apos;entretien générés par l&apos;IA pour une offre ciblée.
        </p>
      </div>

      {offer ? (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFC107]/25 text-[#7A5C00]">
            <IconFolder size={18} stroke={1.8} />
          </span>
          <p className="min-w-0 text-sm font-semibold text-[#051937]">
            Offre chargée : <span className="font-extrabold">{titreOffre(offer) || "sans titre"}</span>
            {entrepriseOffre(offer) ? ` — ${entrepriseOffre(offer)}` : ""}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
          <IconRobot size={36} stroke={1.5} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-500">
            Aucune offre chargée — lance d&apos;abord l&apos;Agent de recherche puis clique « Générer le dossier ».
          </p>
          <Link
            href="/dashboard/agent"
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#051937] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#0A2A5C]"
          >
            Aller à l&apos;Agent de recherche
          </Link>
        </div>
      )}

      {DossierPanel ? (
        <DossierPanel />
      ) : (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-800">
            Le composant DossierPanel est introuvable — ajuste le chemin d&apos;import en haut de ce fichier
            (commande de localisation fournie à l&apos;étape 0 du protocole).
          </p>
        </div>
      )}
    </div>
  );
}