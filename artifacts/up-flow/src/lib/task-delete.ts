import type { Prisma } from "@prisma/client";
import { deleteCalendarEventsWithGoogleTombstones } from "@/lib/calendar-event-delete";

type Tx = Prisma.TransactionClient;

export interface DeleteTasksOptions {
  deleteApprovalRequests?: boolean;
  deleteActivityEvents?: boolean;
  workspaceIds?: string[];
}

export interface DeletedTaskCounts {
  approval_events: number;
  approval_requests: number;
  notifications: number;
  time_entries: number;
  calendar_events: number;
  recurring_rules: number;
  onboarding_task_links: number;
  task_dependencies: number;
  comment_replies_detached: number;
  comments: number;
  custom_field_values: number;
  activity_events: number;
  tasks: number;
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

export async function collectTaskDescendantIds(tx: Tx, taskIds: string[]) {
  const collected = new Set(uniqueIds(taskIds));
  let frontier = Array.from(collected);

  while (frontier.length > 0) {
    const [children, commercialLeadLinks] = await Promise.all([
      tx.task.findMany({
        where: { parent_id: { in: frontier } },
        select: { id: true },
      }),
      tx.commercialLead.findMany({
        where: {
          task_id: { in: frontier },
          follow_up_task_id: { not: null },
        },
        select: { follow_up_task_id: true },
      }),
    ]);
    const next = [
      ...children.map((task) => task.id),
      ...commercialLeadLinks.flatMap((lead) =>
        lead.follow_up_task_id ? [lead.follow_up_task_id] : [],
      ),
    ]
      .filter((id) => !collected.has(id));

    next.forEach((id) => collected.add(id));
    frontier = next;
  }

  return Array.from(collected);
}

/**
 * Returns the first onboarding item linked to a task being deleted (including
 * descendants). Generic task deletion must not silently sever onboarding steps.
 */
export async function findOnboardingTaskLink(tx: Tx, taskIds: string[]) {
  const allTaskIds = await collectTaskDescendantIds(tx, taskIds);
  if (allTaskIds.length === 0) return null;

  return tx.onboardingChecklistItem.findFirst({
    where: { task_id: { in: allTaskIds } },
    select: { id: true, onboarding_id: true, title: true },
  });
}

export async function deleteTasksByIds(
  tx: Tx,
  taskIds: string[],
  options: DeleteTasksOptions = {},
): Promise<DeletedTaskCounts> {
  const allTaskIds = await collectTaskDescendantIds(tx, taskIds);
  const empty: DeletedTaskCounts = {
    approval_events: 0,
    approval_requests: 0,
    notifications: 0,
    time_entries: 0,
    calendar_events: 0,
    recurring_rules: 0,
    onboarding_task_links: 0,
    task_dependencies: 0,
    comment_replies_detached: 0,
    comments: 0,
    custom_field_values: 0,
    activity_events: 0,
    tasks: 0,
  };
  if (allTaskIds.length === 0) return empty;

  const shouldDeleteApprovals = options.deleteApprovalRequests ?? true;
  const approvalRequests = shouldDeleteApprovals
    ? await tx.approvalRequest.findMany({
        where: {
          entity_id: { in: allTaskIds },
          entity_type: "task",
        },
        select: { id: true },
      })
    : [];
  const approvalIds = approvalRequests.map((approval) => approval.id);

  const activityWhere: Prisma.ActivityEventWhereInput = {
    OR: [
      { task_id: { in: allTaskIds } },
      { entity_type: "task", entity_id: { in: allTaskIds } },
    ],
  };
  if (options.workspaceIds?.length) {
    activityWhere.workspace_id = { in: options.workspaceIds };
  }

  const deletedCalendarEvents = await deleteCalendarEventsWithGoogleTombstones(tx, {
    task_id: { in: allTaskIds },
  });

  return {
    approval_events: approvalIds.length
      ? (await tx.approvalEvent.deleteMany({
          where: { approval_id: { in: approvalIds } },
        })).count
      : 0,
    approval_requests: approvalIds.length
      ? (await tx.approvalRequest.deleteMany({
          where: { id: { in: approvalIds } },
        })).count
      : 0,
    notifications: (await tx.notification.deleteMany({
      where: { task_id: { in: allTaskIds } },
    })).count,
    time_entries: (await tx.timeEntry.deleteMany({
      where: { task_id: { in: allTaskIds } },
    })).count,
    calendar_events: deletedCalendarEvents.count,
    recurring_rules: (await tx.recurringTaskRule.deleteMany({
      where: { task_id: { in: allTaskIds } },
    })).count,
    onboarding_task_links: (await tx.onboardingChecklistItem.updateMany({
      where: { task_id: { in: allTaskIds } },
      data: { task_id: null },
    })).count,
    task_dependencies: (await tx.taskDependency.deleteMany({
      where: {
        OR: [
          { task_id: { in: allTaskIds } },
          { depends_on_id: { in: allTaskIds } },
        ],
      },
    })).count,
    comment_replies_detached: (await tx.comment.updateMany({
      where: { task_id: { in: allTaskIds }, parent_id: { not: null } },
      data: { parent_id: null },
    })).count,
    comments: (await tx.comment.deleteMany({
      where: { task_id: { in: allTaskIds } },
    })).count,
    custom_field_values: (await tx.customFieldValue.deleteMany({
      where: { task_id: { in: allTaskIds } },
    })).count,
    activity_events: options.deleteActivityEvents
      ? (await tx.activityEvent.deleteMany({ where: activityWhere })).count
      : 0,
    tasks: await detachAndDeleteTasks(tx, allTaskIds),
  };
}

async function detachAndDeleteTasks(tx: Tx, taskIds: string[]) {
  await tx.task.updateMany({
    where: { id: { in: taskIds } },
    data: { parent_id: null },
  });
  return (await tx.task.deleteMany({
    where: { id: { in: taskIds } },
  })).count;
}
