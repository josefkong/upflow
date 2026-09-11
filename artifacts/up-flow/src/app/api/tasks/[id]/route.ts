import { NextRequest, NextResponse } from "next/server";
import type { Prisma, TaskPriority, TaskStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-response";
import { isSuperAdmin } from "@/lib/auth-helpers";
import { logError } from "@/lib/log-error";
import { withErrorReporting } from "@/lib/with-error-reporting";
import { broadcastNotification } from "@/lib/supabase-server";
import { recordActivity } from "@/lib/activity";
import { parseAppDate } from "@/lib/utils";
import { parseTaskImageUrl } from "@/lib/task-images";
import { deleteTasksByIds, findOnboardingTaskLink } from "@/lib/task-delete";
import { normalizeCommentThread } from "@/lib/comment-mentions";
import {
  getOnboardingTaskStartBlocker,
  getOnboardingTaskCompletionBlocker,
  loadOnboardingAccess,
  syncOnboardingChecklistFromTaskStatus,
} from "@/lib/onboarding";
import {
  canAssignUserToProject,
  canContributeToProject,
  canReadProject,
} from "@/lib/project-access";
import { buildTaskOnboardingLink } from "@/lib/task-onboarding-links";
import { syncSocialMediaMoodboardWorkflow } from "@/lib/social-media-plan";
import { notifySocialMediaWorkflow } from "@/lib/social-media-notifications";
import {
  ensureSocialMediaCustomFields,
  isDateInSocialMediaMonth,
  isSocialMediaPublicationOverdue,
  SOCIAL_MEDIA_FIELD_NAMES,
} from "@/lib/social-media";
import { notifyTaskAssignee } from "@/lib/task-assignment-notifications";
import { getGoogleCalendarConnectionStatus } from "@/lib/google-calendar";
import {
  isCommercialFollowUpStage,
  normalizeCommercialFollowUpTaskTitle,
} from "@/lib/commercial-follow-up";
import { canAdvanceCommercialContract } from "@/lib/commercial-contract-access";
import {
  canViewClientFinancials,
  redactCommercialLeadFinancials,
  redactFinancialTaskDescription,
} from "@/lib/client-financial-access";

const UpdateTaskSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  cover_image_url: z.string().trim().max(2_000).nullable().optional(),
  due_date: z.string().nullable().optional(),
  position: z.number().int().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

const commercialLeadDetailInclude = {
  follow_up_task: { select: { id: true, project_id: true, created_at: true } },
  contract_handoff_task: {
    select: {
      id: true,
      project_id: true,
      status: true,
      project: { select: { id: true, name: true } },
    },
  },
  finance_contract_task: {
    select: {
      id: true,
      project_id: true,
      status: true,
      assignee: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, name: true } },
    },
  },
  presentation_event: {
    select: {
      id: true,
      created_by: true,
      starts_at: true,
      ends_at: true,
      meeting_url: true,
      google_meet_requested: true,
      attendees: {
        select: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { created_at: "asc" },
      },
      google_calendar_links: {
        select: {
          google_event_url: true,
          sync_status: true,
          last_synced_at: true,
          last_error: true,
        },
        orderBy: { updated_at: "desc" },
        take: 1,
      },
      google_calendar_sync_jobs: {
        where: { operation: "upsert" },
        select: {
          status: true,
          last_error: true,
          updated_at: true,
        },
        orderBy: { updated_at: "desc" },
        take: 1,
      },
    },
  },
} satisfies Prisma.CommercialLeadInclude;

type CommercialLeadDetail = Prisma.CommercialLeadGetPayload<{
  include: typeof commercialLeadDetailInclude;
}>;

