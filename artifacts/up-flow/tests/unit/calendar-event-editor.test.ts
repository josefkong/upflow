import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("calendar event click opens a read-only detail viewer", () => {
  const page = source("src/app/(dashboard)/calendar/page.tsx");
  const viewer = source("src/components/calendar/event-editor-sheet.tsx");

  assert.match(page, /<EventEditorSheet/);
  assert.match(viewer, /data-calendar-event-viewer/);
  assert.match(viewer, /calendarViewer\.description/);
  assert.match(viewer, /calendarViewer\.openTask/);
  assert.match(
    viewer,
    /`\/projects\/\$\{detail\.project_id\}\?task=\$\{detail\.task_id\}`/,
  );
  assert.doesNotMatch(viewer, /method: "PATCH"/);
  assert.doesNotMatch(viewer, /method: "DELETE"/);
  assert.doesNotMatch(viewer, /<Input|<Textarea|<select|<form/);
  assert.doesNotMatch(page, /onDragStart|onDrop=|onContextMenu/);
  assert.doesNotMatch(page, /selected-day-event-actions/);
});

test("read-only viewer shows schedule, creator, participants, work, and reminders", () => {
  const viewer = source("src/components/calendar/event-editor-sheet.tsx");

  assert.match(viewer, /calendarEditor\.eventInformation/);
  assert.match(viewer, /calendarEditor\.creator/);
  assert.match(viewer, /calendarEditor\.responsiblePerson/);
  assert.match(viewer, /calendarEditor\.participants/);
  assert.match(viewer, /calendarEditor\.relatedWork/);
  assert.match(viewer, /calendarEditor\.notifications/);
  assert.match(viewer, /detail\.meeting_url/);
});

test("Lead presentation events remain fully visible as individual fields", () => {
  const viewer = source("src/components/calendar/event-editor-sheet.tsx");
  const detail = source("src/app/api/calendar/events/event-detail.ts");

  assert.match(detail, /commercial_lead_presentation:[\s\S]*brand_name: true/);
  assert.match(detail, /monthly_revenue: true/);
  assert.match(viewer, /data-testid="calendar-commercial-lead-fields"/);
  assert.match(viewer, /commercialLead\.brand_name/);
  assert.match(viewer, /commercialLead\.owner_email/);
  assert.match(viewer, /commercialLeadRevenue/);
  assert.match(viewer, /🇧🇷 \+55 \$\{commercialLead\.whatsapp\}/);
  assert.match(viewer, /commercialLead\.observations/);
});

test("calendar reminders target the task assignee and followers", () => {
  const createApi = source("src/app/api/calendar/events/route.ts");
  const updateApi = source("src/app/api/calendar/events/[id]/route.ts");
  const notifications = source("src/lib/calendar-notifications.ts");
  const cron = source("src/app/api/cron/automations/route.ts");

  assert.match(createApi, /followers: \{ select: \{ user_id: true \} \}/);
  assert.match(createApi, /linkedTask\?\.followers\.map/);
  assert.match(updateApi, /linkedTask\?\.followers\.map/);
  assert.match(notifications, /processCalendarEventReminders/);
  assert.match(notifications, /event\.task\.followers\.map/);
  assert.match(cron, /processCalendarEventReminders\(now\)/);
});
