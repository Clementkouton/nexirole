import { auth } from "@/auth";
import { NavbarClient } from "@/components/navbar-client";

export async function SiteNavbar() {
  const session = await auth();

  return <NavbarClient user={session?.user ?? null} />;
}