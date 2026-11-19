import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { SiteNavbar } from "@/components/site-navbar";
import HideOnDashboard from "@/components/HideOnDashboard"; 6
import { SessionProvider } from "next-auth/react";
import "./globals.css";

import { AuthProvider } from "@/components/providers/auth-provider";
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

/* â”€â”€ PARTIE 4 : SEO â€” mÃ©tadonnÃ©es & OpenGraph â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   metadataBase fixe la racine canonique https://nexirole.vercel.app :
   toutes les URLs OpenGraph/Twitter/canoniques en dÃ©rivent.          */
export const metadata: Metadata = {
  metadataBase: new URL("https://nexirole.vercel.app"),
  title: {
    default: "NexiRole â€” GÃ©nÃ©rateur de CV IA, lettres de motivation & recherche d'emploi en direct",
    template: "%s | NexiRole",
  },
  description:
    "NexiRole est votre assistant carriÃ¨re IA : recherche d'emploi en direct (Remotive, Arbeitnow), gÃ©nÃ©rateur de CV ATS, lettre de motivation sur mesure, kit d'entretien et suivi des candidatures. CV optimisÃ© pour chaque offre en quelques secondes.",
  keywords: [
    "gÃ©nÃ©rateur de CV IA",
    "CV ATS",
    "lettre de motivation IA",
    "recherche d'emploi en direct",
    "offres d'emploi remote",
    "assistant carriÃ¨re",
    "prÃ©paration entretien",
    "NexiRole",
  ],
  applicationName: "NexiRole",
  authors: [{ name: "NexiRole" }],
  creator: "NexiRole",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: "https://nexirole.vercel.app",
    siteName: "NexiRole",
    title: "NexiRole â€” Votre assistant carriÃ¨re intelligents",
    description:
      "Recherche d'emploi en direct, CV ATS gÃ©nÃ©rÃ© par l'IA, lettre de motivation et prÃ©paration d'entretien pour chaque offre.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "NexiRole â€” Assistant carriÃ¨re IA",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NexiRole â€” Votre assistant carriÃ¨re intelligents",
    description:
      "GÃ©nÃ©rateur de CV IA, lettres de motivation ATS et recherche d'emploi en direct. Passez au Pass Boost ou CarriÃ¨re Pro.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/logo-mark.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
    >
      <body
        suppressHydrationWarning
        className={`${inter.variable} ${jakarta.variable} font-sans antialiased bg-ice min-h-screen flex flex-col`}
      >
        <AuthProvider>
        <HideOnDashboard>
          <SiteNavbar />
          <main className="flex-1 flex flex-col">{children}</main>
          <Toaster position="top-center" richColors />
        </HideOnDashboard>
        </AuthProvider>
      </body>
    </html>
  );
}
