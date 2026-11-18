"use client";

/**
 * Atelier « Créateur de CV » :
 *  - formulaire guidé de chaque champ (identité, résumé, expériences,
 *    formations, compétences, langues) avec amélioration IA par champ,
 *  - sauvegarde automatique locale (localStorage),
 *  - sélection des 4 templates ATS + interrupteur photo,
 *  - prévisualisation en direct partagée avec le Dashboard (DossierPreview),
 *  - export PDF haute qualité 100 % client (@react-pdf/renderer).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  IconArrowLeft,
  IconCirclePlus,
  IconDownload,
  IconFileText,
  IconLoader2,
  IconSparkles,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { ImproveAiButton } from "@/components/cv-builder/improve-ai-button";
import { TemplateSelector } from "@/components/dashboard/template-selector";
import { DossierPreview } from "@/components/dashboard/dossier-preview";
import { downloadCvPdf } from "@/lib/pdf-client";
import type { TemplateId } from "@/lib/cv-templates";
import type { CvBuilderData, DossierData } from "@/lib/types";

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
      target: null,
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

const STORAGE_KEY = "nexirole-cv-builder-v1";

/** Convertit le formulaire guidé en dossier structuré (aperçu + PDF). */
function toDossier(data: CvBuilderData): DossierData {
  return {
    identite: {
      nom_complet: data.personal.fullName.trim() || "Votre Nom",
      email: data.personal.email,
      telephone: data.personal.phone,
      ville: data.personal.location,
      linkedin: data.personal.linkedin,
    },
    titre: data.personal.title.trim() || "Professionnel",
    resume: data.summary.trim(),
    experiences: data.experiences
      .filter((e) => e.role.trim() || e.company.trim())
      .map((e) => ({
        poste: e.role,
        entreprise: e.company,
        periode: e.period,
        lieu: e.location,
        missions: e.achievements.map((m) => m.trim()).filter(Boolean),
      })),
    formations: data.education
      .filter((d) => d.degree.trim())
      .map((d) => ({
        diplome: d.degree,
        etablissement: d.school,
        periode: d.period,
      })),
    competences: data.skills,
    langues: data.languages
      .filter((l) => l.name.trim())
      .map((l) => ({ nom: l.name, niveau: l.level })),
    lettre_motivation: {
      objet: "",
      salutation: "",
      paragraphes: [],
      politesse: "",
    },
  };
}

