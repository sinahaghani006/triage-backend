CREATE TABLE "patient_feedback" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "patient_feedback_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "patient_feedback_session_id_key" ON "patient_feedback"("session_id");
ALTER TABLE "patient_feedback" ADD CONSTRAINT "patient_feedback_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
