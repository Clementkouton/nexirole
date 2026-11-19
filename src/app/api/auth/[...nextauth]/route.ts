// =============================================================================
// NexiRole — Route handler Auth.js v5 (délègue à src/lib/auth.ts)
// Fichier : src/app/api/auth/[...nextauth]/route.ts
// =============================================================================
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;