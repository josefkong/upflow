import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("task boards expose workflow stages as automatic-only controls", () => {
  const kanban = read("src/components/projects/kanban-board.tsx");
  const list = read("src/components/projects/list-view.tsx");
  const detail = read("src/components/projects/task-detail-sheet.tsx");
  const dashboard = read("src/app/(dashboard)/page.tsx");
  const space = read("src/app/(dashboard)/spaces/[id]/page.tsx");
  const dashboardDetail = read(
    "src/components/dashboard/task-detail-modal.tsx",
  );
  const spaceTask = read("src/components/spaces/space-dashboard-parts.tsx");

  assert.match(kanban, /task\.automaticMovementOnly/);
  assert.match(list, /title=\{t\("task\.automaticMovementOnly"\)\}/);
  assert.doesNotMatch(
    list,
    /status:\s*task\.status\s*===\s*"done"\s*\?\s*"todo"\s*:\s*"done"/,
  );
  assert.match(
    detail,
    /<select[\s\S]*?\sdisabled\s[\s\S]*?task\.automaticMovementOnly/,
  );
  assert.match(detail, /task\.automaticMovementOnly/);
  assert.doesNotMatch(dashboard, /JSON\.stringify\(\{ status \}\)/);
  assert.doesNotMatch(space, /JSON\.stringify\(\{ status \}\)/);
  assert.match(dashboard, /task\.automaticMovementOnly/);
  assert.match(space, /task\.automaticMovementOnly/);
  assert.match(dashboardDetail, /task\.automaticMovementOnly/);
  assert.match(spaceTask, /task\.automaticMovementOnly/);
});
