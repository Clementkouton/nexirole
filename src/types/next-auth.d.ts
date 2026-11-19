// =============================================================================
// NexiRole — Augmentation des types next-auth v5
// Fichier : src/types/next-auth.d.ts
// =============================================================================
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      plan: string;
      licenseStatus: string;
      expiresAt: string | null;
      searchesUsed: number;
      generationsUsed: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    plan?: string;
    licenseStatus?: string;
    expiresAt?: string | null;
    searchesUsed?: number;
    generationsUsed?: number;
  }
}