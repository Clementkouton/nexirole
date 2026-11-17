/**
 * PrismaClient — singleton optimisé pour Neon (PostgreSQL).
 * Prisma 7 utilise un "driver adapter" : @prisma/adapter-pg (node-postgres).
 */
import { PrismaPg } from "@prisma/adapter-pg";
const { PrismaClient } = require("@prisma/client") as {
  PrismaClient: new (...args: any[]) => any;
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL manquante. Créez le fichier .env.local (voir README-DEMARRAGE.md)."
  );
}

const globalForPrisma = globalThis as unknown as { prisma?: any };

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