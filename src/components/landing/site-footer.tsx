import Link from "next/link";
import Image from "next/image";
import {
  IconBrandGithub,
  IconBrandLinkedin,
  IconBrandX,
  IconMail,
} from "@tabler/icons-react";

const FOOTER_COLUMNS = [
  {
    title: "Produit",
    links: [
      { label: "Fonctionnalités", href: "/#fonctionnalites" },
      { label: "Générateur par lien", href: "/#generateur-lien" },
      { label: "Agent de recherche", href: "/#agent-recherche" },
      { label: "Créateur de CV", href: "/cv-builder" },
    ],
  },
  {
    title: "Ressources",
    links: [
      { label: "Comment ça marche", href: "/#comment-ca-marche" },
      { label: "FAQ", href: "/#faq" },
      { label: "Remotive — offres remote", href: "https://remotive.com" },
      {
        label: "Arbeitnow — job board",
        href: "https://www.arbeitnow.com",
      },
    ],
  },
  {
    title: "Workspace",
    links: [
      { label: "Ouvrir le dashboard", href: "/dashboard" },
      { label: "Générer depuis une URL", href: "/dashboard" },
      { label: "Rechercher des offres", href: "/dashboard" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto px-4 sm:px-6 md:px-12 lg:px-18">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="inline-flex items-center" aria-label="NexiRole — Accueil">
              <Image
                src="/logo.png"
                alt="Logo NexiRole"
                width={150}
                height={50}
                className="h-10 w-auto"
              />
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-800">
              NexiRole est l&apos;assistant carrière qui analyse les offres en
              direct, score votre CV et génère vos candidatures sur mesure — CV,
              lettre de motivation et kit d&apos;entretien — grâce à l&apos;IA.
            </p>
            <div className="mt-5 flex items-center gap-2">
              {[
                { icon: IconBrandGithub, label: "GitHub NexiRole", href: "https://github.com/Clementkouton/nexirole.git" },
                { icon: IconBrandLinkedin, label: "LinkedIn", href: "https://www.linkedin.com" },
                { icon: IconBrandX, label: "X / Twitter", href: "https://x.com" },
                { icon: IconMail, label: "Contact email", href: "mailto:contact@nexirole.app" },
              ].map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={item.label}
                  className="flex size-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:border-navy/30 hover:bg-navy hover:text-gold"
                >
                  <item.icon className="size-4" />
                </a>
              ))}
            </div>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="font-heading text-sm font-bold uppercase tracking-wider text-navy">
                {column.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-800 transition-colors hover:text-navy"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-6 sm:flex-row">
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} NexiRole — Assistant carrière intelligent.
          </p>
          <p className="text-xs text-slate-400">
            Propulsé par Groq · Llama 3.3 70B · Remotive &amp; Arbeitnow APIs
          </p>
        </div>
      </div>
    </footer>
  );
}
