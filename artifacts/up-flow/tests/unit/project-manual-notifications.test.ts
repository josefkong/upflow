import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { projectResponsibleIds } from "../../src/lib/project-notifications";

const ROOT = join(__dirname, "..", "..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

test("project responsibility targets are deduplicated", () => {
  assert.deepEqual(
    projectResponsibleIds({
      ownerId: "owner",
      responsibleSalespersonId: "sales",
      assigneeId: "owner",
      memberIds: ["member", "sales"],
      followerIds: ["follower", "owner"],
    }),
    ["owner", "sales", "member", "follower"],
  );
});

test("manual project notification targets every active project owner", () => {
  const notification = read("src/lib/project-notifications.ts");
  const route = read("src/app/api/tasks/[id]/notify-project/route.ts");

  assert.match(notification, /target\.ownerId/);
  assert.match(notification, /target\.responsibleSalespersonId/);
  assert.match(notification, /target\.assigneeId/);
  assert.match(notification, /\.\.\.\(target\.memberIds \?\? \[\]\)/);
  assert.match(notification, /\.\.\.\(target\.followerIds \?\? \[\]\)/);
  assert.match(notification, /status: "active"/);
  assert.match(notification, /role: \{ not: "guest" \}/);
  assert.match(notification, /source: "manual_project_notification"/);
  assert.match(notification, /notification\.createMany/);
  assert.match(notification, /broadcastNotification\(userId\)/);
  assert.match(route, /canContributeToProject/);
  assert.match(route, /responsible_salesperson_id: true/);
  assert.match(route, /project_members: \{ select: \{ user_id: true \} \}/);
  assert.match(route, /followers: \{ select: \{ user_id: true \} \}/);
});

test("manual notification receives dedicated copy in the global header", () => {
  const header = read("src/components/layout/header.tsx");
  assert.match(header, /data\.source === "manual_project_notification"/);
  assert.match(header, /solicitou sua atenção/);
  assert.match(header, /requested your attention/);
});
