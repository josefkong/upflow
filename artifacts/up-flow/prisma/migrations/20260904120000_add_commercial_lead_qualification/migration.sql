ALTER TABLE "CommercialLead"
  ADD COLUMN IF NOT EXISTS "qualified_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archive_reason" TEXT;

-- Leads that were awaiting the negotiation checklist now enter the explicit
-- qualification stage before the proposal can be prepared.
UPDATE "CommercialLead"
SET "stage" = 'qualification'
WHERE "stage" = 'presentation_completed';

UPDATE "CustomFieldValue" AS value
SET "value" = '"Qualificação"'::jsonb
FROM "CustomFieldDefinition" AS definition
WHERE value."definition_id" = definition."id"
  AND definition."name" = 'Upflow Commercial Lead Stage'
  AND value."value" = '"Apresentação Realizada"'::jsonb;
