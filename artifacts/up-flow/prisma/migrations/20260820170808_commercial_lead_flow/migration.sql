ALTER TABLE "CalendarEvent" ADD COLUMN "google_meet_requested" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "CommercialLead" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "presentation_event_id" TEXT,
  "proposal_checklist_task_id" TEXT,
  "brand_name" TEXT NOT NULL,
  "owner_name" TEXT NOT NULL,
  "owner_email" TEXT NOT NULL,
  "instagram" TEXT NOT NULL,
  "monthly_revenue" DECIMAL(14,2) NOT NULL,
  "whatsapp" TEXT NOT NULL,
  "notes" TEXT NOT NULL,
  "presentation_starts_at" TIMESTAMP(3),
  "presentation_ends_at" TIMESTAMP(3),
  "assignee_id" TEXT NOT NULL,
  "company_type" TEXT NOT NULL,
  "observations" TEXT,
  "stage" TEXT NOT NULL DEFAULT 'lead',
  "presentation_confirmation_requested_at" TIMESTAMP(3),
  "presentation_confirmed_at" TIMESTAMP(3),
  "proposal_file_name" TEXT,
  "proposal_storage_bucket" TEXT,
  "proposal_storage_path" TEXT,
  "proposal_mime_type" TEXT,
  "proposal_size_bytes" INTEGER,
  "proposal_uploaded_by" TEXT,
  "proposal_uploaded_at" TIMESTAMP(3),
  "next_follow_up_at" TIMESTAMP(3),
  "follow_up_count" INTEGER NOT NULL DEFAULT 0,
  "closed_at" TIMESTAMP(3),
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommercialLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommercialLead_task_id_key" ON "CommercialLead"("task_id");
CREATE UNIQUE INDEX "CommercialLead_presentation_event_id_key" ON "CommercialLead"("presentation_event_id");
CREATE UNIQUE INDEX "CommercialLead_proposal_checklist_task_id_key" ON "CommercialLead"("proposal_checklist_task_id");
CREATE INDEX "CommercialLead_workspace_id_stage_idx" ON "CommercialLead"("workspace_id", "stage");
CREATE INDEX "CommercialLead_assignee_id_stage_idx" ON "CommercialLead"("assignee_id", "stage");
CREATE INDEX "CommercialLead_presentation_ends_at_presentation_confirmation_requested_at_idx" ON "CommercialLead"("presentation_ends_at", "presentation_confirmation_requested_at");
CREATE INDEX "CommercialLead_next_follow_up_at_stage_idx" ON "CommercialLead"("next_follow_up_at", "stage");

ALTER TABLE "CommercialLead" ADD CONSTRAINT "CommercialLead_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialLead" ADD CONSTRAINT "CommercialLead_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialLead" ADD CONSTRAINT "CommercialLead_presentation_event_id_fkey" FOREIGN KEY ("presentation_event_id") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommercialLead" ADD CONSTRAINT "CommercialLead_proposal_checklist_task_id_fkey" FOREIGN KEY ("proposal_checklist_task_id") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommercialLead" ADD CONSTRAINT "CommercialLead_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialLead" ADD CONSTRAINT "CommercialLead_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialLead" ADD CONSTRAINT "CommercialLead_proposal_uploaded_by_fkey" FOREIGN KEY ("proposal_uploaded_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- This table is server-only. Do not expose commercial lead contact data
-- through the Supabase Data API; all access is scoped by authenticated routes.
ALTER TABLE "CommercialLead" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "CommercialLead" FROM anon, authenticated;
