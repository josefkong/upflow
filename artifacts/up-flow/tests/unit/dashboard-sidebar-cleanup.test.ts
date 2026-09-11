import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("home dashboard defaults to a focused today and risks command center", () => {
  const page = read("src/app/(dashboard)/page.tsx");
  const agencyPanel = read("src/components/dashboard/agency-operations-panel.tsx");
  const teamTimeline = read("src/components/dashboard/team-timeline.tsx");
  const taskDetailModal = read("src/components/dashboard/task-detail-modal.tsx");

  assert.match(page, /t\("dashboard\.commandCenter"\)/);
  assert.match(page, /TodayFocusPanel/);
  assert.match(page, /QuickCreateMenu/);
  assert.match(page, /StatusCountButton/);
  assert.match(page, /<TeamTimeline\s/);
  assert.match(page, /components\/dashboard\/team-timeline/);
  assert.match(page, /agency-operations-panel/);
  assert.match(agencyPanel, /t\("dashboard\.agencyOperationsTitle"\)/);
  assert.match(teamTimeline, /t\("timeline\.subtitle"\)/);
  assert.match(teamTimeline, /buildTimelineRowsFromData/);
  assert.match(teamTimeline, /appTimeInputValue/);
  assert.match(teamTimeline, /formatTime/);
  assert.match(teamTimeline, /startLabel/);
  assert.match(teamTimeline, /aria-label=\{tooltip\}/);
  assert.match(teamTimeline, /const TIMELINE_PREVIEW_LIMIT = 5/);
  assert.match(teamTimeline, /const \[showAllPeople, setShowAllPeople\] = useState\(false\)/);
  assert.match(teamTimeline, /showAllPeople\s*\?\s*users\s*:\s*users\.slice\(0, TIMELINE_PREVIEW_LIMIT\)/s);
  assert.match(teamTimeline, /timeline\.peoplePreviewCount/);
  assert.match(teamTimeline, /data-testid="team-timeline-view-all"/);
  assert.match(teamTimeline, /aria-expanded=\{showAllPeople\}/);
  assert.match(teamTimeline, /onClick=\{\(\) => setShowAllPeople\(\(expanded\) => !expanded\)\}/);
  assert.match(teamTimeline, /data-testid="team-timeline-row"/);
  assert.match(teamTimeline, /timeline\.showLess/);
  assert.doesNotMatch(teamTimeline, /fmtH\(b\.start\)/);
  assert.match(page, /\/api\/dashboard\/summary/);
  assert.doesNotMatch(page, /function AgencyOperationsPanel/);
  assert.doesNotMatch(page, /function TeamTimeline/);
  assert.doesNotMatch(page, /type TimelineBlock/);
  assert.doesNotMatch(page, /<RightPanel\s/);
  assert.doesNotMatch(page, /<QuickAction\s/);
  assert.doesNotMatch(page, /<StatCard\s/);
  assert.doesNotMatch(page, /<PeopleCard\s/);
  assert.doesNotMatch(page, /function TaskDetailModal/);
  assert.match(page, /components\/dashboard\/task-detail-modal/);
  assert.match(taskDetailModal, /aria-modal="true"/);
  assert.match(taskDetailModal, /focusables/);
  assert.match(taskDetailModal, /t\("task\.deleteTask"\)/);
});

