import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");
const read = (relativePath: string) => readFileSync(join(ROOT, relativePath), "utf8");

test("UP Zero onboarding is an idempotent Commercial to Technical Support to Marketing B2B gate", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20260715150000_up_zero_sequential_onboarding/migration.sql");
  const repairMigration = read(
    "prisma/migrations/20260715170000_repair_up_zero_support_workflow/migration.sql",
  );
  const onboarding = read("src/lib/onboarding.ts");
  const taskRoute = read("src/app/api/tasks/[id]/route.ts");
  const taskLinks = read("src/lib/task-onboarding-links.ts");
  const taskRouting = read("src/lib/onboarding-task-routing.ts");
  const reorderRoute = read("src/app/api/projects/[id]/reorder-tasks/route.ts");
  const supportFormRoute = read("src/app/api/onboarding/support-form/[taskId]/route.ts");
  const formRoute = read("src/app/api/onboarding/marketing-b2b-form/[taskId]/route.ts");
  const onboardingRoute = read("src/app/api/onboarding/[id]/route.ts");
  const form = read("src/components/onboarding/marketing-b2b-onboarding-form.tsx");
  const queue = read("src/app/(dashboard)/onboarding/page.tsx");

  assert.match(schema, /sequence_status\s+String\s+@default\("commercial_pending"\)/);
  assert.match(schema, /commercial_completed_at\s+DateTime\?/);
  assert.match(schema, /technical_support_started_at\s+DateTime\?/);
  assert.match(schema, /up_zero_configuration_completed_at\s+DateTime\?/);
  assert.match(schema, /marketing_b2b_released_at\s+DateTime\?/);
  assert.match(schema, /@@unique\(\[onboarding_id, automation_key\]\)/);
  assert.match(migration, /OnboardingChecklistItem_onboarding_id_automation_key_key/);
  assert.match(repairMigration, /SET "project_id" = task\."project_id"/);
  assert.match(repairMigration, /DISTINCT ON \(item\."onboarding_id"\)/);
  assert.match(repairMigration, /up_zero_website_configuration/);

  assert.match(onboarding, /UP_ZERO_CONFIGURATION_AUTOMATION_KEY\s*=\s*"up_zero_website_configuration"/);
  assert.match(onboarding, /UP_ZERO_CONFIGURATION_TASK_TITLE = "Configure UP Zero website"/);
  assert.match(onboarding, /isUpZeroConfigurationChecklistItem/);
  assert.match(onboarding, /if \(!hasUpZeroService\(onboarding\.contracted_services\)\)/);
  assert.match(onboarding, /const canonicalProjectId = form\.task\.project_id \|\| form\.project_id/);
  assert.match(
    onboarding,
    /marketingContext\.taskIds\.filter\(\(taskId\) => taskId !== technicalTaskId\)/,
  );
  assert.match(onboarding, /Waiting for UP Zero website configuration by Technical Support\./);
  assert.match(onboarding, /ownerKeyForDepartmentLabel\(mapping\.service\) === "technical_support"/);
  assert.match(onboarding, /onboardingChecklistItem\.upsert/);
  assert.match(onboarding, /taskDependency\.upsert/);
  assert.match(onboarding, /releaseUpZeroMarketingB2B/);
  assert.match(onboarding, /commercial_onboarding_completed/);
  assert.match(onboarding, /up_zero_technical_support_activated/);
  assert.match(onboarding, /up_zero_configuration_completed/);
  assert.match(onboarding, /marketing_b2b_released/);
  assert.match(onboarding, /marketing_b2b_started/);

  assert.match(taskRoute, /getOnboardingTaskStartBlocker/);
  assert.match(taskLinks, /automation_key: true/);
  assert.match(taskRouting, /UP_ZERO_CONFIGURATION_AUTOMATION_KEY/);
  assert.match(taskRouting, /return false/);
  assert.match(reorderRoute, /getOnboardingTaskStartBlocker/);
  assert.match(supportFormRoute, /canContributeToProject/);
  assert.match(supportFormRoute, /isUpZeroConfigurationChecklistItem/);
  assert.match(formRoute, /upZeroGate\?\.blocked/);
  assert.match(formRoute, /status: 409/);
  assert.match(onboardingRoute, /marketing_b2b_dependency_override/);
  assert.match(onboardingRoute, /overrideUpZeroMarketingB2BGate/);
  assert.match(form, /data-testid="up-zero-dependency-warning"/);
  assert.match(form, /t\("marketingB2B\.adminOverrideReason"\)/);
  assert.match(queue, /function OnboardingClientCard/);
  assert.match(queue, /const owner =/);
  assert.match(queue, /onboardingQueue\.cardOwner/);
  assert.match(queue, /upZeroTechnicalItem\(item\)/);
});
