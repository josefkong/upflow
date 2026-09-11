import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canAccessWorkspace } from "@/lib/auth-helpers";
import { requireAuth } from "@/lib/auth-response";
import { withErrorReporting } from "@/lib/with-error-reporting";
import { recordActivity } from "@/lib/activity";
import { notifyCalendarEventAssignees } from "@/lib/calendar-notifications";
import {
  deleteCalendarEventWithGoogleTombstones,
  hasActiveGoogleCalendarConnection,
  prepareGoogleCalendarOrganizerChangeInTransaction,
  processGoogleCalendarSyncJob,
  queueGoogleCalendarEventSyncInTransaction,
} from "@/lib/google-calendar";
import { logError } from "@/lib/log-error";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import {
  FALLBACK_EVENT_DURATION_MINUTES,
  meetingRoomByKey,
  meetingRoomKeyFromLocation,
} from "@/lib/meeting-rooms";
import {
  calendarEventDetailInclude,
  canManageCalendarEvent,
  EVENT_ATTACHMENT_BUCKET,
  isCalendarEventStoragePath,
  loadCalendarEventDetail,
  serializeCalendarEvent,
  validateCalendarEventRelations,
} from "../event-detail";

const UpdateEventSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().max(50_000).optional().nullable(),
  type: z.enum(["meeting", "client_call", "internal_meeting", "task", "reminder", "deadline"]).optional(),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional().nullable(),
  timezone: z.string().trim().max(100).optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
  task_id: z.string().uuid().optional().nullable(),
  company_id: z.string().uuid().optional().nullable(),
  space_id: z.string().uuid().optional().nullable(),
  responsible_user_id: z.string().uuid().optional().nullable(),
  attendee_ids: z.array(z.string().uuid()).max(200).optional(),
  reminder_minutes: z.array(z.number().int().min(1).max(525_600)).max(20).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  location: z.string().trim().max(1_000).optional().nullable(),
  meeting_url: z.string().trim().url().max(2_000).optional().nullable(),
  color: z.string().trim().optional().nullable(),
});

type RouteContext = { params: Promise<{ id: string }> };

class MeetingRoomConflictError extends Error {}