test("desktop sidebar collapses only the workspace panel and keeps the rail interactive", () => {
  const sidebar = read("src/components/layout/sidebar.tsx");
  const layout = read("src/app/(dashboard)/layout.tsx");
  const rail = read("src/components/layout/sidebar/rail.tsx");
  const panel = read("src/components/layout/sidebar/panel.tsx");
  const panelData = read("src/components/layout/sidebar/use-panel-data.ts");

  assert.match(layout, /import \{ cookies \} from "next\/headers"/);
  assert.match(
    layout,
    /const DESKTOP_SIDEBAR_KEY = "upflow\.sidebar\.desktopOpen\.v2"/,
  );
  assert.match(
    layout,
    /\(await cookies\(\)\)\.get\(DESKTOP_SIDEBAR_KEY\)\?\.value/,
  );
  assert.match(
    layout,
    /const initialDesktopSidebarOpen = sidebarPreference !== "0"/,
  );
  assert.match(
    layout,
    /initialDesktopSidebarOpen=\{initialDesktopSidebarOpen\}/,
  );
  assert.match(sidebar, /initialDesktopSidebarOpen: boolean/);
  assert.match(
    sidebar,
    /const DESKTOP_SIDEBAR_KEY = "upflow\.sidebar\.desktopOpen\.v2"/,
  );
  assert.match(
    sidebar,
    /const \[desktopSidebarOpen, setDesktopSidebarOpen\]\s*=\s*useState\(initialDesktopSidebarOpen\)/,
  );
  assert.match(sidebar, /setDesktopSidebarOpen\(false\)/);
  assert.match(sidebar, /setDesktopSidebarOpen\(\(current\) => !current\)/);
  assert.match(sidebar, /desktopToggleRef\.current\?\.focus\(\)/);
  assert.match(sidebar, /data-testid="desktop-sidebar-rail"/);
  assert.match(sidebar, /data-testid="desktop-sidebar"/);
  assert.match(sidebar, /data-testid="desktop-sidebar-panel"/);
  assert.doesNotMatch(sidebar, /desktop-sidebar-restore/);
  assert.match(sidebar, /onRequestClose=\{closeDesktopSidebar\}/);
  assert.match(
    sidebar,
    /localStorage\.setItem\(\s*DESKTOP_SIDEBAR_KEY,\s*desktopSidebarOpen \? "1" : "0",?\s*\)/s,
  );
  assert.match(sidebar, /document\.cookie\s*=/);
  assert.match(sidebar, /SameSite=Lax/);
  assert.match(sidebar, /window\.matchMedia\("\(min-width: 768px\)"\)/);
  assert.match(
    sidebar,
    /active=\{desktopSidebarOpen && isDesktopViewport\}/,
  );
  assert.match(sidebar, /aria-hidden=\{!desktopSidebarOpen\}/);
  assert.match(sidebar, /inert=\{desktopSidebarOpen \? undefined : true\}/);
  assert.match(sidebar, /desktopSidebarOpen \? "w-\[336px\]" : "w-\[64px\]"/);
  assert.match(
    sidebar,
    /desktopSidebarOpen[\s\S]*\? "w-\[272px\] opacity-100"[\s\S]*: "pointer-events-none w-0 opacity-0"/,
  );
  assert.match(sidebar, /id="desktop-sidebar-panel"/);
  assert.match(sidebar, /panelId: "desktop-sidebar-panel"/);

  assert.match(sidebar, /const \[mobileOpen, setMobileOpen\] = useState\(false\)/);
  assert.match(sidebar, /showPanelToggle: false/);
  assert.match(
    sidebar,
    /const lastNavigationFocusRef = useRef<"mobile" \| "desktop" \| null>\(null\)/,
  );
  assert.match(sidebar, /document\.addEventListener\("focusin", rememberFocus\)/);
  assert.match(
    sidebar,
    /document\.addEventListener\("pointerdown", rememberPointer, true\)/,
  );
  assert.match(sidebar, /document\.removeEventListener\("focusin", rememberFocus\)/);
  assert.match(
    sidebar,
    /document\.removeEventListener\("pointerdown", rememberPointer, true\)/,
  );
  assert.match(
    sidebar,
    /if \(mobileOpen \|\| mobileNavigationFocused\) \{[\s\S]*lastNavigationFocusRef\.current = null;[\s\S]*desktopToggleRef\.current\?\.focus\(\)/,
  );
  assert.match(
    sidebar,
    /const desktopNavigationFocused =[\s\S]*lastNavigationFocusRef\.current === "desktop"/,
  );
  assert.match(
    sidebar,
    /if \(desktopNavigationFocused\) \{\s*lastNavigationFocusRef\.current = null;\s*window\.requestAnimationFrame\(\(\) => mobileToggleRef\.current\?\.focus\(\)\)/,
  );
  assert.match(
    sidebar,
    /const mobileNavigationFocused =[\s\S]*lastNavigationFocusRef\.current === "mobile"/,
  );
  assert.match(sidebar, /closeMobileNavigation\(false\)/);
  assert.match(rail, /href="\/docs"/);
  assert.match(
    sidebar,
    /if \(isDesktopViewport\) \{[\s\S]*setMobileOpen\(false\)/,
  );
  assert.match(
    sidebar,
    /const desktopNavigationFocused =[\s\S]*desktopSidebarRef\.current\?\.contains\(document\.activeElement\)[\s\S]*mobileToggleRef\.current\?\.focus\(\)/,
  );
  assert.match(panel, /if \(!active\) return;[\s\S]*loadPanel/);
  assert.doesNotMatch(panel, /restore-design-queue/);
  assert.match(panelData, /const enabledRef = useRef\(enabled\)/);
  assert.match(panelData, /if \(!enabledRef\.current\) return/);
  assert.doesNotMatch(
    panelData,
    /useEffect\(\(\) => \{\s*loadPanel\(\);\s*\}, \[loadPanel\]\)/,
  );
  assert.match(rail, /data-testid="sidebar-panel-toggle"/);
  assert.match(
    rail,
    /const panelToggleLabel = t\(panelOpen \? "sidebar\.hide" : "sidebar\.show"\)/,
  );
  assert.match(rail, /panelOpen \? \([\s\S]*PanelLeftClose[\s\S]*PanelLeftOpen/);
  assert.match(rail, /aria-controls=\{panelId\}/);
  assert.match(panel, /sidebar\.hide/);
  assert.match(panel, /PanelLeftClose/);
});

test("visible desktop sidebar keeps compact rail labels readable", () => {
  const sidebar = read("src/components/layout/sidebar.tsx");
  const rail = read("src/components/layout/sidebar/rail.tsx");
  const translations = read("src/lib/i18n/translations.ts");

  assert.match(sidebar, /useState\(initialDesktopSidebarOpen\)/);
  assert.match(sidebar, /w-\[64px\]/);
  assert.match(rail, /bg-\[#16132f\]/);
  assert.match(rail, /min-h-\[48px\]/);
  assert.match(rail, /sidebar-rail-item-label/);
  assert.match(rail, /whitespace-normal/);
  assert.match(rail, /overflow-wrap:anywhere/);
  assert.doesNotMatch(rail, /truncate/);
  assert.match(translations, /"sidebar\.show": "Show sidebar"/);
  assert.match(translations, /"sidebar\.show": "Mostrar sidebar"/);

  const brandIndex = rail.indexOf('data-testid="sidebar-rail-brand"');
  const toggleIndex = rail.indexOf('data-testid="sidebar-panel-toggle"');
  const navigationIndex = rail.indexOf('data-testid="sidebar-rail-navigation"');
  assert.ok(
    brandIndex >= 0 &&
      brandIndex < toggleIndex &&
      toggleIndex < navigationIndex,
  );
  assert.match(rail, /mt-1 flex h-8 w-full shrink-0 items-center justify-center/);
});

test("empty workspaces teach setup steps and permission boundaries", () => {
  const page = read("src/app/(dashboard)/page.tsx");
  const summaryRoute = read("src/app/api/dashboard/summary/route.ts");
  const onboarding = read("src/components/dashboard/first-run-onboarding.tsx");
  const panel = read("src/components/layout/sidebar/panel.tsx");
  const translations = read("src/lib/i18n/translations.ts");

  assert.match(page, /components\/dashboard\/first-run-onboarding/);
  assert.match(page, /<FirstRunOnboarding\s/);
  assert.match(summaryRoute, /workspace_setup/);
  assert.match(summaryRoute, /prisma\.space\.count/);
  assert.match(summaryRoute, /prisma\.workspaceMember\.count/);
  assert.match(onboarding, /onboarding\.modelWorkspace/);
  assert.match(onboarding, /onboarding\.roleHintViewer/);
  assert.doesNotMatch(onboarding, /onboarding\.stepSpaceAction/);
  assert.match(onboarding, /onboarding\.stepSpaceBodyViewOnly/);
  assert.match(onboarding, /requiresWorkspaceAdmin: true/);
  assert.match(onboarding, /!canManageWorkspace && Boolean\(step\.requiresWorkspaceAdmin\)/);
  assert.match(onboarding, /const isInteractive = !disabled && !step\.complete/);
  assert.match(panel, /sidebar\.noSpacesHint/);
  assert.match(panel, /sidebar\.noSpacesViewOnly/);
  assert.match(panel, /canManageWorkspace \? \(/);
  assert.match(translations, /Workspace = company\/account environment/);
  assert.match(translations, /Acesso somente leitura/);
});

test("sidebar search queries the server and includes parent context for folder matches", () => {
  const panel = read("src/components/layout/sidebar/panel.tsx");
  const panelData = read("src/components/layout/sidebar/use-panel-data.ts");
  const sidebarRoute = read("src/app/api/sidebar/route.ts");
  const sidebarDiscovery = read("src/lib/sidebar-discovery.ts");
  const workspaceTreeRoute = read("src/app/api/workspace-tree/route.ts");

  assert.match(panel, /loadPanel\(\{ force: isSearching, query: sidebarQuery\.trim\(\) \}\)/);
  assert.match(panelData, /const NAVIGATION_ENDPOINT = "\/api\/workspace-tree"/);
  assert.match(panelData, /\$\{NAVIGATION_ENDPOINT\}\?q=\$\{encodeURIComponent\(normalizedQuery\)\}&limit=500/);
  assert.doesNotMatch(panelData, /fetch\("\/api\/sidebar"\)/);
  assert.match(workspaceTreeRoute, /export \{ GET \} from "@\/app\/api\/sidebar\/route"/);
  assert.match(panelData, /panelLoadFailed/);
  assert.match(panel, /sidebar\.navigationUnavailable/);
  assert.match(sidebarRoute, /loadSidebarFolderContext\(/);
  assert.match(sidebarRoute, /matchingProjects\.map\(\(project\) => project\.folder_id\)/);
  assert.match(sidebarRoute, /projectPage\.items\.map\(\(project\) => project\.folder_id\)/);
  assert.match(sidebarDiscovery, /pendingFolderIds\.size > 0/);
  assert.match(sidebarRoute, /for \(const folder of folderById\.values\(\)\) spaceIds\.add\(folder\.space_id\)/);
});

test("workspace sidebar list clicks open the selected list directly", () => {
  const projectRow = read("src/components/layout/sidebar/project-row.tsx");
  const spaceTree = read("src/components/layout/sidebar/space-tree.tsx");

  assert.match(projectRow, /href=\{href \?\? `\/projects\/\$\{project\.id\}`\}/);
  assert.match(spaceTree, /href=\{`\/projects\/\$\{project\.id\}`\}/);
  assert.equal(spaceTree.match(/<ProjectRows/g)?.length, 2);
  assert.doesNotMatch(spaceTree, /tab=browse&list=/);
  assert.doesNotMatch(spaceTree, /\/folders\/\$\{f\.id\}\?list=/);
});
