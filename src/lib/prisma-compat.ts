/**
 * NexiRole — COMPATIBILITÉ PRISMA 7 (shim pour le code historique).
 *
 * POURQUOI CE FICHIER EXISTE :
 * Le fichier src/lib/nr-auth.ts (écrit à l'époque de Prisma ≤ 6) récupère
 * encore PrismaClient par l'ancien chemin « @prisma/client ». Depuis la
 * migration Prisma 7, ce chemin ne contient plus de client généré (le
 * client vit dans src/generated/prisma et exige l'adaptateur Neon) :
 * en local il « passe » grâce à des résidus dans node_modules, mais sur
 * Vercel (installation propre) il provoquerait la même erreur que la route
 * publier : « Cannot find module '.prisma/client/default' ».
 *
 * Après le correctif (script corriger-nr-auth.ps1), nr-auth.ts fait :
 *   const { PrismaClient } = require("./prisma-compat");
 *   const prisma = new PrismaClient();
 *
 * `new PrismaClient()` renvoie alors une VUE du singleton partagé de
 * l'application (src/lib/prisma.ts, adaptateur Neon déjà configuré).
 * La vue neutralise $connect / $disconnect pour que le code historique ne
 * coupe jamais le pool de connexions utilisé par toute l'application.
 */

import { prisma } from "@/lib/prisma";

export type ClientPrisma = typeof prisma;

function creerVueCompat(): ClientPrisma {
  const vue = Object.create(prisma) as ClientPrisma;
  // Le singleton gère déjà ses connexions : on neutralise ces deux méthodes
  // sur la vue uniquement — le singleton réel reste intact.
  vue.$connect = async () => {};
  vue.$disconnect = async () => {};
  return vue;
}

/**
 * « Classe » de compatibilité : `new PrismaClient()` renvoie une vue du
 * singleton. Fonctionne aussi bien en appel direct qu'avec `new`.
 */
const PrismaClient = function PrismaClientCompat(): ClientPrisma {
  return creerVueCompat();
} as unknown as new () => ClientPrisma;

export { PrismaClient };
export default PrismaClient;
