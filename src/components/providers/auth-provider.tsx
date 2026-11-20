"use client";

// =============================================================================
// NexiRole — Provider de session Auth.js (client)
// Fichier : src/components/providers/auth-provider.tsx
// Rend <SessionProvider /> disponible dans TOUTE l'application :
// navbar publique (UserMenu), dashboard, menus utilisateur.
// Corrige : "useSession must be wrapped in a <SessionProvider />"
// =============================================================================

import type { ReactNode } from "react";
import { SessionProvider } from "next-auth/react";

export function AuthProvider({ children }: { children: ReactNode }) {
  return <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>{children}</SessionProvider>;
}