async function addPresentationIntegration(lead: CommercialLeadDetail | null) {
  if (!lead) return null;
  const { presentation_event: event, ...leadData } = lead;
  if (!event) {
    return { ...leadData, presentation_integration: null };
  }

  const connection = await getGoogleCalendarConnectionStatus({
    workspaceId: lead.workspace_id,
    userId: event.created_by,
  });
  const link = event.google_calendar_links[0] ?? null;
  const job = event.google_calendar_sync_jobs[0] ?? null;
  const failed = link?.sync_status === "failed" || job?.status === "failed";
  const processing =
    link?.sync_status === "pending" ||
    job?.status === "pending" ||
    job?.status === "processing";
  const status = event.meeting_url
    ? "ready"
    : !connection.ready
      ? "not_configured"
      : !connection.connected
        ? "not_connected"
        : failed
          ? "failed"
          : processing || link?.sync_status === "synced"
            ? "syncing"
            : "pending";

  const participants = [
    { id: `lead:${lead.id}`, name: lead.owner_name, email: lead.owner_email, kind: "lead" as const },
    ...event.attendees.map(({ user }) => ({ ...user, kind: "team" as const })),
  ].filter(
    (participant, index, items) =>
      items.findIndex(
        (item) => item.email.trim().toLowerCase() === participant.email.trim().toLowerCase(),
      ) === index,
  );

  return {
    ...leadData,
    presentation_integration: {
      event_id: event.id,
      status,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      meeting_url: event.meeting_url,
      google_event_url: link?.google_event_url ?? null,
      calendar_label:
        connection.connection?.calendar_name ?? connection.connection?.email ?? null,
      participants,
      last_synced_at: link?.last_synced_at ?? null,
      last_error: link?.last_error ?? job?.last_error ?? null,
    },
  };
}

function parsePatchDate(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return parseAppDate(value);
}

