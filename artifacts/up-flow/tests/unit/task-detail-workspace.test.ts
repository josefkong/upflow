import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

function read(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

test("task details use an accessible, focused panel inside the app shell", () => {
  const detail = read("src/components/projects/task-detail-sheet.tsx");
  const sidebar = read("src/components/layout/sidebar.tsx");

  assert.match(detail, /data-testid="task-detail-workspace"/);
  assert.match(detail, /role="dialog"/);
  assert.match(detail, /aria-modal="true"/);
  assert.match(detail, /aria-label=\{currentTask\.title\}/);
  assert.match(detail, /fixed inset-y-0 left-0 right-0 z-\[75\]/);
  assert.match(
    detail,
    /md:left-\[var\(--upflow-desktop-sidebar-width,336px\)\]/,
  );
  assert.match(detail, /md:top-20[^"]*md:h-auto/);
  assert.doesNotMatch(detail, /fixed inset-0 z-50/);
  assert.match(sidebar, /--upflow-desktop-sidebar-width/);
  assert.match(sidebar, /desktopSidebarOpen \? "336px" : "64px"/);
  assert.match(detail, /data-testid="task-detail-main"/);
  assert.match(detail, /max-w-\[1240px\]/);
  assert.doesNotMatch(detail, /data-testid="task-detail-activity"/);
  assert.doesNotMatch(detail, /taskWorkspace\.navigation/);
  assert.doesNotMatch(detail, /taskWorkspace\.projectContext/);
  assert.doesNotMatch(detail, /fixed right-0 top-0 z-50.*sm:max-w-lg/);
});

test("task hub uses accessible sections with real task and subtask activity", () => {
  const detail = read("src/components/projects/task-detail-sheet.tsx");
  const activityRoute = read("src/app/api/activity/route.ts");
  const projectPage = read("src/app/(dashboard)/projects/[id]/page.tsx");

  assert.match(detail, /role="tablist"/);
  assert.match(detail, /role="tab"/);
  assert.match(detail, /role="tabpanel"/);
  assert.match(detail, /include_subtasks=true/);
  assert.match(detail, /activityEventLabel\(event\.type, t\)/);
  assert.match(detail, /renderActivitySection\(true\)/);
  assert.match(detail, /commercial-task-activity/);
  assert.match(activityRoute, /includeSubtasks/);
  assert.match(activityRoute, /parent_id: taskId/);
  assert.match(detail, /comments\.map\(\(comment\) =>/);
  assert.doesNotMatch(detail, /taskWorkspace\.quickChecklist/);
  assert.doesNotMatch(detail, /TaskCoverImageControl/);
  assert.doesNotMatch(detail, /taskWorkspace\.manageCover/);
  assert.match(detail, /formatDate\(currentTask\.created_at, language\)/);
  assert.match(detail, /formatTime\(currentTask\.created_at, language\)/);
  assert.match(
    detail,
    /const taskSpaceName =\s*currentTask\.project\?\.space\?\.name\?\.trim\(\) \|\| spaceName\?\.trim\(\)/,
  );
  assert.doesNotMatch(
    detail,
    /currentTask\.project\?\.space\?\.name \?\? currentTask\.project\?\.name/,
  );
  assert.match(detail, /\{taskSpaceName \? \(/);
  assert.match(projectPage, /spaceName=\{project\.space\?\.name\}/);
  assert.match(detail, /onNotify=\{notifyProject\}/);
  assert.match(detail, /\/api\/tasks\/\$\{currentTask\.id\}\/notify-project/);
});

test("task workspace locks focus and keeps nested task controls accessible", () => {
  const detail = read("src/components/projects/task-detail-sheet.tsx");
  const assigneePicker = read(
    "src/components/projects/task-assignee-picker.tsx",
  );

  assert.match(detail, /document\.body\.style\.overflow = "hidden"/);
  assert.match(detail, /event\.key !== "Tab"/);
  assert.match(detail, /event\.key === "Escape"/);
  assert.match(detail, /previouslyFocused\?\.focus\?\.\(\)/);
  assert.match(detail, /getClientRects\(\)\.length > 0/);
  assert.match(detail, /event\.stopPropagation\(\);\s*setReplyingTo\(null\);/);
  assert.match(detail, /taskWorkspace\.taskTitle/);
  assert.match(assigneePicker, /modal\?: boolean/);
  assert.match(assigneePicker, /onNotify\?: \(\) => void \| Promise<void>/);
  assert.match(assigneePicker, /taskAssigneePicker\.notifyProjectHint/);
  assert.match(assigneePicker, /<Popover\s+modal=\{modal\}/);
});

test("task workspace follows the Flow light theme without changing dark mode", () => {
  const detail = read("src/components/projects/task-detail-sheet.tsx");
  const theme = read("src/app/theme.css");

  assert.match(detail, /className="upflow-task-detail fixed/);
  assert.match(detail, /className="upflow-task-detail-header flex/);
  assert.match(detail, /className="upflow-task-detail-main h-full/);
  assert.match(theme, /html\.light \.upflow-task-detail \{/);
  assert.match(theme, /html\.light \.upflow-task-detail-header \{/);
  assert.match(theme, /html\.light \.upflow-task-detail-main \{/);
  assert.match(
    theme,
    /html\.light \.upflow-task-detail \[class\*="border-white"\]/,
  );
  assert.doesNotMatch(theme, /html\.dark \.upflow-task-detail/);
});
