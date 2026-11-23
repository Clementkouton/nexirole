-- =====================================================================
-- NexiRole — compteur dédié du Coach de Négociation Salariale IA
-- (ÉTAPE OPTIONNELLE — idempotent : sans effet si la colonne existe déjà)
--
-- SANS cette colonne : les limites par plan fonctionnent quand même,
-- le Coach partage le compteur de générations IA du plan Découverte.
-- AVEC cette colonne  : le Coach a son propre compteur indépendant
-- (recommandé : le quota Découverte des dossiers IA n'est pas entamé).
--
-- Exécution :
--   npx prisma db execute --file prisma/ajouter-compteur-coach.sql
--
-- Pour que `npx prisma db push` reste en phase avec la base, ajoutez
-- aussi la ligne correspondante dans le model User de schema.prisma :
--   coachAnalysesUsed Int       @default(0)
-- =====================================================================

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "coachAnalysesUsed" INTEGER NOT NULL DEFAULT 0;
