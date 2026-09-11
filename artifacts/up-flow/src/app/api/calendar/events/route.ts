import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isWorkspaceAdminFor, type AuthUser } from "@/lib/auth-helpers";
import { requireAuth } from "@/lib/auth-response";
import { withErrorReporting } from "@/lib/with-error-reporting";
import { recordActivity } from "@/lib/activity";
import { parseDateParam } from "@/lib/time-range";
import { notifyCalendarEventAssignees } from "@/lib/calendar-notifications";
import {
  hasActiveGoogleCalendarConnection,
  processGoogleCalendarSyncJob,
  queueGoogleCalendarEventSyncInTransaction,
} from "@/lib/google-calendar";
import { logError } from "@/lib/log-error";
import {
  FALLBACK_EVENT_DURATION_MINUTES,
  meetingRoomByKey,
  meetingRoomKeyFromLocation,
} from "@/lib/meeting-rooms";
import {
  getOnboardingCompletionBlocker,
  loadOnboardingAccess,
  recomputeOnboardingProgress,
} from "@/lib/onboarding";
import { onboardingMeetingTitle } from "@/lib/onboarding-meeting-copy";
import {
  calendarEventDetailInclude,
  calendarEventListSelect,
  serializeCalendarEvent,
  validateCalendarEventRelations,
} from "./event-detail";

const EventSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(50_000).optional().nullable(),
  type: z
    .enum([
      "meeting",
      "client_call",
      "internal_meeting",
      "task",
      "reminder",
      "deadline",
    ])
    .default("meeting"),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime().optional().nullable(),
  timezone: z.string().trim().max(100).optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
  task_id: z.string().uuid().optional().nullable(),
  onboarding_checklist_item_id: z.string().uuid().optional().nullable(),
  company_id: z.string().uuid().optional().nullable(),
  space_id: z.string().uuid().optional().nullable(),
  responsible_user_id: z.string().uuid().optional().nullable(),
  attendee_ids: z.array(z.string().uuid()).max(200).optional(),
  reminder_minutes: z
    .array(z.number().int().min(1).max(525_600))
    .max(20)
    .optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  location: z.string().trim().max(1_000).optional().nullable(),
  meeting_url: z.string().trim().url().max(2_000).optional().nullable(),
  google_meet_requested: z.boolean().default(false),
  color: z.string().trim().optional().nullable(),
  meeting_room_key: z.enum(["b2b", "b2c"]).optional(),
});

class MeetingRoomConflictError extends Error {}

function isSchedulingText(value: string) {
  const text = value.toLowerCase();
  return (
    text.includes("schedule") ||
    text.includes("meeting") ||
    text.includes("reuni") ||
    text.includes("visita") ||
    text.includes("agenda")
  );
}

async function canCreateCalendarEvent(auth: AuthUser, workspaceId: string) {
  if (isWorkspaceAdminFor(auth, workspaceId)) return true;

  const member = await prisma.workspaceMember.findFirst({
    where: {
      workspace_id: workspaceId,
      user_id: auth.prismaUser.id,
      status: "active",
      role: { not: "guest" },
    },
    select: { id: true },
  });

  return Boolean(member);
}

async function GET_handler(req: NextRequest) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  if (!auth.currentWorkspaceId) {
    return NextResponse.json({ items: [], nextCursor: null });
  }

  const { searchParams } = new URL(req.url);
  const from = parseDateParam(searchParams.get("from"));
  const to = parseDateParam(searchParams.get("to"));

  const items = await prisma.calendarEvent.findMany({
    where: {
      workspace_id: auth.currentWorkspaceId,
      ...(from || to
        ? {
            starts_at: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ starts_at: "asc" }, { id: "asc" }],
    select: calendarEventListSelect,
  });

  return NextResponse.json({ items, nextCursor: null });
}

