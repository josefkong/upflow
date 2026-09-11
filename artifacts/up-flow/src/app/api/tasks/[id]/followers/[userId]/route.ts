import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-response";
import { canContributeToProject } from "@/lib/project-access";
import { recordActivity } from "@/lib/activity";
import { withErrorReporting } from "@/lib/with-error-reporting";

type RouteContext = { params: Promise<{ id: string; userId: string }> };

async function DELETE_handler(_req: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { auth } = authResult;
  const { id, userId } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      project_id: true,
      project: {
        select: { id: true, workspace_id: true, owner_id: true },
      },
      commercial_lead: { select: { presentation_event_id: true } },
    },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canContributeToProject(auth, task.project))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const follower = await prisma.taskFollower.findUnique({
    where: { task_id_user_id: { task_id: id, user_id: userId } },
    include: { user: { select: { name: true } } },
  });
  if (!follower) return NextResponse.json({ success: true });

  await prisma.taskFollower.delete({ where: { id: follower.id } });
  if (task.commercial_lead?.presentation_event_id) {
    await prisma.calendarEventAttendee.deleteMany({
      where: {
        event_id: task.commercial_lead.presentation_event_id,
        user_id: userId,
      },
    });
  }
  await recordActivity({
    workspace_id: task.project.workspace_id,
    actor_id: auth.prismaUser.id,
    type: "task_follower_removed",
    entity_type: "task",
    entity_id: task.id,
    project_id: task.project_id,
    task_id: task.id,
    metadata: {
      title: task.title,
      follower_id: userId,
      follower_name: follower.user.name,
    },
  });

  return NextResponse.json({ success: true });
}

export const DELETE = withErrorReporting(
  "api:tasks:followers:DELETE",
  DELETE_handler,
);
