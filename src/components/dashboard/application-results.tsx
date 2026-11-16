"use client";

import { useState } from "react";
import {
  IconAlertCircle,
  IconBriefcase,
  IconDownload,
  IconFileText,
  IconLoader2,
  IconMail,
  IconMapPin,
  IconMessageChatbot,
  IconSparkles,
  IconTargetArrow,
  IconWand,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/components/dashboard/copy-button";
import { downloadPdf } from "@/lib/download-client";
import { toast } from "sonner";
import type { ApplicationResponse } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Aperçu du CV optimisé                                              */
/* ------------------------------------------------------------------ */

function CvPreview({ data }: { data: ApplicationResponse }) {
  const { cv, candidate, job } = data;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
      {/* En-tête */}
      <div className="border-b-2 border-navy pb-5">
        <h3 className="font-heading text-2xl font-extrabold text-navy">
          {candidate.fullName || "Candidat"}
        </h3>
        <p className="mt-1 font-heading text-sm font-semibold text-gold-dark">
          {cv.title}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {candidate.email && <span>{candidate.email}</span>}
          {candidate.phone && <span>{candidate.phone}</span>}
          {candidate.location && (
            <span className="inline-flex items-center gap-1">
              <IconMapPin className="size-3" />
              {candidate.location}
            </span>
          )}
          {candidate.linkedin && <span>{candidate.linkedin}</span>}
        </div>
      </div>

      {/* Métadonnées de l'offre */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-ice px-3 py-2 text-xs text-slate-600">
        <IconBriefcase className="size-3.5 text-gold-dark" />
        <span>
          Optimisé pour :{" "}
          <strong className="font-semibold text-navy">{job.title}</strong> —{" "}
          {job.company} ({job.location})
        </span>
      </div>

      {/* Profil */}
      <section className="mt-6">
        <h4 className="text-xs font-bold uppercase tracking-wider text-navy">
          Profil professionnel
        </h4>
        <p className="mt-2.5 text-sm leading-relaxed text-slate-700">{cv.summary}</p>
      </section>

      {/* Compétences */}
      <section className="mt-6">
        <h4 className="text-xs font-bold uppercase tracking-wider text-navy">
          Compétences clés
        </h4>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {cv.skills.map((skill) => (
            <span
              key={skill}
              className="rounded-full border border-slate-200 bg-ice px-2.5 py-1 text-xs font-medium text-navy"
            >
              {skill}
            </span>
          ))}
        </div>
      </section>

      {/* Expériences */}
      <section className="mt-6">
        <h4 className="text-xs font-bold uppercase tracking-wider text-navy">
          Expériences professionnelles
        </h4>
        <div className="mt-3 space-y-5">
          {cv.experiences.map((exp, i) => (
            <article key={`${exp.role}-${exp.company}-${i}`} className="relative pl-4">
              <span className="absolute left-0 top-1.5 h-[calc(100%-0.5rem)] w-px bg-slate-200" />
              <span className="absolute -left-[3.5px] top-1.5 size-2 rounded-full bg-gold" />
              <div className="flex flex-wrap items-baseline justify-between gap-1">
                <h5 className="text-sm font-bold text-navy">{exp.role}</h5>
                <span className="text-xs font-medium text-slate-500">{exp.period}</span>
              </div>
              <p className="text-xs font-semibold text-gold-dark">
                {exp.company}
                {exp.location ? (
                  <span className="font-normal text-slate-500"> · {exp.location}</span>
                ) : null}
              </p>
              <ul className="mt-2 space-y-1.5">
                {exp.achievements.map((achievement, j) => (
                  <li key={j} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-300" />
                    {achievement}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* Formations */}
      {cv.education.length > 0 && (
        <section className="mt-6">
          <h4 className="text-xs font-bold uppercase tracking-wider text-navy">
            Formation
          </h4>
          <div className="mt-3 space-y-3">
            {cv.education.map((edu, i) => (
              <div key={`${edu.degree}-${i}`} className="flex flex-wrap items-baseline justify-between gap-1">
                <div>
                  <p className="text-sm font-bold text-navy">{edu.degree}</p>
                  <p className="text-xs text-slate-600">{edu.school}</p>
                </div>
                <span className="text-xs font-medium text-slate-500">{edu.period}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Langues */}
      {cv.languages && cv.languages.length > 0 && (
        <section className="mt-6">
          <h4 className="text-xs font-bold uppercase tracking-wider text-navy">
            Langues
          </h4>
          <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1">
            {cv.languages.map((lang) => (
              <p key={lang.name} className="text-sm text-slate-700">
                <span className="font-semibold text-navy">{lang.name}</span> — {lang.level}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* Mots-clés intégrés */}
      {cv.keywordsMatched && cv.keywordsMatched.length > 0 && (
        <section className="mt-6 rounded-lg border border-dashed border-gold/60 bg-gold-soft/50 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-accent-foreground">
            <IconSparkles className="size-3.5" />
            Mots-clés de l&apos;offre intégrés dans votre CV
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {cv.keywordsMatched.map((kw) => (
              <span
                key={kw}
                className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-accent-foreground"
              >
                {kw}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Aperçu de la lettre                                                */
/* ------------------------------------------------------------------ */

function LetterPreview({ data }: { data: ApplicationResponse }) {
  const { coverLetter, candidate, job } = data;
  const fullText = [
    `Objet : ${coverLetter.subject}`,
    "",
    coverLetter.greeting,
    "",
    ...coverLetter.paragraphs.flatMap((p) => [p, ""]),
    coverLetter.closing,
    "",
    candidate.fullName,
  ].join("\n");

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-10">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="font-heading text-lg font-bold text-navy">
              {candidate.fullName || "Candidat"}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {[candidate.email, candidate.phone, candidate.location]
                .filter(Boolean)
                .join("  ·  ")}
            </p>
          </div>
          <div className="text-right">
            <p className="font-heading text-sm font-bold text-navy">{job.company}</p>
            <p className="text-xs text-slate-500">À l&apos;attention du recrutement</p>
          </div>
        </div>
        <div className="mt-3 h-0.5 w-full bg-navy" />

        <p className="mt-6 text-sm font-semibold text-navy">
          Objet : {coverLetter.subject}
        </p>

        <div className="mt-5 space-y-4 text-sm leading-relaxed text-slate-700">
          <p className="font-medium">{coverLetter.greeting}</p>
          {coverLetter.paragraphs.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
          <p>{coverLetter.closing}</p>
          <p className="pt-2 font-semibold text-navy">{candidate.fullName}</p>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <CopyButton text={fullText} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Kit d'entretien                                                    */
/* ------------------------------------------------------------------ */

function KitPreview({ data }: { data: ApplicationResponse }) {
  const { interviewKit, job } = data;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h4 className="flex items-center gap-2 font-heading text-sm font-bold text-navy">
          <IconTargetArrow className="size-4 text-gold-dark" />
          3 questions probables en entretien — {job.title}
        </h4>
        <div className="mt-4 space-y-3">
          {interviewKit.questions.map((q, i) => (
            <details
              key={i}
              className="group rounded-lg border border-slate-200 bg-ice/60 open:bg-white"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-navy">
                <span>
                  <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-navy text-[11px] font-bold text-white">
                    {i + 1}
                  </span>
                  {q.question}
                </span>
                <IconMessageChatbot className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-slate-200 px-4 pb-4 pt-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gold-dark">
                  Réponse suggérée
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-700">
                  {q.suggestedAnswer}
                </p>
                <p className="mt-3 rounded-lg bg-gold-soft/70 px-3 py-2 text-xs leading-relaxed text-accent-foreground">
                  <span className="font-bold">Conseil : </span>
                  {q.tip}
                </p>
                <div className="mt-3">
                  <CopyButton
                    text={`${q.question}\n\nRéponse suggérée : ${q.suggestedAnswer}\n\nConseil : ${q.tip}`}
                    label="Copier la question"
                  />
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h4 className="flex items-center gap-2 text-sm font-bold text-navy">
            <IconMessageChatbot className="size-4 text-gold-dark" />
            Approche LinkedIn
          </h4>
          <p className="mt-3 whitespace-pre-line rounded-lg bg-ice p-3.5 text-sm leading-relaxed text-slate-700">
            {interviewKit.outreachLinkedin}
          </p>
          <div className="mt-3">
            <CopyButton text={interviewKit.outreachLinkedin} label="Copier le message" />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h4 className="flex items-center gap-2 text-sm font-bold text-navy">
            <IconMail className="size-4 text-gold-dark" />
            Approche email recruteur
          </h4>
          <p className="mt-3 whitespace-pre-line rounded-lg bg-ice p-3.5 text-sm leading-relaxed text-slate-700">
            {interviewKit.outreachEmail}
          </p>
          <div className="mt-3">
            <CopyButton text={interviewKit.outreachEmail} label="Copier le message" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Résultats complets avec onglets et exports                         */
/* ------------------------------------------------------------------ */

export function ApplicationResults({ data }: { data: ApplicationResponse }) {
  const [downloadingCv, setDownloadingCv] = useState(false);
  const [downloadingLetter, setDownloadingLetter] = useState(false);

  const cvText = [
    data.candidate.fullName,
    data.candidate.email,
    data.candidate.phone,
    data.candidate.location,
    "",
    data.cv.title,
    "",
    data.cv.summary,
    "",
    "COMPÉTENCES : " + data.cv.skills.join(", "),
    "",
    ...data.cv.experiences.flatMap((e) => [
      `${e.role} — ${e.company} (${e.period}${e.location ? ", " + e.location : ""})`,
      ...e.achievements.map((a) => `- ${a}`),
      "",
    ]),
    ...data.cv.education.map((e) => `${e.degree} — ${e.school} (${e.period})`),
    ...(data.cv.languages && data.cv.languages.length > 0
      ? ["", "LANGUES : " + data.cv.languages.map((l) => `${l.name} (${l.level})`).join(", ")]
      : []),
  ].join("\n");

  const letterText = [
    `Objet : ${data.coverLetter.subject}`,
    "",
    data.coverLetter.greeting,
    "",
    ...data.coverLetter.paragraphs,
    "",
    data.coverLetter.closing,
    "",
    data.candidate.fullName,
  ].join("\n");

  async function handleDownload(kind: "cv" | "cover-letter") {
    const setter = kind === "cv" ? setDownloadingCv : setDownloadingLetter;
    setter(true);
    try {
      if (kind === "cv") {
        await downloadPdf(
          "cv",
          {
            cv: data.cv,
            candidateName: data.candidate.fullName,
            contact: {
              email: data.candidate.email,
              phone: data.candidate.phone,
              location: data.candidate.location,
              linkedin: data.candidate.linkedin,
            },
          },
          `CV-${data.candidate.fullName || "NexiRole"}`
        );
      } else {
        await downloadPdf(
          "cover-letter",
          {
            letter: data.coverLetter,
            candidateName: data.candidate.fullName,
            jobTitle: data.job.title,
            company: data.job.company,
            contact: {
              email: data.candidate.email,
              phone: data.candidate.phone,
              location: data.candidate.location,
            },
          },
          `Lettre-${data.candidate.fullName || "NexiRole"}`
        );
      }
      toast.success(kind === "cv" ? "CV téléchargé en PDF" : "Lettre téléchargée en PDF");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Le téléchargement a échoué."
      );
    } finally {
      setter(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg font-bold text-navy">
            Dossier prêt pour {data.job.title}
          </h3>
          <p className="text-xs text-slate-500">
            {data.job.company} · {data.job.location} · généré via {data.meta.engine}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => handleDownload("cv")}
            disabled={downloadingCv}
            className="h-9 rounded-full bg-navy text-xs font-semibold text-white hover:bg-navy-800"
          >
            {downloadingCv ? (
              <IconLoader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <IconDownload className="mr-1.5 size-4 text-gold" />
            )}
            Télécharger le CV en PDF
          </Button>
          <Button
            onClick={() => handleDownload("cover-letter")}
            disabled={downloadingLetter}
            variant="outline"
            className="h-9 rounded-full border-slate-300 bg-white text-xs font-semibold text-navy hover:bg-slate-50"
          >
            {downloadingLetter ? (
              <IconLoader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <IconDownload className="mr-1.5 size-4 text-gold-dark" />
            )}
            Télécharger la Lettre en PDF
          </Button>
        </div>
      </div>

      <Tabs defaultValue="cv">
        <TabsList className="h-10 rounded-full border border-slate-200 bg-white p-1">
          <TabsTrigger
            value="cv"
            className="rounded-full px-4 text-xs font-semibold data-[state=active]:bg-navy data-[state=active]:text-white"
          >
            <IconFileText className="mr-1.5 size-3.5" />
            CV optimisé
          </TabsTrigger>
          <TabsTrigger
            value="letter"
            className="rounded-full px-4 text-xs font-semibold data-[state=active]:bg-navy data-[state=active]:text-white"
          >
            <IconMail className="mr-1.5 size-3.5" />
            Lettre de motivation
          </TabsTrigger>
          <TabsTrigger
            value="kit"
            className="rounded-full px-4 text-xs font-semibold data-[state=active]:bg-navy data-[state=active]:text-white"
          >
            <IconWand className="mr-1.5 size-3.5" />
            Kit entretien
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cv" className="mt-4">
          <div className="mb-3 flex justify-end">
            <CopyButton text={cvText} label="Copier le CV" />
          </div>
          <CvPreview data={data} />
        </TabsContent>

        <TabsContent value="letter" className="mt-4">
          <LetterPreview data={data} />
        </TabsContent>

        <TabsContent value="kit" className="mt-4">
          <KitPreview data={data} />
        </TabsContent>
      </Tabs>

      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400">
        <IconAlertCircle className="mt-0.5 size-3 shrink-0" />
        Vérifiez toujours les informations générées avant envoi : NexiRole
        reformule votre parcours sans l&apos;inventer, mais la relecture humaine
        reste essentielle.
      </p>
    </div>
  );
}
