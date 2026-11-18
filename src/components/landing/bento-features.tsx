import Link from "next/link";
import {
  IconArrowUpRight,
  IconDownload,
  IconFileText,
  IconLink,
  IconListCheck,
  IconRadar,
  IconTargetArrow,
  IconWorld,
} from "@tabler/icons-react";
import { SectionHeading } from "@/components/landing/section-heading";

const MINI_ROW_CLASS =
  "flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2";

function LinkModePreview() {
  return (
    <div className="mt-6 space-y-2">
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-ice px-3 py-2 text-xs text-slate-500">
        <IconLink className="size-3.5 text-gold-dark" />
        <span className="truncate">jobs.example.com/senior-frontend-engineer</span>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-navy px-3 py-2 text-xs font-semibold text-white">
        <span className="flex items-center gap-1.5">
          <IconFileText className="size-3.5 text-gold" />
          Générer le dossier
        </span>
        <IconArrowUpRight className="size-3.5" />
      </div>
      <div className="grid grid-cols-3 gap-2 pt-1">
        {["CV optimisé", "Lettre", "Kit entretien"].map((label, i) => (
          <div
            key={label}
            className={`rounded-lg border px-2 py-2 text-center text-[10px] font-semibold ${
              i === 0
                ? "border-gold/50 bg-gold-soft text-accent-foreground"
                : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentPreview() {
  return (
    <div className="mt-6 space-y-2">
      {[
        { name: "Remotive", status: "18 offres", live: true },
        { name: "Arbeitnow", status: "29 offres", live: true },
      ].map((source) => (
        <div key={source.name} className={MINI_ROW_CLASS}>
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-gold opacity-70" />
            <span className="relative inline-flex size-2 rounded-full bg-gold-dark" />
          </span>
          <span className="text-xs font-semibold text-navy">{source.name}</span>
          <span className="ml-auto text-[11px] text-slate-400">{source.status}</span>
        </div>
      ))}
      <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-400">
        Ranking IA : score 0→100 % par offre, points forts et lacunes
      </div>
    </div>
  );
}

function ScoringPreview() {
  return (
    <div className="mt-6 space-y-2.5">
      {[
        { label: "Compétences techniques", value: 88 },
        { label: "Séniorité requise", value: 74 },
        { label: "Mots-clés ATS", value: 91 },
      ].map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">{row.label}</span>
            <span className="font-bold tabular-nums text-navy">{row.value}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gold"
              style={{ width: `${row.value}%` }}
            />
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {["Kotlin", "CI/CD"].map((word) => (
          <span
            key={word}
            className="rounded-full border border-dashed border-slate-300 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-400 line-through decoration-slate-300"
          >
            {word} manquant
          </span>
        ))}
      </div>
    </div>
  );
}

function PdfPreview() {
  return (
    <div className="mt-6 flex items-center gap-3">
      <div className="flex h-20 w-14 shrink-0 flex-col gap-1 rounded-md border border-slate-200 bg-white p-1.5 shadow-sm">
        <div className="h-1.5 w-3/4 rounded-full bg-navy/80" />
        <div className="h-1 w-full rounded-full bg-slate-200" />
        <div className="h-1 w-full rounded-full bg-slate-200" />
        <div className="h-1 w-5/6 rounded-full bg-slate-200" />
        <div className="mt-1 h-1 w-1/2 rounded-full bg-gold" />
        <div className="h-1 w-full rounded-full bg-slate-200" />
        <div className="h-1 w-4/6 rounded-full bg-slate-200" />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className={MINI_ROW_CLASS}>
          <IconFileText className="size-3.5 text-navy" />
          <span className="truncate text-xs font-medium text-navy">
            CV-Marie-Dupont.pdf
          </span>
          <IconDownload className="ml-auto size-3.5 text-gold-dark" />
        </div>
        <div className={MINI_ROW_CLASS}>
          <IconFileText className="size-3.5 text-navy" />
          <span className="truncate text-xs font-medium text-navy">
            Lettre-Datawave.pdf
          </span>
          <IconDownload className="ml-auto size-3.5 text-gold-dark" />
        </div>
        <p className="text-[11px] text-slate-400">Compatible ATS · texte sélectionnable</p>
      </div>
    </div>
  );
}

export function BentoFeatures() {
  return (
    <section id="fonctionnalites" className="bg-ice py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-12 lg:px-18">
        <SectionHeading
          badge="Fonctionnalités"
          title={
            <>
              Une candidature complète,{" "}
              <span className="gold-underline">sans effort</span>
            </>
          }
          subtitle="Quatre outils qui couvrent toute la chaîne : trouver l'offre, comprendre vos lacunes, produire un dossier impeccable."
        />

        <div className="mt-12 grid gap-4 lg:grid-cols-3 lg:grid-rows-2">
          {/* Carte 1 — large */}
          <div
            id="generateur-lien"
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md lg:col-span-2"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-navy">
                <IconLink className="size-5 text-gold" />
              </span>
              <h3 className="font-heading text-lg font-bold text-navy">
                Candidature Express par Lien d&apos;Offre
              </h3>
            </div>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-800">
              Collez simplement l&apos;URL de l&apos;annonce qui vous intéresse.
              NexiRole lit l&apos;offre, extrait ses mots-clés et produit votre CV
              réécrit, votre lettre de motivation et vos 3 questions
              d&apos;entretien probables. Site bloqué ? Collez le texte de
              l&apos;annonce en un clic.
            </p>
            <LinkModePreview />
          </div>

          {/* Carte 2 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-navy">
                <IconRadar className="size-5 text-gold" />
              </span>
              <h3 className="font-heading text-lg font-bold text-navy">
                Agent de Recherche en Direct
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-800">
              Scan permanent des API officielles Remotive et Arbeitnow — aucune
              clé payante, aucune arnaque d&apos;agrégateur.
            </p>
            <AgentPreview />
          </div>

          {/* Carte 3 */}
          <div
            id="agent-recherche"
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-navy">
                <IconTargetArrow className="size-5 text-gold" />
              </span>
              <h3 className="font-heading text-lg font-bold text-navy">
                Scoring ATS &amp; Analyse des Lacunes
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-800">
              Chaque offre reçoit une note sur 100, vos points forts et les
              mots-clés manquants, avec un conseil d&apos;adaptation immédiat.
            </p>
            <ScoringPreview />
          </div>

          {/* Carte 4 — large */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md lg:col-span-2">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-navy">
                <IconDownload className="size-5 text-gold" />
              </span>
              <h3 className="font-heading text-lg font-bold text-navy">
                Export PDF Haute Précision
              </h3>
            </div>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-800">
              Modèles sobres et professionnels, lisibles par les robots ATS comme
              par les recruteurs : texte sélectionnable, hiérarchie claire,
              mise en page courrier française pour la lettre. Téléchargez,
              envoyez, décrochez.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <PdfPreview />
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-navy">
                  <IconListCheck className="size-3.5 text-gold-dark" />
                  CV réécrit sans jamais inventer d&apos;expérience
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-navy">
                  <IconListCheck className="size-3.5 text-gold-dark" />
                  Lettre structurée prête à envoyer
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-navy">
                  <IconWorld className="size-3.5 text-gold-dark" />
                  Messages d&apos;approche LinkedIn &amp; email inclus
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
