import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["600", "700", "800"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "NexiRole | Générateur de CV & Agent de Recherche d'Emploi IA",
  description:
    "Importez votre CV, laissez notre agent IA chercher les offres en direct et obtenez un rapport classé par pertinence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${jakarta.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-[#F8FAFC] font-sans text-[#051937] antialiased">
        {/* Barre de navigation supérieure avec votre logo */}
        <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link href="/" className="flex items-center">
              <Image
                src="/Logo_NexiRole_carrière_en_essor.png"
                alt="NexiRole"
                width={170}
                height={45}
                priority
                className="h-10 w-auto object-contain"
              />
            </Link>

            <nav className="flex items-center gap-4">
              <Link
                href="/cv-builder"
                className="text-sm font-medium text-slate-600 transition hover:text-[#051937]"
              >
                Générateur de CV
              </Link>
              <Link
                href="/dashboard"
                className="rounded-lg bg-[#051937] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0B2954]"
              >
                Analyser mon profil
              </Link>
            </nav>
          </div>
        </header>

        {/* Contenu principal des pages */}
        <main>{children}</main>
      </body>
    </html>
  );
}
