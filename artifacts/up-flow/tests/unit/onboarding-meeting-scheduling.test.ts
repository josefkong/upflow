import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  onboardingMeetingName,
  onboardingMeetingTitle,
} from "../../src/lib/onboarding-meeting-copy";

const ROOT = join(__dirname, "..", "..");

function source(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

test("shared onboarding meeting names use canonical title casing", () => {
  assert.equal(
    onboardingMeetingTitle({
      companyName: "Vionix",
      automationKey: "shared_onboarding:scheduling:01:support-finance-admin",
      department: "Suporte Técnico",
    }),
    "Vionix - Suporte Onboarding Meeting",
  );
  assert.equal(
    onboardingMeetingName({
      automationKey: "shared_onboarding:scheduling:02:performance",
      department: "Marketing B2B",
    }),
    "Performance Onboarding Meeting",
  );
  assert.equal(
    onboardingMeetingName({ department: "Criativo e design" }),
    "Criativo e Design Onboarding Meeting",
  );
});

test("only the responsible department can confirm an onboarding schedule", () => {
  const onboarding = source("src/lib/onboarding.ts");
  const calendarRoute = source("src/app/api/calendar/events/route.ts");
  const taskRouting = source("src/lib/onboarding-task-routing.ts");
  const scheduleDialog = source(
    "src/components/dashboard/schedule-meeting-dialog.tsx",
  );

  assert.match(onboarding, /canScheduleChecklistItem/);
  assert.match(
    onboarding,
    /isSharedOnboardingSchedulingKey\(item\.automation_key\)[\s\S]*access\.canScheduleChecklistItem\(item\)/,
  );
  assert.match(
    calendarRoute,
    /onboardingAccess\?\.canScheduleChecklistItem\(linkedSchedulingItem\)/,
  );
  assert.match(
    calendarRoute,
    /if \(isLinkedSchedulingItem && !canCreateLinkedSchedule\)/,
  );
  assert.doesNotMatch(
    calendarRoute,
    /canCreateLinkedSchedule[\s\S]{0,500}linkedTask\.project\.owner_id === auth\.prismaUser\.id/,
  );
  assert.match(
    calendarRoute,
    /onboardingMeetingTitle\(\{[\s\S]*companyName: linkedSchedulingItem\.onboarding\.company\.name/,
  );
  assert.match(
    calendarRoute,
    /onboardingChecklistItem\.update[\s\S]*onboardingMeeting\.updateMany[\s\S]*recomputeOnboardingProgress/,
  );
  assert.match(
    scheduleDialog,
    /readOnly=\{Boolean\(defaultOnboardingChecklistItemId\)\}/,
  );
  assert.match(
    taskRouting,
    /task\.onboarding_link\?\.automation_key ===[\s\S]*SHARED_ONBOARDING_TASK_AUTOMATION_KEY[\s\S]*return null/,
  );
});
