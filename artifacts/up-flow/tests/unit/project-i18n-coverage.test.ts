import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

test("dashboard API copy is localized before it reaches the interface", () => {
  const panel = read("src/components/dashboard/agency-operations-panel.tsx");
  const dashboard = read("src/app/(dashboard)/page.tsx");
  const utilities = read("src/components/dashboard/dashboard-utils.ts");
  const translations = read("src/lib/i18n/translations.ts");

  assert.match(panel, /localizeAgencyRiskSignal\(signal, t\)/);
  assert.match(dashboard, /localizeDashboardReason\(reason, t\)/);
  assert.match(dashboard, /dashboard\.creativeQueueSourceNote/);
  assert.match(utilities, /dashboard\.risk\.overdueDeliverables/);
  assert.match(translations, /"dashboard\.risk\.overdueDeliverables": "Entregas Atrasadas"/);
  assert.match(translations, /"dashboard\.reason\.noOwner": "Sem responsável"/);
});

test("large operational surfaces use the active language catalogue", () => {
  const eventEditor = read("src/components/calendar/event-editor-sheet.tsx");
  const socialCalendar = read("src/components/projects/social-media-calendar.tsx");
  const clickupImport = read("src/app/(dashboard)/admin/imports/clickup/page.tsx");

  assert.match(eventEditor, /calendarEditor\.eventInformation/);
  assert.doesNotMatch(eventEditor, /title="Event information"/);
  assert.doesNotMatch(eventEditor, />Save changes</);

  assert.match(socialCalendar, /socialCalendar\.operationalAlerts/);
  assert.match(socialCalendar, /localizeSocialStatus\(option, t\)/);
  assert.doesNotMatch(socialCalendar, />Operational alerts</);
  assert.doesNotMatch(socialCalendar, />Clients without a content plan</);

  assert.match(clickupImport, /clickupImport\.title/);
  assert.doesNotMatch(clickupImport, />ClickUp migration</);
  assert.doesNotMatch(clickupImport, />Migration job</);
});

test("dynamic notifications and generated onboarding links honor Portuguese", () => {
  const header = read("src/components/layout/header.tsx");
  const onboarding = read("src/components/onboarding/client-onboarding-panel.tsx");
  const meetingCopy = read("src/lib/onboarding-meeting-copy.ts");

  assert.match(header, /Alguém/);
  assert.match(header, /produção criativa/);
  assert.doesNotMatch(header, /Alguem|producao criativa|Calendario/);
  assert.match(onboarding, /onboardingMeetingTitle/);
  assert.match(meetingCopy, /Onboarding Meeting/);
  assert.match(onboarding, /onboardingWorkflow\.meetingDescription/);
});
