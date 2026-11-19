"use client";

// =============================================================
// NEXIROLE — Masque Navbar/Footer du site public dans l'espace candidat.
// Correctif A2 : la navbar de la landing page ne doit JAMAIS apparaître
// dans /dashboard/*. Utilisation dans src/app/layout.tsx :
//
//   <HideOnDashboard>
//     <Navbar />
//     <Footer />
//   </HideOnDashboard>
// =============================================================

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function HideOnDashboard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/dashboard")) return null;
  return <>{children}</>;
}