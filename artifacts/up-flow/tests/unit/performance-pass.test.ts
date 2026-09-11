import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("defers optional Space and sidebar UI while preserving the existing panel behavior", () => {
  const sidebar = source("src/components/layout/sidebar.tsx");
  const panelData = source("src/components/layout/sidebar/use-panel-data.ts");
  const spacePage = source("src/app/(dashboard)/spaces/[id]/page.tsx");
  const spaceCache = source("src/lib/space-page-cache.ts");
  const spaceTree = source("src/components/layout/sidebar/space-tree.tsx");
  const projectRow = source("src/components/layout/sidebar/project-row.tsx");
  const projectPage = source("src/app/(dashboard)/projects/[id]/page.tsx");

  assert.match(sidebar, /const Panel = dynamic/);
  assert.match(sidebar, /active=\{desktopSidebarOpen && isDesktopViewport\}/);
  assert.match(panelData, /options: \{ enabled\?: boolean \} = \{\}/);
  assert.match(panelData, /if \(!enabled\) return;/);
  assert.match(panelData, /panelCache\.delete\(storageKeys\.scope\)/);
  assert.match(spacePage, /const SpaceDocsTab = dynamic/);
  assert.match(spacePage, /ssr: false/);
  assert.match(spacePage, /spacePageCacheKeys/);
  assert.match(spaceCache, /SPACE_DASHBOARD_LIMIT = 100/);
  assert.match(spaceTree, /prefetchSpacePage/);
  assert.match(projectRow, /prefetchProjectPage/);
  assert.match(projectPage, /projectPageCacheKeys\.fields/);
  assert.doesNotMatch(spacePage, /department-defaults/);
});

test("calendar and document indexes request only the data their list views use", () => {
  const calendarPage = source("src/app/(dashboard)/calendar/page.tsx");
  const eventRoute = source("src/app/api/calendar/events/route.ts");
  const eventDetail = source("src/app/api/calendar/events/event-detail.ts");
  const docsRoute = source("src/app/api/docs/route.ts");
  const docsPage = source("src/app/(dashboard)/docs/page.tsx");
  const companiesRoute = source("src/app/api/companies/route.ts");
  const clientsPage = source("src/app/(dashboard)/clients/page.tsx");
  const [docsListHandler] = docsRoute.split("async function POST_handler");

  assert.doesNotMatch(calendarPage, /\/api\/tasks\?/);
  assert.match(calendarPage, /isCalendarAppointment/);
  assert.match(calendarPage, /event\.type !== "task" && event\.type !== "deadline"/);
  assert.match(eventRoute, /select: calendarEventListSelect/);
  assert.match(eventDetail, /export const calendarEventListSelect/);
  assert.match(docsListHandler, /select: \{/);
  assert.doesNotMatch(docsListHandler, /content:/);
  assert.match(docsPage, /DocSummary/);
  assert.match(companiesRoute, /const includeSummary = url\.searchParams\.get\("include_summary"\) !== "false"/);
  assert.match(companiesRoute, /if \(!includeSummary\)/);
  assert.match(companiesRoute, /include: companyListInclude/);
  assert.match(clientsPage, /params\.set\("include_summary", "false"\)/);
});
