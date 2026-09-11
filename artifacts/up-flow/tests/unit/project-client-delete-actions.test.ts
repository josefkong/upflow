import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("projects and clients expose card delete actions backed by DELETE routes", () => {
  const projectsPage = read("src/components/projects/project-directory.tsx");
  const projectDetailPage = read("src/app/(dashboard)/projects/[id]/page.tsx");
  const clientsPage = read("src/app/(dashboard)/clients/page.tsx");
  const projectRoute = read("src/app/api/projects/[id]/route.ts");
  const folderRoute = read("src/app/api/folders/[id]/route.ts");
  const tasksRoute = read("src/app/api/tasks/route.ts");
  const companyRoute = read("src/app/api/companies/[id]/route.ts");
  const projectDelete = read("src/lib/project-delete.ts");
  const taskDelete = read("src/lib/task-delete.ts");
  const kanbanBoard = read("src/components/projects/kanban-board.tsx");
  const listView = read("src/components/projects/list-view.tsx");
  const projectToolbar = read("src/components/projects/project-toolbar.tsx");
  const sidebarProjectRow = read("src/components/layout/sidebar/project-row.tsx");
  const sidebarTree = read("src/components/layout/sidebar/space-tree.tsx");

  assert.match(projectsPage, /Trash2/);
  assert.match(projectsPage, /t\("common\.delete"\)/);
  assert.match(projectsPage, /fetch\(`\/api\/projects\/\$\{project\.id\}`,\s*\{\s*method:\s*"DELETE",?\s*\}\)/);
  assert.match(projectRoute, /findActiveOnboardingProject\(tx, \[project\]\)/);
  assert.match(projectRoute, /if \(!result\.ok\)[\s\S]*status: 409/);
  assert.match(projectDelete, /export async function findActiveOnboardingProject/);
  assert.match(projectDelete, /status: \{ not: "onboarding_complete" \}/);
  assert.match(projectDelete, /checklist_items:[\s\S]*task:[\s\S]*project_id: \{ in: projectIds \}/);
  assert.match(projectsPage, /deletingProjectId/);
  assert.match(projectsPage, /setRefreshKey\(\(value\) => value \+ 1\)/);
  assert.match(projectsPage, /t\("projects\.deleted"\)/);
  assert.match(projectRoute, /prisma\.\$transaction/);
  assert.match(projectRoute, /deleteProjectsByIds/);
  assert.match(projectDelete, /deleteTasksByIds/);
  assert.match(taskDelete, /collectTaskDescendantIds/);
  assert.match(taskDelete, /commercialLead\.findMany/);
  assert.match(taskDelete, /follow_up_task_id/);
  assert.match(taskDelete, /taskDependency\.deleteMany/);
  assert.match(taskDelete, /notification\.deleteMany/);
  assert.match(taskDelete, /timeEntry\.deleteMany/);
  assert.match(taskDelete, /deleteCalendarEventsWithGoogleTombstones/);
  assert.match(projectDelete, /approvalRequest\.deleteMany/);
  assert.match(projectDelete, /activityEvent\.deleteMany/);
  assert.match(taskDelete, /onboardingChecklistItem\.updateMany/);
  assert.match(projectDelete, /clientOnboarding\.updateMany/);
  assert.match(projectDelete, /clientContract\.updateMany/);
  assert.match(projectDelete, /project\.deleteMany/);
  assert.match(projectRoute, /deleted\.projects !== 1/);
  assert.match(folderRoute, /findActiveOnboardingProject\(tx, projects\)/);
  assert.match(folderRoute, /if \(!result\.ok\)[\s\S]*status: 409/);
  assert.match(projectRoute, /workspace_id:\s*project\.workspace_id/);
  assert.match(projectRoute, /deleted:\s*result/);
  assert.match(folderRoute, /getDescendantFolderIds/);
  assert.match(folderRoute, /deleteProjectsByIds/);
  assert.match(folderRoute, /folder\.deleteMany/);
  assert.doesNotMatch(folderRoute, /promoted_children/);
  assert.match(tasksRoute, /async function deleteHandler/);
  assert.match(tasksRoute, /ids\.length > 200/);
  assert.match(tasksRoute, /deleteTasksByIds/);
  assert.match(tasksRoute, /export const DELETE = withErrorReporting\("api:tasks:DELETE", deleteHandler\)/);
  assert.match(projectDetailPage, /selectedTaskIds/);
  assert.match(projectDetailPage, /task\.deleteSelected/);
  assert.match(projectDetailPage, /toggleVisibleTaskSelection/);
  assert.match(projectDetailPage, /task\.selectAllVisible/);
  assert.match(projectDetailPage, /deletingSelectedTasks/);
  assert.match(projectDetailPage, /fetch\("\/api\/tasks"/);
  assert.match(kanbanBoard, /onToggleTaskSelection/);
  assert.match(kanbanBoard, /isDragDisabled=\{\s*!canCreate \|\|\s*selectionMode/s);
  assert.match(listView, /onToggleTaskSelection/);
  assert.match(projectToolbar, /task\.selectTasks/);
  assert.match(projectToolbar, /onToggleSelectionMode/);
  assert.match(sidebarProjectRow, /new CustomEvent\("upflow:sidebar-refresh"\)/);
  assert.match(sidebarTree, /onDeleted=\{\(\) => loadPanel\(\{ force: true \}\)\}/);

  assert.match(clientsPage, /Trash2/);
  assert.match(clientsPage, /t\("clients\.deleteClient"\)/);
  assert.match(clientsPage, /fetch\(`\/api\/companies\/\$\{company\.id\}`,\s*\{\s*method:\s*"DELETE",?\s*\}\)/);
  assert.match(clientsPage, /t\("clients\.deleted"\)/);

  assert.match(companyRoute, /async function DELETE_handler/);
  assert.match(companyRoute, /isWorkspaceAdminFor\(auth, company\.workspace_id\)/);
  assert.match(companyRoute, /type:\s*"company_deleted"/);
  assert.match(companyRoute, /kind:\s*\{\s*in:\s*\["client", "onboarding"\]/);
  assert.match(companyRoute, /kind:\s*"internal"/);
  assert.match(companyRoute, /FOR UPDATE[\s\S]*project\.updateMany/);
  assert.doesNotMatch(companyRoute, /TransactionIsolationLevel\.Serializable/);
  assert.match(companyRoute, /tx\.company\.delete/);
  assert.match(companyRoute, /export const DELETE = withErrorReporting\(\s*"api:companies\/id:DELETE",\s*DELETE_handler/s);
});
