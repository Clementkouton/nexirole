"use client";

import type { CvBuilderData } from "@/lib/types";

/**
 * Aperçu HTML fidèle au template PDF (@react-pdf/renderer) — mise à jour
 * en temps réel pendant la saisie du CV Builder.
 */

export function CvLivePreview({ data }: { data: CvBuilderData }) {
  const { personal, summary, experiences, education, skills, languages } = data;
  const isEmpty =
    !personal.fullName &&
    !summary &&
    experiences.length === 0 &&
    education.length === 0 &&
    skills.length === 0;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Barre d'aperçu */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Aperçu temps réel
        </p>
        <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-bold text-accent-foreground">
          Format A4 · compatible ATS
        </span>
      </div>

      <div className="nice-scrollbar max-h-[720px] overflow-y-auto">
        <div className="p-6" style={{ fontFamily: "var(--font-inter)" }}>
          {isEmpty ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
              <p className="text-sm font-semibold text-slate-400">
                Votre CV apparaîtra ici
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Commencez par remplir vos informations personnelles.
              </p>
            </div>
          ) : (
            <div>
              {/* En-tête */}
              <div className="border-b-2 border-navy pb-4">
                <h2 className="font-heading text-xl font-extrabold text-navy">
                  {personal.fullName || "Votre nom"}
                </h2>
                <p className="mt-0.5 text-sm font-semibold text-gold-dark">
                  {personal.title || "Titre professionnel"}
                </p>
                <p className="mt-2 text-[10.5px] leading-relaxed text-slate-500">
                  {[personal.email, personal.phone, personal.location, personal.linkedin]
                    .filter(Boolean)
                    .join("   •   ") || "email · téléphone · ville"}
                </p>
              </div>

              {/* Résumé */}
              {summary && (
                <section className="mt-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-navy">
                    Profil professionnel
                  </h3>
                    <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-800">
                    {summary}
                  </p>
                </section>
              )}

              {/* Compétences */}
              {skills.length > 0 && (
                <section className="mt-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-navy">
                    Compétences clés
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {skills.map((skill, i) => (
                      <span
                        key={`${skill}-${i}`}
                        className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-navy"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Expériences */}
              {experiences.length > 0 && (
                <section className="mt-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-navy">
                    Expériences professionnelles
                  </h3>
                  <div className="mt-2 space-y-3">
                    {experiences.map((exp) => (
                      <div key={exp.id}>
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-[11.5px] font-bold text-navy">
                            {exp.role || "Poste"}
                          </p>
                          <p className="shrink-0 text-[9.5px] text-slate-500">
                            {exp.period}
                          </p>
                        </div>
                        <p className="text-[10.5px] font-semibold text-[#8a6d00]">
                          {exp.company || "Entreprise"}
                          {exp.location && (
                            <span className="font-normal text-slate-500">
                              {" "}
                              · {exp.location}
                            </span>
                          )}
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {exp.achievements
                            .filter((a) => a.trim())
                            .map((a, i) => (
                              <li
                                key={i}
                                className="flex gap-1.5 text-[11px] leading-relaxed text-slate-800"
                              >
                                <span className="text-navy">•</span>
                                {a}
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Formations */}
              {education.length > 0 && (
                <section className="mt-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-navy">
                    Formation
                  </h3>
                  <div className="mt-2 space-y-2">
                    {education.map((edu) => (
                      <div key={edu.id}>
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-[11.5px] font-bold text-navy">
                            {edu.degree || "Diplôme"}
                          </p>
                          <p className="shrink-0 text-[9.5px] text-slate-500">
                            {edu.period}
                          </p>
                        </div>
                        <p className="text-[10.5px] text-slate-800">
                          {edu.school || "Établissement"}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Langues */}
              {languages.filter((l) => l.name.trim()).length > 0 && (
                <section className="mt-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-navy">
                    Langues
                  </h3>
                  <div className="mt-2 space-y-1">
                    {languages
                      .filter((l) => l.name.trim())
                      .map((lang) => (
                        <div
                          key={lang.id}
                          className="flex items-baseline justify-between"
                        >
                          <p className="text-[11px] font-bold text-slate-700">
                            {lang.name}
                          </p>
                          <p className="text-[10.5px] text-slate-500">{lang.level}</p>
                        </div>
                      ))}
                  </div>
                </section>
              )}

              <p className="mt-5 border-t border-slate-200 pt-2 text-[8.5px] text-slate-400">
                Optimisé avec NexiRole
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
