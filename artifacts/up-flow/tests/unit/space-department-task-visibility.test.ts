import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

test("Space dashboard exposes every department task in one shared directory", () => {
  const page = read("src/app/(dashboard)/spaces/[id]/page.tsx");
  const directory = read("src/components/spaces/department-task-directory.tsx");
  const route = read("src/app/api/spaces/[id]/dashboard/route.ts");

  assert.match(page, /DepartmentTaskDirectory/);
  assert.match(page, /SPACE_DASHBOARD_LIMIT/);
  assert.match(directory, /department-task-directory/);
  assert.match(directory, /groupedTasks/);
  assert.match(directory, /task\.project_id/);
  assert.match(route, /project: spaceProjectWhere/);
  assert.match(route, /tasks: buildPage\(tasks, limit\)/);
});

test("other departments receive a read-only Space view while the responsible department can operate", () => {
  const page = read("src/app/(dashboard)/spaces/[id]/page.tsx");
  const directory = read("src/components/spaces/department-task-directory.tsx");
  const route = read("src/app/api/spaces/[id]/dashboard/route.ts");

  assert.match(route, /viewerDepartmentName/);
  assert.match(route, /isDepartmentMember/);
  assert.match(route, /can_operate_space: canOperateSpace/);
  assert.match(page, /dashboard\?\.access\.can_operate_space/);
  assert.match(page, /space\.departmentViewerAccess/);
  assert.match(directory, /canOperate \?/);
  assert.match(directory, /readOnlyTaskHint/);
});

test("department task directory remains responsive and searchable", () => {
  const directory = read("src/components/spaces/department-task-directory.tsx");

  assert.match(directory, /sm:flex-row/);
  assert.match(directory, /xl:grid-cols-2/);
  assert.match(directory, /setQuery/);
  assert.match(directory, /setFilter/);
});
