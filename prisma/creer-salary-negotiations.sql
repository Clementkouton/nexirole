-- =============================================================
-- NexiRole - Table salary_negotiations (Coach de Negotiation)
-- -------------------------------------------------------------
-- SECOURS : a utiliser UNIQUEMENT si « npx prisma db push »
-- n'aboutit pas apres l'ajout du modele SalaryNegotiation.
--
-- Execution :
--   npx prisma db execute --file prisma/creer-salary-negotiations.sql
--
-- IDEMPOTENT (IF NOT EXISTS partout) : sans danger a relancer.
-- Les noms de contraintes/index sont les noms PHYSIQUES attendus
-- par Prisma (prefixe = nom de table mappe « salary_negotiations »),
-- donc « prisma db push » restera silencieux ensuite.
-- =============================================================

-- 1) Table (colonnes exactes du modele SalaryNegotiation)
CREATE TABLE IF NOT EXISTS "salary_negotiations" (
    "id"              TEXT        NOT NULL,
    "userId"          TEXT        NOT NULL,
    "jobTitle"        TEXT        NOT NULL,
    "experienceYears" INTEGER     NOT NULL,
    "countryName"     TEXT        NOT NULL,
    "currencyCode"    TEXT        NOT NULL,
    "currencySymbol"  TEXT        NOT NULL,
    "keySkills"       TEXT        NOT NULL,
    "currentOffer"    TEXT,
    "resultJson"      JSONB       NOT NULL,
    "shareToken"      TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_negotiations_pkey" PRIMARY KEY ("id")
);

-- 2) Cle etrangere vers users(id), au nom physique attendu par Prisma
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'salary_negotiations_userId_fkey'
          AND conrelid = '"salary_negotiations"'::regclass
    ) THEN
        ALTER TABLE "salary_negotiations"
            ADD CONSTRAINT "salary_negotiations_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

-- 3) Index utilisateur (nom physique attendu par Prisma)
CREATE INDEX IF NOT EXISTS "salary_negotiations_userId_idx"
    ON "salary_negotiations"("userId");

-- 4) Index unique du token de partage (champ optionnel)
CREATE UNIQUE INDEX IF NOT EXISTS "salary_negotiations_shareToken_key"
    ON "salary_negotiations"("shareToken");
