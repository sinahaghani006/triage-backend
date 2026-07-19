CREATE TABLE "medical_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "chronic_conditions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "allergies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "current_medications" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "surgical_history" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "family_history" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "medical_history_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "medical_history_user_id_key" ON "medical_history"("user_id");
ALTER TABLE "medical_history" ADD CONSTRAINT "medical_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "periodic_vitals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "periodic_vitals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "periodic_vitals_user_id_idx" ON "periodic_vitals"("user_id");
CREATE INDEX "periodic_vitals_user_id_type_idx" ON "periodic_vitals"("user_id", "type");
ALTER TABLE "periodic_vitals" ADD CONSTRAINT "periodic_vitals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
