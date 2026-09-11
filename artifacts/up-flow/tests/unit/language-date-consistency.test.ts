import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { formatDate, formatLongDate } from "../../src/lib/utils";

const ROOT = join(__dirname, "..", "..");

function source(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

test("shared date formatters honor the selected English and Portuguese locales", () => {
  const date = "2026-08-18T12:00:00.000Z";

  assert.equal(formatDate(date, "en-US"), "08/18/2026");
  assert.equal(formatDate(date, "pt-BR"), "18/08/2026");
  assert.equal(formatLongDate(date, "en-US"), "Tuesday, August 18");
  assert.equal(formatLongDate(date, "pt-BR"), "Terça-feira, 18 de Agosto");
});

test("language changes update the document locale before React rerenders", () => {
  const provider = source("src/components/language-provider.tsx");

  assert.match(provider, /applyDocumentLanguage\(next\);\s*setLanguageState\(next\);/);
  assert.match(provider, /applyDocumentLanguage\(stored\);\s*setLanguageState\(stored\);/);
});

test("calendar surfaces pass the selected language into textual date labels", () => {
  const calendar = source("src/app/(dashboard)/calendar/page.tsx");
  const meetingRoom = source("src/app/(dashboard)/sala-de-reuniao/page.tsx");
  const socialMedia = source("src/components/projects/social-media-calendar.tsx");

  assert.match(calendar, /formatLongDate\(selected, language\)/);
  assert.match(calendar, /eventTime\(event, language\)/);
  assert.match(meetingRoom, /formatLongDate\(selected, language\)/);
  assert.match(meetingRoom, /eventRange\(event, language\)/);
  assert.match(socialMedia, /monthTitle\(calendarMonth, language\)/);
  assert.doesNotMatch(socialMedia, /Intl\.DateTimeFormat\(undefined/);
});

test("meeting room copy does not leak the Portuguese internal room identifier into English", () => {
  const translations = source("src/lib/i18n/translations.ts");

  assert.match(translations, /"meetingRoom\.calendarHint": "Bookings tagged to Meeting Room\."/);
  assert.match(translations, /"calendar\.roomBookingDetail": "Meeting Room reserved"/);
  assert.doesNotMatch(translations, /"(?:meetingRoom\.calendarHint|calendar\.roomBookingDetail)": "[^"]*Sala de Reuniao[^"]*"/);
});

test("dashboard and workflow surfaces do not rely on a stale document locale", () => {
  const sources = [
    "src/components/onboarding/client-onboarding-panel.tsx",
    "src/components/onboarding/finance-onboarding-form.tsx",
    "src/components/onboarding/marketing-b2c-onboarding-form.tsx",
    "src/components/projects/project-directory.tsx",
    "src/components/spaces/space-dashboard-parts.tsx",
    "src/components/spaces/space-dashboard-drawer.tsx",
    "src/components/dashboard/agency-operations-panel.tsx",
  ].map(source).join("\n");

  assert.doesNotMatch(sources, /formatDate\([^,\n\)]*\)/);
  assert.doesNotMatch(sources, /formatDateTime\([^,\n\)]*\)/);
});
