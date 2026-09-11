ALTER TABLE "CommercialLead"
  ADD COLUMN "contract_handoff_task_id" TEXT,
  ADD COLUMN "finance_contract_task_id" TEXT,
  ADD COLUMN "contract_cnpj" TEXT,
  ADD COLUMN "contract_legal_name" TEXT,
  ADD COLUMN "contract_plan" TEXT,
  ADD COLUMN "contract_services" JSONB,
  ADD COLUMN "contract_monthly_fee" DECIMAL(14,2),
  ADD COLUMN "contract_confirmed_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "CommercialLead_contract_handoff_task_id_key"
  ON "CommercialLead"("contract_handoff_task_id");
CREATE UNIQUE INDEX "CommercialLead_finance_contract_task_id_key"
  ON "CommercialLead"("finance_contract_task_id");
CREATE INDEX "CommercialLead_contract_handoff_task_id_idx"
  ON "CommercialLead"("contract_handoff_task_id");
CREATE INDEX "CommercialLead_finance_contract_task_id_idx"
  ON "CommercialLead"("finance_contract_task_id");

ALTER TABLE "CommercialLead"
  ADD CONSTRAINT "CommercialLead_contract_handoff_task_id_fkey"
  FOREIGN KEY ("contract_handoff_task_id") REFERENCES "Task"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommercialLead"
  ADD CONSTRAINT "CommercialLead_finance_contract_task_id_fkey"
  FOREIGN KEY ("finance_contract_task_id") REFERENCES "Task"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
