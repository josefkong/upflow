import { NextResponse } from "next/server";

import { isWorkspaceAdminFor } from "@/lib/auth-helpers";
import { requireAuth } from "@/lib/auth-response";
import { CLICKUP_STATUS_FIELD_NAME } from "@/lib/clickup-status";
import { COMMERCIAL_LEAD_STAGE_FIELD_NAME } from "@/lib/commercial-lead-stages";
import { prisma } from "@/lib/prisma";
import { readableProjectWhere } from "@/lib/project-access";
import { RH_BOARD_FIELD_NAME } from "@/lib/rh-board";
import { SPACE_TASK_STATUS_FIELD_NAME } from "@/lib/space-task-status";
import { withErrorReporting } from "@/lib/with-error-reporting";

export const dynamic = "force-dynamic";

const WORKFLOW_FIELD_NAMES = new Set([
  SPACE_TASK_STATUS_FIELD_NAME,
  COMMERCIAL_LEAD_STAGE_FIELD_NAME,
  RH_BOARD_FIELD_NAME,
  CLICKUP_STATUS_FIELD_NAME,
]);

async function getHandler() {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;

  const auth = authResult.auth;
  const workspaceId = auth.currentWorkspaceId;
  if (!workspaceId) {
    return NextResponse.json({ spaces: [], folders: [], projects: [], tasks: [] });
  }

  const userId = auth.prismaUser.id;
  const [spaces, folders, rows] = await Promise.all([
    prisma.space.findMany({
      where: { workspace_id: workspaceId },
      orderBy: [{ position: "asc" }, { created_at: "asc" }],
      select: { id: true, name: true, icon: true, position: true },
    }),
    prisma.folder.findMany({
      where: { workspace_id: workspaceId },
      orderBy: [{ position: "asc" }, { created_at: "asc" }],
      select: {
        id: true,
        name: true,
        icon: true,
        space_id: true,
        parent_id: true,
        position: true,
      },
    }),
    prisma.task.findMany({
      where: {
        project: readableProjectWhere(auth, workspaceId),
        OR: [
          { assignee_id: userId },
          { followers: { some: { user_id: userId } } },
        ],
      },
      take: 1001,
      orderBy: [
        { status: "asc" },
        { due_date: "asc" },
        { position: "asc" },
        { created_at: "desc" },
      ],
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        due_date: true,
        created_at: true,
        position: true,
        parent_id: true,
        assignee_id: true,
        assignee: { select: { id: true, name: true, email: true } },
        _count: { select: { comments: true, subtasks: true } },
        project: {
          select: {
            id: true,
            name: true,
            owner_id: true,
            space_id: true,
            folder_id: true,
            space: { select: { id: true, name: true, icon: true } },
            folder: {
              select: {
                id: true,
                name: true,
                icon: true,
                parent_id: true,
              },
            },
            custom_fields: {
              where: { type: "dropdown" },
              select: { name: true },
            },
            project_members: {
              where: { user_id: userId },
              select: { user_id: true },
            },
            _count: { select: { project_members: true } },
          },
        },
      },
    }),
  ]);

  const truncated = rows.length > 1000;
  const tasks = rows.slice(0, 1000).map((task) => {
    const project = task.project;
    const hasRestrictedContributors = project._count.project_members > 0;
    const activeContributor =
      auth.currentRole !== "guest" &&
      (!hasRestrictedContributors ||
        project.owner_id === userId ||
        project.project_members.length > 0);
    const workflowManaged = project.custom_fields.some((field) =>
      WORKFLOW_FIELD_NAMES.has(field.name),
    );

    return {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date,
      created_at: task.created_at,
      position: task.position,
      parent_id: task.parent_id,
      assignee: task.assignee,
      linked_as: task.assignee_id === userId ? "assignee" : "follower",
      can_move:
        !workflowManaged &&
        (isWorkspaceAdminFor(auth, workspaceId) || activeContributor),
      workflow_managed: workflowManaged,
      comments_count: task._count.comments,
      subtasks_count: task._count.subtasks,
      project: {
        id: project.id,
        name: project.name,
        space_id: project.space_id,
        folder_id: project.folder_id,
        space: project.space,
        folder: project.folder,
      },
    };
  });

  const projectById = new Map(
    tasks.map((task) => [task.project.id, task.project] as const),
  );

  return NextResponse.json({
    spaces,
    folders,
    projects: Array.from(projectById.values()),
    tasks,
    truncated,
  });
}

export const GET = withErrorReporting("api:projects:my-work:GET", getHandler);
