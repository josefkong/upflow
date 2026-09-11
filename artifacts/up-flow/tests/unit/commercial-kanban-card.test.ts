import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { dueDateUrgency } from "../../src/lib/utils";

const ROOT = process.cwd();

function read(path: string) {
  return readFileSync(join(ROOT, path), "utf8");
}

test("commercial Kanban deadline colors follow the requested day bands", () => {
  const now = "2026-08-26T12:00:00-03:00";

  assert.equal(dueDateUrgency("2026-08-29T09:00:00-03:00", now), "planned");
  assert.equal(dueDateUrgency("2026-08-28T09:00:00-03:00", now), "due_soon");
  assert.equal(dueDateUrgency("2026-08-27T09:00:00-03:00", now), "due_soon");
  assert.equal(
    dueDateUrgency("2026-08-26T09:00:00-03:00", now),
    "overdue_or_today",
  );
  assert.equal(
    dueDateUrgency("2026-08-25T09:00:00-03:00", now),
    "overdue_or_today",
  );
});

test("every Kanban task uses the unified card with responsibles, date, and priority", () => {
  const board = read("src/components/projects/kanban-board.tsx");
  const tasksRoute = read("src/app/api/tasks/route.ts");

  assert.match(board, /data-task-card-format="unified"/);
  assert.match(board, /taskResponsibles\(task\)/);
  assert.match(board, /commercialTaskProfile\(task\)/);
  assert.match(board, /presentation_starts_at/);
  assert.match(board, /formatDateTime\(\s*taskCardDate,\s*language,?\s*\)/);
  assert.match(board, /<PriorityBadge\s+priority=\{task\.priority\}/);
  assert.match(board, /commercialProfile\.company_type/);
  assert.match(
    board,
    /\{task\.title\}[\s\S]{0,900}\{commercialProfile\.company_type\}/,
  );
  assert.doesNotMatch(board, /task\.subtasksCount/);
  assert.doesNotMatch(board, /_count\?\.comments/);
  assert.match(tasksRoute, /followers:\s*\{[\s\S]*?user:\s*\{\s*select:/);
});
