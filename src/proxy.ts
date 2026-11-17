import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Next.js 16 : middleware.ts devient proxy.ts.
// Protège /dashboard et redirige /login, /register si déjà connecté.
export default NextAuth(authConfig).auth;

export const config = {
  // Exclut les routes API et les fichiers statiques
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:png|jpg|jpeg|svg|ico|webp|txt|xml)$).*)",
  ],
};