export function CvBuilderWorkbench({ userName }: { userName: string | null }) {
  const [data, setData] = useState<CvBuilderData>(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [skillInput, setSkillInput] = useState("");
  const [step, setStep] = useState(0);

  /* Template + photo */
  const [templateId, setTemplateId] = useState<TemplateId>("modern-accent");
  const [photoEnabled, setPhotoEnabled] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  /* Export */
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

  /* ── Listes dynamiques ─────────────────────────────────────────── */
  function addExperience() {
    update({
      experiences: [
        ...data.experiences,
        { id: uid(), target: null, role: "", company: "", period: "", location: "", achievements: [""] },
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

  function addSkill() {
    const value = skillInput.trim();
    if (!value) return;
    if (data.skills.includes(value)) {
      toast.info("Cette compétence est déjà ajoutée.");
      return;
    }
    update({ skills: [...data.skills, value] });
    setSkillInput("");
  }

  /* ── Export PDF (client pur) ───────────────────────────────────── */
  async function handleDownload() {
    const dossier = toDossier(data);
    if (!dossier.identite.nom_complet || dossier.identite.nom_complet === "Votre Nom") {
      toast.error("Renseigne d'abord ton nom complet (étape 1).");
      setStep(0);
      return;
    }
    setDownloading(true);
    try {
      await downloadCvPdf(dossier, templateId, photoEnabled ? photoUrl : null);
      toast.success("CV PDF téléchargé");
    } catch {
      toast.error("La génération du PDF a échoué. Réessayez.");
    } finally {
      setDownloading(false);
    }
  }

  const steps = ["Identité", "Résumé", "Expériences", "Formations", "Compétences", "Langues"];
  const dossier = toDossier(data);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
      {/* ── Barre supérieure ──────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex size-10 items-center justify-center rounded-full border border-slate-300 bg-white text-navy transition hover:bg-slate-50"
            aria-label="Retour au dashboard"
          >
            <IconArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-extrabold text-navy">Créateur de CV</h1>
            <p className="text-xs text-slate-500">
              Bonjour {userName ?? "!"} — saisis chaque champ, choisis ton template, exporte en PDF.
            </p>
          </div>
        </div>
        <Button onClick={handleDownload} disabled={downloading} className="px-5">
          {downloading ? (
            <>
              <IconLoader2 className="size-4 animate-spin" />
              Génération…
            </>
          ) : (
            <>
              <IconDownload className="size-4" />
              Télécharger le CV PDF
            </>
          )}
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
        {/* ── Colonne formulaire ──────────────────────────────────── */}
        <div className="space-y-4">
          {/* Onglets d'étapes */}
          <div className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            {steps.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => setStep(index)}
                className={
                  step === index
                    ? "rounded-full bg-navy px-3.5 py-1.5 text-xs font-bold text-white"
                    : "rounded-full px-3.5 py-1.5 text-xs font-semibold text-navy transition hover:bg-slate-100"
                }
              >
                {label}
              </button>
            ))}
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {/* Étape 0 : Identité */}
            {step === 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-bold text-navy">Informations personnelles</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="fullName">Nom complet</Label>
                    <Input
                      id="fullName"
                      value={data.personal.fullName}
                      onChange={(e) =>
                        update({ personal: { ...data.personal, fullName: e.target.value } })
                      }
                      placeholder="Jean Dupont"
                    />
                  </div>
                  <div>
                    <Label htmlFor="title">Titre professionnel</Label>
                    <Input
                      id="title"
                      value={data.personal.title}
                      onChange={(e) =>
                        update({ personal: { ...data.personal, title: e.target.value } })
                      }
                      placeholder="Développeur Full Stack"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={data.personal.email}
                      onChange={(e) =>
                        update({ personal: { ...data.personal, email: e.target.value } })
                      }
                      placeholder="jean.dupont@email.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Téléphone</Label>
                    <Input
                      id="phone"
                      value={data.personal.phone}
                      onChange={(e) =>
                        update({ personal: { ...data.personal, phone: e.target.value } })
                      }
                      placeholder="+33 6 12 34 56 78"
                    />
                  </div>
                  <div>
                    <Label htmlFor="location">Ville / Pays</Label>
                    <Input
                      id="location"
                      value={data.personal.location}
                      onChange={(e) =>
                        update({ personal: { ...data.personal, location: e.target.value } })
                      }
                      placeholder="Paris, France"
                    />
                  </div>
                  <div>
                    <Label htmlFor="linkedin">LinkedIn</Label>
                    <Input
                      id="linkedin"
                      value={data.personal.linkedin}
                      onChange={(e) =>
                        update({ personal: { ...data.personal, linkedin: e.target.value } })
                      }
                      placeholder="linkedin.com/in/jeandupont"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Étape 1 : Résumé */}
            {step === 1 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-navy">Résumé professionnel</h2>
                  <ImproveAiButton
                    label="Résumé professionnel"
                    value={data.summary}
                    onImproved={(text) => update({ summary: text })}
                  />
                </div>
                <Textarea
                  rows={6}
                  value={data.summary}
                  onChange={(e) => update({ summary: e.target.value })}
                  placeholder="3 à 4 phrases : qui vous êtes, vos forces, ce que vous cherchez…"
                />
              </div>
            )}

            {/* Étape 2 : Expériences */}
            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-sm font-bold text-navy">Expériences professionnelles</h2>
                {data.experiences.map((exp, i) => (
                  <div key={exp.id} className="rounded-xl border border-slate-200 p-3.5">
                    <div className="mb-2.5 flex items-center justify-between">
                      <p className="text-xs font-bold text-gold">Expérience {i + 1}</p>
                      {data.experiences.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            update({
                              experiences: data.experiences.filter((e) => e.id !== exp.id),
                            })
                          }
                          className="inline-flex size-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          aria-label="Supprimer cette expérience"
                        >
                          <IconTrash className="size-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <Input
                        value={exp.role}
                        onChange={(e) =>
                          update({
                            experiences: data.experiences.map((e) =>
                              e.id === exp.id ? { ...e, role: e.target.value } : e
                            ),
                          })
                        }
                        placeholder="Poste occupé"
                      />
                      <Input
                        value={exp.company}
                        onChange={(e) =>
                          update({
                            experiences: data.experiences.map((e) =>
                              e.id === exp.id ? { ...e, company: e.target.value } : e
                            ),
                          })
                        }
                        placeholder="Entreprise"
                      />
                      <Input
                        value={exp.period}
                        onChange={(e) =>
                          update({
                            experiences: data.experiences.map((e) =>
                              e.id === exp.id ? { ...e, period: e.target.value } : e
                            ),
                          })
                        }
                        placeholder="Période (ex : 2022 — Aujourd'hui)"
                      />
                      <Input
                        value={exp.location}
                        onChange={(e) =>
                          update({
                            experiences: data.experiences.map((e) =>
                              e.id === exp.id ? { ...e, location: e.target.value } : e
                            ),
                          })
                        }
                        placeholder="Lieu ou Remote"
                      />
                    </div>
                    <div className="mt-2.5 space-y-2">
                      {exp.achievements.map((achievement, j) => (
                        <div key={j} className="flex items-start gap-2">
                          <Textarea
                            rows={2}
                            value={achievement}
                            onChange={(e) =>
                              update({
                                experiences: data.experiences.map((e) =>
                                  e.id === exp.id
                                    ? {
                                        ...e,
                                        achievements: e.achievements.map((a, k) =>
                                          k === j ? e.target.value : a
                                        ),
                                      }
                                    : e
                                ),
                              })
                            }
                            placeholder={`Réalisation ${j + 1} (orientée résultats)`}
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
                                            (_, k) => k !== j
                                          ),
                                        }
                                      : e
                                  ),
                                })
                              }
                              className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                              aria-label="Retirer cette réalisation"
                            >
                              <IconX className="size-4" />
                            </button>
                          )}
                        </div>
                      ))}
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
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy transition hover:text-gold"
                      >
                        <IconCirclePlus className="size-3.5" />
                        Ajouter une réalisation
                      </button>
                    </div>
                  </div>
                ))}
                <Button variant="outline" onClick={addExperience} className="w-full">
                  <IconCirclePlus className="size-4" />
                  Ajouter une expérience
                </Button>
              </div>
            )}

            {/* Étape 3 : Formations */}
            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-sm font-bold text-navy">Formations</h2>
                {data.education.map((edu, i) => (
                  <div key={edu.id} className="grid gap-2.5 rounded-xl border border-slate-200 p-3.5 sm:grid-cols-3">
                    <Input
                      value={edu.degree}
                      onChange={(e) =>
                        update({
                          education: data.education.map((d) =>
                            d.id === edu.id ? { ...d, degree: e.target.value } : d
                          ),
                        })
                      }
                      placeholder="Diplôme"
                    />
                    <Input
                      value={edu.school}
                      onChange={(e) =>
                        update({
                          education: data.education.map((d) =>
                            d.id === edu.id ? { ...d, school: e.target.value } : d
                          ),
                        })
                      }
                      placeholder="Établissement"
                    />
                    <div className="flex items-center gap-2">
                      <Input
                        value={edu.period}
                        onChange={(e) =>
                          update({
                            education: data.education.map((d) =>
                              d.id === edu.id ? { ...d, period: e.target.value } : d
                            ),
                          })
                        }
                        placeholder="Période"
                      />
                      {data.education.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            update({
                              education: data.education.filter((d) => d.id !== edu.id),
                            })
                          }
                          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          aria-label="Supprimer cette formation"
                        >
                          <IconTrash className="size-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] font-bold text-gold sm:col-span-3">
                      Formation {i + 1}
                    </p>
                  </div>
                ))}
                <Button variant="outline" onClick={addEducation} className="w-full">
                  <IconCirclePlus className="size-4" />
                  Ajouter une formation
                </Button>
              </div>
            )}

            {/* Étape 4 : Compétences */}
            {step === 4 && (
              <div className="space-y-3">
                <h2 className="text-sm font-bold text-navy">Compétences</h2>
                <div className="flex gap-2">
                  <Input
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSkill();
                      }
                    }}
                    placeholder="ex : React, Comptabilité, Gestion de projet…"
                  />
                  <Button onClick={addSkill}>Ajouter</Button>
                </div>
                {data.skills.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {data.skills.map((skill) => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-navy"
                      >
                        {skill}
                        <button
                          type="button"
                          onClick={() =>
                            update({ skills: data.skills.filter((s) => s !== skill) })
                          }
                          className="text-slate-400 transition hover:text-red-600"
                          aria-label={`Retirer ${skill}`}
                        >
                          <IconX className="size-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Étape 5 : Langues */}
            {step === 5 && (
              <div className="space-y-4">
                <h2 className="text-sm font-bold text-navy">Langues</h2>
                {data.languages.map((lang, i) => (
                  <div key={lang.id} className="grid gap-2.5 rounded-xl border border-slate-200 p-3.5 sm:grid-cols-[1fr_1fr_auto]">
                    <Input
                      value={lang.name}
                      onChange={(e) =>
                        update({
                          languages: data.languages.map((l) =>
                            l.id === lang.id ? { ...l, name: e.target.value } : l
                          ),
                        })
                      }
                      placeholder="Langue (ex : Anglais)"
                    />
                    <Input
                      value={lang.level}
                      onChange={(e) =>
                        update({
                          languages: data.languages.map((l) =>
                            l.id === lang.id ? { ...l, level: e.target.value } : l
                          ),
                        })
                      }
                      placeholder="Niveau (ex : Courant C1)"
                    />
                    {data.languages.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          update({
                            languages: data.languages.filter((l) => l.id !== lang.id),
                          })
                        }
                        className="inline-flex size-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        aria-label="Supprimer cette langue"
                      >
                        <IconTrash className="size-4" />
                      </button>
                    )}
                    <p className="text-[10px] font-bold text-gold sm:col-span-3">Langue {i + 1}</p>
                  </div>
                ))}
                <Button variant="outline" onClick={addLanguage} className="w-full">
                  <IconCirclePlus className="size-4" />
                  Ajouter une langue
                </Button>
              </div>
            )}

            {/* Navigation étapes */}
            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-navy transition hover:bg-slate-50 disabled:opacity-40"
              >
                ← Précédent
              </button>
              <span className="text-xs font-medium text-slate-400">
                Étape {step + 1} / {steps.length} — sauvegarde automatique
              </span>
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
                disabled={step === steps.length - 1}
                className="rounded-full bg-navy px-4 py-2 text-xs font-bold text-white transition hover:bg-navy/90 disabled:opacity-40"
              >
                Suivant →
              </button>
            </div>
          </section>

          {/* Sélecteur de template + photo */}
          <TemplateSelector
            selected={templateId}
            onSelect={setTemplateId}
            photoEnabled={photoEnabled}
            onPhotoToggle={setPhotoEnabled}
            photoUrl={photoUrl}
            onPhotoChange={setPhotoUrl}
            detectedJobTitle={data.personal.title || null}
          />
        </div>

        {/* ── Colonne prévisualisation ─────────────────────────────── */}
        <div className="lg:sticky lg:top-6 lg:h-fit">
          <DossierPreview
            data={dossier}
            templateId={templateId}
            photo={photoEnabled ? photoUrl : null}
          />
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400">
            <IconSparkles className="size-3.5" />
            L&apos;aperçu se met à jour instantanément — seule la lettre et le kit
            sont générés par l&apos;IA dans l&apos;onglet Dossier.
          </p>
        </div>
      </div>
    </div>
  );
}