import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_LOCALE,
  APP_TIME_ZONE,
  appDateKey,
  appTimeInputValue,
  formatDate,
  formatIsoDateInput,
  formatLongDate,
  formatTime,
  mergeAppDateAndTime,
  maskBrazilianDateInput,
  parseAppDate,
  parseBrazilianDateInput,
} from "../../src/lib/utils";

const SAMPLE_UTC = "2026-05-28T12:30:00.000Z";

test("shared date helpers use Brazilian locale and Sao Paulo timezone", () => {
  assert.equal(APP_LOCALE, "pt-BR");
  assert.equal(APP_TIME_ZONE, "America/Sao_Paulo");
  assert.equal(formatDate(SAMPLE_UTC), "28/05/2026");
  assert.equal(formatTime(SAMPLE_UTC), "09:30");
});

test("long dates render with Brazilian month and weekday names", () => {
  assert.equal(formatLongDate(SAMPLE_UTC), "Quinta-feira, 28 de Maio");
});

test("Brazilian date inputs mask and parse dd/mm/aaaa values", () => {
  assert.equal(maskBrazilianDateInput("28052026"), "28/05/2026");
  assert.equal(formatIsoDateInput("2026-05-28"), "28/05/2026");
  assert.equal(parseBrazilianDateInput("28/05/2026"), "2026-05-28");
  assert.equal(parseBrazilianDateInput("31/02/2026"), "invalid");
});

test("date-only due dates stay on the selected Brazilian calendar day", () => {
  const parsed = parseAppDate("2026-05-28");

  if (parsed === "invalid") assert.fail("Expected valid Brazilian calendar date");
  assert.equal(formatDate(parsed), "28/05/2026");
  assert.equal(appDateKey(parsed), "2026-05-28");
});

test("calendar event helpers preserve Sao Paulo date and time", () => {
  const eventStart = mergeAppDateAndTime(new Date("2026-05-28T12:00:00.000Z"), "09:30");

  assert.equal(formatDate(eventStart), "28/05/2026");
  assert.equal(formatTime(eventStart), "09:30");
  assert.equal(appTimeInputValue(eventStart), "09:30");
  assert.equal(appDateKey(eventStart), "2026-05-28");
});
