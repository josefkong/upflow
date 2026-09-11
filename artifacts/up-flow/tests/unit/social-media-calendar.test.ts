import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  canAdvanceSocialMediaApproval,
  canAdvanceSocialMediaProduction,
  canSetSocialMediaPublishingStatus,
  isMoodboardReady,
  isSocialMediaCalendarListName,
  isSocialMediaPublicationOverdue,
  moodboardStatusForTaskStatus,
  moodboardTaskStatusFor,
  parseSocialMediaMonth,
  scheduleSocialMediaDates,
  socialMediaMonthKey,
} from "../../src/lib/social-media";
import { appDateTimeToUtc } from "../../src/lib/utils";

const ROOT = join(__dirname, "..", "..");

function read(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

test("Social Media planning dates honor the month, target, and moodboard lifecycle", () => {
  const month = parseSocialMediaMonth("2026-07");
  assert.notEqual(month, "invalid");
  if (month === "invalid") return;

  const dates = scheduleSocialMediaDates(month, 12, 3);
  assert.equal(dates.length, 12);
  assert.ok(dates.every((date) => socialMediaMonthKey(date) === "2026-07"));
  assert.equal(moodboardStatusForTaskStatus("todo"), "Not Started");
  assert.equal(moodboardStatusForTaskStatus("in_progress"), "In Progress");
  assert.equal(moodboardStatusForTaskStatus("done"), "Ready");
  assert.equal(moodboardStatusForTaskStatus("done", "Approved"), "Approved");
  assert.equal(moodboardStatusForTaskStatus("in_progress", "Awaiting Approval"), "Awaiting Approval");
  assert.equal(moodboardTaskStatusFor("Awaiting Approval"), "in_progress");
  assert.equal(moodboardTaskStatusFor("Approved"), "done");
  assert.equal(isMoodboardReady("Ready"), true);
  assert.equal(isMoodboardReady("In Progress"), false);
  const dueToday = appDateTimeToUtc(2026, 7, 20, 12, 0);
  assert.equal(isSocialMediaPublicationOverdue(dueToday, appDateTimeToUtc(2026, 7, 20, 23, 0)), false);
  assert.equal(isSocialMediaPublicationOverdue(dueToday, appDateTimeToUtc(2026, 7, 21, 0, 1)), true);
  assert.equal(canAdvanceSocialMediaApproval("Approved", "Awaiting Approval"), true);
  assert.equal(canAdvanceSocialMediaApproval("Approved", "In Production"), false);
  assert.equal(canAdvanceSocialMediaProduction("In Production", "Not Requested", "Ready"), true);
  assert.equal(canAdvanceSocialMediaProduction("Approved", "In Production", "Ready"), false);
  assert.equal(canAdvanceSocialMediaProduction("In Production", "Not Requested", "In Progress"), false);
  assert.equal(canAdvanceSocialMediaProduction("Scheduled", "Approved", "Ready", "Awaiting Approval"), false);
  assert.equal(canSetSocialMediaPublishingStatus("Published", "Approved", "Approved"), true);
  assert.equal(canSetSocialMediaPublishingStatus("Published", "Awaiting Approval", "Approved"), false);
});

test("Social Media calendar detection supports existing list and space names", () => {
  assert.equal(isSocialMediaCalendarListName("Social Media"), true);
  assert.equal(isSocialMediaCalendarListName("Social Media Monthly Content Plan"), true);
  assert.equal(isSocialMediaCalendarListName("Mídias Sociais"), true);
  assert.equal(isSocialMediaCalendarListName("Design Queue"), false);
});

test("Social Media calendar is a real Creative & Design list with a secure planning surface", () => {
  const schema = read("prisma/schema.prisma");
  const component = read("src/components/projects/social-media-calendar.tsx");
  const projectPage = read("src/app/(dashboard)/projects/[id]/page.tsx");
  const planRoute = read("src/app/api/projects/[id]/social-media/route.ts");
  const planUpdateRoute = read("src/app/api/social-media/plans/[id]/route.ts");
  const postRoute = read("src/app/api/social-media/plans/[id]/posts/route.ts");
  const customFieldsRoute = read("src/app/api/tasks/[id]/custom-fields/route.ts");
  const taskRoute = read("src/app/api/tasks/[id]/route.ts");
  const overdueCronRoute = read("src/app/api/cron/due-soon/route.ts");
  const notifications = read("src/lib/social-media-notifications.ts");

  assert.match(schema, /model SocialMediaContentPlan/);
  assert.match(schema, /social_media_plan_id/);
  assert.match(schema, /@@unique\(\[project_id, company_id, month\]\)/);
  assert.match(projectPage, /isSocialMediaProject/);
  assert.match(projectPage, /isSocialMediaCalendarListName/);
  assert.match(projectPage, /SocialMediaCalendar/);
  assert.match(component, /socialCalendar\.operationalAlerts/);
  assert.match(component, /socialCalendar\.alert\.clientsWithoutPlan/);
  assert.match(component, /socialCalendar\.alert\.additionalItems/);
  assert.match(component, /content_tasks\.map/);
  assert.match(component, /hydrateSocialMediaTask/);
  assert.match(component, /hydrateMoodboardTask/);
  assert.match(component, /Promise\.all\(\[load\(true\), Promise\.resolve\(onRefresh\(\)\)\]\)/);
  assert.match(component, /social_manager_ids/);
  assert.match(component, /designer_ids/);
  assert.match(component, /awaitingApproval: planPosts\.filter/);
  assert.match(component, /APP_TIME_ZONE/);
  assert.match(component, /clientPostingGap/);
  assert.match(component, /Moodboard: \{localizeSocialStatus\(plan\.moodboard_status, t\)\}/);
  assert.match(component, /Publishing/);
  assert.match(component, /Moodboard/);
  assert.match(planRoute, /canContributeToProject/);
  assert.match(planRoute, /scheduleSocialMediaDates/);
  assert.match(planRoute, /ensureSocialMediaCustomFields/);
  assert.match(planUpdateRoute, /moodboardTaskStatusFor/);
  assert.match(postRoute, /canContributeToProject/);
  assert.match(customFieldsRoute, /canSetSocialMediaPublishingStatus/);
  assert.match(customFieldsRoute, /SOCIAL_MEDIA_PUBLISHED_URL_REQUIRED_ERROR/);
  assert.match(customFieldsRoute, /notifySocialMediaWorkflow/);
  assert.match(taskRoute, /scheduledPublishingDate/);
  assert.match(taskRoute, /notifySocialMediaWorkflow/);
  assert.match(overdueCronRoute, /processOverdueSocialMediaPosts/);
  assert.match(overdueCronRoute, /social_media_post_overdue/);
  assert.match(notifications, /Creative & Design/);
  assert.match(notifications, /notification_key/);
});

test("Social Media has a checked-in database migration", () => {
  const migrationsRoot = join(ROOT, "prisma", "migrations");
  const migrationPaths = readdirSync(migrationsRoot)
    .map((name) => join(migrationsRoot, name, "migration.sql"))
    .filter((path) => existsSync(path));
  const migration = migrationPaths
    .map((path) => readFileSync(path, "utf8"))
    .find((source) => source.includes("SocialMediaContentPlan"));

  assert.ok(migration, "expected a SocialMediaContentPlan migration");
  assert.match(migration, /social_media_plan_id/);
});
