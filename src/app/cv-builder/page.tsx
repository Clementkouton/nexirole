"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  IconArrowLeft,
  IconArrowRight,
  IconBriefcase,
  IconCirclePlus,
  IconDownload,
  IconId,
  IconLanguage,
  IconLoader2,
  IconSchool,
  IconSparkles,
  IconTrash,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { CvLivePreview } from "@/components/cv-builder/cv-live-preview";
import { ImproveAiButton } from "@/components/cv-builder/improve-ai-button";
import { downloadPdf } from "@/lib/download-client";
import { toast } from "sonner";
import type { CvBuilderData } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  État initial                                                       */
/* ------------------------------------------------------------------ */

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const EMPTY_DATA: CvBuilderData = {
  personal: {
    fullName: "",
    title: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
  },
  summary: "",
  experiences: [
    {
      id: "exp-1",
      role: "",
      company: "",
      period: "",
      location: "",
      achievements: [""],
    },
  ],
  education: [{ id: "edu-1", degree: "", school: "", period: "" }],
  skills: [],
  languages: [{ id: "lang-1", name: "", level: "" }],
};

const STEPS = [
  { id: 0, label: "Infos personnelles", icon: IconId },
  { id: 1, label: "Résumé", icon: IconUser },
  { id: 2, label: "Expériences", icon: IconBriefcase },
  { id: 3, label: "Formations", icon: IconSchool },
  { id: 4, label: "Compétences", icon: IconSparkles },
  { id: 5, label: "Langues", icon: IconLanguage },
] as const;

