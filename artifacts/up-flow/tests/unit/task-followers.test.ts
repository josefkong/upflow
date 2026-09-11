import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { projectResponsibleIds } from "../../src/lib/project-notifications";

const ROOT = join(__dirname, "..", "..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

test("task followers are stored separately from project contributor access", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260821153000_add_task_followers/migration.sql",
  );

  assert.match(schema, /model TaskFollower/);
  assert.match(schema, /@@unique\(\[task_id, user_id\]\)/);
  assert.match(schema, /@@index\(\[user_id\]\)/);
  const followerModel = schema.match(/model TaskFollower \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.doesNotMatch(followerModel, /role\s+WorkspaceRole/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(
    migration,
    /REVOKE ALL ON TABLE "TaskFollower" FROM anon, authenticated/,
  );
});

test("follower management preserves the primary assignee and workspace permissions", () => {
  const addRoute = read("src/app/api/tasks/[id]/followers/route.ts");
  const removeRoute = read(
    "src/app/api/tasks/[id]/followers/[userId]/route.ts",
  );
  const taskRoute = read("src/app/api/tasks/[id]/route.ts");

  assert.match(addRoute, /canContributeToProject/);
  assert.match(addRoute, /role: \{ not: "guest" \}/);
  assert.match(addRoute, /parsed\.data\.user_id === task\.assignee_id/);
  assert.match(addRoute, /source: "task_follower_added"/);
  assert.match(removeRoute, /taskFollower\.delete/);
  assert.match(taskRoute, /taskFollower\.deleteMany/);
  assert.match(taskRoute, /followers: \{[\s\S]*created_at: "asc"/);
});

test("followers receive task updates without changing project contributor membership", () => {
  assert.deepEqual(
    projectResponsibleIds({
      ownerId: "owner",
      assigneeId: "primary",
      memberIds: ["contributor"],
      followerIds: ["follower", "primary"],
    }),
    ["owner", "primary", "contributor", "follower"],
  );

  const projectNotifications = read("src/lib/project-notifications.ts");
  const comments = read("src/app/api/comments/route.ts");
  const taskRoute = read("src/app/api/tasks/[id]/route.ts");
  const dueSoon = read("src/app/api/cron/due-soon/route.ts");

  assert.match(projectNotifications, /followerIds: task\.followers\?\.map/);
  assert.match(comments, /task\.followers/);
  assert.match(taskRoute, /for \(const follower of oldTask\.followers\)/);
  assert.match(dueSoon, /followers: \{ select: \{ user_id: true \} \}/);
});

test("task detail exposes responsive follower controls and padded dropdown arrows", () => {
  const detail = read("src/components/projects/task-detail-sheet.tsx");
  const picker = read("src/components/projects/task-followers-picker.tsx");
  const assigneePicker = read(
    "src/components/projects/task-assignee-picker.tsx",
  );
  const globals = read("src/app/globals.css");

  assert.match(detail, /<TaskFollowersPicker/);
  assert.match(detail, /<TaskFollowerAddButton/);
  assert.match(detail, /showClear=\{false\}/);
  assert.match(detail, /headerAction=\{/);
  assert.match(detail, /lg:grid-cols-\[minmax\(0,24rem\)_minmax\(0,1fr\)\]/);
  assert.match(detail, /appearance-none[^"]*pl-3\.5 pr-10/);
  assert.match(detail, /upflow-select-chevron/);
  assert.match(globals, /\.upflow-select-chevron\s*\{\s*inset-inline-end: 0\.875rem !important;/);
  assert.match(picker, /taskFollowers\.add/);
  assert.match(picker, /<Plus[^>]*className="h-4 w-4"/);
  assert.match(picker, /className="flex h-7 w-7 shrink-0/);
  assert.match(picker, /sm:grid-cols-2/);
  assert.match(picker, /user\.id !== primaryAssigneeId/);
  assert.match(assigneePicker, /showClear\?: boolean/);
  assert.match(assigneePicker, /value && showClear/);
});
