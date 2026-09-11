import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

test("task cover uploads authorize project contributors against a trusted project or task", () => {
  const route = read("src/app/api/uploads/task-cover/route.ts");
  const control = read("src/components/projects/task-cover-image-control.tsx");
  const detail = read("src/components/projects/task-detail-sheet.tsx");
  const create = read("src/components/projects/task-create-sheet.tsx");

  assert.match(route, /formUuid\(form, "project_id"\)/);
  assert.match(route, /formUuid\(form, "task_id"\)/);
  assert.match(route, /prisma\.project\.findUnique/);
  assert.match(route, /prisma\.task\.findUnique/);
  assert.match(route, /Task does not belong to project/);
  assert.match(route, /canContributeToProject\(auth, project\)/);
  assert.match(route, /project\.workspace_id/);
  assert.doesNotMatch(route, /auth\.currentWorkspaceId/);

  assert.match(control, /projectId\?: string/);
  assert.match(control, /taskId\?: string/);
  assert.match(control, /form\.append\("project_id", projectId\)/);
  assert.match(control, /form\.append\("task_id", taskId\)/);
  assert.doesNotMatch(control, /hasWorkspaceAdminAccess/);
  assert.doesNotMatch(detail, /TaskCoverImageControl/);
  assert.doesNotMatch(create, /TaskCoverImageControl/);
  assert.match(create, /contributorAccessDenied/);
});
