ALTER TABLE "patient_details" ADD COLUMN "age" INTEGER;

UPDATE "patient_details"
SET "age" = EXTRACT(YEAR FROM CURRENT_DATE)::int - EXTRACT(YEAR FROM "birth_date")::int
  - CASE
      WHEN (EXTRACT(MONTH FROM CURRENT_DATE), EXTRACT(DAY FROM CURRENT_DATE))
           < (EXTRACT(MONTH FROM "birth_date"), EXTRACT(DAY FROM "birth_date"))
      THEN 1 ELSE 0
    END
WHERE "age" IS NULL;