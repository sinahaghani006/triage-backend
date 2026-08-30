-- Add visit_number: sequential, human-friendly reference number per session.
-- Backfilled by created_at ASC (chronological order of actual visit creation),
-- NOT by Postgres physical row order, which would not reflect true visit
-- chronology and could assign inconsistent/non-monotonic numbers.

-- Step 1: add the column as nullable first (so backfill can run before
-- the NOT NULL constraint is enforced).
ALTER TABLE "sessions" ADD COLUMN "visit_number" INTEGER;

-- Step 2: backfill existing rows in true chronological order.
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM "sessions"
)
UPDATE "sessions" s
SET "visit_number" = numbered.rn
FROM numbered
WHERE s.id = numbered.id;

-- Step 3: now that every existing row has a value, enforce NOT NULL.
ALTER TABLE "sessions" ALTER COLUMN "visit_number" SET NOT NULL;

-- Step 4: unique constraint so no two sessions can share the same number.
CREATE UNIQUE INDEX "sessions_visit_number_key" ON "sessions"("visit_number");

-- Step 5: sequence for all NEW sessions created after this migration,
-- starting from (current max + 1) so numbering continues seamlessly.
CREATE SEQUENCE IF NOT EXISTS "sessions_visit_number_seq";
SELECT setval('"sessions_visit_number_seq"', (SELECT COALESCE(MAX("visit_number"), 0) FROM "sessions"));
ALTER TABLE "sessions" ALTER COLUMN "visit_number" SET DEFAULT nextval('"sessions_visit_number_seq"');
ALTER SEQUENCE "sessions_visit_number_seq" OWNED BY "sessions"."visit_number";