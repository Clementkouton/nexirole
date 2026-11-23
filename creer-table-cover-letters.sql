-- =============================================================
-- NexiRole - Creation de la table cover_letters (SECOURS)
-- -------------------------------------------------------------
-- Equivalent EXACT du modele CoverLetter de prisma/schema.prisma.
-- A utiliser SEULEMENT si « npx prisma db push » echoue, via :
--   npx prisma db execute --file prisma/creer-table-cover-letters.sql
-- Sans danger a relancer : IF NOT EXISTS partout.
-- =============================================================

CREATE TABLE IF NOT EXISTS "cover_letters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Lettre de motivation',
    "company" TEXT NOT NULL DEFAULT '',
    "position" TEXT NOT NULL DEFAULT '',
    "tone" TEXT NOT NULL DEFAULT 'professionnel',
    "language" TEXT NOT NULL DEFAULT 'fr',
    "jobOffer" TEXT NOT NULL DEFAULT '',
    "cvText" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoverLetter_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CoverLetter_userId_fkey'
    ) THEN
        ALTER TABLE "cover_letters"
            ADD CONSTRAINT "CoverLetter_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "CoverLetter_userId_idx" ON "cover_letters"("userId");
