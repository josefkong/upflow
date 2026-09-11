import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("Marketing B2C onboarding uses routed department form tasks", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20260702130000_marketing_b2c_onboarding_forms/migration.sql");
  const repairMigration = read("prisma/migrations/20260803120000_repair_marketing_b2c_onboarding_forms/migration.sql");
  const helper = read("src/lib/onboarding.ts");
  const routing = read("src/lib/onboarding-routing.ts");
  const route = read("src/app/api/onboarding/marketing-b2c-form/[taskId]/route.ts");
  const form = read("src/components/onboarding/marketing-b2c-onboarding-form.tsx");
  const panel = read("src/components/onboarding/client-onboarding-panel.tsx");
  const taskListRoute = read("src/app/api/tasks/route.ts");
  const taskDetailRoute = read("src/app/api/tasks/[id]/route.ts");
  const kanbanBoard = read("src/components/projects/kanban-board.tsx");
  const projectPage = read("src/app/(dashboard)/projects/[id]/page.tsx");
  const translations = read("src/lib/i18n/translations.ts");
  const wizardRoute = read("src/app/api/onboarding/client-wizard/route.ts");
  const companyDialog = read("src/components/dashboard/create-company-dialog.tsx");

  assert.match(schema, /model MarketingB2COnboardingForm/);
  assert.match(schema, /marketing_b2c_onboarding_form\s+MarketingB2COnboardingForm\?/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "MarketingB2COnboardingForm"/);
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS "MarketingB2COnboardingForm_task_id_key"/);
  assert.match(repairMigration, /DISTINCT ON \(item\."onboarding_id"\)/);
  assert.match(repairMigration, /gen_random_uuid\(\)::text/);
  assert.match(repairMigration, /MarketingB2COnboardingForm/);
  assert.match(repairMigration, /NOT \(/);

  assert.match(helper, /MARKETING_B2C_FORM_SERVICES/);
  assert.match(helper, /MARKETING_B2C_FORM_SERVICES[\s\S]*"Vesti"/);
  assert.match(helper, /isMarketingB2CFormService[\s\S]*key === "vesti"/);
  assert.match(helper, /isMarketingB2CFormService/);
  assert.match(routing, /routeForResponsibleDepartment/);
  assert.match(helper, /resolveMarketingB2COnboardingProjectId/);
  assert.match(helper, /Marketing B2C Onboarding/);
  assert.match(helper, /const projectName = input\.companyName\.trim\(\) \|\| "Marketing B2C Onboarding"/);
  assert.match(helper, /legacyProjectName/);
  assert.match(helper, /db\.project\.update[\s\S]*name: projectName/);
  assert.match(helper, /b2cFormServices/);
  assert.match(helper, /marketingB2COnboardingForm\.create/);
  assert.match(helper, /async function ensureMarketingB2COnboardingForm/);
  assert.match(helper, /servicesRevealB2C/);
  assert.match(helper, /b2cFormRepair/);
  assert.match(helper, /onboarding_enabled: true/);
  assert.match(helper, /const formServiceAlreadyAssigned\s*=\s*b2bFormServiceKeys\.has\(serviceMapKey\)\s*\|\|\s*b2cFormServiceKeys\.has\(serviceMapKey\)/);
  assert.match(helper, /const dedicatedServiceTask = shouldCreateDedicatedServiceTask\(service\)/);
  assert.match(helper, /formServiceAlreadyAssigned && !dedicatedServiceTask/);
  assert.match(helper, /marketingOnboardingProjectId = b2cProjectId/);
  assert.match(helper, /const dedicatedWorkflowRoute = marketingFormRoute \?\? "marketing_b2b"/);
  assert.match(helper, /queueProjectId\(dedicatedWorkflowRoute\)/);
  assert.match(
    helper,
    /const b2cMeetingTask = await createTask\(\{[\s\S]*?project_id: b2cProjectId,[\s\S]*?title: "Onboarding: schedule Marketing B2C kickoff meeting"/,
  );
  assert.match(helper, /input\.responsibleDepartmentId[\s\S]*tx\.department\.findFirst/);
  assert.match(helper, /space:\s*\{\s*select:\s*\{\s*id:\s*true,\s*name:\s*true\s*\}\s*\}/);
  assert.match(helper, /sourceProjectSpaceName = sourceProject\?\.space\?\.name/);
  assert.match(helper, /responsibleDepartmentName\s*=\s*input\.responsibleDepartmentName\s*\?\?\s*responsibleDepartment\?\.name\s*\?\?\s*sourceProjectSpaceName/);
  assert.match(
    helper,
    /marketingFormRouteForOnboarding\([\s\S]*company\.service_type,[\s\S]*responsibleDepartmentName/,
  );
  assert.match(helper, /marketingFormRoute === "marketing_b2c"/);
  assert.match(helper, /async function persistedMarketingFormRoute/);
  assert.match(helper, /if \(b2cForm\) return "marketing_b2c"/);
  assert.match(helper, /await persistedMarketingFormRoute\(tx, input\.onboardingId\)/);
  assert.match(routing, /key\.includes\("content calendar"\)/);
  assert.match(routing, /key\.includes\("campanhas"\)/);
  assert.match(helper, /key === "tiktok ads"/);
  assert.match(helper, /key === "pinterest ads"/);
  assert.match(helper, /key\.startsWith\("up motion "\)/);
  assert.match(helper, /key === "implantacao ia"/);
  assert.match(helper, /key === "social media"/);

  assert.match(route, /marketingB2COnboardingForm\.findUnique/);
  assert.match(route, /async function ensureBackfilledB2CForm/);
  assert.match(route, /bindExistingB2CFormToTask/);
  assert.match(route, /type RouteContext = \{ params: Promise<\{ taskId: string \}> \}/);
  assert.match(route, /const \{ taskId \} = await params/);
  assert.match(route, /canContributeToProject/);
  assert.match(route, /marketingB2COnboardingForm\.update/);
  assert.match(route, /task\.update[\s\S]*status: "done"/);
  assert.match(route, /onboardingChecklistItem\.update[\s\S]*status: "complete"/);
  assert.match(route, /recomputeOnboardingProgress/);
  assert.match(route, /withErrorReporting\("api:onboarding\/marketing-b2c-form:PATCH"/);

  assert.match(form, /MarketingB2COnboardingForm/);
  assert.match(form, /scheduleFieldSave/);
  assert.match(form, /valuesRef\.current/);
  assert.match(form, /finalizeAction/);
  assert.match(form, /loadError/);
  assert.match(form, /common\.retry/);
  assert.match(form, /brandName/);
  assert.match(form, /metaPixelStatus/);
  assert.match(form, /ecommercePlatform/);

  assert.match(panel, /marketing_b2c_form/);
  assert.match(panel, /marketingB2CForm\.centralHint/);
  assert.match(panel, /upflow:sidebar-refresh/);
  assert.match(taskListRoute, /marketing_b2c_onboarding_form/);
  assert.match(taskDetailRoute, /marketing_b2c_onboarding_form/);
  assert.match(kanbanBoard, /MarketingB2COnboardingForm/);
  assert.match(projectPage, /MarketingB2COnboardingForm/);
  assert.doesNotMatch(projectPage, /ClientOnboardingPanel/);

  assert.match(wizardRoute, /responsible_department_id/);
  assert.match(wizardRoute, /responsibleDepartmentName/);
  assert.match(companyDialog, /companyDialog\.service\.nuvemshop/);
  assert.match(companyDialog, /companyDialog\.service\.vesti/);
  assert.match(companyDialog, /companyDialog\.service\.googleShopping/);
  assert.match(companyDialog, /companyDialog\.service\.tiktokAds/);
  assert.match(companyDialog, /companyDialog\.service\.upMotionV1/);
  assert.match(companyDialog, /companyDialog\.service\.aiImplementation/);

  assert.match(translations, /marketingB2CForm\.field\.brandName/);
  assert.match(translations, /marketingB2CForm\.field\.metaPixelStatus/);
  assert.match(translations, /marketingB2CForm\.finalizeAction/);
  assert.match(translations, /companyDialog\.service\.influencersUgc/);
});
