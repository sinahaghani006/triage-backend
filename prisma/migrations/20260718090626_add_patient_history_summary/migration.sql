CREATE TABLE "patient_history_summaries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "presenting_problem_id" TEXT,
    "urgency_level" TEXT NOT NULL,
    "reasoning_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "patient_history_summaries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "patient_history_summaries_session_id_key" ON "patient_history_summaries"("session_id");
CREATE INDEX "patient_history_summaries_user_id_idx" ON "patient_history_summaries"("user_id");
ALTER TABLE "patient_history_summaries" ADD CONSTRAINT "patient_history_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patient_history_summaries" ADD CONSTRAINT "patient_history_summaries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
