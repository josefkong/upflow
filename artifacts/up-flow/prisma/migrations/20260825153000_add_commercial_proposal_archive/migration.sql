CREATE TABLE "CommercialProposalDocument" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "commercial_lead_id" TEXT,
  "brand_name" TEXT NOT NULL,
  "owner_name" TEXT NOT NULL,
  "owner_email" TEXT NOT NULL,
  "storage_bucket" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT,
  "size_bytes" INTEGER,
  "uploaded_by" TEXT,
  "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmed_at" TIMESTAMP(3),
  "removed_from_lead_at" TIMESTAMP(3),
  CONSTRAINT "CommercialProposalDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommercialProposalDocument_storage_path_key"
  ON "CommercialProposalDocument"("storage_path");
CREATE INDEX "CommercialProposalDocument_workspace_id_uploaded_at_idx"
  ON "CommercialProposalDocument"("workspace_id", "uploaded_at");
CREATE INDEX "CommercialProposalDocument_commercial_lead_id_uploaded_at_idx"
  ON "CommercialProposalDocument"("commercial_lead_id", "uploaded_at");
CREATE INDEX "CommercialProposalDocument_workspace_id_brand_name_idx"
  ON "CommercialProposalDocument"("workspace_id", "brand_name");

ALTER TABLE "CommercialProposalDocument"
  ADD CONSTRAINT "CommercialProposalDocument_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialProposalDocument"
  ADD CONSTRAINT "CommercialProposalDocument_commercial_lead_id_fkey"
  FOREIGN KEY ("commercial_lead_id") REFERENCES "CommercialLead"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommercialProposalDocument"
  ADD CONSTRAINT "CommercialProposalDocument_uploaded_by_fkey"
  FOREIGN KEY ("uploaded_by") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve proposals that were already active before the archive existed.
INSERT INTO "CommercialProposalDocument" (
  "id",
  "workspace_id",
  "commercial_lead_id",
  "brand_name",
  "owner_name",
  "owner_email",
  "storage_bucket",
  "storage_path",
  "file_name",
  "mime_type",
  "size_bytes",
  "uploaded_by",
  "uploaded_at"
)
SELECT
  gen_random_uuid()::text,
  lead."workspace_id",
  lead."id",
  lead."brand_name",
  lead."owner_name",
  lead."owner_email",
  lead."proposal_storage_bucket",
  lead."proposal_storage_path",
  lead."proposal_file_name",
  lead."proposal_mime_type",
  lead."proposal_size_bytes",
  COALESCE(lead."proposal_uploaded_by", lead."created_by"),
  COALESCE(lead."proposal_uploaded_at", lead."updated_at")
FROM "CommercialLead" lead
WHERE lead."proposal_storage_bucket" IS NOT NULL
  AND lead."proposal_storage_path" IS NOT NULL
  AND lead."proposal_file_name" IS NOT NULL
ON CONFLICT ("storage_path") DO NOTHING;

-- Archive metadata is accessed only by authenticated Next.js route handlers.
ALTER TABLE "CommercialProposalDocument" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "CommercialProposalDocument" FROM anon, authenticated;
