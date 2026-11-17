import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "NexiRole — Ton assistant carrière IA",
    template: "%s | NexiRole",
  },
  description:
    "NexiRole analyse les offres Remotive et Arbeitnow, puis génère ton CV, ta lettre de motivation et ton kit d'entretien sur mesure.",
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body
        className={`${inter.variable} ${plusJakarta.variable} bg-ice font-sans text-slate-800 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}