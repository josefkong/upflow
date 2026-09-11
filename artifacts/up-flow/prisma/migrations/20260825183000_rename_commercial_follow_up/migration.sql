-- Standardize the Comercial cadence nomenclature without changing any
-- relationship, workflow status, or parent/child task linkage.
UPDATE "Project" AS project
SET "name" = 'Follow Up'
FROM "Space" AS space
WHERE project."space_id" = space."id"
  AND lower(trim(space."name")) = 'comercial'
  AND lower(trim(project."name")) IN ('follow up', 'follow-up', 'follow-ups');

UPDATE "Task" AS task
SET "title" = regexp_replace(
  task."title",
  '^Follow([ -]?Up)s? Comercial',
  'Follow Up Comercial',
  'i'
)
FROM "CommercialLead" AS lead
WHERE lead."follow_up_task_id" = task."id"
  AND task."title" ~* '^Follow([ -]?Up)s? Comercial';
