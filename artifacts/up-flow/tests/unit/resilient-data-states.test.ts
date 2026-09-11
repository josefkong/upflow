import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

test("calendar protects the current range from stale requests and exposes retry after a failed load", () => {
  const page = source("src/app/(dashboard)/calendar/page.tsx");
  const translations = source("src/lib/i18n/translations.ts");

  assert.match(page, /calendarRequestIdRef/);
  assert.match(page, /calendarRequestControllerRef/);
  assert.match(page, /calendarRequestControllerRef\.current\?\.abort\(\)/);
  assert.match(page, /requestId !== calendarRequestIdRef\.current/);
  assert.match(page, /loadedCalendarRange === calendarRangeKey/);
  assert.match(page, /failedCalendarRange === calendarRangeKey/);
  assert.match(page, /calendarHasLoaded \? events : \[\]/);
  assert.match(page, /calendarIsLoading = !calendarHasLoaded && !calendarLoadError/);
  assert.match(page, /Unable to load calendar events/);
  assert.match(page, /setLoadedCalendarRange\(rangeKey\)/);
  assert.match(page, /setFailedCalendarRange\(rangeKey\)/);
  assert.match(page, /role="alert"/);
  assert.match(page, /role="status"/);
  assert.match(page, /aria-busy=\{calendarIsLoading\}/);
  assert.match(page, /onClick=\{\(\) => loadCalendar\(\)\}/);
  assert.match(page, /calendar\.loadUnavailableStale/);
  assert.match(page, /calendar\.retryLoad/);
  assert.match(page, /calendar\.loadingSchedule/);

  assert.match(translations, /"calendar\.loadUnavailable"/);
  assert.match(translations, /"calendar\.loadUnavailableStale"/);
  assert.match(translations, /"calendar\.retryLoad"/);
  assert.match(translations, /"calendar\.loadingSchedule"/);
});

test("notification failures retain known state instead of presenting an empty inbox as caught up", () => {
  const header = source("src/components/layout/header.tsx");
  const translations = source("src/lib/i18n/translations.ts");

  assert.match(header, /notificationListUnavailable/);
  assert.match(header, /notificationUnreadUnavailable/);
  assert.match(header, /setNotificationListUnavailable\(true\)/);
  assert.match(header, /setNotificationUnreadUnavailable\(true\)/);
  assert.match(header, /Unable to load notifications/);
  assert.match(header, /Unread notification count was not returned/);
  assert.match(header, /notifications\.length === 0 && notificationsUnavailable/);
  assert.match(header, /notificationsUnavailable && notifications\.length > 0/);
  assert.match(header, /retryNotifications/);
  assert.doesNotMatch(header, /\.catch\(\(\) => \[\]\)/);
  assert.doesNotMatch(header, /\.catch\(\(\) => 0\)/);

  assert.match(translations, /"header\.notificationsUnavailable"/);
  assert.match(translations, /"header\.notificationsUnavailableStale"/);
  assert.match(translations, /"header\.retryNotifications"/);
});
