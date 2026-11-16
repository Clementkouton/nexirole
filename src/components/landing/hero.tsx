import Link from "next/link";
import {
  IconArrowRight,
  IconBolt,
  IconPlayerPlay,
  IconSparkles,
} from "@tabler/icons-react";
import { buttonClasses, cx } from "@/lib/ui-classes";
import { HeroDashboardPreview } from "@/components/landing/hero-dashboard-preview";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-white">
      {/* Fond grille légère */}
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />

      <div className="relative mx-auto max-w-7xl px-4 pb-8 pt-16 sm:px-6 sm:pt-24 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-navy shadow-sm">
            <IconSparkles className="size-3.5 text-gold-dark" />
            Assistant carrière IA — propulsé par Llama 3.3 (Groq)
            <span className="ml-1 rounded-full bg-gold-soft px-1.5 py-0.5 text-[10px] font-bold text-accent-foreground">
              GRATUIT
            </span>
          </span>

          <h1 className="mt-6 font-heading text-4xl font-extrabold leading-[1.08] tracking-tight text-navy sm:text-6xl">
            Votre dossier de candidature,
            <span className="gold-underline"> calibré pour chaque offre</span>
            , en 2 minutes.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            NexiRole scanne les offres en direct sur Remotive et Arbeitnow,
            note la compatibilité de votre CV, puis génère CV optimisé, lettre
            de motivation sur mesure et kit d&apos;entretien — prêts à envoyer.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/dashboard"
              className={cx(buttonClasses(), "h-12 rounded-full bg-navy px-7 text-base font-semibold text-white shadow-[0_10px_30px_-10px_rgba(5,25,55,0.5)] hover:bg-navy-800")}
            >
              Lancer l&apos;Assistant
              <IconArrowRight className="ml-2 size-5" />
            </Link>
            <Link
              href="#comment-ca-marche"
              className={cx(buttonClasses("outline"), "h-12 rounded-full border-slate-300 bg-white px-7 text-base font-semibold text-navy hover:bg-slate-50")}
            >
              <IconPlayerPlay className="mr-2 size-4 text-gold-dark" />
              Voir comment ça marche
            </Link>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <IconBolt className="size-3.5 text-gold-dark" />
              Sans carte bancaire
            </span>
            <span className="inline-flex items-center gap-1.5">
              <IconBolt className="size-3.5 text-gold-dark" />
              Sources d&apos;offres officielles en direct
            </span>
            <span className="inline-flex items-center gap-1.5">
              <IconBolt className="size-3.5 text-gold-dark" />
              Export PDF compatible ATS
            </span>
          </div>
        </div>

        <HeroDashboardPreview />
      </div>
    </section>
  );
}
