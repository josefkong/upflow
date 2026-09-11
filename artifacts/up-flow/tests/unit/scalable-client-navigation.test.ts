import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("generated client onboarding work is visible in its department spaces", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20260716160000_scalable_client_navigation/migration.sql");
  const spaceVisibilityMigration = read(
    "prisma/migrations/20260717173000_add_space_sidebar_visibility/migration.sql",
  );
  const departmentOnboardingVisibilityMigration = read(
    "prisma/migrations/20260721180000_expose_department_onboarding_work/migration.sql",
  );
  const legacyOnboardingVisibilityMigration = read(
    "prisma/migrations/20260722120000_repair_legacy_onboarding_visibility/migration.sql",
  );
  const onboarding = read("src/lib/onboarding.ts");

  assert.match(schema, /sidebar_hidden\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /model SidebarClientPin/);
  assert.match(schema, /@@unique\(\[workspace_id, user_id, company_id\]\)/);
  assert.match(migration, /project\."company_id" IS NOT NULL/);
  assert.match(migration, /OnboardingChecklistItem/);
  assert.match(migration, /AND NOT EXISTS \(\s*SELECT 1\s*FROM "Project"/);
  assert.doesNotMatch(migration, /DELETE FROM "Project"/);
  assert.doesNotMatch(migration, /DELETE FROM "Folder"/);
  assert.match(
    spaceVisibilityMigration,
    /ALTER TABLE "Space" ADD COLUMN IF NOT EXISTS "sidebar_hidden" BOOLEAN NOT NULL DEFAULT false/,
  );
  assert.match(
    spaceVisibilityMigration,
    /Space_workspace_id_sidebar_hidden_idx/,
  );
  assert.match(departmentOnboardingVisibilityMigration, /UPDATE "Project"/);
  assert.match(departmentOnboardingVisibilityMigration, /"kind" = 'onboarding'/);
  assert.match(departmentOnboardingVisibilityMigration, /WITH RECURSIVE onboarding_folder_ids/);
  assert.match(legacyOnboardingVisibilityMigration, /"onboarding_enabled" = true/);
  assert.match(legacyOnboardingVisibilityMigration, /MarketingB2BOnboardingForm/);
  assert.match(legacyOnboardingVisibilityMigration, /WITH RECURSIVE onboarding_folder_ids/);
  assert.match(onboarding, /sidebarHidden: false/);
  assert.match(onboarding, /sidebar_hidden: false/);
});

test("the sidebar includes visible generated onboarding work", () => {
  const sidebarRoute = read("src/app/api/sidebar/route.ts");
  const panel = read("src/components/layout/sidebar/panel.tsx");
  const panelData = read("src/components/layout/sidebar/use-panel-data.ts");

  assert.match(sidebarRoute, /const visibleProjectWhere: Prisma\.ProjectWhereInput/);
  assert.doesNotMatch(sidebarRoute, /kind: \{ not: "onboarding" as const \}/);
  assert.match(sidebarRoute, /sidebar_hidden: false/);
  assert.match(sidebarRoute, /kind: "onboarding"/);
  assert.match(sidebarRoute, /onboarding_enabled: true/);
  assert.match(sidebarRoute, /company_id: \{ not: null \}/);
  assert.match(sidebarRoute, /company:\s*\{\s*is:\s*\{\s*name:\s*\{ contains: q/s);
  assert.match(sidebarRoute, /pinned_clients: pinnedClients/);
  assert.match(panelData, /pinned_clients\?: SidebarPinnedClient\[\]/);
  assert.match(panel, /PinnedClientsSection/);
  assert.match(panel, /\/api\/sidebar-pins\/\$\{companyId\}/);
});

test("sidebar space reads remain compatible while the visibility migration rolls out", () => {
  const sidebarRoute = read("src/app/api/sidebar/route.ts");

  assert.match(sidebarRoute, /const spaceSelect = \{/);
  assert.match(sidebarRoute, /sidebar_hidden/);
  assert.match(sidebarRoute, /select: spaceSelect/);
  assert.doesNotMatch(sidebarRoute, /include: spaceInclude/);
});

test("workspace navigation uses a content-blocker-safe endpoint", () => {
  const panelData = read("src/components/layout/sidebar/use-panel-data.ts");
  const workspaceTreeRoute = read("src/app/api/workspace-tree/route.ts");

  assert.match(panelData, /NAVIGATION_ENDPOINT = "\/api\/workspace-tree"/);
  assert.match(workspaceTreeRoute, /export \{ GET \} from "@\/app\/api\/sidebar\/route"/);
});

test("client pins are private, workspace-scoped, and capped at five", () => {
  const pins = read("src/app/api/sidebar-pins/route.ts");
  const removePin = read("src/app/api/sidebar-pins/[companyId]/route.ts");
  const pinButton = read("src/components/clients/client-pin-button.tsx");

  assert.match(pins, /MAX_SIDEBAR_CLIENT_PINS = 5/);
  assert.match(pins, /workspace_id: auth\.currentWorkspaceId/);
  assert.match(pins, /user_id: auth\.prismaUser\.id/);
  assert.match(pins, /count >= MAX_SIDEBAR_CLIENT_PINS/);
  assert.match(removePin, /workspace_id: auth\.currentWorkspaceId/);
  assert.match(removePin, /user_id: auth\.prismaUser\.id/);
  assert.match(pinButton, /window\.dispatchEvent\(new CustomEvent\("upflow:sidebar-refresh"\)\)/);
});

test("onboarding and client discovery support lifecycle filtering, search, and direct client results", () => {
  const onboardingRoute = read("src/app/api/onboarding/route.ts");
  const onboardingPage = read("src/app/(dashboard)/onboarding/page.tsx");
  const companiesRoute = read("src/app/api/companies/route.ts");
  const clientsPage = read("src/app/(dashboard)/clients/page.tsx");
  const searchRoute = read("src/app/api/search/route.ts");
  const searchPage = read("src/app/(dashboard)/search/page.tsx");

  assert.match(onboardingRoute, /lifecycle === "completed"/);
  assert.match(onboardingRoute, /lifecycle === "active"/);
  assert.match(onboardingRoute, /checklist_items/);
  assert.match(onboardingPage, /QueueLifecycle/);
  assert.match(onboardingPage, /onboardingQueue\.searchPlaceholder/);
  assert.match(onboardingPage, /ClientPinButton/);
  assert.match(companiesRoute, /const url = new URL\(req\.url\);\s*const q = \(url\.searchParams\.get\("q"\)/);
  assert.match(clientsPage, /nextCursor/);
  assert.match(clientsPage, /clients\.loadMore/);
  assert.match(searchRoute, /companies/);
  assert.match(searchPage, /SearchCompany/);
  assert.match(searchPage, /href=\{`\/clients\/\$\{company\.id\}`\}/);
});
