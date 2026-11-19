/**
 * PrismaClient — singleton optimisé pour Neon (PostgreSQL).
 *
 * Prisma 7 + générateur « prisma-client » : le client est généré dans
 * src/generated/prisma (voir prisma/schema.prisma) et s'importe via
 * l'alias @/generated/prisma/client. L'accès à la base passe par le
 * driver adapter officiel @prisma/adapter-pg (node-postgres).
 *
 * - DATABASE_URL : chaîne POOLÉE Neon (endpoint « -pooler ») → l'app au runtime.
 * - DIRECT_URL   : chaîne directe Neon → uniquement pour les migrations
 *   (voir prisma.config.ts).
 *
 * Le singleton global évite de créer un pool par rechargement de module
 * en développement ; en serverless, chaque instance garde son petit pool
 * (limitez `connection_limit` dans DATABASE_URL si besoin, ex: ?connection_limit=5).
 */
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL manquante. Créez le fichier .env.local (voir README-DEMARRAGE.md)."
  );
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: 5, // connexions max par instance — adapté au serverless
    }),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
