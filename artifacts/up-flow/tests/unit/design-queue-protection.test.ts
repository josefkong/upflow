import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isDesignQueueName,
  isProtectedDesignQueue,
} from "../../src/lib/system-projects";

const root = process.cwd();
const departmentSpaces = readFileSync(
  join(root, "src/lib/department-spaces.ts"),
  "utf8",
);
const projectRoute = readFileSync(
  join(root, "src/app/api/projects/[id]/route.ts"),
  "utf8",
);
const sidebarPanel = readFileSync(
  join(root, "src/components/layout/sidebar/panel.tsx"),
  "utf8",
);
const projectRow = readFileSync(
  join(root, "src/components/layout/sidebar/project-row.tsx"),
  "utf8",
);

test("Design Queue protection recognizes the English and Portuguese Creative space names", () => {
  assert.equal(isDesignQueueName(" Design Queue "), true);
  assert.equal(
    isProtectedDesignQueue({
      projectName: "Design Queue",
      spaceName: "Creative & Design",
    }),
    true,
  );
  assert.equal(
    isProtectedDesignQueue({
      projectName: "Design Queue",
      spaceName: "Criativos & Design",
    }),
    true,
  );
  assert.equal(
    isProtectedDesignQueue({
      projectName: "Design Queue",
      spaceName: "Marketing B2B",
    }),
    false,
  );
});

test("missing, hidden, or moved Design Queue lists are restored and cannot be deleted or relocated", () => {
  assert.match(departmentSpaces, /ensureCreativeDesignQueue/);
  assert.match(departmentSpaces, /folder_id: null/);
  assert.match(departmentSpaces, /sidebar_hidden: false/);
  assert.match(departmentSpaces, /isCreativeDesignDepartmentName/);
  assert.match(projectRoute, /isProtectedDesignQueue/);
  assert.match(projectRoute, /cannot be renamed or moved/);
  assert.match(projectRoute, /cannot be deleted/);
  assert.match(departmentSpaces, /await ensureCreativeDesignQueue\(workspaceId, space\.id, ownerId\)/);
  assert.doesNotMatch(sidebarPanel, /sidebar:restore-design-queue/);
  assert.match(projectRow, /protectedDesignQueue/);
});
