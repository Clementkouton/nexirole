/**
 * Layout du groupe (public) : navbar du site montée UNIQUEMENT ici.
 * Pages concernées : la landing "/". Aucun changement d'URL (route group).
 * Le Dashboard garde sa propre coquille (sidebar), les pages (auth)
 * leur coquille centrée — sans navbar.
 */
import { SiteNavbar } from "@/components/site-navbar";

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col bg-ice">
      <SiteNavbar />
      <main className="flex-1">{children}</main>
    </div>
  );
}