import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultSpaceTaskStatusName,
  isValidStatusColor,
  spaceTaskStatusKey,
  taskStatusForSpaceTaskStatus,
} from "../../src/lib/space-task-status";

const ROOT = join(__dirname, "..", "..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const STATUSES = [
  { name: "Briefing", terminal: false, stage_order: 0 },
  { name: "Production", terminal: false, stage_order: 1 },
  { name: "Delivered", terminal: true, stage_order: 2 },
];

test("Space workflow statuses normalize keys and retain useful task progress", () => {
  assert.equal(spaceTaskStatusKey("Revisão interna"), "space-revisao-interna");
  assert.equal(isValidStatusColor("#3b82f6"), true);
  assert.equal(isValidStatusColor("blue"), false);
  assert.equal(taskStatusForSpaceTaskStatus(STATUSES[0], 0), "todo");
  assert.equal(taskStatusForSpaceTaskStatus(STATUSES[1], 1), "in_progress");
  assert.equal(taskStatusForSpaceTaskStatus(STATUSES[2], 2), "done");
  assert.equal(defaultSpaceTaskStatusName(STATUSES, "todo"), "Briefing");
  assert.equal(defaultSpaceTaskStatusName(STATUSES, "in_progress"), "Production");
  assert.equal(defaultSpaceTaskStatusName(STATUSES, "done"), "Delivered");
});

test("Space workflows are persisted, authorized, synchronized, and rendered as board stages", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20260720120000_space_workflow_statuses/migration.sql");
  const route = read("src/app/api/spaces/[id]/workflow-statuses/route.ts");
  const sync = read("src/lib/space-workflow-statuses.ts");
  const manager = read("src/components/spaces/space-workflow-status-manager.tsx");
  const board = read("src/components/projects/kanban-board.tsx");
  const boardStatus = read("src/lib/task-board-status.ts");

  assert.match(schema, /space_id\s+String\?/);
  assert.match(schema, /workflow_statuses\s+WorkflowStatus\[\]/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "space_id"/);
  assert.match(migration, /WorkflowStatus_space_id_fkey/);
  assert.match(route, /isWorkspaceAdminFor/);
  assert.match(route, /syncSpaceTaskStatusFields/);
  assert.match(route, /Mark at least one status as complete/);
  assert.match(sync, /SPACE_TASK_STATUS_FIELD_NAME/);
  assert.match(sync, /renamedValues/);
  assert.match(manager, /space\.taskStatuses/);
  assert.match(board, /resolveTaskBoardStatus/);
  assert.match(boardStatus, /SPACE_TASK_STATUS_FIELD_NAME/);
  assert.match(boardStatus, /kind === "space"/);
});
