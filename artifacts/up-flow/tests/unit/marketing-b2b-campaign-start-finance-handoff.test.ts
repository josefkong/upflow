import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("Marketing B2B campaign starts create one Finance handoff for Vesti and UP Zero", () => {
  const onboarding = read("src/lib/onboarding.ts");
  const routing = read("src/lib/onboarding-routing.ts");
  const taskLinks = read("src/lib/task-onboarding-links.ts");
  const taskRouting = read("src/lib/onboarding-task-routing.ts");
  const taskRoute = read("src/app/api/tasks/[id]/route.ts");
  const taskCustomFieldsRoute = read("src/app/api/tasks/[id]/custom-fields/route.ts");
  const reorderRoute = read("src/app/api/projects/[id]/reorder-tasks/route.ts");
  const migration = read(
    "prisma/migrations/20260723120000_add_marketing_b2b_campaign_handoff_tasks/migration.sql",
  );

  assert.match(onboarding, /VESTI_CAMPAIGN_STARTED_AUTOMATION_KEY\s*=\s*"marketing_b2b_vesti_campaign_start"/);
  assert.match(onboarding, /UP_ZERO_CAMPAIGN_STARTED_AUTOMATION_KEY\s*=\s*"marketing_b2b_up_zero_campaign_start"/);
  assert.match(onboarding, /title: CAMPAIGN_STARTED_TASK_TITLE,[\s\S]*automationKey: VESTI_CAMPAIGN_STARTED_AUTOMATION_KEY/);
  assert.match(onboarding, /title: CAMPAIGN_STARTED_TASK_TITLE,[\s\S]*automationKey: UP_ZERO_CAMPAIGN_STARTED_AUTOMATION_KEY/);
  assert.match(onboarding, /route === "marketing_b2c"[\s\S]*!step\.marketingB2BOnly/);
  assert.match(onboarding, /async function persistedMarketingFormRoute/);
  assert.match(onboarding, /if \(b2cForm\) return "marketing_b2c"/);
  assert.match(onboarding, /await persistedMarketingFormRoute\(tx, input\.onboardingId\)/);
  assert.match(onboarding, /automation_key: step\.automationKey \?\? null/);

  assert.match(onboarding, /function campaignStartedFinanceHandoffFor/);
  assert.match(onboarding, /finance_campaign_started:vesti/);
  assert.match(onboarding, /finance_campaign_started:up_zero/);
  assert.match(onboarding, /input\.status === "done" && completedAt/);
  assert.match(onboarding, /createFinanceCampaignStartedHandoff/);
  assert.match(onboarding, /resolveFinanceOnboardingProjectId/);
  assert.match(onboarding, /ownerKeyForDepartmentLabel\(mapping\.service\) === "finance"/);
  assert.match(onboarding, /required: false/);
  assert.match(onboarding, /formatDate\(input\.startedAt\)/);
  assert.match(onboarding, /PrismaClientKnownRequestError[\s\S]*error\.code === "P2002"/);
  assert.match(onboarding, /transitionNotificationTargets\.push\(campaignHandoff\)/);

  assert.match(routing, /FINANCE_CAMPAIGN_STARTED_AUTOMATION_KEY_PREFIX/);
  assert.match(taskLinks, /isFinanceCampaignStartedAutomationKey\(link\.automation_key\)/);
  assert.match(taskRouting, /isFinanceCampaignStartedAutomationKey\(task\.onboarding_link\?\.automation_key\)/);
  assert.match(taskRoute, /status !== oldTask\.status \|\| status === "done"/);
  assert.match(taskCustomFieldsRoute, /taskStatusChanged \|\| body\.task_status === "done"/);
  assert.match(reorderRoute, /srcColumn !== dstColumn \|\| dstColumn === "done"/);

  assert.match(migration, /marketing_b2b_vesti_campaign_start/);
  assert.match(migration, /marketing_b2b_up_zero_campaign_start/);
  assert.match(migration, /onboarding\."status" <> 'onboarding_complete'/);
  assert.match(migration, /MarketingB2BOnboardingForm/);
  assert.doesNotMatch(migration, /finance_campaign_started:/);
});