const STORAGE_KEY = "nexirole-cv-builder-v1";

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function CvBuilderPage() {
  const [data, setData] = useState<CvBuilderData>(EMPTY_DATA);
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [skillInput, setSkillInput] = useState("");
  const [downloading, setDownloading] = useState(false);

  /* Chargement / sauvegarde locale */
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setData({ ...EMPTY_DATA, ...(JSON.parse(saved) as CvBuilderData) });
    } catch {
      /* données locales corrompues : on repart du modèle vide */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* quota dépassé : on ignore */
    }
  }, [data, loaded]);

  function update(patch: Partial<CvBuilderData>) {
    setData((prev) => ({ ...prev, ...patch }));
  }

  /* ---------------------------------------------------------------- */
  /*  Listes dynamiques                                                */
  /* ---------------------------------------------------------------- */

  function addExperience() {
    update({
      experiences: [
        ...data.experiences,
        { id: uid(), role: "", company: "", period: "", location: "", achievements: [""] },
      ],
    });
  }

  function addEducation() {
    update({
      education: [...data.education, { id: uid(), degree: "", school: "", period: "" }],
    });
  }

  function addLanguage() {
    update({
      languages: [...data.languages, { id: uid(), name: "", level: "" }],
    });
  }

  function addSkill(raw: string) {
    const skill = raw.trim().replace(/,$/, "");
    if (!skill) return;
    if (data.skills.some((s) => s.toLowerCase() === skill.toLowerCase())) {
      setSkillInput("");
      return;
    }
    update({ skills: [...data.skills, skill] });
    setSkillInput("");
  }

  const contextHint = useMemo(
    () =>
      [data.personal.title, data.personal.location].filter(Boolean).join(" — "),
    [data.personal.title, data.personal.location]
  );

  /* ---------------------------------------------------------------- */
  /*  Export PDF                                                       */
  /* ---------------------------------------------------------------- */

  async function handleDownloadPdf() {
    if (!data.personal.fullName.trim()) {
      toast.error("Renseignez votre nom complet (étape 1) avant l'export.");
      setStep(0);
      return;
    }
    setDownloading(true);
    try {
      await downloadPdf(
        "cv",
        {
          cv: {
            title: data.personal.title.trim() || "Candidat",
            summary: data.summary.trim(),
            experiences: data.experiences
              .filter((e) => e.role.trim() || e.company.trim())
              .map((e) => ({
                role: e.role.trim() || "Poste",
                company: e.company.trim() || "Entreprise",
                period: e.period.trim(),
                location: e.location.trim(),
                achievements: e.achievements.map((a) => a.trim()).filter(Boolean),
              })),
            education: data.education
              .filter((e) => e.degree.trim() || e.school.trim())
              .map((e) => ({
                degree: e.degree.trim() || "Diplôme",
                school: e.school.trim(),
                period: e.period.trim(),
              })),
            skills: data.skills,
            languages: data.languages
              .filter((l) => l.name.trim())
              .map((l) => ({ name: l.name.trim(), level: l.level.trim() || "Courant" })),
            keywordsMatched: [],
          },
          candidateName: data.personal.fullName.trim(),
          contact: {
            email: data.personal.email.trim(),
            phone: data.personal.phone.trim(),
            location: data.personal.location.trim(),
            linkedin: data.personal.linkedin.trim(),
          },
        },
        `CV-${data.personal.fullName.trim() || "NexiRole"}`
      );
      toast.success("Votre CV a été téléchargé en PDF");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "La génération du PDF a échoué."
      );
    } finally {
      setDownloading(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Rendu des étapes                                                 */
  /* ---------------------------------------------------------------- */

  const inputClass = "h-10 rounded-xl border-slate-200 text-sm";
  const fieldLabelClass = "text-xs font-semibold text-navy";

  function renderStep() {
    switch (step) {
      case 0:
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="fullName" className={fieldLabelClass}>
                Nom complet *
              </Label>
              <Input
                id="fullName"
                placeholder="Marie Dupont"
                value={data.personal.fullName}
                onChange={(e) =>
                  update({ personal: { ...data.personal, fullName: e.target.value } })
                }
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="title" className={fieldLabelClass}>
                Titre professionnel
              </Label>
              <Input
                id="title"
                placeholder="Ex : Développeuse Fullstack Senior"
                value={data.personal.title}
                onChange={(e) =>
                  update({ personal: { ...data.personal, title: e.target.value } })
                }
                className={inputClass}
              />
            </div>
            <div>
              <Label htmlFor="email" className={fieldLabelClass}>
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="marie.dupont@email.com"
                value={data.personal.email}
                onChange={(e) =>
                  update({ personal: { ...data.personal, email: e.target.value } })
                }
                className={inputClass}
              />
            </div>
            <div>
              <Label htmlFor="phone" className={fieldLabelClass}>
                Téléphone
              </Label>
              <Input
                id="phone"
                placeholder="+33 6 12 34 56 78"
                value={data.personal.phone}
                onChange={(e) =>
                  update({ personal: { ...data.personal, phone: e.target.value } })
                }
                className={inputClass}
              />
            </div>
            <div>
              <Label htmlFor="location" className={fieldLabelClass}>
                Ville / Pays
              </Label>
              <Input
                id="location"
                placeholder="Paris, France"
                value={data.personal.location}
                onChange={(e) =>
                  update({ personal: { ...data.personal, location: e.target.value } })
                }
                className={inputClass}
              />
            </div>
            <div>
              <Label htmlFor="linkedin" className={fieldLabelClass}>
                LinkedIn
              </Label>
              <Input
                id="linkedin"
                placeholder="linkedin.com/in/mariedupont"
                value={data.personal.linkedin}
                onChange={(e) =>
                  update({ personal: { ...data.personal, linkedin: e.target.value } })
                }
                className={inputClass}
              />
            </div>
          </div>
        );

      case 1:
        return (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="summary" className={fieldLabelClass}>
                Résumé professionnel — 3 à 4 phrases qui résument votre valeur
              </Label>
              <ImproveAiButton
                label="Résumé professionnel"
                value={data.summary}
                context={contextHint}
                onImproved={(text) => update({ summary: text })}
              />
            </div>
            <Textarea
              id="summary"
              placeholder="Ex : Développeuse fullstack avec 6 ans d'expérience…"
              value={data.summary}
              onChange={(e) => update({ summary: e.target.value })}
              rows={7}
              className="nice-scrollbar mt-2 rounded-xl border-slate-200 text-sm"
            />
            <p className="mt-1.5 text-[11px] text-slate-400">
              {data.summary.trim().split(/\s+/).filter(Boolean).length} mots —
              cible recommandée : 40 à 70 mots.
            </p>
          </div>
        );

      case 2:
        return (
          <div className="space-y-5">
            {data.experiences.map((exp, index) => (
              <div
                key={exp.id}
                className="rounded-xl border border-slate-200 bg-ice/50 p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-navy">
                    Expérience {index + 1}
                  </p>
                  {data.experiences.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        update({
                          experiences: data.experiences.filter((e) => e.id !== exp.id),
                        })
                      }
                      className="flex size-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                      aria-label={`Supprimer l'expérience ${index + 1}`}
                    >
                      <IconTrash className="size-4" />
                    </button>
                  )}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className={fieldLabelClass}>Intitulé du poste</Label>
                    <Input
                      placeholder="Développeur Frontend"
                      value={exp.role}
                      onChange={(e) =>
                        update({
                          experiences: data.experiences.map((e) =>
                            e.id === exp.id ? { ...e, role: e.target.value } : e
                          ),
                        })
                      }
                      className={`${inputClass} mt-1`}
                    />
                  </div>
                  <div>
                    <Label className={fieldLabelClass}>Entreprise</Label>
                    <Input
                      placeholder="Acme Corp"
                      value={exp.company}
                      onChange={(e) =>
                        update({
                          experiences: data.experiences.map((e) =>
                            e.id === exp.id ? { ...e, company: e.target.value } : e
                          ),
                        })
                      }
                      className={`${inputClass} mt-1`}
                    />
                  </div>
                  <div>
                    <Label className={fieldLabelClass}>Période</Label>
                    <Input
                      placeholder="2022 — Aujourd'hui"
                      value={exp.period}
                      onChange={(e) =>
                        update({
                          experiences: data.experiences.map((e) =>
                            e.id === exp.id ? { ...e, period: e.target.value } : e
                          ),
                        })
                      }
                      className={`${inputClass} mt-1`}
                    />
                  </div>
                  <div>
                    <Label className={fieldLabelClass}>Lieu</Label>
                    <Input
                      placeholder="Paris / Remote"
                      value={exp.location}
                      onChange={(e) =>
                        update({
                          experiences: data.experiences.map((e) =>
                            e.id === exp.id ? { ...e, location: e.target.value } : e
                          ),
                        })
                      }
                      className={`${inputClass} mt-1`}
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between">
                    <Label className={fieldLabelClass}>
                      Réalisations &amp; missions
                    </Label>
                  </div>
                  <div className="mt-1.5 space-y-2">
                    {exp.achievements.map((achievement, aIndex) => (
                      <div key={aIndex} className="flex items-start gap-2">
                        <Textarea
                          placeholder={`Ex : Refonte du front-end SaaS : -40 % de temps de chargement, adoption de React 18…`}
                          value={achievement}
                          onChange={(e) =>
                            update({
                              experiences: data.experiences.map((e) =>
                                e.id === exp.id
                                  ? {
                                      ...e,
                                      achievements: e.achievements.map((a, i) =>
                                        i === aIndex ? e.target.value : a
                                      ),
                                    }
                                  : e
                              ),
                            })
                          }
                          rows={2}
                          className="nice-scrollbar flex-1 rounded-xl border-slate-200 text-sm"
                        />
                        <div className="flex flex-col gap-1.5">
                          <ImproveAiButton
                            size="xs"
                            label={`Réalisation ${aIndex + 1} (${exp.role || "poste"})`}
                            value={achievement}
                            context={contextHint}
                            onImproved={(text) =>
                              update({
                                experiences: data.experiences.map((e) =>
                                  e.id === exp.id
                                    ? {
                                        ...e,
                                        achievements: e.achievements.map((a, i) =>
                                          i === aIndex ? text : a
                                        ),
                                      }
                                    : e
                                ),
                              })
                            }
                          />
                          {exp.achievements.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                update({
                                  experiences: data.experiences.map((e) =>
                                    e.id === exp.id
                                      ? {
                                          ...e,
                                          achievements: e.achievements.filter(
                                            (_, i) => i !== aIndex
                                          ),
                                        }
                                      : e
                                  ),
                                })
                              }
                              className="mx-auto flex size-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                              aria-label={`Supprimer la réalisation ${aIndex + 1}`}
                            >
                              <IconX className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      update({
                        experiences: data.experiences.map((e) =>
                          e.id === exp.id
                            ? { ...e, achievements: [...e.achievements, ""] }
                            : e
                        ),
                      })
                    }
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-navy underline decoration-gold decoration-2 underline-offset-4"
                  >
                    <IconCirclePlus className="size-3.5 text-gold-dark" />
                    Ajouter une réalisation
                  </button>
                </div>
              </div>
            ))}

            <Button
              type="button"
              onClick={addExperience}
              variant="outline"
              className="h-10 w-full rounded-xl border-dashed border-slate-300 bg-white px-5 text-sm font-semibold text-navy hover:bg-slate-50"
            >
              <IconCirclePlus className="mr-2 size-4 text-gold-dark" />
              Ajouter une expérience
            </Button>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            {data.education.map((edu, index) => (
              <div key={edu.id} className="rounded-xl border border-slate-200 bg-ice/50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-navy">
                    Formation {index + 1}
                  </p>
                  {data.education.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        update({
                          education: data.education.filter((e) => e.id !== edu.id),
                        })
                      }
                      className="flex size-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                      aria-label={`Supprimer la formation ${index + 1}`}
                    >
                      <IconTrash className="size-4" />
                    </button>
                  )}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className={fieldLabelClass}>Diplôme / Formation</Label>
                    <Input
                      placeholder="Master Informatique"
                      value={edu.degree}
                      onChange={(e) =>
                        update({
                          education: data.education.map((e) =>
                            e.id === edu.id ? { ...e, degree: e.target.value } : e
                          ),
                        })
                      }
                      className={`${inputClass} mt-1`}
                    />
                  </div>
                  <div>
                    <Label className={fieldLabelClass}>Établissement</Label>
                    <Input
                      placeholder="Université Paris-Saclay"
                      value={edu.school}
                      onChange={(e) =>
                        update({
                          education: data.education.map((e) =>
                            e.id === edu.id ? { ...e, school: e.target.value } : e
                          ),
                        })
                      }
                      className={`${inputClass} mt-1`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className={fieldLabelClass}>Période</Label>
                    <Input
                      placeholder="2018 — 2020"
                      value={edu.period}
                      onChange={(e) =>
                        update({
                          education: data.education.map((e) =>
                            e.id === edu.id ? { ...e, period: e.target.value } : e
                          ),
                        })
                      }
                      className={`${inputClass} mt-1`}
                    />
                  </div>
                </div>
              </div>
            ))}

            <Button
              type="button"
              onClick={addEducation}
              variant="outline"
              className="h-10 w-full rounded-xl border-dashed border-slate-300 bg-white px-5 text-sm font-semibold text-navy hover:bg-slate-50"
            >
              <IconCirclePlus className="mr-2 size-4 text-gold-dark" />
              Ajouter une formation
            </Button>
          </div>
        );

      case 4:
        return (
          <div>
            <Label htmlFor="skill-input" className={fieldLabelClass}>
              Compétences — appuyez sur Entrée pour en ajouter
            </Label>
            <Input
              id="skill-input"
              placeholder="Ex : TypeScript, React, Gestion de projet…"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSkill(skillInput);
                }
              }}
              className={`${inputClass} mt-1.5`}
            />
            {data.skills.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.skills.map((skill, i) => (
                  <span
                    key={`${skill}-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-ice px-3 py-1.5 text-xs font-medium text-navy"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() =>
                        update({ skills: data.skills.filter((_, idx) => idx !== i) })
                      }
                      className="text-slate-400 transition-colors hover:text-red-500"
                      aria-label={`Retirer la compétence ${skill}`}
                    >
                      <IconX className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="mt-3 text-[11px] text-slate-400">
              Conseil : les 5 premières compétences sont les plus visibles par les
              robots ATS — mettez d&apos;abord celles qui correspondent à vos
              offres cibles.
            </p>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            {data.languages.map((lang, index) => (
              <div key={lang.id} className="flex items-end gap-3">
                <div className="flex-1">
                  <Label className={fieldLabelClass}>Langue {index + 1}</Label>
                  <Input
                    placeholder="Anglais"
                    value={lang.name}
                    onChange={(e) =>
                      update({
                        languages: data.languages.map((l) =>
                          l.id === lang.id ? { ...l, name: e.target.value } : l
                        ),
                      })
                    }
                    className={`${inputClass} mt-1`}
                  />
                </div>
                <div className="w-44">
                  <Label className={fieldLabelClass}>Niveau</Label>
                  <Input
                    placeholder="C1 — Courant"
                    value={lang.level}
                    onChange={(e) =>
                      update({
                        languages: data.languages.map((l) =>
                          l.id === lang.id ? { ...l, level: e.target.value } : l
                        ),
                      })
                    }
                    className={`${inputClass} mt-1`}
                  />
                </div>
                {data.languages.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      update({
                        languages: data.languages.filter((l) => l.id !== lang.id),
                      })
                    }
                    className="mb-1 flex size-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                    aria-label={`Supprimer la langue ${index + 1}`}
                  >
                    <IconTrash className="size-4" />
                  </button>
                )}
              </div>
            ))}

            <Button
              type="button"
              onClick={addLanguage}
              variant="outline"
              className="h-10 w-full rounded-xl border-dashed border-slate-300 bg-white px-5 text-sm font-semibold text-navy hover:bg-slate-50"
            >
              <IconCirclePlus className="mr-2 size-4 text-gold-dark" />
              Ajouter une langue
            </Button>
          </div>
        );

      default:
        return null;
    }
  }

  /* ---------------------------------------------------------------- */

  return (
    <div className="bg-ice">
      {/* En-tête */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-ice px-3 py-1 text-xs font-semibold text-navy">
            <IconSparkles className="size-3.5 text-gold-dark" />
            Mode 3 — Créateur de CV
          </span>
          <h1 className="mt-3 font-heading text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">
            Créez un CV professionnel de zéro
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-600">
            6 étapes guidées, amélioration IA sur chaque description et aperçu
            PDF en temps réel. Vos données sont sauvegardées automatiquement
            dans votre navigateur.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_440px]">
          {/* Colonne formulaire */}
          <div className="min-w-0">
            {/* Stepper */}
            <div className="nice-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
              {STEPS.map((s) => {
                const active = s.id === step;
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStep(s.id)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-all ${
                      active
                        ? "border-navy bg-navy text-white shadow-[0_8px_20px_-8px_rgba(5,25,55,0.5)]"
                        : "border-slate-200 bg-white text-slate-600 hover:border-navy/30 hover:text-navy"
                    }`}
                    aria-current={active ? "step" : undefined}
                  >
                    <span
                      className={`flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${
                        active ? "bg-gold text-navy" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {s.id + 1}
                    </span>
                    <Icon className={`size-3.5 ${active ? "text-gold" : "text-gold-dark"}`} />
                    {s.label}
                  </button>
                );
              })}
            </div>

            {/* Carte étape */}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="font-heading text-lg font-bold text-navy">
                {STEPS[step].label}
              </h2>
              <div className="mt-4">{renderStep()}</div>

              {/* Navigation */}
              <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={step === 0}
                  className="h-10 rounded-full border-slate-300 bg-white px-5 text-sm font-semibold text-navy hover:bg-slate-50"
                >
                  <IconArrowLeft className="mr-1.5 size-4" />
                  Précédent
                </Button>

                {step < STEPS.length - 1 ? (
                  <Button
                    type="button"
                    onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                    className="h-10 rounded-full bg-navy px-5 text-sm font-semibold text-white hover:bg-navy-800"
                  >
                    Suivant
                    <IconArrowRight className="ml-1.5 size-4" />
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={handleDownloadPdf}
                      disabled={downloading}
                      className="h-10 rounded-full bg-navy px-5 text-sm font-semibold text-white hover:bg-navy-800"
                    >
                      {downloading ? (
                        <IconLoader2 className="mr-1.5 size-4 animate-spin" />
                      ) : (
                        <IconDownload className="mr-1.5 size-4 text-gold" />
                      )}
                      Télécharger le CV en PDF
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <p className="mt-3 px-1 text-[11px] text-slate-400">
              Besoin d&apos;adapter ce CV à une offre précise ?{" "}
              <Link
                href="/dashboard"
                className="font-semibold text-navy underline decoration-gold decoration-2 underline-offset-4"
              >
                Utilisez le Générateur par Lien
              </Link>
              .
            </p>
          </div>

          {/* Colonne aperçu */}
          <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <CvLivePreview data={data} />
            <Button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloading}
              variant="outline"
              className="mt-3 h-10 w-full rounded-xl border-slate-300 bg-white px-5 text-sm font-semibold text-navy hover:bg-slate-50"
            >
              {downloading ? (
                <IconLoader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <IconDownload className="mr-1.5 size-4 text-gold-dark" />
              )}
              Exporter ce CV en PDF
            </Button>
          </aside>
        </div>
      </div>
    </div>
  );
}
