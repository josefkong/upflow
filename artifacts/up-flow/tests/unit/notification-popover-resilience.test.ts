import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const header = readFileSync(join(root, "src/components/layout/header.tsx"), "utf8");
const taskDetail = readFileSync(
  join(root, "src/components/projects/task-detail-sheet.tsx"),
  "utf8",
);

test("notification refreshes ignore stale responses and reuse an in-flight forced request", () => {
  assert.match(header, /if \(notificationRequest\?\.userId === userId\)/);
  assert.match(header, /notificationListRequestRef/);
  assert.match(header, /notificationUnreadRequestRef/);
  assert.match(header, /notificationListRequestRef\.current === requestId/);
  assert.match(header, /notificationUnreadRequestRef\.current === requestId/);
});

test("notification availability reflects the list instead of a recoverable count refresh", () => {
  assert.match(
    header,
    /notificationListUnavailable\s*\|\|\s*\(!notificationsHaveLoaded && notificationUnreadUnavailable\)/,
  );
});

test("the notification popover exposes and restores accessible focus state", () => {
  assert.match(header, /notificationToggleRef/);
  assert.match(header, /aria-expanded=\{panelOpen\}/);
  assert.match(header, /aria-controls="header-notification-panel"/);
  assert.match(header, /id="header-notification-panel"/);
  assert.match(header, /closeNotificationPanel\(true\)/);
});

test("notification surfaces remain above the task detail workspace", () => {
  assert.match(header, /sticky top-0 z-\[70\]/);
  assert.match(header, /top-16 z-\[80\].*glass-strong/);
  assert.match(header, /top-24 z-\[60\].*max-w-sm/);
  assert.match(taskDetail, /upflow-task-detail fixed.*z-50/);
});

test("assistant open and dismiss persist the notification before closing", () => {
  assert.match(header, /const markNotificationRead = useCallback/);
  assert.match(
    header,
    /const response = await fetch\(`\/api\/notifications\/\$\{notification\.id\}`/,
  );
  assert.match(header, /if \(!response\.ok\)/);
  assert.match(header, /notificationAcknowledgementKey/);
  assert.match(header, /result\.acknowledged_count/);
  assert.match(
    header,
    /const handleDismissAssistantNotification = async \(\) => \{[\s\S]*await markNotificationRead\(notification\)/,
  );
  assert.match(
    header,
    /const handleOpenNotification = async[\s\S]*await markNotificationRead\(notification\)/,
  );
  assert.doesNotMatch(
    header,
    /onClick=\{\(\) => setAssistantNotification\(null\)\}/,
  );
});
