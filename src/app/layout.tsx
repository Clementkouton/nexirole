import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { SiteNavbar } from "@/components/site-navbar";
import { SessionProvider } from "next-auth/react";
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
  title: "NexiRole — Votre assistant carrière intelligents",
  description:
    "NexiRole analyse les offres d'emploi en direct, score votre CV et génère CV, lettre de motivation et kit d'entretien sur mesure grâce à l'IA.",
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
        <SessionProvider>
          <SiteNavbar />
          <main className="flex-1 flex flex-col">{children}</main>
          <Toaster position="top-center" richColors />
        </SessionProvider>
      </body>
    </html>
  );
}