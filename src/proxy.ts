import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Next.js 16 : le handler du proxy est l'export default.
// `auth` de NextAuth v5 est compatible avec cette signature.
export default NextAuth(authConfig).auth;

// Le matcher doit être un export de premier niveau nommé `config`.
export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};