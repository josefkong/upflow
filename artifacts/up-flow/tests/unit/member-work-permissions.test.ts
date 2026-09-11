import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

function read(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

test("only administrators can create projects while members keep task contribution capability", () => {
  const projectsRoute = read("src/app/api/projects/route.ts");
  const projectRoute = read("src/app/api/projects/[id]/route.ts");
  const projectPage = read("src/app/(dashboard)/projects/[id]/page.tsx");

  assert.match(
    projectsRoute,
    /if \(!isWorkspaceAdminFor\(auth, auth\.currentWorkspaceId\)\) \{\s*return NextResponse\.json\(\{ error: "Forbidden" \}, \{ status: 403 \}\);/s,
  );
  assert.doesNotMatch(projectsRoute, /canCreateProjectInWorkspace/);

  assert.match(
    projectRoute,
    /capabilities:\s*\{\s*canContribute:\s*await canContributeToProject\(auth, project\),/s,
  );
  assert.match(projectRoute, /canManageMembers:/);
  assert.match(
    projectPage,
    /const canCreateTasks = Boolean\(project\?\.capabilities\?\.canContribute\);/,
  );
  assert.match(projectPage, /canCreate=\{canCreateTasks\}/);
});

test("task creation stops before submission when project contribution capability is false", () => {
  const sheet = read("src/components/projects/task-create-sheet.tsx");

  assert.match(
    sheet,
    /const contributorAccessDenied = Boolean\([\s\S]*!projectContext\.capabilities\.canContribute,[\s\S]*\);/,
  );
  assert.match(
    sheet,
    /if \(project\.capabilities && !project\.capabilities\.canContribute\) \{\s*setContextError\(t\("task\.contributorAccessRequired"\)\);\s*return;\s*\}/s,
  );
  assert.match(
    sheet,
    /if \(contributorAccessDenied\) \{\s*setContextError\(t\("task\.contributorAccessRequired"\)\);\s*setAnnouncement\(t\("task\.contributorAccessRequired"\)\);\s*return;\s*\}/s,
  );
  assert.match(
    sheet,
    /disabled=\{submitting \|\| projectsLoading \|\| contextLoading \|\| contributorAccessDenied\}/,
  );
});

test("space structure and project creation stay admin-only while active members can create tasks and meetings", () => {
  const spacePage = read("src/app/(dashboard)/spaces/[id]/page.tsx");
  const spaceBrowser = read("src/components/spaces/space-browser.tsx");

  const structureControls = spacePage.match(
    /\{canManageWorkspace && \(\s*<>[\s\S]*?<\/>\s*\)\}/,
  )?.[0];
  assert.ok(structureControls, "expected a workspace-management gate around structural controls");
  assert.match(structureControls, /setShowNewFolder\(true\)/);
  assert.match(structureControls, /setShowNewList\(true\)/);
  assert.doesNotMatch(structureControls, /showNewProject|setShowNewProject/);

  assert.match(spacePage, /canManageStructure=\{canManageWorkspace\}/);
  assert.match(
    spaceBrowser,
    /\{canManageStructure && \(\s*<div className="mt-5 flex flex-wrap justify-center gap-2">/s,
  );
  assert.match(spaceBrowser, /onClick=\{onNewFolder\}/);
  assert.match(spaceBrowser, /onClick=\{onNewList\}/);

  assert.match(
    spacePage,
    /const hasWritableWorkspaceRole = Boolean\([\s\S]*?currentRole === "member"[\s\S]*?\);[\s\S]*?const canCreateWorkspaceWork = Boolean\(/,
  );
  assert.match(
    spacePage,
    /onCreateTask=\{canCreateWorkspaceWork \? openTaskCreate : undefined\}/,
  );
  assert.match(
    spacePage,
    /onCreateMeeting=\{\s*canCreateWorkspaceWork \? openMeetingCreate : undefined\s*\}/,
  );
  assert.match(spacePage, /onCreateProject=\{[\s\S]*?canManageWorkspace/);
  assert.match(spacePage, /<NewProjectDialog\s+open=\{canManageWorkspace && showNewProject\}/s);
});

test("read-only project users stay in view mode and cannot mutate the social calendar", () => {
  const projectPage = read("src/app/(dashboard)/projects/[id]/page.tsx");
  const socialCalendar = read("src/components/projects/social-media-calendar.tsx");

  assert.match(projectPage, /action\?\.kind === "form" && canCreateTasks/);
  assert.match(projectPage, /action && action\.kind !== "form"/);
  assert.match(projectPage, /selectedTask && canCreateTasks && workflowFormKind\(selectedTask\)/);
  assert.match(
    projectPage,
    /<SocialMediaCalendar[\s\S]*?canContribute=\{canCreateTasks\}/,
  );

  assert.match(socialCalendar, /canContribute: boolean;/);
  assert.match(socialCalendar, /if \(!canContribute\) return;/);
  assert.match(socialCalendar, /disabled=\{!canContribute \|\| !moodboardReady/);
  assert.match(
    socialCalendar,
    /\{canContribute && \(\s*<CreateActionButton[\s\S]*?socialCalendar\.newPlan/s,
  );
});
