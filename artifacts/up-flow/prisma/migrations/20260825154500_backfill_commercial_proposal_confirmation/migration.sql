-- Proposals that had already advanced beyond the sending stage were confirmed
-- before the archive table existed. Preserve that lifecycle state in history.
UPDATE "CommercialProposalDocument" document
SET "confirmed_at" = COALESCE(lead."proposal_uploaded_at", lead."updated_at")
FROM "CommercialLead" lead
WHERE document."commercial_lead_id" = lead."id"
  AND document."storage_path" = lead."proposal_storage_path"
  AND document."confirmed_at" IS NULL
  AND lead."stage" IN ('awaiting_response', 'completed');
