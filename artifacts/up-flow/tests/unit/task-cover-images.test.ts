import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("legacy task cover data remains compatible without exposing cover controls in the Flow UI", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20260526114500_add_task_cover_image/migration.sql");
  const privateBucketMigration = read(
    "prisma/migrations/20260720100000_make_task_assets_private/migration.sql",
  );
  const tasksRoute = read("src/app/api/tasks/route.ts");
  const taskRoute = read("src/app/api/tasks/[id]/route.ts");
  const uploadRoute = read("src/app/api/uploads/task-cover/route.ts");
  const assetRoute = read("src/app/api/task-assets/[...path]/route.ts");
  const taskImages = read("src/lib/task-images.ts");
  const board = read("src/components/projects/kanban-board.tsx");
  const sheet = read("src/components/projects/task-detail-sheet.tsx");
  const taskCreator = read("src/components/projects/task-create-sheet.tsx");
  const control = read("src/components/projects/task-cover-image-control.tsx");

  assert.match(schema, /cover_image_url\s+String\?/);
  assert.match(migration, /ADD COLUMN "cover_image_url" TEXT/);
  assert.match(privateBucketMigration, /task-asset:\/\//);
  assert.match(privateBucketMigration, /unsupported storage path/);
  assert.match(privateBucketMigration, /UPDATE storage\.buckets/);
  assert.match(privateBucketMigration, /SET public = false/);
  assert.match(tasksRoute, /cover_image_url/);
  assert.match(taskRoute, /Invalid cover_image_url/);
  assert.match(uploadRoute, /canContributeToProject\(auth,\s*project\)/);
  assert.match(uploadRoute, /isWorkspaceAdminFor\(auth,\s*project\.workspace_id\)/);
  assert.match(uploadRoute, /TASK_STORAGE_NOT_CONFIGURED/);
  assert.match(uploadRoute, /TASK_COVER_UPLOAD_FAILED/);
  assert.match(uploadRoute, /imageTypeFromBytes/);
  assert.match(uploadRoute, /createTaskAssetReference/);
  assert.doesNotMatch(uploadRoute, /getPublicUrl/);
  assert.match(taskImages, /TASK_ASSET_PREFIX/);
  assert.match(taskImages, /getTaskCoverDisplayUrl/);
  assert.match(assetRoute, /createSignedUrl\(path, 60\)/);
  assert.match(assetRoute, /canAccessWorkspace/);
  assert.match(assetRoute, /Cache-Control/);
  assert.match(control, /\/api\/uploads\/task-cover/);
  assert.doesNotMatch(tasksRoute, /data:image/);
  assert.doesNotMatch(taskRoute, /data:image/);
  assert.doesNotMatch(board, /task\.cover_image_url/);
  assert.doesNotMatch(board, /getTaskCoverDisplayUrl/);
  assert.doesNotMatch(board, /priorityLabel/);
  assert.doesNotMatch(board, /shadow-\[0_0_12px_currentColor\]/);
  assert.doesNotMatch(sheet, /TaskCoverImageControl/);
  assert.doesNotMatch(sheet, /taskWorkspace\.manageCover/);
  assert.doesNotMatch(taskCreator, /TaskCoverImageControl/);
  assert.doesNotMatch(taskCreator, /cover_image_url: coverImageUrl/);
  assert.match(control, /compact \? null/);
});