async function GET_handler(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  void req;

  const event = await loadCalendarEventDetail(id);
  if (!event || !canAccessWorkspace(auth, event.workspace_id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(serializeCalendarEvent(event));
}

async function PATCH_handler(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;

  const existing = await loadCalendarEventDetail(id);
  if (!existing || !canAccessWorkspace(auth, existing.workspace_id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canManageCalendarEvent(auth, existing))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = UpdateEventSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event", issues: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;
  const startsAt = body.starts_at ? new Date(body.starts_at) : existing.starts_at;
  const endsAt = body.ends_at === undefined ? existing.ends_at : body.ends_at ? new Date(body.ends_at) : null;
  if (endsAt && endsAt <= startsAt) {
    return NextResponse.json({ error: "ends_at must be after starts_at" }, { status: 400 });
  }

  const taskId = body.task_id === undefined ? existing.task_id : body.task_id || null;
  const linkedTask = taskId
      ? await prisma.task.findFirst({
        where: { id: taskId, project: { workspace_id: existing.workspace_id } },
        select: {
          id: true,
          project_id: true,
          assignee_id: true,
          followers: { select: { user_id: true } },
        },
      })
    : null;
  if (taskId && !linkedTask) return NextResponse.json({ error: "Task not found" }, { status: 400 });

  const requestedProjectId = body.project_id === undefined ? existing.project_id : body.project_id || null;
  const projectId = linkedTask && !requestedProjectId ? linkedTask.project_id : requestedProjectId;
  const companyId = body.company_id === undefined ? existing.company_id : body.company_id || null;
  const spaceId = body.space_id === undefined ? existing.space_id : body.space_id || null;
  const responsibleUserId =
    body.responsible_user_id === undefined
      ? existing.responsible_user_id
      : body.responsible_user_id || null;
  const attendeeIds = Array.from(
    new Set([
      ...(body.attendee_ids === undefined
        ? existing.attendees.map((attendee) => attendee.user_id)
        : body.attendee_ids),
      ...(linkedTask?.assignee_id ? [linkedTask.assignee_id] : []),
      ...(linkedTask?.followers.map((follower) => follower.user_id) ?? []),
      ...(responsibleUserId ? [responsibleUserId] : []),
    ]),
  );
  const relationValidation = await validateCalendarEventRelations({
    workspaceId: existing.workspace_id,
    projectId,
    taskId,
    companyId,
    spaceId,
    responsibleUserId,
    attendeeIds,
  });
  if (!relationValidation.ok) {
    return NextResponse.json({ error: relationValidation.error }, { status: 400 });
  }
  const nextOrganizerUserId = responsibleUserId || existing.created_by;
  if (
    existing.google_meet_requested &&
    !(await hasActiveGoogleCalendarConnection({
      workspaceId: existing.workspace_id,
      userId: nextOrganizerUserId,
    }))
  ) {
    return NextResponse.json(
      {
        error: "The responsible person must connect their Google account before this online meeting can be assigned to them.",
        code: "GOOGLE_CALENDAR_CONNECTION_REQUIRED",
      },
      { status: 409 },
    );
  }

  const reminderMinutes =
    body.reminder_minutes === undefined
      ? undefined
      : Array.from(new Set(body.reminder_minutes)).sort((a, b) => a - b);
  const previousAttendeeIds = new Set(existing.attendees.map((attendee) => attendee.user_id));
  const replaceAttendees = body.attendee_ids !== undefined || body.responsible_user_id !== undefined;
  const newlyAddedAttendees = attendeeIds.filter((userId) => !previousAttendeeIds.has(userId));
  const nextLocation =
    body.location === undefined ? existing.location : body.location || null;
  const nextType = body.type ?? existing.type;
  const meetingRoomKey =
    nextType === "meeting" ? meetingRoomKeyFromLocation(nextLocation) : null;
  const meetingRoom = meetingRoomKey ? meetingRoomByKey(meetingRoomKey) : null;
  const bookingEndsAt =
    endsAt ??
    new Date(
      startsAt.getTime() + FALLBACK_EVENT_DURATION_MINUTES * 60 * 1000,
    );
  let mutation;
  try {
    mutation = await prisma.$transaction(async (tx) => {
      if (meetingRoom) {
        const fallbackWindowStart = new Date(
          startsAt.getTime() - FALLBACK_EVENT_DURATION_MINUTES * 60 * 1000,
        );
        const conflict = await tx.calendarEvent.findFirst({
          where: {
            id: { not: id },
            workspace_id: existing.workspace_id,
            status: "scheduled",
            location: meetingRoom.location,
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

      const googleCalendarCleanupJobIds =
        await prepareGoogleCalendarOrganizerChangeInTransaction(
          tx,
          existing.id,
          nextOrganizerUserId,
        );
      const event = await tx.calendarEvent.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description || null }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.starts_at !== undefined && { starts_at: startsAt }),
        ...(body.ends_at !== undefined && { ends_at: endsAt }),
        ...(body.timezone !== undefined && { timezone: body.timezone || null }),
        project_id: projectId,
        task_id: taskId,
        company_id: companyId,
        space_id: spaceId,
        responsible_user_id: responsibleUserId,
        ...(body.priority !== undefined && { priority: body.priority }),
        ...(body.location !== undefined && { location: body.location || null }),
        ...(body.meeting_url !== undefined && { meeting_url: body.meeting_url || null }),
        ...(body.color !== undefined && { color: body.color || null }),
        ...(replaceAttendees && {
          attendees: { deleteMany: {}, create: attendeeIds.map((user_id) => ({ user_id })) },
        }),
        ...(reminderMinutes !== undefined && {
          reminders: {
            deleteMany: {},
            create: reminderMinutes.map((minutes_before) => ({
              minutes_before,
              enabled: existing.status !== "cancelled",
            })),
          },
        }),
      },
      include: calendarEventDetailInclude,
      });
      const googleCalendarJobId = await queueGoogleCalendarEventSyncInTransaction(tx, event.id);
      return { event, googleCalendarJobId, googleCalendarCleanupJobIds };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (
      meetingRoom &&
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
  const {
    event: updated,
    googleCalendarJobId,
    googleCalendarCleanupJobIds,
  } = mutation;

  await recordActivity({
    workspace_id: existing.workspace_id,
    actor_id: auth.prismaUser.id,
    type: "calendar_event_updated",
    entity_type: "calendar_event",
    entity_id: updated.id,
    project_id: updated.project_id,
    task_id: updated.task_id,
    company_id: updated.company_id,
    metadata: { title: updated.title },
  });
  if (replaceAttendees) {
    await notifyCalendarEventAssignees({
      event: updated,
      attendeeIds: newlyAddedAttendees,
      actor: auth.prismaUser,
    });
  }

  // The update and its durable sync job were committed together. Provider work
  // remains asynchronous and is retried by the scheduled maintenance route.
  const googleCalendarJobIds = [
    ...googleCalendarCleanupJobIds,
    ...(googleCalendarJobId ? [googleCalendarJobId] : []),
  ];
  if (googleCalendarJobIds.length > 0) {
    after(() =>
      Promise.all(
        googleCalendarJobIds.map((jobId) =>
          processGoogleCalendarSyncJob(jobId),
        ),
      ).catch((error) =>
        logError("api:calendar/events/id:PATCH:google-calendar-sync", error, {
          event_id: updated.id,
        }),
      ),
    );
  }

  return NextResponse.json(serializeCalendarEvent(updated));
}

async function DELETE_handler(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  void req;

  const existing = await loadCalendarEventDetail(id);
  if (!existing || !canAccessWorkspace(auth, existing.workspace_id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canManageCalendarEvent(auth, existing))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const fileAttachments = existing.attachments.filter((attachment) => attachment.kind === "file");
  if (
    fileAttachments.some(
      (attachment) =>
        attachment.storage_bucket !== EVENT_ATTACHMENT_BUCKET ||
        !isCalendarEventStoragePath(existing.workspace_id, existing.id, attachment.storage_path),
    )
  ) {
    return NextResponse.json({ error: "Event attachment storage is invalid" }, { status: 409 });
  }
  if (fileAttachments.length > 0) {
    const { error } = await getSupabaseAdminClient()
      .storage.from(EVENT_ATTACHMENT_BUCKET)
      .remove(fileAttachments.map((attachment) => attachment.storage_path!));
    if (error) {
      return NextResponse.json({ error: "Could not remove private event files" }, { status: 503 });
    }
  }

  // Persist all Google deletion tombstones and remove the local event in one
  // transaction. A failure leaves the event in place rather than risking an
  // orphaned Google Calendar event after a retry.
  let googleCalendarDeletionJobIds: string[] = [];
  try {
    googleCalendarDeletionJobIds = await deleteCalendarEventWithGoogleTombstones(existing.id);
  } catch (error) {
    logError("api:calendar/events/id:DELETE:google-calendar-tombstone", error, { event_id: existing.id });
    return NextResponse.json(
      { error: "Could not safely remove the calendar event. Please retry." },
      { status: 503 },
    );
  }
  for (const googleCalendarJobId of googleCalendarDeletionJobIds) {
    after(() =>
      processGoogleCalendarSyncJob(googleCalendarJobId).catch((error) =>
        logError("api:calendar/events/id:DELETE:google-calendar-sync", error, { event_id: existing.id }),
      ),
    );
  }
  await recordActivity({
    workspace_id: existing.workspace_id,
    actor_id: auth.prismaUser.id,
    type: "calendar_event_deleted",
    entity_type: "calendar_event",
    entity_id: existing.id,
    project_id: existing.project_id,
    task_id: existing.task_id,
    company_id: existing.company_id,
    metadata: { title: existing.title },
  });
  return NextResponse.json({ success: true });
}

export const GET = withErrorReporting("api:calendar/events/id:GET", GET_handler);
export const PATCH = withErrorReporting("api:calendar/events/id:PATCH", PATCH_handler);
export const DELETE = withErrorReporting("api:calendar/events/id:DELETE", DELETE_handler);
