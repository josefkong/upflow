import { prisma } from "@/lib/prisma";
import { notifyTaskAssignee } from "@/lib/task-assignment-notifications";

export async function runCommercialLeadAutomations(input: { workspaceId: string; now?: Date }) {
  const now = input.now ?? new Date();
  const presentations = await prisma.commercialLead.findMany({
    where: {
      workspace_id: input.workspaceId,
      stage: "presentation_scheduled",
      presentation_ends_at: { lte: now },
      presentation_confirmation_requested_at: null,
    },
    include: { task: { select: { followers: { select: { user_id: true } } } } },
    take: 100,
    orderBy: [{ presentation_ends_at: "asc" }, { id: "asc" }],
  });
  let presentationConfirmations = 0;
  for (const lead of presentations) {
    // The production cron, the authenticated browser pulse, and multiple open
    // tabs may reach the same Lead at nearly the same time. Claim the reminder
    // atomically so only one runner can persist and broadcast notifications.
    const claimed = await prisma.commercialLead.updateMany({
      where: {
        id: lead.id,
        workspace_id: input.workspaceId,
        stage: "presentation_scheduled",
        presentation_ends_at: { lte: now },
        presentation_confirmation_requested_at: null,
      },
      data: { presentation_confirmation_requested_at: now },
    });
    if (claimed.count === 0) continue;

    const recipients = Array.from(
      new Set([lead.assignee_id, ...lead.task.followers.map((follower) => follower.user_id)]),
    );
    await Promise.all(
      recipients.map((userId) =>
        notifyTaskAssignee({
          taskId: lead.task_id,
          userId,
          workspaceId: lead.workspace_id,
          data: {
            source: "commercial_lead_presentation_confirmation",
            lead_id: lead.id,
            brand_name: lead.brand_name,
          },
        }),
      ),
    );
    presentationConfirmations += 1;
  }

  const followUps = await prisma.commercialLead.findMany({
    where: {
      workspace_id: input.workspaceId,
      stage: "awaiting_response",
      next_follow_up_at: { lte: now },
      follow_up_task_id: { not: null },
      follow_up_notification_sent_at: null,
    },
    include: {
      task: {
        select: {
          followers: { select: { user_id: true } },
        },
      },
      follow_up_task: { select: { id: true } },
    },
    take: 100,
    orderBy: [{ next_follow_up_at: "asc" }, { id: "asc" }],
  });
  let followUpsCreated = 0;
  for (const lead of followUps) {
    if (!lead.follow_up_task) continue;
    const claimed = await prisma.commercialLead.updateMany({
      where: {
        id: lead.id,
        workspace_id: input.workspaceId,
        stage: "awaiting_response",
        next_follow_up_at: { lte: now },
        follow_up_task_id: lead.follow_up_task.id,
        follow_up_notification_sent_at: null,
      },
      data: { follow_up_notification_sent_at: now },
    });
    if (claimed.count === 0) continue;

    const recipients = Array.from(
      new Set([
        lead.assignee_id,
        ...lead.task.followers.map((follower) => follower.user_id),
      ]),
    );
    await Promise.all(
      recipients.map((userId) =>
        notifyTaskAssignee({
          taskId: lead.follow_up_task!.id,
          userId,
          workspaceId: lead.workspace_id,
          data: {
            source: "commercial_lead_follow_up_due",
            lead_id: lead.id,
            brand_name: lead.brand_name,
            follow_up_stage: lead.follow_up_stage,
          },
        }),
      ),
    );
    followUpsCreated += 1;
  }

  return {
    presentation_confirmations: presentationConfirmations,
    follow_ups_created: followUpsCreated,
  };
}
