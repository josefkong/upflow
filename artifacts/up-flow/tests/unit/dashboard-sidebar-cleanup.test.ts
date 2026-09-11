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
  const agencyPanel = read(
    "src/components/dashboard/agency-operations-panel.tsx",
  );
  const teamTimeline = read("src/components/dashboard/team-timeline.tsx");
  const taskDetailModal = read(
    "src/components/dashboard/task-detail-modal.tsx",
  );

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
  assert.match(
    teamTimeline,
    /const \[showAllPeople, setShowAllPeople\] = useState\(false\)/,
  );
  assert.match(
    teamTimeline,
    /showAllPeople\s*\?\s*users\s*:\s*users\.slice\(0, TIMELINE_PREVIEW_LIMIT\)/s,
  );
  assert.match(teamTimeline, /timeline\.peoplePreviewCount/);
  assert.match(teamTimeline, /data-testid="team-timeline-view-all"/);
  assert.match(teamTimeline, /aria-expanded=\{showAllPeople\}/);
  assert.match(
    teamTimeline,
    /onClick=\{\(\) => setShowAllPeople\(\(expanded\) => !expanded\)\}/,
  );
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

test("desktop sidebar collapses to an icon rail and keeps its toggle focused", () => {
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
    /const \[desktopSidebarOpen, setDesktopSidebarOpen\]\s*=\s*useState\(\s*initialDesktopSidebarOpen,?\s*\)/,
  );
  assert.match(sidebar, /setDesktopSidebarOpen\(false\)/);
  assert.match(sidebar, /const nextOpen = !open/);
  assert.match(sidebar, /desktopToggleRef\.current\?\.focus\(\)/);
  assert.match(sidebar, /data-testid="desktop-sidebar"/);
  assert.doesNotMatch(sidebar, /data-testid="desktop-sidebar-restore"/);
  assert.match(sidebar, /onRequestClose=\{closeDesktopSidebar\}/);
  assert.match(
    sidebar,
    /localStorage\.setItem\(\s*DESKTOP_SIDEBAR_KEY,\s*desktopSidebarOpen \? "1" : "0",?\s*\)/s,
  );
  assert.match(sidebar, /document\.cookie\s*=/);
  assert.match(sidebar, /SameSite=Lax/);
  assert.match(sidebar, /window\.matchMedia\("\(min-width: 768px\)"\)/);
  assert.match(sidebar, /active=\{desktopSidebarOpen && isDesktopViewport\}/);
  assert.match(sidebar, /desktopSidebarOpen \? "w-\[272px\]" : "w-\[64px\]"/);
  assert.match(sidebar, /panelId: "desktop-sidebar-panel"/);
  assert.match(sidebar, /id="desktop-sidebar-panel"/);
  assert.match(sidebar, /aria-hidden=\{!desktopSidebarOpen\}/);
  assert.match(sidebar, /inert=\{desktopSidebarOpen \? undefined : true\}/);
  assert.match(
    sidebar,
    /const \[mobileOpen, setMobileOpen\] = useState\(false\)/,
  );
  assert.match(sidebar, /w-\[min\(100vw,272px\)\]/);
  assert.match(sidebar, /closeButtonRef=\{mobileCloseRef\}/);
  assert.match(sidebar, /closeButtonLabel=\{t\("sidebar\.closeNavigation"\)\}/);
  assert.doesNotMatch(
    sidebar,
    /renderRail\(closeMobileNavigationAfterNavigate/,
  );
  assert.match(panel, /closeButtonLabel\?: string/);
  assert.match(panel, /closeButtonLabel \?\? t\("sidebar\.hide"\)/);
  assert.match(
    sidebar,
    /const lastNavigationFocusRef = useRef<"mobile" \| "desktop" \| null>\(null\)/,
  );
  assert.match(
    sidebar,
    /document\.addEventListener\("focusin", rememberFocus\)/,
  );
  assert.match(
    sidebar,
    /document\.addEventListener\("pointerdown", rememberPointer, true\)/,
  );
  assert.match(
    sidebar,
    /document\.removeEventListener\("focusin", rememberFocus\)/,
  );
  assert.match(
    sidebar,
    /document\.removeEventListener\("pointerdown", rememberPointer, true\)/,
  );
  assert.match(
    sidebar,
    /if \(mobileOpen \|\| mobileNavigationFocused\) \{[\s\S]*if \(desktopSidebarOpen\) desktopPanelCloseRef\.current\?\.focus\(\);[\s\S]*else desktopToggleRef\.current\?\.focus\(\)/,
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
  assert.match(panel, /loadPanel\(\{ force: isSearching, query: sidebarQuery\.trim\(\) \}\)/);
  assert.match(panelData, /const enabledRef = useRef\(enabled\)/);
  assert.match(panelData, /if \(!enabledRef\.current\) return/);
  assert.doesNotMatch(
    panelData,
    /useEffect\(\(\) => \{\s*loadPanel\(\);\s*\}, \[loadPanel\]\)/,
  );
  assert.match(rail, /data-testid="sidebar-panel-toggle"/);
  assert.doesNotMatch(rail, /const showLabels/);
  assert.match(rail, /className="sr-only"/);
  assert.match(rail, /PanelLeftOpen/);
  assert.match(
    rail,
    /panelOpen \? t\("sidebar\.hide"\) : t\("sidebar\.show"\)/,
  );
  assert.match(panel, /sidebar\.hide/);
  assert.match(panel, /PanelLeftClose/);
});

test("expanded desktop sidebar uses one panel and collapsed mode keeps aligned icon targets", () => {
  const sidebar = read("src/components/layout/sidebar.tsx");
  const rail = read("src/components/layout/sidebar/rail.tsx");
  const panel = read("src/components/layout/sidebar/panel.tsx");
  const panelNav = read("src/components/layout/sidebar/panel-nav.tsx");
  const workspaceSwitcher = read(
    "src/components/layout/workspace-switcher.tsx",
  );
  const translations = read("src/lib/i18n/translations.ts");

  assert.match(sidebar, /useState\(\s*initialDesktopSidebarOpen,?\s*\)/);
  assert.match(sidebar, /w-\[64px\]/);
  assert.match(sidebar, /w-\[272px\]/);
  assert.match(rail, /data-testid="sidebar-rail"/);
  assert.match(rail, /upflow-sidebar-panel/);
  assert.match(rail, /dark:bg-\[#050816\]/);
  assert.match(rail, /from-blue-600\/55 to-violet-600\/32/);
  assert.doesNotMatch(rail, /bg-white text-\[#171331\]/);
  assert.match(rail, /h-11 w-11/);
  assert.match(rail, /\[scrollbar-width:none\]/);
  assert.match(rail, /sidebar-rail-item-label/);
  assert.doesNotMatch(rail, /truncate/);
  assert.doesNotMatch(rail, /showLabels/);
  assert.match(sidebar, /desktopSidebarOpen[\s\S]*"pointer-events-none w-0 opacity-0"[\s\S]*"w-\[64px\] opacity-100"/);
  assert.match(panel, /closeButtonRef\?: Ref<HTMLButtonElement>/);
  assert.match(panel, /data-testid="sidebar-profile-footer"/);
  assert.match(panel, /menuPlacement="top"/);
  assert.doesNotMatch(workspaceSwitcher, /SlidersHorizontal/);
  assert.doesNotMatch(workspaceSwitcher, /upflow-workspace-control/);
  assert.match(workspaceSwitcher, /aria-expanded=\{open\}/);
  assert.equal(
    workspaceSwitcher.match(/t\("workspace\.options"\)/g)?.length,
    1,
  );
  assert.match(panelNav, /flex flex-col gap-1\.5 px-2 pb-2/);
  assert.match(panelNav, /relative flex h-11 shrink-0 items-center/);
  assert.match(translations, /"sidebar\.show": "Show sidebar"/);
  assert.match(translations, /"sidebar\.show": "Mostrar sidebar"/);

  const brandIndex = rail.indexOf('data-testid="sidebar-rail-brand"');
  const toggleIndex = rail.indexOf('data-testid="sidebar-panel-toggle"');
  const navigationIndex = rail.indexOf('data-testid="sidebar-rail-navigation"');
  assert.ok(
    toggleIndex >= 0 &&
      toggleIndex < brandIndex &&
      brandIndex < navigationIndex,
  );
  assert.match(
    rail,
    /flex h-11 w-full shrink-0 items-center justify-center/,
  );
});

test("expanded and collapsed sidebars share the requested category order", () => {
  const rail = read("src/components/layout/sidebar/rail.tsx");
  const primaryNavBlock = rail.slice(
    rail.indexOf("export const primaryNav"),
    rail.indexOf("interface RailProps"),
  );
  const hrefs = Array.from(
    primaryNavBlock.matchAll(/href: "([^"]+)"/g),
    (match) => match[1],
  );

  assert.deepEqual(hrefs, [
    "/",
    "/inbox",
    "/calendar",
    "/projects",
    "/clients",
    "/onboarding",
    "/team",
    "/time",
    "/sala-de-reuniao",
    "/activity",
  ]);
});

test("Inbox shows the synchronized pending-message count in both sidebar modes", () => {
  const sidebar = read("src/components/layout/sidebar.tsx");
  const rail = read("src/components/layout/sidebar/rail.tsx");
  const panelNav = read("src/components/layout/sidebar/panel-nav.tsx");
  const header = read("src/components/layout/header.tsx");
  const inbox = read("src/app/(dashboard)/inbox/page.tsx");
  const countEvents = read("src/lib/inbox-pending-count.ts");

  assert.match(sidebar, /INBOX_PENDING_COUNT_EVENT/);
  assert.match(sidebar, /setInboxPendingCount\(detail\.count\)/);
  assert.match(rail, /data-testid="sidebar-rail-inbox-count"/);
  assert.match(panelNav, /data-testid="sidebar-panel-inbox-count"/);
  assert.match(header, /countPendingInboxNotifications\(notifications\)/);
  assert.match(inbox, /publishInboxPendingCount\(user\?\.id, counts\.action_needed\)/);
  assert.match(countEvents, /count > 99 \? "99\+"/);
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
  assert.match(
    onboarding,
    /!canManageWorkspace && Boolean\(step\.requiresWorkspaceAdmin\)/,
  );
  assert.match(
    onboarding,
    /const isInteractive = !disabled && !step\.complete/,
  );
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

  assert.match(
    panel,
    /loadPanel\(\{ force: isSearching, query: sidebarQuery\.trim\(\) \}\)/,
  );
  assert.match(
    panelData,
    /const NAVIGATION_ENDPOINT = "\/api\/workspace-tree"/,
  );
  assert.match(
    panelData,
    /\$\{NAVIGATION_ENDPOINT\}\?q=\$\{encodeURIComponent\(normalizedQuery\)\}&limit=500/,
  );
  assert.doesNotMatch(panelData, /fetch\("\/api\/sidebar"\)/);
  assert.match(
    workspaceTreeRoute,
    /export \{ GET \} from "@\/app\/api\/sidebar\/route"/,
  );
  assert.match(panelData, /panelLoadFailed/);
  assert.match(panel, /sidebar\.navigationUnavailable/);
  assert.match(panel, /upflow-sidebar-sticky sticky top-0 z-20/);
  assert.match(panel, /dark:bg-\[#050816\]/);
  assert.match(panel, /dark:bg-\[#071024\]/);
  assert.doesNotMatch(panel, /dark:bg-\[#050816\]\/\[0\.92\]/);
  assert.doesNotMatch(panel, /dark:bg-\[#071024\]\/80/);
  assert.match(sidebarRoute, /loadSidebarFolderContext\(/);
  assert.match(
    sidebarRoute,
    /matchingProjects\.map\(\(project\) => project\.folder_id\)/,
  );
  assert.match(
    sidebarRoute,
    /projectPage\.items\.map\(\(project\) => project\.folder_id\)/,
  );
  assert.match(sidebarDiscovery, /pendingFolderIds\.size > 0/);
  assert.match(
    sidebarRoute,
    /for \(const folder of folderById\.values\(\)\) spaceIds\.add\(folder\.space_id\)/,
  );
});

test("workspace sidebar list clicks open the selected list directly", () => {
  const projectRow = read("src/components/layout/sidebar/project-row.tsx");
  const spaceTree = read("src/components/layout/sidebar/space-tree.tsx");

  assert.match(
    projectRow,
    /href=\{href \?\? `\/projects\/\$\{project\.id\}`\}/,
  );
  assert.match(
    spaceTree,
    /href=\{`\/projects\/\$\{project\.id\}`\}/,
  );
  assert.doesNotMatch(spaceTree, /tab=browse&list=/);
  assert.doesNotMatch(spaceTree, /\/folders\/\$\{f\.id\}\?list=/);
});
