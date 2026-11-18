"use client";

import { useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { SectionHeading } from "@/components/landing/section-heading";
import { cx } from "@/components/ui";

const FAQ_ITEMS = [
  {
    question: "NexiRole est-il vraiment gratuit ?",
    answer:
      "Oui. NexiRole s'appuie exclusivement sur des services gratuits : le moteur IA Groq (modèle Llama 3.3 70B), et les API publiques de Remotive et Arbeitnow pour les offres. Aucune carte bancaire, aucun abonnement.",
  },
  {
    question: "D'où viennent les offres d'emploi affichées ?",
    answer:
      "Elles proviennent directement des API officielles de Remotive (offres remote internationales) et d'Arbeitnow (job board européen). Chaque carte renvoie vers l'offre originale sur le site source — jamais de copie dégradée.",
  },
  {
    question: "Mon CV est-il vraiment réécrit sans invention ?",
    answer:
      "Le moteur IA reçoit une consigne stricte : il reformule et réorganise uniquement les expériences présentes dans votre CV. Il n'invente ni entreprise, ni diplôme, ni date. Les mots-clés de l'annonce sont intégrés uniquement lorsqu'une compétence équivalente est démontrée dans votre parcours.",
  },
  {
    question: "Que contient exactement le kit d'entretien ?",
    answer:
      "Trois questions réellement probables pour le poste visé, chacune avec une réponse suggérée structurée (méthode STAR quand c'est pertinent) et un conseil rapide, plus deux messages courts d'approche : un pour LinkedIn, un pour l'email du recruteur.",
  },
  {
    question: "Que se passe-t-il si le site de l'offre bloque la lecture automatique ?",
    answer:
      "Certains sites refusent la lecture automatique. NexiRole vous le signale immédiatement et vous propose de coller le texte de l'annonce : le résultat généré est identique. Vous pouvez aussi mixer les deux — lien et texte.",
  },
  {
    question: "Les PDF générés sont-ils compatibles avec les robots ATS ?",
    answer:
      "Oui. Les modèles évitent les colonnes complexes, les images et les polices exotiques : le texte est sélectionnable, la structure est linéaire (en-tête, profil, compétences, expériences, formation, langues), et les accents français sont correctement encodés.",
  },
  {
    question: "Le créateur de CV peut-il remplacer mon CV actuel ?",
    answer:
      "Oui. Le CV Builder guidé vous fait saisir vos informations par étapes (infos personnelles, résumé, expériences, formations, compétences, langues), améliore chaque description avec l'IA et produit un PDF professionnel en temps réel — parfait si vous partez de zéro.",
  },
];

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-ice py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          badge="FAQ"
          title={
            <>
              Questions{" "}
              <span className="gold-underline">fréquentes</span>
            </>
          }
          subtitle="Tout ce qu'il faut savoir avant de générer votre premier dossier de candidature."
        />

        <div className="mt-10 rounded-2xl border border-slate-200 bg-white px-5 shadow-sm">
          {FAQ_ITEMS.map((item, index) => {
            const open = openIndex === index;
            const isLast = index === FAQ_ITEMS.length - 1;
            return (
              <div
                key={item.question}
                className={cx("border-b border-slate-200", isLast && "border-b-0")}
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(open ? null : index)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-3 py-5 text-left text-sm font-semibold text-navy transition-colors hover:text-navy-800 sm:text-base"
                >
                  {item.question}
                  <IconChevronDown
                    className={cx(
                      "size-4 shrink-0 text-gold-dark transition-transform duration-300",
                      open && "rotate-180"
                    )}
                  />
                </button>
                <div
                  className={cx(
                    "grid transition-all duration-300 ease-out",
                    open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="pb-5 text-sm leading-relaxed text-slate-800">
                      {item.answer}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
