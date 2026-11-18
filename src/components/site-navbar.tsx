/**
 * Navbar publique (Server Component) : lit la session côté serveur
 * via auth() puis délègue le rendu interactif à NavbarClient.
 * Montée UNIQUEMENT par src/app/(public)/layout.tsx.
 */
import { auth } from "@/auth";
import { NavbarClient } from "@/components/navbar-client";

export async function SiteNavbar() {
  const session = await auth();

  return <NavbarClient user={session?.user ?? null} />;
}