import type { CalendarEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/log-error";
import { broadcastNotification } from "@/lib/supabase-server";

type CalendarNotificationEvent = {
  id: string;
  workspace_id: string;
  title: string;
  type: CalendarEventType;
  starts_at: Date;
};

const MAX_REMINDER_LOOKAHEAD_MS = 30 * 24 * 60 * 60 * 1000;

export async function notifyCalendarEventAssignees({
  event,
  attendeeIds,
  actor,
}: {
  event: CalendarNotificationEvent;
  attendeeIds: string[];
  actor: { id: string; name?: string | null; email?: string | null };
}) {
  const targets = Array.from(new Set(attendeeIds)).filter(Boolean);
  if (targets.length === 0) return 0;

  const data = {
    source: "calendar_event_assigned",
    calendar_event_id: event.id,
    calendar_event_title: event.title,
    calendar_event_type: event.type,
    starts_at: event.starts_at.toISOString(),
    actor_id: actor.id,
    actor_name: actor.name ?? actor.email ?? null,
  };
  const existing = await prisma.notification.findMany({
    where: {
      type: "assigned",
      user_id: { in: targets },
      read: false,
      data: { path: ["calendar_event_id"], equals: event.id },
    },
    select: { user_id: true },
  });
  const existingTargets = new Set(existing.map((item) => item.user_id));
  const newTargets = targets.filter((userId) => !existingTargets.has(userId));

  if (existingTargets.size > 0) {
    await prisma.notification.updateMany({
      where: {
        type: "assigned",
        user_id: { in: Array.from(existingTargets) },
        read: false,
        data: { path: ["calendar_event_id"], equals: event.id },
      },
      data: { workspace_id: event.workspace_id, data },
    });
  }
  if (newTargets.length > 0) {
    await prisma.notification.createMany({
      data: newTargets.map((user_id) => ({
        type: "assigned",
        user_id,
        workspace_id: event.workspace_id,
        data,
      })),
    });
  }

  await Promise.all(
    newTargets.map((userId) =>
      broadcastNotification(userId).catch((err) =>
        logError("calendar:notify:broadcast", err, {
          user_id: userId,
          event_id: event.id,
        }),
      ),
    ),
  );

  return newTargets.length;
}

/**
 * Delivers persisted event reminders to every person designated on the linked
 * task. Events without a task fall back to their internal attendees.
 *
 * The reminder key includes the current start time, so rescheduling creates a
 * new valid reminder while repeated cron runs remain idempotent.
 */
export async function processCalendarEventReminders(now = new Date()) {
  const reminders = await prisma.calendarEventReminder.findMany({
    where: {
      enabled: true,
      event: {
        status: "scheduled",
        starts_at: {
          gt: now,
          lte: new Date(now.getTime() + MAX_REMINDER_LOOKAHEAD_MS),
        },
      },
    },
    take: 1_000,
    orderBy: [{ event: { starts_at: "asc" } }, { minutes_before: "desc" }],
    select: {
      minutes_before: true,
      event: {
        select: {
          id: true,
          workspace_id: true,
          title: true,
          type: true,
          starts_at: true,
          task: {
            select: {
              assignee_id: true,
              followers: { select: { user_id: true } },
            },
          },
          attendees: { select: { user_id: true } },
        },
      },
    },
  });

  let delivered = 0;
  for (const reminder of reminders) {
    const event = reminder.event;
    const notifyAt = new Date(
      event.starts_at.getTime() - reminder.minutes_before * 60_000,
    );
    if (notifyAt > now) continue;

    const taskRecipients = event.task
      ? [
          event.task.assignee_id,
          ...event.task.followers.map((follower) => follower.user_id),
        ]
      : [];
    const recipients = Array.from(
      new Set(
        (taskRecipients.length
          ? taskRecipients
          : event.attendees.map((attendee) => attendee.user_id)
        ).filter((userId): userId is string => Boolean(userId)),
      ),
    );
    if (!recipients.length) continue;

    const reminderKey = [
      event.id,
      event.starts_at.toISOString(),
      reminder.minutes_before,
    ].join(":");
    const existing = await prisma.notification.findMany({
      where: {
        type: "assigned",
        user_id: { in: recipients },
        data: { path: ["calendar_event_reminder_key"], equals: reminderKey },
      },
      select: { user_id: true },
    });
    const existingRecipients = new Set(existing.map((item) => item.user_id));
    const pendingRecipients = recipients.filter(
      (userId) => !existingRecipients.has(userId),
    );
    if (!pendingRecipients.length) continue;

    const data = {
      source: "calendar_event_reminder",
      calendar_event_id: event.id,
      calendar_event_title: event.title,
      calendar_event_type: event.type,
      calendar_event_reminder_key: reminderKey,
      minutes_before: reminder.minutes_before,
      starts_at: event.starts_at.toISOString(),
    };
    await prisma.notification.createMany({
      data: pendingRecipients.map((user_id) => ({
        type: "assigned" as const,
        user_id,
        workspace_id: event.workspace_id,
        data,
      })),
    });
    await Promise.all(
      pendingRecipients.map((userId) =>
        broadcastNotification(userId).catch((error) =>
          logError("calendar:reminder:broadcast", error, {
            user_id: userId,
            event_id: event.id,
          }),
        ),
      ),
    );
    delivered += pendingRecipients.length;
  }

  return { scanned: reminders.length, delivered };
}
