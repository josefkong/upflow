import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-response";
import { canContributeToProject, canReadProject } from "@/lib/project-access";
import { recordActivity } from "@/lib/activity";
import { broadcastNotification } from "@/lib/supabase-server";
import { withErrorReporting } from "@/lib/with-error-reporting";
import { sendCommercialLeadPresentationEmails } from "@/lib/commercial-lead-email";
import { logError } from "@/lib/log-error";

const AddFollowerSchema = z.object({
  user_id: z.string().uuid(),
});

type RouteContext = { params: Promise<{ id: string }> };

const followerInclude = {
  user: { select: { id: true, name: true, email: true } },
} as const;

async function loadTask(id: string) {
  return prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      assignee_id: true,
      project_id: true,
      project: {
        select: { id: true, name: true, workspace_id: true, owner_id: true },
      },
      commercial_lead: {
        select: {
          id: true,
          brand_name: true,
          presentation_event_id: true,
          presentation_starts_at: true,
          presentation_ends_at: true,
        },
      },
    },
  });
}

async function GET_handler(_req: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { id } = await params;
  const task = await loadTask(id);

  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (
    !(await canReadProject(authResult.auth, task.project)) &&
    task.assignee_id !== authResult.auth.prismaUser.id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const followers = await prisma.taskFollower.findMany({
    where: { task_id: id },
    include: followerInclude,
    orderBy: { created_at: "asc" },
  });

  return NextResponse.json({
    followers,
    canManageFollowers: await canContributeToProject(
      authResult.auth,
      task.project,
    ),
  });
}

async function POST_handler(req: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { auth } = authResult;
  const { id } = await params;
  const task = await loadTask(id);

  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canContributeToProject(auth, task.project))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = AddFollowerSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid follower", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (parsed.data.user_id === task.assignee_id) {
    return NextResponse.json(
      { error: "This person is already the primary assignee" },
      { status: 409 },
    );
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspace_id: task.project.workspace_id,
      user_id: parsed.data.user_id,
      status: "active",
      role: { not: "guest" },
    },
    select: { user_id: true },
  });
  if (!membership) {
    return NextResponse.json(
      { error: "Follower must be an active workspace member" },
      { status: 400 },
    );
  }

  const existingFollower = await prisma.taskFollower.findUnique({
    where: {
      task_id_user_id: { task_id: id, user_id: parsed.data.user_id },
    },
    include: followerInclude,
  });
  if (existingFollower) return NextResponse.json(existingFollower);

  const follower = await prisma.taskFollower.create({
    data: { task_id: id, user_id: parsed.data.user_id },
    include: followerInclude,
  });

  const lead = task.commercial_lead;
  if (
    lead?.presentation_event_id &&
    lead.presentation_starts_at &&
    lead.presentation_ends_at &&
    lead.presentation_ends_at > new Date()
  ) {
    await prisma.calendarEventAttendee.upsert({
      where: {
        event_id_user_id: {
          event_id: lead.presentation_event_id,
          user_id: follower.user_id,
        },
      },
      create: {
        event_id: lead.presentation_event_id,
        user_id: follower.user_id,
      },
      update: {},
    });
    after(() =>
      sendCommercialLeadPresentationEmails({
        eventId: lead.presentation_event_id!,
        recipients: [{ email: follower.user.email, name: follower.user.name }],
        brandName: lead.brand_name,
        startsAt: lead.presentation_starts_at!,
        endsAt: lead.presentation_ends_at!,
      }).catch((error) =>
        logError("commercial-lead:follower-presentation-email", error, {
          lead_id: lead.id,
          follower_id: follower.user_id,
        }),
      ),
    );
  }

  await prisma.notification.create({
    data: {
      type: "assigned",
      user_id: parsed.data.user_id,
      task_id: id,
      workspace_id: task.project.workspace_id,
      data: {
        source: "task_follower_added",
        actor_id: auth.prismaUser.id,
        actor_name: auth.prismaUser.name,
        task_title: task.title,
        project_id: task.project.id,
        project_name: task.project.name,
      },
    },
  });
  void broadcastNotification(parsed.data.user_id);

  await recordActivity({
    workspace_id: task.project.workspace_id,
    actor_id: auth.prismaUser.id,
    type: "task_follower_added",
    entity_type: "task",
    entity_id: task.id,
    project_id: task.project_id,
    task_id: task.id,
    metadata: {
      title: task.title,
      follower_id: parsed.data.user_id,
      follower_name: follower.user.name,
    },
  });

  return NextResponse.json(follower, { status: 201 });
}

export const GET = withErrorReporting("api:tasks:followers:GET", GET_handler);
export const POST = withErrorReporting(
  "api:tasks:followers:POST",
  POST_handler,
);
