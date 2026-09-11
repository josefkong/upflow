import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

function read(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

test("workspace admins can reorder sidebar spaces with an accessible drag handle", () => {
  const panel = read("src/components/layout/sidebar/panel.tsx");
  const tree = read("src/components/layout/sidebar/space-tree.tsx");

  assert.match(panel, /<DragDropContext/);
  assert.match(panel, /droppableId="sidebar-spaces"/);
  assert.match(
    panel,
    /isDragDisabled=\{\s*!canManageWorkspace \|\| savingSpaceOrder\s*\}/,
  );
  assert.match(panel, /fetch\("\/api\/spaces\/reorder"/);
  assert.match(tree, /DraggableProvidedDragHandleProps/);
  assert.match(tree, /sidebar\.reorderSpace/);
  assert.match(tree, /cursor-grab touch-none/);
  assert.match(tree, /<span\s+\{\.\.\.dragHandleProps\}/);
  assert.doesNotMatch(tree, /<button[^>]*\{\.\.\.dragHandleProps\}/);
});

test("space reorder API is workspace-scoped, admin-only, and atomic", () => {
  const route = read("src/app/api/spaces/reorder/route.ts");

  assert.match(route, /requireAuth\(\)/);
  assert.match(route, /isWorkspaceAdminFor\(auth, auth\.currentWorkspaceId\)/);
  assert.match(route, /where: \{ workspace_id: auth\.currentWorkspaceId \}/);
  assert.match(route, /new Set\(orderedSpaceIds\)/);
  assert.match(route, /prisma\.\$transaction/);
  assert.match(route, /data: \{ position \}/);
  assert.match(route, /withErrorReporting\("api:spaces:reorder:POST"/);
});

test("projects keep the fixed workflow order inside each sidebar group", () => {
  const panel = read("src/components/layout/sidebar/panel.tsx");
  const tree = read("src/components/layout/sidebar/space-tree.tsx");
  const row = read("src/components/layout/sidebar/project-row.tsx");

  assert.doesNotMatch(panel, /result\.type\.startsWith\("PROJECT:"\)/);
  assert.doesNotMatch(panel, /fetch\("\/api\/projects\/reorder"/);
  assert.doesNotMatch(tree, /droppableId=\{`projects:/);
  assert.doesNotMatch(tree, /type=\{`PROJECT:/);
  assert.doesNotMatch(tree, /draggableId=\{`project:/);
  assert.doesNotMatch(row, /dragHandleProps/);
  assert.doesNotMatch(row, /sidebar\.reorderProject/);
});

test("project subcategory order is persisted and scoped to sibling projects", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260820201637_add_project_sidebar_position/migration.sql",
  );
  const sidebarRoute = read("src/app/api/sidebar/route.ts");
  const reorderRoute = read("src/app/api/projects/reorder/route.ts");

  assert.match(schema, /model Project \{[\s\S]*?position\s+Int\s+@default\(0\)/);
  assert.match(migration, /ROW_NUMBER\(\) OVER/);
  assert.match(migration, /WHEN "folder_id" IS NOT NULL/);
  assert.match(sidebarRoute, /orderBy: \[\{ position: "asc" \}/);
  assert.match(reorderRoute, /isWorkspaceAdminFor\(auth, auth\.currentWorkspaceId\)/);
  assert.match(reorderRoute, /project\.folder_id === firstProject\.folder_id/);
  assert.match(reorderRoute, /project\.space_id === firstProject\.space_id/);
  assert.match(reorderRoute, /prisma\.\$transaction/);
  assert.match(reorderRoute, /data: \{ position \}/);
});