async function GET_handler(req: NextRequest, { params }: RouteContext) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  void req;
  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      followers: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { created_at: "asc" },
      },
      project: {
        select: {
          id: true,
          name: true,
          workspace_id: true,
          owner_id: true,
          space: { select: { id: true, name: true } },
        },
      },
      subtasks: {
        include: {
          assignee: { select: { id: true, name: true, email: true } },
        },
        orderBy: { created_at: "asc" },
      },
      comments: {
        where: { parent_id: null },
        include: {
          author: { select: { id: true, name: true } },
          replies: {
            include: { author: { select: { id: true, name: true } } },
            orderBy: { created_at: "asc" },
          },
        },
        orderBy: { created_at: "asc" },
      },
      dependencies: {
        include: {
          depends_on: {
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              due_date: true,
              project: { select: { id: true, name: true } },
              assignee: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: { created_at: "asc" },
      },
      dependents: {
        include: {
          task: {
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              due_date: true,
              project: { select: { id: true, name: true } },
              assignee: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: { created_at: "asc" },
      },
      marketing_b2b_onboarding_form: {
        select: { id: true, status: true, completed_at: true },
      },
      marketing_b2c_onboarding_form: {
        select: { id: true, status: true, completed_at: true },
      },
      commercial_lead: {
        include: commercialLeadDetailInclude,
      },
      commercial_follow_up: {
        include: commercialLeadDetailInclude,
      },
      commercial_contract_handoff: {
        include: commercialLeadDetailInclude,
      },
      commercial_finance_contract: {
        include: commercialLeadDetailInclude,
      },
      custom_field_values: {
        select: { definition_id: true, value: true },
      },
    },
  });

  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (
    !(await canReadProject(auth, task.project)) &&
    task.assignee_id !== auth.prismaUser.id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const canViewFinancials = await canViewClientFinancials(
    auth,
    task.project.workspace_id,
  );

  const onboardingLink = await prisma.onboardingChecklistItem.findFirst({
    where: { task_id: task.id },
    select: {
      id: true,
      task_id: true,
      onboarding_id: true,
      department: true,
      title: true,
      automation_key: true,
      status: true,
      onboarding: {
        select: {
          company_id: true,
          progress: true,
          company: { select: { name: true } },
          meetings: {
            orderBy: [{ created_at: "asc" }],
            select: {
              id: true,
              scheduled: true,
              scheduled_at: true,
              checklist_item: {
                select: {
                  title: true,
                  automation_key: true,
                  sort_order: true,
                },
              },
            },
          },
        },
      },
      marketing_b2b_form: { select: { id: true } },
      marketing_b2c_form: { select: { id: true } },
      meetings: { select: { id: true, service: true } },
    },
  });

  const [commercialLead, commercialFollowUp] = await Promise.all([
    addPresentationIntegration(task.commercial_lead),
    addPresentationIntegration(task.commercial_follow_up),
  ]);
  const canAdvanceContract =
    task.commercial_contract_handoff || task.commercial_finance_contract
      ? await canAdvanceCommercialContract({
          workspaceId: task.project.workspace_id,
          userId: auth.prismaUser.id,
          isUpFlowAdmin: isSuperAdmin(auth),
        })
      : false;
  const followUpTaskId =
    commercialFollowUp?.follow_up_task_id ?? commercialLead?.follow_up_task_id;
  const followUpEvents = followUpTaskId
    ? await prisma.activityEvent.findMany({
        where: {
          workspace_id: task.project.workspace_id,
          task_id: followUpTaskId,
          type: "commercial_lead_follow_up_recorded",
        },
        select: {
          id: true,
          created_at: true,
          metadata: true,
          actor: { select: { id: true, name: true, email: true } },
        },
        orderBy: { created_at: "asc" },
      })
    : [];
  const followUpCheckpoints = followUpEvents.flatMap((event) => {
    const metadata =
      event.metadata &&
      typeof event.metadata === "object" &&
      !Array.isArray(event.metadata)
        ? event.metadata
        : null;
    const stage = metadata?.previous_stage;
    if (
      typeof stage !== "string" ||
      !isCommercialFollowUpStage(stage) ||
      !["first_contact", "second_contact", "final_contact"].includes(stage)
    ) {
      return [];
    }
    return [
      {
        id: event.id,
        stage: stage as "first_contact" | "second_contact" | "final_contact",
        completed_at: event.created_at,
        completed_by: event.actor,
      },
    ];
  });
  const withFollowUpCheckpoints = <Lead extends object>(lead: Lead | null) =>
    lead ? { ...lead, follow_up_checkpoints: followUpCheckpoints } : null;
  const withContractAccess = <Lead extends object>(lead: Lead | null) =>
    lead ? { ...lead, can_advance_contract: canAdvanceContract } : null;

  return NextResponse.json({
    ...task,
    description: redactFinancialTaskDescription(
      task.description,
      canViewFinancials,
    ),
    title: commercialFollowUp
      ? normalizeCommercialFollowUpTaskTitle(task.title)
      : task.title,
    commercial_lead: redactCommercialLeadFinancials(
      withContractAccess(withFollowUpCheckpoints(commercialLead)),
      canViewFinancials,
    ),
    commercial_follow_up: redactCommercialLeadFinancials(
      withContractAccess(withFollowUpCheckpoints(commercialFollowUp)),
      canViewFinancials,
    ),
    commercial_contract_handoff: redactCommercialLeadFinancials(
      withContractAccess(task.commercial_contract_handoff),
      canViewFinancials,
    ),
    commercial_finance_contract: redactCommercialLeadFinancials(
      withContractAccess(task.commercial_finance_contract),
      canViewFinancials,
    ),
    comments: task.comments.map(normalizeCommentThread),
    onboarding_link: onboardingLink
      ? buildTaskOnboardingLink(onboardingLink)
      : null,
  });
}

async function PATCH_handler(req: NextRequest, { params }: RouteContext) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  const { id } = await params;

  const { prismaUser } = auth;

  const oldTask = await prisma.task.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, workspace_id: true, owner_id: true } },
      followers: { select: { user_id: true } },
      social_media_plan: { select: { month: true } },
      commercial_contract_handoff: { select: { id: true } },
      commercial_finance_contract: { select: { id: true } },
      equipment_checkout: { select: { id: true } },
    },
  });
  if (!oldTask)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (
    !(await canReadProject(auth, oldTask.project)) &&
    oldTask.assignee_id !== prismaUser.id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = UpdateTaskSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid task", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (oldTask.equipment_checkout) {
    return NextResponse.json(
      {
        error:
          "Esta tarefa avança somente pelas confirmações do fluxo de equipamentos.",
      },
      { status: 409 },
    );
  }
  const body = parsed.data as {
    title?: string;
    description?: string | null;
    status?: TaskStatus;
    priority?: TaskPriority;
    assignee_id?: string | null;
    cover_image_url?: string | null;
    due_date?: string | null;
    position?: number;
  };
  const {
    title,
    description,
    status,
    priority,
    assignee_id,
    cover_image_url,
    due_date,
    position,
  } = body;
  const canContribute = await canContributeToProject(auth, oldTask.project);
  const canReassignTask = canContribute;
  const onboardingItem = await prisma.onboardingChecklistItem.findFirst({
    where: { task_id: id },
    select: {
      id: true,
      onboarding_id: true,
      department: true,
      owner_id: true,
      title: true,
    },
  });
  const onboardingAccess = onboardingItem
    ? await loadOnboardingAccess(auth, onboardingItem.onboarding_id)
    : null;
  const changedKeys = Object.entries(body)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  const isStatusOnlyPatch = changedKeys.length === 1 && status !== undefined;
  const canUpdateDepartmentOnboardingStatus = Boolean(
    onboardingItem &&
    isStatusOnlyPatch &&
    onboardingAccess?.canUpdateChecklistItem(onboardingItem),
  );
  if (!canContribute && !canUpdateDepartmentOnboardingStatus) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (
    status !== undefined &&
    status !== oldTask.status &&
    (oldTask.commercial_contract_handoff ||
      oldTask.commercial_finance_contract)
  ) {
    return NextResponse.json(
      {
        error:
          "As etapas contratuais avançam somente pelas confirmações do fluxo Financeiro.",
      },
      { status: 409 },
    );
  }

  const parsedDueDate = parsePatchDate(due_date);
  if (parsedDueDate === "invalid") {
    return NextResponse.json({ error: "Invalid due_date" }, { status: 400 });
  }
  if (
    parsedDueDate &&
    oldTask.social_media_plan?.month &&
    !isDateInSocialMediaMonth(parsedDueDate, oldTask.social_media_plan.month)
  ) {
    return NextResponse.json(
      { error: "Scheduled publishing date must be in the plan month" },
      { status: 400 },
    );
  }
  const parsedCoverImage =
    cover_image_url === undefined
      ? undefined
      : parseTaskImageUrl(cover_image_url);
  if (parsedCoverImage === "invalid") {
    return NextResponse.json(
      {
        error:
          "Invalid cover_image_url. Upload an image or use an HTTPS image URL.",
      },
      { status: 400 },
    );
  }

  if (assignee_id !== undefined && !canReassignTask) {
    return NextResponse.json(
      { error: "Only project contributors can reassign tasks" },
      { status: 403 },
    );
  }

  if (assignee_id) {
    if (!(await canAssignUserToProject(oldTask.project, assignee_id))) {
      return NextResponse.json(
        {
          error: "Assignee is not an active member with access to this project",
        },
        { status: 400 },
      );
    }
  }

  if (status === "done" && status !== oldTask.status) {
    const blocker = await getOnboardingTaskCompletionBlocker(prisma, id);
    if (blocker) return NextResponse.json({ error: blocker }, { status: 409 });
  }
  if (status === "in_progress" && status !== oldTask.status) {
    const blocker = await getOnboardingTaskStartBlocker(prisma, id);
    if (blocker) return NextResponse.json({ error: blocker }, { status: 409 });
  }

  const task = await prisma.$transaction(async (tx) => {
    if (assignee_id) {
      await tx.taskFollower.deleteMany({
        where: { task_id: id, user_id: assignee_id },
      });
    }
    const updated = await tx.task.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(priority !== undefined && { priority }),
        ...(assignee_id !== undefined && { assignee_id: assignee_id || null }),
        ...(parsedCoverImage !== undefined && {
          cover_image_url: parsedCoverImage,
        }),
        ...(parsedDueDate !== undefined && { due_date: parsedDueDate }),
        ...(position !== undefined && { position }),
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
        marketing_b2b_onboarding_form: {
          select: { id: true, status: true, completed_at: true },
        },
        marketing_b2c_onboarding_form: {
          select: { id: true, status: true, completed_at: true },
        },
        commercial_lead: {
          include: commercialLeadDetailInclude,
        },
        commercial_follow_up: true,
        commercial_contract_handoff: {
          include: commercialLeadDetailInclude,
        },
        commercial_finance_contract: {
          include: commercialLeadDetailInclude,
        },
        followers: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { created_at: "asc" },
        },
      },
    });

    // Task.due_date is the canonical Social Media publication date. Keep the
    // visible calendar field synchronized whenever it is edited generically.
    if (parsedDueDate !== undefined && oldTask.social_media_plan_id) {
      const fields = await ensureSocialMediaCustomFields(
        tx,
        oldTask.project_id,
      );
      if (parsedDueDate) {
        await tx.customFieldValue.upsert({
          where: {
            task_id_definition_id: {
              task_id: oldTask.id,
              definition_id:
                fields[SOCIAL_MEDIA_FIELD_NAMES.scheduledPublishingDate],
            },
          },
          update: { value: parsedDueDate.toISOString() },
          create: {
            task_id: oldTask.id,
            definition_id:
              fields[SOCIAL_MEDIA_FIELD_NAMES.scheduledPublishingDate],
            value: parsedDueDate.toISOString(),
          },
        });
        if (!isSocialMediaPublicationOverdue(parsedDueDate)) {
          await tx.customFieldValue.updateMany({
            where: {
              task_id: oldTask.id,
              definition_id: fields[SOCIAL_MEDIA_FIELD_NAMES.publishingStatus],
              value: { equals: "Overdue" },
            },
            data: { value: "Not Scheduled" },
          });
        }
      } else {
        await tx.customFieldValue.deleteMany({
          where: {
            task_id: oldTask.id,
            definition_id:
              fields[SOCIAL_MEDIA_FIELD_NAMES.scheduledPublishingDate],
          },
        });
      }
    }
    return updated;
  });

  // A prior request can persist the task status before an onboarding side
  // effect (such as the Finance campaign-start handoff) finishes. Replaying a
  // completed status is safe because onboarding automations use unique keys,
  // and lets a retry reconcile that missed side effect.
  const shouldSyncOnboarding =
    status !== undefined && (status !== oldTask.status || status === "done");
  const onboardingSync = shouldSyncOnboarding
    ? await syncOnboardingChecklistFromTaskStatus(prisma, {
        taskId: task.id,
        status,
        actorId: prismaUser.id,
      })
    : null;
  const socialMediaMoodboardSync =
    status !== undefined && status !== oldTask.status
      ? await syncSocialMediaMoodboardWorkflow(task.id, status)
      : null;
  if (socialMediaMoodboardSync?.became_ready) {
    await notifySocialMediaWorkflow({
      source: "social_media_moodboard_ready",
      planId: socialMediaMoodboardSync.id,
      taskId: task.id,
      taskTitle: task.title,
      actorId: prismaUser.id,
      actorName: prismaUser.name,
    });
  }

  if (assignee_id && assignee_id !== oldTask.assignee_id) {
    await notifyTaskAssignee({
      taskId: task.id,
      userId: assignee_id,
      workspaceId: oldTask.project.workspace_id,
    });
  }

  // Status-change notifications. Notify the project owner (creator) and the
  // task's assignee — excluding whoever made the change, and skipping
  // duplicates when those are the same person.
  if (status !== undefined && status !== oldTask.status) {
    const recipients = new Set<string>();
    if (
      oldTask.project.owner_id &&
      oldTask.project.owner_id !== prismaUser.id
    ) {
      recipients.add(oldTask.project.owner_id);
    }
    // Use the post-update assignee so a status change combined with a
    // re-assignment still notifies the new assignee about the new status.
    const currentAssignee = task.assignee_id;
    if (currentAssignee && currentAssignee !== prismaUser.id) {
      recipients.add(currentAssignee);
    }
    for (const follower of oldTask.followers) {
      if (follower.user_id !== prismaUser.id) recipients.add(follower.user_id);
    }

    const payload = {
      old_status: oldTask.status,
      new_status: status,
      task_title: task.title,
      actor_id: prismaUser.id,
      actor_name: prismaUser.name,
    };

    for (const userId of recipients) {
      await prisma.notification
        .create({
          data: {
            type: "status_changed",
            user_id: userId,
            task_id: task.id,
            data: payload,
          },
        })
        .catch((err) =>
          logError("api:tasks:PATCH:status-notify", err, {
            task_id: task.id,
            user_id: userId,
          }),
        );
      await broadcastNotification(userId).catch((err) =>
        logError("api:tasks:PATCH:status-broadcast", err, {
          task_id: task.id,
          user_id: userId,
        }),
      );
    }
  }

  await recordActivity({
    workspace_id: oldTask.project.workspace_id,
    actor_id: prismaUser.id,
    type:
      status !== undefined && status !== oldTask.status
        ? "task_status_changed"
        : "task_updated",
    entity_type: "task",
    entity_id: task.id,
    project_id: task.project_id,
    task_id: task.id,
    metadata: {
      title: task.title,
      old_status: oldTask.status,
      new_status: task.status,
    },
  });

  const responseTask = {
    ...task,
    title: task.commercial_follow_up
      ? normalizeCommercialFollowUpTaskTitle(task.title)
      : task.title,
    commercial_lead: await addPresentationIntegration(task.commercial_lead),
  };

  return NextResponse.json(
    onboardingSync?.linked || socialMediaMoodboardSync
      ? {
          ...responseTask,
          ...(onboardingSync?.linked
            ? { onboarding_sync: onboardingSync }
            : {}),
          ...(socialMediaMoodboardSync
            ? { social_media_moodboard_sync: socialMediaMoodboardSync }
            : {}),
        }
      : responseTask,
  );
}

