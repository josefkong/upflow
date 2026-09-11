import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

function read(path: string) {
  return readFileSync(join(ROOT, path), "utf8");
}

test("standalone client creation remains separate from onboarding", () => {
  const clientsPage = read("src/app/(dashboard)/clients/page.tsx");
  const createDialog = read("src/components/dashboard/create-company-dialog.tsx");
  const companiesRoute = read("src/app/api/companies/route.ts");
  const companiesAccessRoute = read("src/app/api/companies/access/route.ts");
  const onboardingPanel = read("src/components/onboarding/client-onboarding-panel.tsx");
  const deferredDialog = read("src/components/onboarding/start-client-onboarding-dialog.tsx");
  const wizardRoute = read("src/app/api/onboarding/client-wizard/route.ts");
  const teamPage = read("src/app/(dashboard)/team/page.tsx");
  const translations = read("src/lib/i18n/translations.ts");

  assert.match(clientsPage, /\/api\/companies\/access/);
  assert.match(clientsPage, /ClientCreationActions/);
  assert.match(clientsPage, /mode=\{creationMode \?\? "company"\}/);
  assert.match(clientsPage, /useAppUser/);
  assert.match(clientsPage, /resolveCompanyCreationAccess/);
  assert.doesNotMatch(clientsPage, /creationAccess\?\.canCreateStandalone \?\?/);
  assert.match(clientsPage, /contextCreationAccess\.canCreateStandalone/);
  assert.match(clientsPage, /create-standalone-client/);
  assert.match(clientsPage, /create-client-onboarding/);
  assert.match(companiesAccessRoute, /resolveCompanyCreationAccess/);
  assert.match(companiesAccessRoute, /can_create_standalone/);
  assert.match(companiesAccessRoute, /can_create_complete_client/);
  assert.match(companiesAccessRoute, /can_view_financials/);
  assert.match(teamPage, /router\.refresh\(\)/);
  assert.match(createDialog, /start_onboarding: false/);
  assert.match(createDialog, /createdWithoutOnboarding/);
  assert.match(createDialog, /fieldClass =\s*\n\s*"[^"]*pl-16 pr-4/);
  assert.match(createDialog, /onboardingInputClass =\s*\n\s*"[^"]*pl-16 pr-14/);
  assert.match(companiesRoute, /const startOnboarding = parsed\.data\.start_onboarding \?\? false/);
  assert.match(companiesRoute, /canCreateStandalone/);
  assert.match(companiesRoute, /forceCreatorAsOwner/);
  assert.match(companiesRoute, /\(startOnboarding \|\| completeRegistration\)/);
  assert.match(companiesRoute, /canStartOnboarding/);
  assert.match(onboardingPanel, /\/api\/companies\/access/);
  assert.match(onboardingPanel, /canStartClientOnboarding/);
  assert.match(onboardingPanel, /companyId && !projectId/);
  assert.match(deferredDialog, /company_id: companyId/);
  assert.doesNotMatch(deferredDialog, /contact_name:/);
  assert.match(wizardRoute, /resolveCompanyCreationAccess/);
  assert.match(translations, /"clients\.createStandalone":/);
  assert.match(translations, /"clients\.createStandaloneHint":/);
  assert.match(translations, /"onboardingWorkflow\.deferredEmptyBody":/);
});
