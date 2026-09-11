-- Preserve the internal final_contact key while updating its user-facing
-- label, and add Desistência as an alternative terminal outcome.
UPDATE "CustomFieldDefinition" field
SET "options" = '["Primeiro Contato · D+3", "Segundo Contato · D+7", "Terceiro Contato · D+14", "Aguardando Decisão", "Concluído", "Desistência"]'::jsonb
FROM "Project" project
JOIN "Space" space ON space."id" = project."space_id"
WHERE field."project_id" = project."id"
  AND field."name" = 'Upflow Commercial Follow-up Stage'
  AND lower(trim(project."name")) = 'follow-ups'
  AND lower(trim(space."name")) = 'comercial';

UPDATE "CustomFieldValue" value
SET "value" = '"Terceiro Contato · D+14"'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
FROM "CustomFieldDefinition" field
WHERE value."definition_id" = field."id"
  AND field."name" = 'Upflow Commercial Follow-up Stage'
  AND value."value" = '"Última Tentativa · D+14"'::jsonb;

WITH cadence("key", "name", "stage_order", "color", "terminal") AS (
  VALUES
    ('commercial-follow-up-first_contact', 'Primeiro Contato · D+3', 0, '#f59e0b', false),
    ('commercial-follow-up-second_contact', 'Segundo Contato · D+7', 1, '#3b82f6', false),
    ('commercial-follow-up-final_contact', 'Terceiro Contato · D+14', 2, '#8b5cf6', false),
    ('commercial-follow-up-awaiting_decision', 'Aguardando Decisão', 3, '#ec4899', false),
    ('commercial-follow-up-completed', 'Concluído', 4, '#22c55e', true),
    ('commercial-follow-up-withdrawn', 'Desistência', 5, '#ef4444', true)
)
INSERT INTO "WorkflowStatus" (
  "id",
  "workspace_id",
  "project_id",
  "key",
  "name",
  "category",
  "stage_order",
  "color",
  "terminal",
  "active",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  project."workspace_id",
  project."id",
  cadence."key",
  cadence."name",
  'task',
  cadence."stage_order",
  cadence."color",
  cadence."terminal",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Project" project
JOIN "Space" space ON space."id" = project."space_id"
CROSS JOIN cadence
WHERE lower(trim(project."name")) = 'follow-ups'
  AND lower(trim(space."name")) = 'comercial'
ON CONFLICT ("workspace_id", "project_id", "category", "key") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "stage_order" = EXCLUDED."stage_order",
  "color" = EXCLUDED."color",
  "terminal" = EXCLUDED."terminal",
  "active" = true,
  "updated_at" = CURRENT_TIMESTAMP;
