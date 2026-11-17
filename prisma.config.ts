// NexiRole — Configuration Prisma 7 (chargée par la CLI : migrate, studio…)
// Pour les MIGRATIONS on utilise la chaîne DIRECTE Neon (DIRECT_URL),
// pas l'endpoint poolé (les migrations doivent contourner PgBouncer).

import path from "node:path";
import { defineConfig } from "prisma/config";
import { config as dotenvConfig } from "dotenv";

// La CLI Prisma ne charge pas .env.local automatiquement : on le fait ici.
dotenvConfig({ path: path.resolve(".env.local") });
dotenvConfig({ path: path.resolve(".env") });

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});