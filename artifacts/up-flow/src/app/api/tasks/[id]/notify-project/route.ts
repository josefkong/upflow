import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-response";
import { notifyProjectResponsibles } from "@/lib/project-notifications";
import { canContributeToProject } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { withErrorReporting } from "@/lib/with-error-reporting";

type RouteContext = { params: Promise<{ id: string }> };

async function POST_handler(req: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { auth } = authResult;
  const { id } = await params;
  void req;

  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      assignee_id: true,
      followers: { select: { user_id: true } },
      project: {
        select: {
          id: true,
          name: true,
          workspace_id: true,
          owner_id: true,
          responsible_salesperson_id: true,
          project_members: { select: { user_id: true } },
        },
      },
    },
  });

  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canContributeToProject(auth, task.project))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const notified = await notifyProjectResponsibles({
    task,
    actor: {
      id: auth.prismaUser.id,
      name: auth.prismaUser.name,
      email: auth.prismaUser.email,
    },
  });

  return NextResponse.json({ notified });
}

export const POST = withErrorReporting(
  "api:tasks:notify-project:POST",
  POST_handler,
);
