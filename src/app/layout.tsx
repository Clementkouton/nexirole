import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { SiteNavbar } from "@/components/site-navbar";
import HideOnDashboard from "@/components/HideOnDashboard";
import { AuthProvider } from "@/components/providers/auth-provider";
import "./globals.css";

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

export const metadata: Metadata = {
  metadataBase: new URL("https://nexirole.vercel.app"),
  title: {
    default: "NexiRole — Générateur de CV IA, lettres de motivation & recherche d'emploi en direct",
    template: "%s | NexiRole",
  },
  description:
    "NexiRole est votre assistant carrière IA : recherche d'emploi en direct (Remotive, Arbeitnow), générateur de CV ATS, lettre de motivation sur mesure, kit d'entretien et suivi des candidatures.",
  keywords: [
    "générateur de CV IA",
    "CV ATS",
    "lettre de motivation IA",
    "recherche d'emploi en direct",
    "offres d'emploi remote",
    "assistant carrière",
    "préparation entretien",
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
    title: "NexiRole — Votre assistant carrière intelligent",
    description:
      "Recherche d'emploi en direct, CV ATS généré par l'IA, lettre de motivation et préparation d'entretien pour chaque offre.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "NexiRole — Assistant carrière IA",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NexiRole — Votre assistant carrière intelligent",
    description:
      "Générateur de CV IA, lettres de motivation ATS et recherche d'emploi en direct.",
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
    <html lang="fr" suppressHydrationWarning data-scroll-behavior="smooth">
      <body
        suppressHydrationWarning
        className={`${inter.variable} ${jakarta.variable} font-sans antialiased bg-[#F8FAFC] min-h-screen flex flex-col`}
      >
        <AuthProvider>
          {/* On masque UNIQUEMENT la navbar publique sur /dashboard, jamais {children} */}
          <HideOnDashboard>
            <SiteNavbar />
          </HideOnDashboard>

          <main className="flex-1 flex flex-col">{children}</main>
          <Toaster position="top-center" richColors />
        </AuthProvider>
      </body>
    </html>
  );
}
