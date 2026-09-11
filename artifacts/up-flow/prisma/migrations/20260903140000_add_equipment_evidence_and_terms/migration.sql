ALTER TABLE "EquipmentCheckout"
  ADD COLUMN "terms_version" TEXT,
  ADD COLUMN "terms_accepted_at" TIMESTAMP(3),
  ADD COLUMN "handover_photo_paths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "requester_photo_confirmation_at" TIMESTAMP(3),
  ADD COLUMN "damage_photo_paths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "inspection_agreement_confirmed_at" TIMESTAMP(3),
  ADD COLUMN "damage_notice_confirmed_at" TIMESTAMP(3),
  ADD COLUMN "overdue_notified_at" TIMESTAMP(3);

CREATE INDEX "EquipmentCheckout_status_expected_return_at_idx"
  ON "EquipmentCheckout"("status", "expected_return_at");
