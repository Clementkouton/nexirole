/**
 * Proxy Next.js 16 (ex-middleware) — protection du Dashboard et redirection
 * des utilisateurs connectés.
 * Utilise UNIQUEMENT auth.config.ts (edge-safe : sans Prisma ni bcrypt).
 */
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};