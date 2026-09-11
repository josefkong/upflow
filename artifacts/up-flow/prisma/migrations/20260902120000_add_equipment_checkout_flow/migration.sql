CREATE TABLE "EquipmentItem" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "asset_code" TEXT NOT NULL,
  "brand" TEXT,
  "model" TEXT,
  "serial_number" TEXT,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'available',
  "condition" TEXT NOT NULL DEFAULT 'good',
  "current_holder_id" TEXT,
  "last_holder_id" TEXT,
  "created_by" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EquipmentItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EquipmentCheckout" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "equipment_id" TEXT NOT NULL,
  "task_id" TEXT,
  "requester_id" TEXT NOT NULL,
  "administrator_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'requested',
  "purpose" TEXT NOT NULL,
  "expected_return_at" TIMESTAMP(3) NOT NULL,
  "condition_out" TEXT,
  "condition_in" TEXT,
  "handover_notes" TEXT,
  "return_notes" TEXT,
  "damage_notes" TEXT,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "admin_handover_confirmed_at" TIMESTAMP(3),
  "requester_receipt_confirmed_at" TIMESTAMP(3),
  "return_requested_at" TIMESTAMP(3),
  "admin_return_confirmed_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EquipmentCheckout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EquipmentCustodyEvent" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "equipment_id" TEXT NOT NULL,
  "checkout_id" TEXT,
  "actor_id" TEXT,
  "holder_id" TEXT,
  "event_type" TEXT NOT NULL,
  "condition" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquipmentCustodyEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EquipmentItem_workspace_id_asset_code_key"
  ON "EquipmentItem"("workspace_id", "asset_code");
CREATE INDEX "EquipmentItem_project_id_status_name_idx"
  ON "EquipmentItem"("project_id", "status", "name");
CREATE INDEX "EquipmentItem_workspace_id_status_idx"
  ON "EquipmentItem"("workspace_id", "status");
CREATE INDEX "EquipmentItem_current_holder_id_idx"
  ON "EquipmentItem"("current_holder_id");
CREATE INDEX "EquipmentItem_last_holder_id_idx"
  ON "EquipmentItem"("last_holder_id");

CREATE UNIQUE INDEX "EquipmentCheckout_task_id_key"
  ON "EquipmentCheckout"("task_id");
CREATE INDEX "EquipmentCheckout_workspace_id_status_requested_at_idx"
  ON "EquipmentCheckout"("workspace_id", "status", "requested_at");
CREATE INDEX "EquipmentCheckout_project_id_status_idx"
  ON "EquipmentCheckout"("project_id", "status");
CREATE INDEX "EquipmentCheckout_equipment_id_status_idx"
  ON "EquipmentCheckout"("equipment_id", "status");
CREATE INDEX "EquipmentCheckout_requester_id_status_idx"
  ON "EquipmentCheckout"("requester_id", "status");
CREATE INDEX "EquipmentCheckout_administrator_id_idx"
  ON "EquipmentCheckout"("administrator_id");

CREATE INDEX "EquipmentCustodyEvent_workspace_id_created_at_idx"
  ON "EquipmentCustodyEvent"("workspace_id", "created_at");
CREATE INDEX "EquipmentCustodyEvent_equipment_id_created_at_idx"
  ON "EquipmentCustodyEvent"("equipment_id", "created_at");
CREATE INDEX "EquipmentCustodyEvent_checkout_id_created_at_idx"
  ON "EquipmentCustodyEvent"("checkout_id", "created_at");
CREATE INDEX "EquipmentCustodyEvent_holder_id_created_at_idx"
  ON "EquipmentCustodyEvent"("holder_id", "created_at");

ALTER TABLE "EquipmentItem"
  ADD CONSTRAINT "EquipmentItem_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquipmentItem"
  ADD CONSTRAINT "EquipmentItem_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquipmentItem"
  ADD CONSTRAINT "EquipmentItem_current_holder_id_fkey"
  FOREIGN KEY ("current_holder_id") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EquipmentItem"
  ADD CONSTRAINT "EquipmentItem_last_holder_id_fkey"
  FOREIGN KEY ("last_holder_id") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EquipmentItem"
  ADD CONSTRAINT "EquipmentItem_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EquipmentCheckout"
  ADD CONSTRAINT "EquipmentCheckout_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquipmentCheckout"
  ADD CONSTRAINT "EquipmentCheckout_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquipmentCheckout"
  ADD CONSTRAINT "EquipmentCheckout_equipment_id_fkey"
  FOREIGN KEY ("equipment_id") REFERENCES "EquipmentItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquipmentCheckout"
  ADD CONSTRAINT "EquipmentCheckout_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "Task"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EquipmentCheckout"
  ADD CONSTRAINT "EquipmentCheckout_requester_id_fkey"
  FOREIGN KEY ("requester_id") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentCheckout"
  ADD CONSTRAINT "EquipmentCheckout_administrator_id_fkey"
  FOREIGN KEY ("administrator_id") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EquipmentCustodyEvent"
  ADD CONSTRAINT "EquipmentCustodyEvent_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquipmentCustodyEvent"
  ADD CONSTRAINT "EquipmentCustodyEvent_equipment_id_fkey"
  FOREIGN KEY ("equipment_id") REFERENCES "EquipmentItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquipmentCustodyEvent"
  ADD CONSTRAINT "EquipmentCustodyEvent_checkout_id_fkey"
  FOREIGN KEY ("checkout_id") REFERENCES "EquipmentCheckout"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EquipmentCustodyEvent"
  ADD CONSTRAINT "EquipmentCustodyEvent_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EquipmentCustodyEvent"
  ADD CONSTRAINT "EquipmentCustodyEvent_holder_id_fkey"
  FOREIGN KEY ("holder_id") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Equipment data is reachable only through authenticated Next.js route
-- handlers, where workspace membership and department permissions are checked.
ALTER TABLE "EquipmentItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EquipmentCheckout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EquipmentCustodyEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "EquipmentItem" FROM anon, authenticated;
REVOKE ALL ON TABLE "EquipmentCheckout" FROM anon, authenticated;
REVOKE ALL ON TABLE "EquipmentCustodyEvent" FROM anon, authenticated;

-- Existing workspaces receive the operational project immediately. New
-- department spaces are provisioned by the matching application helper.
INSERT INTO "Project" (
  "id",
  "name",
  "description",
  "kind",
  "workspace_id",
  "owner_id",
  "space_id",
  "position"
)
SELECT
  gen_random_uuid()::text,
  'Equipment Control',
  'Agency equipment checkout, custody, returns, condition inspections, and possession history.',
  'operational_queue'::"ProjectKind",
  space."workspace_id",
  space."owner_id",
  space."id",
  COALESCE((
    SELECT MAX(project."position") + 1
    FROM "Project" project
    WHERE project."space_id" = space."id"
  ), 0)
FROM "Space" space
WHERE lower(trim(space."name")) IN (
  'general admin',
  'administração geral',
  'administracao geral'
)
AND NOT EXISTS (
  SELECT 1
  FROM "Project" existing
  WHERE existing."workspace_id" = space."workspace_id"
    AND existing."space_id" = space."id"
    AND existing."company_id" IS NULL
    AND lower(trim(existing."name")) IN (
      'equipment control',
      'controle de equipamentos'
    )
);
