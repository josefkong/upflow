ALTER TABLE "Project"
ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

WITH ranked_projects AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY
        "workspace_id",
        CASE
          WHEN "folder_id" IS NOT NULL THEN 'folder:' || "folder_id"
          WHEN "space_id" IS NOT NULL THEN 'space:' || "space_id"
          ELSE 'unassigned'
        END
      ORDER BY "created_at" DESC, "id" ASC
    ) - 1 AS next_position
  FROM "Project"
)
UPDATE "Project" AS project
SET "position" = ranked_projects.next_position::INTEGER
FROM ranked_projects
WHERE project."id" = ranked_projects."id";

CREATE INDEX "Project_sidebar_position_idx"
ON "Project"(
  "workspace_id",
  "space_id",
  "folder_id",
  "position",
  "created_at"
);
