-- =============================================================
-- NexiRole - Nettoyage cover_letters (apres le script de secours)
-- -------------------------------------------------------------
-- Le script de secours avait cree la contrainte et l'index avec
-- les noms « modele » (CoverLetter_...) alors que Prisma attend
-- les noms « physiques » (cover_letters_...), derives du nom de
-- table mappé. Resultat : des doublons, et « npx prisma db push »
-- boucle sur :
--   ERROR: constraint "cover_letters_userId_fkey" already exists
--
-- Ce script supprime les doublons et garantit les noms attends
-- par Prisma. SANS DANGER A RELANCER (IF EXISTS / IF NOT EXISTS).
--
-- Execution :
--   npx prisma db execute --file prisma/nettoyer-cover-letters.sql
-- puis :
--   npx prisma db push        (doit se terminer sans erreur)
-- =============================================================

-- 1) doublon de contrainte (nom « modele ») → supprime
ALTER TABLE "cover_letters" DROP CONSTRAINT IF EXISTS "CoverLetter_userId_fkey";

-- 2) doublon d'index (nom « modele ») → supprime
DROP INDEX IF EXISTS "CoverLetter_userId_idx";

-- 3) contrainte au nom attendu par Prisma → creee si absente
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'cover_letters_userId_fkey'
          AND conrelid = '"cover_letters"'::regclass
    ) THEN
        ALTER TABLE "cover_letters"
            ADD CONSTRAINT "cover_letters_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

-- 4) index au nom attendu par Prisma → cree si absent
CREATE INDEX IF NOT EXISTS "cover_letters_userId_idx" ON "cover_letters"("userId");

-- 5) cle primaire au nom attendu par Prisma → renommee si besoin
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'CoverLetter_pkey'
          AND conrelid = '"cover_letters"'::regclass
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'cover_letters_pkey'
          AND conrelid = '"cover_letters"'::regclass
    ) THEN
        ALTER TABLE "cover_letters"
            RENAME CONSTRAINT "CoverLetter_pkey" TO "cover_letters_pkey";
    END IF;
END
$$;
