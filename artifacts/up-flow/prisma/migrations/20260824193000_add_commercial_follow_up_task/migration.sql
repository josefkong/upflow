ALTER TABLE "CommercialLead"
  ADD COLUMN IF NOT EXISTS "follow_up_task_id" TEXT,
  ADD COLUMN IF NOT EXISTS "follow_up_stage" TEXT,
  ADD COLUMN IF NOT EXISTS "follow_up_notification_sent_at" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "CommercialLead_follow_up_task_id_key"
  ON "CommercialLead"("follow_up_task_id");

CREATE INDEX IF NOT EXISTS "CommercialLead_follow_up_task_id_follow_up_stage_idx"
  ON "CommercialLead"("follow_up_task_id", "follow_up_stage");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CommercialLead_follow_up_task_id_fkey'
      AND conrelid = '"CommercialLead"'::regclass
  ) THEN
    ALTER TABLE "CommercialLead"
      ADD CONSTRAINT "CommercialLead_follow_up_task_id_fkey"
      FOREIGN KEY ("follow_up_task_id") REFERENCES "Task"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Commercial lead records and their child-task links remain server-only.
ALTER TABLE "CommercialLead" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "CommercialLead" FROM anon, authenticated;