async function POST_handler(req: NextRequest) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  if (!auth.currentWorkspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 400 });
  }

  const parsed = EventSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid event", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const startsAt = new Date(body.starts_at);
  const endsAt = body.ends_at ? new Date(body.ends_at) : null;
  if (endsAt && endsAt <= startsAt) {
    return NextResponse.json(
      { error: "ends_at must be after starts_at" },
      { status: 400 },
    );
  }

  const linkedTask = body.task_id
    ? await prisma.task.findFirst({
        where: {
          id: body.task_id,
          project: { workspace_id: auth.currentWorkspaceId },
        },
        select: {
          id: true,
          title: true,
          project_id: true,
          assignee_id: true,
          followers: { select: { user_id: true } },
          project: { select: { id: true, workspace_id: true, owner_id: true } },
        },
      })
    : null;
  if (body.task_id && !linkedTask)
    return NextResponse.json({ error: "Task not found" }, { status: 400 });

  const requestedSchedulingItem = body.onboarding_checklist_item_id
    ? await prisma.onboardingChecklistItem.findFirst({
        where: {
          id: body.onboarding_checklist_item_id,
          onboarding: { workspace_id: auth.currentWorkspaceId },
        },
        select: {
          id: true,
          onboarding_id: true,
          owner_id: true,
          department: true,
          title: true,
          status: true,
          task_id: true,
          automation_key: true,
          onboarding: {
            select: { company: { select: { name: true } } },
          },
        },
      })
    : null;
  if (body.onboarding_checklist_item_id && !requestedSchedulingItem) {
    return NextResponse.json(
      { error: "Onboarding checklist item not found" },
      { status: 400 },
    );
  }
  if (requestedSchedulingItem && !linkedTask) {
    return NextResponse.json(
      { error: "An onboarding meeting must remain linked to its task" },
      { status: 400 },
    );
  }
  if (requestedSchedulingItem && linkedTask) {
    const sharedTaskLink = await prisma.onboardingChecklistItem.findFirst({
      where: {
        onboarding_id: requestedSchedulingItem.onboarding_id,
        task_id: linkedTask.id,
        automation_key: "shared_onboarding:task",
      },
      select: { id: true },
    });
    if (!sharedTaskLink) {
      return NextResponse.json(
        { error: "Checklist item does not belong to the linked task" },
        { status: 400 },
      );
    }
  }
  const linkedSchedulingItem =
    requestedSchedulingItem ??
    (linkedTask
      ? await prisma.onboardingChecklistItem.findFirst({
          where: { task_id: linkedTask.id },
          select: {
            id: true,
            onboarding_id: true,
            owner_id: true,
            department: true,
            title: true,
            status: true,
            task_id: true,
            automation_key: true,
            onboarding: {
              select: { company: { select: { name: true } } },
            },
          },
        })
      : null);
  const isLinkedSchedulingItem = Boolean(
    linkedTask &&
    linkedSchedulingItem &&
    isSchedulingText(
      `${linkedSchedulingItem.department} ${linkedSchedulingItem.title} ${linkedTask.title}`,
    ),
  );

  const canCreateWorkspaceEvent = await canCreateCalendarEvent(
    auth,
    auth.currentWorkspaceId,
  );
  const onboardingAccess = linkedSchedulingItem
    ? await loadOnboardingAccess(auth, linkedSchedulingItem.onboarding_id)
    : null;
  const onboardingSequenceBlocker = requestedSchedulingItem
    ? await getOnboardingCompletionBlocker(
        prisma,
        requestedSchedulingItem.onboarding_id,
        requestedSchedulingItem,
        { ignoreCurrentConditionRequirement: true },
      )
    : null;
  if (onboardingSequenceBlocker) {
    return NextResponse.json(
      { error: onboardingSequenceBlocker },
      { status: 409 },
    );
  }
  const canCreateLinkedSchedule = Boolean(
    linkedTask &&
    linkedSchedulingItem &&
    isLinkedSchedulingItem &&
    onboardingAccess?.canScheduleChecklistItem(linkedSchedulingItem),
  );
  if (isLinkedSchedulingItem && !canCreateLinkedSchedule) {
    return NextResponse.json(
      {
        error:
          "Only the department responsible for this onboarding can schedule its meeting.",
      },
      { status: 403 },
    );
  }
  if (!canCreateWorkspaceEvent && !canCreateLinkedSchedule) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const eventProjectId = body.project_id || linkedTask?.project_id || null;
  const eventTitle =
    linkedSchedulingItem && isLinkedSchedulingItem
      ? onboardingMeetingTitle({
          companyName: linkedSchedulingItem.onboarding.company.name,
          automationKey: linkedSchedulingItem.automation_key,
          department: linkedSchedulingItem.department,
        })
      : body.title;
  const attendeeIds = Array.from(
    new Set([
      auth.prismaUser.id,
      ...(body.attendee_ids ?? []),
      ...(linkedTask?.assignee_id ? [linkedTask.assignee_id] : []),
      ...(linkedTask?.followers.map((follower) => follower.user_id) ?? []),
      ...(body.responsible_user_id ? [body.responsible_user_id] : []),
    ]),
  );
  const reminderMinutes = Array.from(new Set(body.reminder_minutes ?? [])).sort(
    (a, b) => a - b,
  );
  const meetingRoomKey =
    body.meeting_room_key ??
    (body.type === "meeting"
      ? meetingRoomKeyFromLocation(body.location)
      : null);
  const selectedRoom = meetingRoomKey
    ? meetingRoomByKey(meetingRoomKey)
    : null;
  const bookingEndsAt =
    endsAt ??
    new Date(
      startsAt.getTime() + FALLBACK_EVENT_DURATION_MINUTES * 60 * 1000,
    );
  const relationValidation = await validateCalendarEventRelations({
    workspaceId: auth.currentWorkspaceId,
    projectId: eventProjectId,
    taskId: body.task_id || null,
    companyId: body.company_id || null,
    spaceId: body.space_id || null,
    responsibleUserId: body.responsible_user_id || null,
    attendeeIds,
  });
  if (!relationValidation.ok) {
    return NextResponse.json(
      { error: relationValidation.error },
      { status: 400 },
    );
  }
  const organizerUserId = body.responsible_user_id || auth.prismaUser.id;
  if (
    body.google_meet_requested &&
    !(await hasActiveGoogleCalendarConnection({
      workspaceId: auth.currentWorkspaceId,
      userId: organizerUserId,
    }))
  ) {
    return NextResponse.json(
      {
        error: "The responsible person must connect their Google account before an online meeting can be scheduled.",
        code: "GOOGLE_CALENDAR_CONNECTION_REQUIRED",
      },
      { status: 409 },
    );
  }

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      if (selectedRoom) {
        const fallbackWindowStart = new Date(
          startsAt.getTime() - FALLBACK_EVENT_DURATION_MINUTES * 60 * 1000,
        );
        const conflict = await tx.calendarEvent.findFirst({
          where: {
            workspace_id: auth.currentWorkspaceId!,
            status: "scheduled",
            location: selectedRoom.location,
            starts_at: { lt: bookingEndsAt },
            OR: [
              { ends_at: { gt: startsAt } },
              { ends_at: null, starts_at: { gt: fallbackWindowStart } },
            ],
          },
          select: { id: true },
        });
        if (conflict) throw new MeetingRoomConflictError();
      }

      const event = await tx.calendarEvent.create({
      data: {
        workspace_id: auth.currentWorkspaceId,
        title: eventTitle,
        description: body.description || null,
        type: selectedRoom ? "meeting" : body.type,
        starts_at: startsAt,
        ends_at: endsAt,
        timezone: body.timezone || "America/Sao_Paulo",
        created_by: auth.prismaUser.id,
        project_id: eventProjectId,
        task_id: body.task_id || null,
        company_id: body.company_id || null,
        space_id: body.space_id || null,
        responsible_user_id: body.responsible_user_id || null,
        priority: body.priority,
        location: selectedRoom?.location || body.location || null,
        meeting_url: body.meeting_url || null,
        google_meet_requested: body.google_meet_requested,
        color: selectedRoom?.color || body.color || null,
        attendees: { create: attendeeIds.map((user_id) => ({ user_id })) },
        reminders: {
          create: reminderMinutes.map((minutes_before) => ({ minutes_before })),
        },
      },
      include: calendarEventDetailInclude,
      });
      const googleCalendarJobId = await queueGoogleCalendarEventSyncInTransaction(
        tx,
        event.id,
      );
      if (
        linkedTask &&
        linkedSchedulingItem &&
        isLinkedSchedulingItem &&
        canCreateLinkedSchedule
      ) {
        if (!requestedSchedulingItem) {
          await tx.task.update({
            where: { id: linkedTask.id },
            data: { status: "done" },
          });
        }
        await tx.onboardingChecklistItem.update({
          where: { id: linkedSchedulingItem.id },
          data: {
            status: "complete",
            completed_at: new Date(),
            completed_by: auth.prismaUser.id,
          },
        });
        await tx.onboardingMeeting.updateMany({
          where: { checklist_item_id: linkedSchedulingItem.id },
          data: {
            scheduled: true,
            scheduled_at: startsAt,
            meeting_url: body.meeting_url || null,
            notes: body.description || null,
          },
        });
        await recomputeOnboardingProgress(
          tx,
          linkedSchedulingItem.onboarding_id,
        );
      }
      return { event, googleCalendarJobId };
    }, {
      isolationLevel: "Serializable",
      maxWait: 10_000,
      timeout: 30_000,
    });
  } catch (error) {
    if (
      selectedRoom &&
      (error instanceof MeetingRoomConflictError ||
        (typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2034"))
    ) {
      return NextResponse.json(
        {
          error: "The meeting room is already booked for this time range",
          code: "MEETING_ROOM_CONFLICT",
        },
        { status: 409 },
      );
    }
    throw error;
  }
  const { event, googleCalendarJobId } = created;

  await recordActivity({
    workspace_id: auth.currentWorkspaceId,
    actor_id: auth.prismaUser.id,
    type: "calendar_event_created",
    entity_type: "calendar_event",
    entity_id: event.id,
    project_id: event.project_id,
    task_id: event.task_id,
    company_id: event.company_id,
    metadata: {
      title: event.title,
      starts_at: event.starts_at.toISOString(),
      type: event.type,
      ...(selectedRoom ? { meeting_room: selectedRoom.key } : {}),
    },
  });

  await notifyCalendarEventAssignees({
    event,
    attendeeIds,
    actor: auth.prismaUser,
  });

  // The event and its durable sync job were committed together. The job remains
  // available for the maintenance runner if this immediate attempt is interrupted.
  if (googleCalendarJobId) {
    after(() =>
      processGoogleCalendarSyncJob(googleCalendarJobId).catch((error) =>
        logError("api:calendar/events:POST:google-calendar-sync", error, {
          event_id: event.id,
        }),
      ),
    );
  }

  return NextResponse.json(serializeCalendarEvent(event), { status: 201 });
}

export const GET = withErrorReporting("api:calendar/events:GET", GET_handler);
export const POST = withErrorReporting(
  "api:calendar/events:POST",
  POST_handler,
);
