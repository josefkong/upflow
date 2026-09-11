import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

function read(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

test("all primary task entry points use the shared quick-first sheet", () => {
  const entryPoints = [
    "src/app/(dashboard)/page.tsx",
    "src/app/(dashboard)/spaces/[id]/page.tsx",
    "src/app/(dashboard)/projects/[id]/page.tsx",
  ];

  for (const entryPoint of entryPoints) {
    const source = read(entryPoint);
    assert.match(source, /import TaskCreateSheet from "@\/components\/projects\/task-create-sheet"/);
    assert.match(source, /<TaskCreateSheet/);
    assert.doesNotMatch(source, /<NewTaskDialog|<CreateTaskPanel/);
  }

  const calendar = read("src/app/(dashboard)/calendar/page.tsx");
  assert.doesNotMatch(calendar, /TaskCreateSheet|\/api\/tasks\?/);
});

test("quick-first essentials stay visible and secondary details stay collapsed", () => {
  const sheet = read("src/components/projects/task-create-sheet.tsx");

  assert.match(sheet, /t\("task\.destinationList"\)/);
  assert.match(sheet, /t\("task\.taskTitleLabel"\)/);
  assert.match(sheet, /t\("task\.optionalNotes"\)/);
  assert.match(sheet, /<TaskAssigneePicker/);
  assert.match(sheet, /<BrazilianDateInput/);
  assert.match(sheet, /<PriorityPicker/);
  assert.match(sheet, /<ProgressiveSection icon=\{Shapes\}/);
  assert.match(sheet, /title=\{t\("task\.detailsCustomFields"\)\}/);
  assert.match(sheet, /title=\{t\("task\.detailsSettings"\)\}/);
  assert.doesNotMatch(sheet, /task\.detailsCover|TaskCoverImageControl/);
  assert.match(sheet, /<details className=/);
  assert.doesNotMatch(sheet, /task\.subtasks|addSubtasksLater/);
});

test("the sheet preserves inherited defaults and posts the existing API shape", () => {
  const sheet = read("src/components/projects/task-create-sheet.tsx");

  assert.match(sheet, /setDueDate\(defaultDueDate\)/);
  assert.match(sheet, /setStatus\(defaultStatus\)/);
  assert.match(sheet, /setTemplateId\(defaultTemplateId\)/);
  assert.match(sheet, /setFieldValues\(initialCustomFieldValues \?\? \{\}\)/);
  assert.match(sheet, /fetch\("\/api\/tasks"/);
  assert.match(sheet, /project_id: selectedProjectId/);
  assert.match(sheet, /custom_fields: customFieldEntries/);
  assert.doesNotMatch(sheet, /cover_image_url: coverImageUrl/);
  assert.match(sheet, /assignee_id: assigneeId \|\| null/);
  assert.match(sheet, /due_date: dueDate \|\| null/);
});

test("task status selectors use the project's board stages when available", () => {
  const createSheet = read("src/components/projects/task-create-sheet.tsx");
  const detailSheet = read("src/components/projects/task-detail-sheet.tsx");
  const taskDetailRoute = read("src/app/api/tasks/[id]/route.ts");

  assert.match(createSheet, /resolveTaskBoardStatus/);
  assert.match(createSheet, /taskStatusForTaskBoardOption/);
  assert.match(createSheet, /fieldValuesForSubmit/);
  assert.match(detailSheet, /resolveTaskBoardStatus/);
  assert.match(detailSheet, /disabled[\s\S]*task\.automaticMovementOnly/);
  assert.doesNotMatch(detailSheet, /task_status: taskStatus/);
  assert.match(taskDetailRoute, /custom_field_values:/);
});

test("task creation provides inline validation, announcements, discard protection, and a centered dialog", () => {
  const sheet = read("src/components/projects/task-create-sheet.tsx");

  assert.match(sheet, /role="alert"/);
  assert.match(sheet, /aria-invalid=\{Boolean\(titleError\)\}/);
  assert.match(sheet, /aria-live="polite"/);
  assert.match(sheet, /<DialogContent/);
  assert.match(sheet, /<DialogTitle>/);
  assert.match(sheet, /<DialogDescription>/);
  assert.match(sheet, /data-task-create-dialog/);
  assert.match(sheet, /max-w-\[680px\]/);
  assert.doesNotMatch(sheet, /<SheetContent/);
  assert.doesNotMatch(sheet, /side="right"/);
  assert.match(sheet, /setDiscardOpen\(true\)/);
  assert.match(sheet, /t\("task\.discardMessage"\)/);
  assert.match(sheet, /overflow-y-auto/);
  assert.match(sheet, /shrink-0 border-t/);
});
