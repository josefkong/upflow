import type { Prisma } from "@prisma/client";
import { logError } from "@/lib/log-error";
import { prisma } from "@/lib/prisma";
import { broadcastNotification } from "@/lib/supabase-server";

export type ProjectResponsibilityTarget = {
  ownerId?: string | null;
  responsibleSalespersonId?: string | null;
  assigneeId?: string | null;
  memberIds?: string[];
  followerIds?: string[];
};

export function projectResponsibleIds(target: ProjectResponsibilityTarget) {
  return Array.from(
    new Set([
      target.ownerId,
      target.responsibleSalespersonId,
      target.assigneeId,
      ...(target.memberIds ?? []),
      ...(target.followerIds ?? []),
    ]),
  ).filter((userId): userId is string => Boolean(userId));
}

export async function notifyProjectResponsibles({
  task,
  actor,
}: {
  task: {
    id: string;
    title: string;
    assignee_id?: string | null;
    project: {
      id: string;
      name: string;
      workspace_id: string;
      owner_id?: string | null;
      responsible_salesperson_id?: string | null;
      project_members: Array<{ user_id: string }>;
    };
    followers?: Array<{ user_id: string }>;
  };
  actor: { id: string; name?: string | null; email?: string | null };
}) {
  const candidates = projectResponsibleIds({
    ownerId: task.project.owner_id,
    responsibleSalespersonId: task.project.responsible_salesperson_id,
    assigneeId: task.assignee_id,
    memberIds: task.project.project_members.map((member) => member.user_id),
    followerIds: task.followers?.map((follower) => follower.user_id),
  });
  if (candidates.length === 0) return 0;

  const activeMemberships = await prisma.workspaceMember.findMany({
    where: {
      workspace_id: task.project.workspace_id,
      user_id: { in: candidates },
      status: "active",
      role: { not: "guest" },
    },
    select: { user_id: true },
  });
  const recipients = activeMemberships.map((membership) => membership.user_id);
  if (recipients.length === 0) return 0;

  const data = {
    source: "manual_project_notification",
    actor_id: actor.id,
    actor_name: actor.name ?? actor.email ?? null,
    project_id: task.project.id,
    project_name: task.project.name,
    task_title: task.title,
  } satisfies Prisma.InputJsonObject;

  await prisma.notification.createMany({
    data: recipients.map((user_id) => ({
      type: "assigned" as const,
      user_id,
      task_id: task.id,
      workspace_id: task.project.workspace_id,
      data,
    })),
  });

  await Promise.all(
    recipients.map((userId) =>
      broadcastNotification(userId).catch((error) =>
        logError("project-notification:broadcast", error, {
          user_id: userId,
          task_id: task.id,
          project_id: task.project.id,
        }),
      ),
    ),
  );

  return recipients.length;
}
