import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isWorkspaceAdminFor, type AuthUser } from "@/lib/auth-helpers";

export const EVENT_ATTACHMENT_BUCKET =
  process.env.TASK_ASSETS_BUCKET || "task-assets";

export const calendarEventDetailInclude = {
  creator: { select: { id: true, name: true, email: true, avatar_url: true } },
  project: { select: { id: true, name: true } },
  task: {
    select: {
      id: true,
      title: true,
      assignee: { select: { id: true, name: true, email: true } },
      followers: {
        select: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { created_at: "asc" },
      },
    },
  },
  company: { select: { id: true, name: true } },
  space: { select: { id: true, name: true, icon: true } },
  responsible: {
    select: { id: true, name: true, email: true, avatar_url: true },
  },
  cancelled_by_user: { select: { id: true, name: true, email: true } },
  commercial_lead_presentation: {
    select: {
      id: true,
      brand_name: true,
      owner_name: true,
      owner_email: true,
      instagram: true,
      monthly_revenue: true,
      whatsapp: true,
      company_type: true,
      observations: true,
      assignee: { select: { id: true, name: true, email: true } },
    },
  },
  attendees: {
    include: {
      user: { select: { id: true, name: true, email: true, avatar_url: true } },
    },
    orderBy: { created_at: "asc" },
  },
  reminders: { orderBy: { minutes_before: "asc" } },
  attachments: {
    include: {
      document: { select: { id: true, title: true, project_id: true } },
    },
    orderBy: { created_at: "asc" },
  },
} as const satisfies Prisma.CalendarEventInclude;

// Calendar grids only need the event itself and attendee identities. Full
// relation graphs (attachments, reminders, linked records) are loaded by the
// existing detail endpoint when a user opens an event to edit it.
export const calendarEventListSelect = {
  id: true,
  workspace_id: true,
  title: true,
  description: true,
  type: true,
  status: true,
  starts_at: true,
  ends_at: true,
  timezone: true,
  created_by: true,
  project_id: true,
  task_id: true,
  company_id: true,
  space_id: true,
  responsible_user_id: true,
  priority: true,
  cancelled_at: true,
  cancelled_by: true,
  location: true,
  meeting_url: true,
  google_meet_requested: true,
  color: true,
  created_at: true,
  updated_at: true,
  creator: { select: { id: true, name: true, email: true, avatar_url: true } },
  attendees: {
    select: {
      id: true,
      user_id: true,
      created_at: true,
      user: { select: { id: true, name: true, email: true, avatar_url: true } },
    },
    orderBy: { created_at: "asc" },
  },
} as const satisfies Prisma.CalendarEventSelect;

export type CalendarEventDetail = Prisma.CalendarEventGetPayload<{
  include: typeof calendarEventDetailInclude;
}>;

type CalendarEventAttachmentDetail = CalendarEventDetail["attachments"][number];

export function serializeCalendarEventAttachment(
  attachment: CalendarEventAttachmentDetail,
  eventId: string,
) {
  const {
    storage_bucket: _storageBucket,
    storage_path: _storagePath,
    ...safeAttachment
  } = attachment;
  return {
    ...safeAttachment,
    download_url:
      attachment.kind === "file"
        ? `/api/calendar/events/${eventId}/attachments/${attachment.id}/download`
        : null,
  };
}

export function serializeCalendarEvent(event: CalendarEventDetail) {
  return {
    ...event,
    attachments: event.attachments.map((attachment) =>
      serializeCalendarEventAttachment(attachment, event.id),
    ),
  };
}

export async function loadCalendarEventDetail(id: string) {
  return prisma.calendarEvent.findUnique({
    where: { id },
    include: calendarEventDetailInclude,
  });
}

export async function canManageCalendarEvent(
  auth: AuthUser,
  event: { workspace_id: string; created_by: string },
) {
  if (isWorkspaceAdminFor(auth, event.workspace_id)) return true;

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspace_id: event.workspace_id,
      user_id: auth.prismaUser.id,
      status: "active",
      role: { not: "guest" },
    },
    select: { role: true },
  });
  if (!membership) return false;

  return (
    event.created_by === auth.prismaUser.id ||
    membership.role === "owner" ||
    membership.role === "admin"
  );
}

export async function validateCalendarEventRelations(input: {
  workspaceId: string;
  projectId: string | null;
  taskId: string | null;
  companyId: string | null;
  spaceId: string | null;
  responsibleUserId: string | null;
  attendeeIds: string[];
}) {
  const [project, task, company, space] = await Promise.all([
    input.projectId
      ? prisma.project.findFirst({
          where: { id: input.projectId, workspace_id: input.workspaceId },
          select: { id: true },
        })
      : null,
    input.taskId
      ? prisma.task.findFirst({
          where: {
            id: input.taskId,
            project: { workspace_id: input.workspaceId },
          },
          select: { id: true, project_id: true, assignee_id: true },
        })
      : null,
    input.companyId
      ? prisma.company.findFirst({
          where: { id: input.companyId, workspace_id: input.workspaceId },
          select: { id: true },
        })
      : null,
    input.spaceId
      ? prisma.space.findFirst({
          where: { id: input.spaceId, workspace_id: input.workspaceId },
          select: { id: true },
        })
      : null,
  ]);

  if (input.projectId && !project)
    return { ok: false as const, error: "Project not found" };
  if (input.taskId && !task)
    return { ok: false as const, error: "Task not found" };
  if (input.companyId && !company)
    return { ok: false as const, error: "Client not found" };
  if (input.spaceId && !space)
    return { ok: false as const, error: "Space not found" };
  if (task && input.projectId && task.project_id !== input.projectId) {
    return {
      ok: false as const,
      error: "Task does not belong to the selected project",
    };
  }

  const people = Array.from(
    new Set([
      ...input.attendeeIds,
      ...(input.responsibleUserId ? [input.responsibleUserId] : []),
    ]),
  );
  if (people.length > 0) {
    const members = await prisma.workspaceMember.findMany({
      where: {
        workspace_id: input.workspaceId,
        user_id: { in: people },
        status: "active",
        role: { not: "guest" },
      },
      select: { user_id: true },
    });
    if (members.length !== people.length) {
      return {
        ok: false as const,
        error:
          "Attendees and the responsible person must be active non-guest workspace members",
      };
    }
  }

  return { ok: true as const, task };
}

export function cleanCalendarEventFileName(name: string) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
  return cleaned || "attachment";
}

export function isCalendarEventStoragePath(
  workspaceId: string,
  eventId: string,
  path: string | null | undefined,
) {
  if (!path) return false;
  const [pathWorkspaceId, collection, pathEventId, filename, ...extra] =
    path.split("/");
  return (
    pathWorkspaceId === workspaceId &&
    collection === "calendar-events" &&
    pathEventId === eventId &&
    extra.length === 0 &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,240}$/.test(filename || "")
  );
}
