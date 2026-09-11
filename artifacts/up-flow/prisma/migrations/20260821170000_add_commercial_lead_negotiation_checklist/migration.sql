ALTER TABLE "CommercialLead"
  ADD COLUMN "group_up_plan" TEXT,
  ADD COLUMN "group_up_monthly_fee" DECIMAL(14, 2),
  ADD COLUMN "up_zero_plan" TEXT,
  ADD COLUMN "up_zero_monthly_fee" DECIMAL(14, 2),
  ADD COLUMN "negotiation_checklist_completed_at" TIMESTAMP(3);
