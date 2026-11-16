import Link from "next/link";
import {
  IconArrowRight,
  IconFileUpload,
  IconLink,
  IconRocket,
  IconSparkles,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/landing/section-heading";

const STEPS = [
  {
    number: "01",
    icon: IconFileUpload,
    title: "Importez votre profil",
    description:
      "Chargez votre CV PDF actuel — NexiRole extrait votre parcours, vos compétences et vos réalisations — ou décrivez votre profil rapide en quelques lignes.",
  },
  {
    number: "02",
    icon: IconLink,
    title: "Choisissez votre offre",
    description:
      "Collez le lien d'une annonce, ou laissez l'agent de recherche scanner Remotive et Arbeitnow et classer les offres selon votre profil.",
  },
  {
    number: "03",
    icon: IconRocket,
    title: "Envoyez votre dossier",
    description:
      "CV optimisé, lettre de motivation, kit d'entretien et messages d'approche : tout est généré, prévisualisé et exportable en PDF compatible ATS.",
  },
];

export function HowItWorks() {
  return (
    <section id="comment-ca-marche" className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          badge="Comment ça marche"
          title={
            <>
              Trois étapes,{" "}
              <span className="gold-underline">zéro friction</span>
            </>
          }
          subtitle="De l'import de votre CV au dossier envoyé, NexiRole fait le travail analytique — vous gardez le contrôle."
        />

        <div className="relative mt-14 grid gap-6 md:grid-cols-3">
          {/* Ligne de connexion décorative */}
          <div
            aria-hidden
            className="absolute left-[16.5%] right-[16.5%] top-10 hidden border-t-2 border-dashed border-slate-200 md:block"
          />
          {STEPS.map((step) => (
            <div
              key={step.number}
              className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-12 items-center justify-center rounded-xl bg-navy shadow-[0_8px_20px_-8px_rgba(5,25,55,0.5)]">
                  <step.icon className="size-5 text-gold" />
                </span>
                <span className="font-heading text-3xl font-extrabold text-slate-100">
                  {step.number}
                </span>
              </div>
              <h3 className="mt-5 font-heading text-lg font-bold text-navy">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Button
            asChild
            size="lg"
            className="h-12 rounded-full bg-navy px-7 text-base font-semibold text-white shadow-[0_10px_30px_-10px_rgba(5,25,55,0.5)] hover:bg-navy-800"
          >
            <Link href="/dashboard">
              <IconSparkles className="mr-2 size-5 text-gold" />
              Démarrer maintenant
              <IconArrowRight className="ml-2 size-5" />
            </Link>
          </Button>
          <p className="mt-3 text-xs text-slate-400">
            Gratuit, sans inscription, sans carte bancaire.
          </p>
        </div>
      </div>
    </section>
  );
}
