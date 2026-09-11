import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcastNotification } from "@/lib/supabase-server";
import {
  processPendingGoogleCalendarSyncJobs,
  syncSharedGoogleCalendarAgendas,
} from "@/lib/google-calendar";
import { logError } from "@/lib/log-error";
import { withErrorReporting } from "@/lib/with-error-reporting";
import {
  isSocialMediaPublicationOverdue,
  SOCIAL_MEDIA_FIELD_NAMES,
} from "@/lib/social-media";
import { notifySocialMediaWorkflow } from "@/lib/social-media-notifications";
import { processOverdueEquipmentReturns } from "@/lib/equipment-control";

export const dynamic = "force-dynamic";

// How far in the future "due soon" reaches. We use a single 24-hour window
// (see task #60). Tasks whose due_date falls between now and now+24h get one
// `due_soon` notification per (task, due_date) pair, deduped against any
// existing unread `due_soon` for that same task+due_date.
const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // If no secret is configured, allow only when running on localhost (dev).
  if (!secret) {
    const host = req.headers.get("host") ?? "";
    return host.startsWith("localhost") || host.startsWith("127.0.0.1");
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  // Some schedulers send the secret as a custom header instead.
  if (req.headers.get("x-cron-secret") === secret) return true;
  return false;
}

/**
 * Turn genuinely past calendar-day publication commitments into a persisted
 * Overdue status. This runs in the scheduled job instead of a calendar GET,
 * so read-only visitors never cause a write or notification.
 */
async function processOverdueSocialMediaPosts(now: Date) {
  const posts = await prisma.task.findMany({
    where: {
      social_media_plan_id: { not: null },
      due_date: { not: null, lt: now },
    },
    select: {
      id: true,
      title: true,
      project_id: true,
      social_media_plan_id: true,
      assignee_id: true,
      due_date: true,
      custom_field_values: {
        where: {
          definition: { name: SOCIAL_MEDIA_FIELD_NAMES.publishingStatus },
        },
        select: { value: true },
      },
    },
  });
  if (posts.length === 0) return { transitioned: 0, notifications: 0 };

  const projectIds = Array.from(new Set(posts.map((post) => post.project_id)));
  const fields = await prisma.customFieldDefinition.findMany({
    where: {
      project_id: { in: projectIds },
      name: SOCIAL_MEDIA_FIELD_NAMES.publishingStatus,
    },
    select: { id: true, project_id: true },
  });
  const fieldByProjectId = new Map(
    fields.map((field) => [field.project_id, field.id]),
  );

  let transitioned = 0;
  let notifications = 0;
  for (const post of posts) {
    if (
      !post.social_media_plan_id ||
      !post.due_date ||
      !isSocialMediaPublicationOverdue(post.due_date, now)
    ) {
      continue;
    }
    const status = post.custom_field_values[0]?.value;
    if (
      status === "Published" ||
      status === "Cancelled" ||
      status === "Overdue"
    )
      continue;
    const fieldId = fieldByProjectId.get(post.project_id);
    if (!fieldId) continue;

    await prisma.customFieldValue.upsert({
      where: {
        task_id_definition_id: { task_id: post.id, definition_id: fieldId },
      },
      update: { value: "Overdue" },
      create: { task_id: post.id, definition_id: fieldId, value: "Overdue" },
    });
    transitioned += 1;
    notifications += await notifySocialMediaWorkflow({
      source: "social_media_post_overdue",
      planId: post.social_media_plan_id,
      taskId: post.id,
      taskTitle: post.title,
      assigneeId: post.assignee_id,
      scheduledPublishingDate: post.due_date.toISOString(),
    });
  }

  return { transitioned, notifications };
}

async function handler(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + DUE_SOON_WINDOW_MS);

  const [socialMediaOverdue, equipmentOverdue] = await Promise.all([
    processOverdueSocialMediaPosts(now),
    processOverdueEquipmentReturns({ now }),
  ]);

  // Not-yet-done tasks with a primary assignee or followers need reminders.
  const tasks = await prisma.task.findMany({
    where: {
      due_date: { gte: now, lte: windowEnd },
      status: { not: "done" },
      OR: [{ assignee_id: { not: null } }, { followers: { some: {} } }],
    },
    select: {
      id: true,
      title: true,
      due_date: true,
      assignee_id: true,
      followers: { select: { user_id: true } },
    },
  });

  let created = 0;
  for (const task of tasks) {
    if (!task.due_date) continue;

    // De-dupe: skip if an unread due_soon notification already exists for
    // this exact (task, due_date). We match on `data.due_date` directly in
    // the query so prior reminders for a different (rescheduled) due date
    // don't accidentally block today's reminder, and so multiple historical
    // rows can't hide a matching one from `findFirst`.
    const dueIso = task.due_date.toISOString();
    const recipients = new Set([
      task.assignee_id,
      ...task.followers.map((follower) => follower.user_id),
    ]);
    recipients.delete(null);

    for (const userId of recipients) {
      if (!userId) continue;
      const existing = await prisma.notification.findFirst({
        where: {
          type: "due_soon",
          user_id: userId,
          task_id: task.id,
          read: false,
          data: { path: ["due_date"], equals: dueIso },
        },
        select: { id: true },
      });
      if (existing) continue;

      try {
        await prisma.notification.create({
          data: {
            type: "due_soon",
            user_id: userId,
            task_id: task.id,
            data: { due_date: dueIso, task_title: task.title },
          },
        });
        await broadcastNotification(userId);
        created += 1;
      } catch (err) {
        logError("api:cron:due-soon:create", err, {
          task_id: task.id,
          user_id: userId,
        });
      }
    }
  }

  // Reuse the existing daily maintenance request for a bounded Google
  // Calendar retry pass. We intentionally do not add another Vercel cron,
  // which keeps the deployment compatible with the current hosting plan.
  after(() =>
    Promise.all([
      processPendingGoogleCalendarSyncJobs({ limit: 10 }),
      syncSharedGoogleCalendarAgendas({ limit: 25 }),
    ]).catch((error) =>
      logError("api:cron:due-soon:google-calendar-sync", error),
    ),
  );

  return NextResponse.json({
    ok: true,
    scanned: tasks.length,
    created,
    social_media_overdue: socialMediaOverdue,
    equipment_overdue: equipmentOverdue,
    window_hours: DUE_SOON_WINDOW_MS / 3_600_000,
    ran_at: now.toISOString(),
  });
}

export const GET = withErrorReporting("api:cron:due-soon:GET", handler);
export const POST = withErrorReporting("api:cron:due-soon:POST", handler);
