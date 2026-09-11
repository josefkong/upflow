-- Initialize every existing Comercial / Follow-ups project before its first
-- child task is created. Future projects are initialized by the application.
INSERT INTO "CustomFieldDefinition" (
  "id",
  "project_id",
  "name",
  "type",
  "options",
  "position",
  "created_at"
)
SELECT
  gen_random_uuid()::text,
  project."id",
  'Upflow Commercial Follow-up Stage',
  'dropdown'::"CustomFieldType",
  '["Primeiro Contato · D+3", "Segundo Contato · D+7", "Última Tentativa · D+14", "Aguardando Decisão", "Concluído"]'::jsonb,
  0,
  CURRENT_TIMESTAMP
FROM "Project" project
JOIN "Space" space ON space."id" = project."space_id"
WHERE lower(trim(project."name")) = 'follow-ups'
  AND lower(trim(space."name")) = 'comercial'
  AND NOT EXISTS (
    SELECT 1
    FROM "CustomFieldDefinition" field
    WHERE field."project_id" = project."id"
      AND field."name" = 'Upflow Commercial Follow-up Stage'
  );

WITH cadence("key", "name", "stage_order", "color", "terminal") AS (
  VALUES
    ('commercial-follow-up-first_contact', 'Primeiro Contato · D+3', 0, '#f59e0b', false),
    ('commercial-follow-up-second_contact', 'Segundo Contato · D+7', 1, '#3b82f6', false),
    ('commercial-follow-up-final_contact', 'Última Tentativa · D+14', 2, '#8b5cf6', false),
    ('commercial-follow-up-awaiting_decision', 'Aguardando Decisão', 3, '#ec4899', false),
    ('commercial-follow-up-completed', 'Concluído', 4, '#22c55e', true)
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
