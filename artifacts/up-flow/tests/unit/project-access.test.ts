import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("active workspace members can read and contribute while guests stay view-only", () => {
  const helper = read("src/lib/project-access.ts");
  const projectsRoute = read("src/app/api/projects/route.ts");
  const projectRoute = read("src/app/api/projects/[id]/route.ts");
  const tasksRoute = read("src/app/api/tasks/route.ts");
  const taskRoute = read("src/app/api/tasks/[id]/route.ts");
  const sidebarRoute = read("src/app/api/sidebar/route.ts");
  const searchRoute = read("src/app/api/search/route.ts");
  const scopeHelper = read("src/lib/api/scope.ts");

  assert.match(helper, /return \{ workspace_id: workspaceId \}/);
  assert.match(helper, /return canAccessWorkspace\(auth,\s*project\.workspace_id\)/);
  assert.match(helper, /isWorkspaceAdminFor\(auth,\s*project\.workspace_id\)/);
  assert.match(helper, /export function canManageProjectMembers/);
  assert.match(helper, /project\.owner_id !== auth\.prismaUser\.id/);
  assert.match(helper, /membership\.role !== "guest"/);
  assert.match(helper, /workspaceMember\.findFirst/);
  assert.match(helper, /status:\s*"active"/);
  assert.match(helper, /role:\s*\{\s*not:\s*"guest"\s*\}/);
  assert.doesNotMatch(helper, /project_members:\s*\{\s*none:\s*\{\s*\}/);
  assert.match(helper, /project_id_user_id/);
  assert.match(helper, /hasExplicitMembers/);
  assert.match(helper, /project\.owner_id === userId/);
  assert.match(projectsRoute, /readableProjectWhere\(auth,\s*auth\.currentWorkspaceId\)/);
  assert.match(projectRoute, /canReadProject\(auth,\s*project\)/);
  assert.match(projectRoute, /canContributeToProject\(auth,\s*project\)/);
  assert.match(projectRoute, /canManageMembers:/);
  assert.match(projectRoute, /canManageProjectMembers\(auth, project\)/);
  assert.match(tasksRoute, /readableProjectWhere\(auth,\s*auth\.currentWorkspaceId\)/);
  assert.match(tasksRoute, /canContributeToProject\(auth,\s*project\)/);
  assert.match(taskRoute, /canReadProject\(auth,\s*task\.project\)/);
  assert.match(taskRoute, /canContributeToProject\(auth,\s*oldTask\.project\)/);
  assert.match(sidebarRoute, /readableProjectsWhere = readableProjectWhere\(\s*auth,\s*auth\.currentWorkspaceId/s);
  assert.match(searchRoute, /readableProjectWhere\(auth,\s*workspaceId\)/);
  assert.match(searchRoute, /const taskScope = \{\s*project:\s*projectScope\s*\}/);
  assert.match(searchRoute, /const docScope = \{\s*workspace_id:\s*workspaceId,\s*project:\s*projectScope\s*\}/);
  assert.match(scopeHelper, /validateReadableProjectScope/);
  assert.match(scopeHelper, /validateContributableProjectScope/);
  assert.match(scopeHelper, /validateReadableTaskScope/);
  assert.match(scopeHelper, /validateContributableTaskScope/);
  assert.match(scopeHelper, /canReadProject\(auth,\s*project\)/);
  assert.match(scopeHelper, /canContributeToProject\(auth,\s*project\)/);
});

test("task assignment honors explicit project membership, not only workspace membership", () => {
  const helper = read("src/lib/project-access.ts");
  const tasksRoute = read("src/app/api/tasks/route.ts");
  const taskRoute = read("src/app/api/tasks/[id]/route.ts");

  assert.match(helper, /canAssignUserToProject/);
  assert.match(helper, /workspaceMember\.findFirst/);
  assert.match(helper, /role:\s*\{\s*not:\s*"guest"\s*\}/);
  assert.match(helper, /project\.owner_id === userId/);
  assert.match(tasksRoute, /canAssignUserToProject\(project,\s*assignee_id\)/);
  assert.match(taskRoute, /canAssignUserToProject\(oldTask\.project,\s*assignee_id\)/);
});
