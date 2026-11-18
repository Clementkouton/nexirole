"use client";

/**
 * Prévisualisation en direct du dossier (CV / Lettre / Kit) selon le
 * template choisi et la photo. Mise à jour instantanée : le composant
 * est 100 % contrôlé par ses props (data, templateId, photo).
 */

import { useEffect, useState } from "react";
import { cx } from "@/lib/ui-classes";
import { getTemplate, type TemplateId } from "@/lib/cv-templates";
import type { DossierData } from "@/lib/types";

interface DossierPreviewProps {
  data: DossierData;
  templateId: TemplateId;
  photo: string | null;
}

type Tab = "cv" | "letter" | "kit";

export function DossierPreview({ data, templateId, photo }: DossierPreviewProps) {
  const template = getTemplate(templateId);
  const hasLetter = data.lettre_motivation.paragraphes.length > 0;
  const kit = data.kit_entretien;
  const hasKit = Boolean(kit && (kit.questions.length > 0 || kit.conseils.length > 0 || kit.score !== undefined));

  const [tab, setTab] = useState<Tab>("cv");

  // Si l'onglet actif disparaît (données sans lettre/kit), retour au CV
  useEffect(() => {
    if (tab === "letter" && !hasLetter) setTab("cv");
    if (tab === "kit" && !hasKit) setTab("cv");
  }, [tab, hasLetter, hasKit]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "cv", label: "CV" },
    ...(hasLetter ? [{ id: "letter" as Tab, label: "Lettre" }] : []),
    ...(hasKit ? [{ id: "kit" as Tab, label: "Kit Entretien" }] : []),
  ];

  const isSwiss = template.headerVariant === "swiss";
  const isBanner = template.headerVariant === "banner";
  const isLinear = template.headerVariant === "linear";
  const isExecutive = template.headerVariant === "centered-rule";

  const contacts = [
    data.identite.email,
    data.identite.telephone,
    data.identite.ville,
    data.identite.linkedin,
  ].filter(Boolean) as string[];

  /* ── En-têtes par template ──────────────────────────────────────── */
  function Header() {
    if (isBanner) {
      return (
        <div className="rounded-t-xl bg-navy px-5 py-4" style={{ borderBottom: "3px solid #FFC107" }}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold text-white">{data.identite.nom_complet}</p>
              <p className="truncate text-xs font-bold text-gold">{data.titre}</p>
              <p className="mt-1 truncate text-[10px] text-slate-300">{contacts.join("  •  ")}</p>
            </div>
            {photo && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={photo}
                alt=""
                className="size-14 shrink-0 rounded-full border-2 border-gold object-cover"
              />
            )}
          </div>
        </div>
      );
    }
    if (isExecutive) {
      return (
        <div className="rounded-t-xl border-b border-slate-300 px-5 py-4 text-center">
          <div className="flex items-center justify-center gap-3">
            <div className="min-w-0 flex-1">
              <p className={cx("truncate font-bold text-navy", "text-xl")} style={{ fontFamily: "Georgia, serif" }}>
                {data.identite.nom_complet}
              </p>
              <p className="text-xs text-slate-500">{data.titre}</p>
              <p className="mt-1 text-[10px] text-slate-500">{contacts.join("  •  ")}</p>
            </div>
            {photo && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={photo}
                alt=""
                className="size-14 shrink-0 rounded-md border border-slate-200 object-cover"
              />
            )}
          </div>
        </div>
      );
    }
    if (isSwiss) {
      return (
        <div className="rounded-t-xl border-b-2 border-slate-800 px-5 py-5">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-2xl font-extrabold uppercase tracking-wide text-slate-900">
                {data.identite.nom_complet}
              </p>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{data.titre}</p>
              <p className="mt-1 text-[10px] text-slate-500">{contacts.join("  •  ")}</p>
            </div>
            {photo && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={photo}
                alt=""
                className="size-14 shrink-0 object-cover"
              />
            )}
          </div>
        </div>
      );
    }
    // linear (Clean Balanced ATS)
    return (
      <div className="rounded-t-xl border-b-2 border-gold px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-navy">{data.identite.nom_complet}</p>
            <p className="truncate text-[11px] text-slate-500">{data.titre}</p>
            <p className="mt-0.5 truncate text-[10px] text-slate-500">{contacts.join("  •  ")}</p>
          </div>
          {photo && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={photo}
              alt=""
              className="size-11 shrink-0 rounded-full border border-slate-200 object-cover"
            />
          )}
        </div>
      </div>
    );
  }

  function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
      <p
        className={cx(
          "mb-1.5 border-b pb-1 font-bold",
          isSwiss
            ? "border-transparent text-sm uppercase tracking-[0.25em] text-slate-900"
            : "border-slate-200 text-xs uppercase tracking-wider text-navy"
        )}
      >
        {children}
      </p>
    );
  }

  /* ── Onglet CV ──────────────────────────────────────────────────── */
  function CvView() {
    return (
      <div className="p-4">
        {data.resume && (
          <section className="mb-3">
            <SectionTitle>Profil</SectionTitle>
            <p className="text-justify text-[11px] leading-relaxed text-slate-700">{data.resume}</p>
          </section>
        )}

        {data.experiences.length > 0 && (
          <section className="mb-3">
            <SectionTitle>Expérience professionnelle</SectionTitle>
            <div className="space-y-2.5">
              {data.experiences.map((exp, i) => (
                <div key={i}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-bold text-navy">{exp.poste}</p>
                    <p className="shrink-0 text-[10px] text-slate-500">{exp.periode}</p>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[11px] font-semibold" style={{ color: template.accent }}>
                      {exp.entreprise}
                    </p>
                    <p className="text-[10px] text-slate-400">{exp.lieu}</p>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {exp.missions.map((m, j) => (
                      <li key={j} className="flex gap-1.5 text-[11px] leading-snug text-slate-700">
                        <span style={{ color: template.accent }}>•</span>
                        <span>{m}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {data.formations.length > 0 && (
          <section className="mb-3">
            <SectionTitle>Formation</SectionTitle>
            <div className="space-y-1.5">
              {data.formations.map((edu, i) => (
                <div key={i} className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-semibold text-navy">{edu.diplome}</p>
                  <p className="shrink-0 text-[10px] text-slate-500">{edu.periode}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {data.competences.length > 0 && (
          <section className="mb-3">
            <SectionTitle>Compétences</SectionTitle>
            {template.skillBadges ? (
              <div className="flex flex-wrap gap-1.5">
                {data.competences.map((skill) => (
                  <span
                    key={skill}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-navy"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] leading-relaxed text-slate-700">
                {data.competences.join("   •   ")}
              </p>
            )}
          </section>
        )}

        {data.langues.length > 0 && (
          <section>
            <SectionTitle>Langues</SectionTitle>
            <p className="text-[11px] text-slate-700">
              {data.langues.map((l) => `${l.nom} — ${l.niveau}`).join("   •   ")}
            </p>
          </section>
        )}
      </div>
    );
  }

  /* ── Onglet Lettre ──────────────────────────────────────────────── */
  function LetterView() {
    const letter = data.lettre_motivation;
    return (
      <div className="p-5">
        {data.offre && (
          <div className="mb-4">
            <p className="text-xs font-bold text-navy">
              {data.offre.entreprise || "À l'attention du service recrutement"}
            </p>
            <p className="text-[11px] text-slate-500">
              {data.offre.titre}
              {data.offre.lieu ? ` — ${data.offre.lieu}` : ""}
            </p>
          </div>
        )}
        {letter.objet && (
          <p className="mb-3 text-xs font-bold underline text-navy">Objet : {letter.objet}</p>
        )}
        {letter.salutation && <p className="mb-2 text-[11px] text-slate-700">{letter.salutation}</p>}
        <div className="space-y-2">
          {letter.paragraphes.map((p, i) => (
            <p key={i} className="text-justify text-[11px] leading-relaxed text-slate-700">
              {p}
            </p>
          ))}
        </div>
        {letter.politesse && <p className="mt-3 text-[11px] text-slate-700">{letter.politesse}</p>}
        <p className="mt-4 text-xs font-bold text-navy">{data.identite.nom_complet}</p>
      </div>
    );
  }

  /* ── Onglet Kit ─────────────────────────────────────────────────── */
  function KitView() {
    if (!kit) return null;
    return (
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between rounded-xl bg-navy px-4 py-3">
          <div>
            <p className="text-sm font-extrabold text-white">Kit d&apos;entretien</p>
            {data.offre && (
              <p className="text-[10px] text-slate-300">
                {data.offre.titre} @ {data.offre.entreprise}
              </p>
            )}
          </div>
          {kit.score !== undefined && (
            <span className="rounded-full bg-gold px-3 py-1.5 text-sm font-extrabold text-navy">
              {kit.score}%
            </span>
          )}
        </div>

        {kit.score !== undefined && (
          <p className="mb-3 text-[11px] leading-relaxed text-slate-600">
            {kit.score >= 80
              ? "Profil très aligné : candidatez immédiatement."
              : kit.score >= 60
                ? "Profil solide : quelques écarts comblables — suivez les conseils ci-dessous."
                : "Pertinence partielle : adaptez votre CV avant de candidater."}
          </p>
        )}

        {kit.conseils.length > 0 && (
          <section className="mb-3">
            <SectionTitle>Conseils d&apos;adaptation</SectionTitle>
            <ul className="space-y-1">
              {kit.conseils.map((c, i) => (
                <li key={i} className="flex gap-1.5 text-[11px] text-slate-700">
                  <span className="text-navy">•</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mb-3">
          <SectionTitle>Messages recruteur</SectionTitle>
          <div className="space-y-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Message LinkedIn
              </p>
              <p className="text-[11px] leading-relaxed text-slate-700">{kit.message_linkedin}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Message Email
              </p>
              <p className="text-[11px] leading-relaxed text-slate-700">{kit.message_email}</p>
            </div>
          </div>
        </section>

        {kit.questions.length > 0 && (
          <section>
            <SectionTitle>Questions d&apos;entretien</SectionTitle>
            <div className="space-y-2">
              {kit.questions.map((q, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-2.5">
                  <p className="text-xs font-bold text-navy">
                    Q{i + 1}. {q.question}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-700">
                    {q.reponse_suggeree}
                  </p>
                  <p className="mt-1 text-[10px] italic text-slate-500">Astuce : {q.astuce}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cx(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
              tab === t.id
                ? "bg-navy text-white"
                : "border border-slate-200 bg-white text-navy hover:bg-slate-50"
            )}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] font-medium text-slate-400">
          Aperçu en direct — {template.name}
        </span>
      </div>

      <div className="mx-auto max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-inner">
        <Header />
        {tab === "cv" && <CvView />}
        {tab === "letter" && <LetterView />}
        {tab === "kit" && <KitView />}
      </div>
    </section>
  );
}