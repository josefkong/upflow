import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("calendar events cannot be edited by dragging them to another date", () => {
  const page = source("src/app/(dashboard)/calendar/page.tsx");

  assert.doesNotMatch(page, /draggable/);
  assert.doesNotMatch(page, /onDragStart=/);
  assert.doesNotMatch(page, /onDrop=/);
  assert.doesNotMatch(page, /startEventDrag|dropEventOnDate|rescheduleEvent/);
});

test("calendar drag-and-drop has localized guidance and outcomes", () => {
  const translations = source("src/lib/i18n/translations.ts");

  assert.match(translations, /"calendar\.dragToReschedule"/);
  assert.match(translations, /"calendar\.eventRescheduled"/);
  assert.match(translations, /"calendar\.couldNotReschedule"/);
});