async function DELETE_handler(req: NextRequest, { params }: RouteContext) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  void req;
  const { id } = await params;

  const { prismaUser } = auth;

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, workspace_id: true, owner_id: true } },
      commercial_follow_up: { select: { id: true } },
      commercial_contract_handoff: { select: { id: true } },
      commercial_finance_contract: { select: { id: true } },
      equipment_checkout: { select: { id: true } },
    },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canContributeToProject(auth, task.project))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (task.commercial_follow_up) {
    return NextResponse.json(
      {
        error:
          "Esta tarefa de follow-up é removida automaticamente quando a proposta é retirada.",
      },
      { status: 409 },
    );
  }
  if (
    task.commercial_contract_handoff ||
    task.commercial_finance_contract ||
    task.equipment_checkout
  ) {
    return NextResponse.json(
      {
        error:
          "Esta tarefa pertence a um fluxo automático e não pode ser apagada manualmente.",
      },
      { status: 409 },
    );
  }

  const deletion = await prisma.$transaction(async (tx) => {
    const onboardingTask = await findOnboardingTaskLink(tx, [id]);
    if (onboardingTask) return { blocked: true as const };
    return {
      blocked: false as const,
      deleted: await deleteTasksByIds(tx, [id]),
    };
  });
  if (deletion.blocked) {
    return NextResponse.json(
      {
        error: "This task is part of client onboarding and cannot be deleted.",
      },
      { status: 409 },
    );
  }

  await recordActivity({
    workspace_id: task.project.workspace_id,
    actor_id: prismaUser.id,
    type: "task_deleted",
    entity_type: "task",
    entity_id: task.id,
    project_id: task.project_id,
    task_id: task.id,
    metadata: { title: task.title },
  });
  return NextResponse.json({ success: true, deleted: deletion.deleted });
}
export const GET = withErrorReporting("api:tasks/id:GET", GET_handler);
export const PATCH = withErrorReporting("api:tasks/id:PATCH", PATCH_handler);
export const DELETE = withErrorReporting("api:tasks/id:DELETE", DELETE_handler);
