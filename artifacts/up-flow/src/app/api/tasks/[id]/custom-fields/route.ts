import { NextRequest, NextResponse } from "next/server";
import { Prisma, type TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-response";
import { isEmptyValue, validateCustomFieldValue } from "@/lib/custom-field-validator";
import { withErrorReporting } from "@/lib/with-error-reporting";
import {
  getOnboardingTaskCompletionBlocker,
  getOnboardingTaskStartBlocker,
  syncOnboardingChecklistFromTaskStatus,
} from "@/lib/onboarding";
import { canContributeToProject } from "@/lib/project-access";
import { recordActivity } from "@/lib/activity";
import { syncSocialMediaMoodboardWorkflow } from "@/lib/social-media-plan";
import { notifySocialMediaWorkflow } from "@/lib/social-media-notifications";
import {
  canAdvanceSocialMediaApproval,
  canAdvanceSocialMediaProduction,
  canSetSocialMediaPublishingStatus,
  ensureSocialMediaCustomFields,
  isDateInSocialMediaMonth,
  isSocialMediaPublicationOverdue,
  SOCIAL_MEDIA_APPROVAL_GATE_ERROR,
  SOCIAL_MEDIA_FIELD_NAMES,
  SOCIAL_MEDIA_PUBLISHED_URL_REQUIRED_ERROR,
  SOCIAL_MEDIA_PUBLISHING_GATE_ERROR,
  SOCIAL_MEDIA_PRODUCTION_GATE_ERROR,
} from "@/lib/social-media";
import { parseAppDate } from "@/lib/utils";
import { COMMERCIAL_LEAD_STAGE_FIELD_NAME, commercialLeadStageFromName } from "@/lib/commercial-lead-stages";
import { COMMERCIAL_FOLLOW_UP_FIELD_NAME } from "@/lib/commercial-follow-up";
import { COMMERCIAL_CONTRACT_STAGE_FIELD_NAME } from "@/lib/commercial-contract-stages";

type RouteContext = { params: Promise<{ id: string }> };

function isTaskStatus(value: unknown): value is TaskStatus {
  return value === "todo" || value === "in_progress" || value === "done";
}

type SocialMediaFieldReader = Pick<
  Prisma.TransactionClient,
  "customFieldDefinition" | "customFieldValue"
>;

type SocialMediaStageValues = {
  approvalStatus: string | null;
  creativeProductionStatus: string | null;
  publishingStatus: string | null;
  publishedUrl: string | null;
  publishedAt: string | null;
};

async function loadSocialMediaStageValues(
  db: SocialMediaFieldReader,
  taskId: string,
  fieldIds: Awaited<ReturnType<typeof ensureSocialMediaCustomFields>>,
): Promise<SocialMediaStageValues> {
  const values = await db.customFieldValue.findMany({
    where: {
      task_id: taskId,
      definition_id: {
        in: [
          fieldIds[SOCIAL_MEDIA_FIELD_NAMES.approvalStatus],
          fieldIds[SOCIAL_MEDIA_FIELD_NAMES.creativeProductionStatus],
          fieldIds[SOCIAL_MEDIA_FIELD_NAMES.publishingStatus],
          fieldIds[SOCIAL_MEDIA_FIELD_NAMES.publishedUrl],
          fieldIds[SOCIAL_MEDIA_FIELD_NAMES.publishedAt],
        ],
      },
    },
    select: { definition_id: true, value: true },
  });
  const valueByFieldId = new Map(values.map((value) => [value.definition_id, value.value]));
  const asStatus = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    approvalStatus: asStatus(valueByFieldId.get(fieldIds[SOCIAL_MEDIA_FIELD_NAMES.approvalStatus])),
    creativeProductionStatus: asStatus(
      valueByFieldId.get(fieldIds[SOCIAL_MEDIA_FIELD_NAMES.creativeProductionStatus]),
    ),
    publishingStatus: asStatus(valueByFieldId.get(fieldIds[SOCIAL_MEDIA_FIELD_NAMES.publishingStatus])),
    publishedUrl: asStatus(valueByFieldId.get(fieldIds[SOCIAL_MEDIA_FIELD_NAMES.publishedUrl])),
    publishedAt: asStatus(valueByFieldId.get(fieldIds[SOCIAL_MEDIA_FIELD_NAMES.publishedAt])),
  };
}

async function PUT_handler(
  req: NextRequest,
  { params }: RouteContext,
) {
  const { id } = await params;
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;

  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      project_id: true,
      status: true,
      social_media_plan_id: true,
      social_media_plan: { select: { month: true, moodboard_status: true } },
      commercial_lead: {
        select: {
          id: true,
          stage: true,
          proposal_uploaded_at: true,
          presentation_starts_at: true,
          presentation_ends_at: true,
        },
      },
      commercial_follow_up: { select: { id: true } },
      commercial_contract_handoff: { select: { id: true } },
      commercial_finance_contract: { select: { id: true } },
      project: { select: { id: true, workspace_id: true, owner_id: true } },
    },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canContributeToProject(auth, task.project))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    definition_id?: string;
    value?: unknown;
    task_status?: TaskStatus;
  };
  if (!body.definition_id) {
    return NextResponse.json({ error: "definition_id is required" }, { status: 400 });
  }
  if (body.task_status !== undefined && !isTaskStatus(body.task_status)) {
    return NextResponse.json({ error: "Invalid task status" }, { status: 400 });
  }

  const def = await prisma.customFieldDefinition.findUnique({
    where: { id: body.definition_id },
    select: { project_id: true, name: true, type: true, options: true },
  });
  if (!def || def.project_id !== task.project_id) {
    return NextResponse.json({ error: "Field not in this project" }, { status: 400 });
  }
  const commercialStage =
    def.name === COMMERCIAL_LEAD_STAGE_FIELD_NAME && typeof body.value === "string"
      ? commercialLeadStageFromName(body.value)
      : null;
  if (def.name === COMMERCIAL_LEAD_STAGE_FIELD_NAME && task.commercial_lead) {
    if (!commercialStage) {
      return NextResponse.json({ error: "Selecione uma etapa válida do fluxo Comercial." }, { status: 400 });
    }
    return NextResponse.json({ error: "As etapas do fluxo Comercial avançam automaticamente pelas ações do lead." }, { status: 409 });
  }
  if (
    def.name === COMMERCIAL_FOLLOW_UP_FIELD_NAME &&
    task.commercial_follow_up
  ) {
    return NextResponse.json(
      { error: "As etapas de Follow Up avançam somente pelos checkpoints da tarefa." },
      { status: 409 },
    );
  }
  if (
    def.name === COMMERCIAL_CONTRACT_STAGE_FIELD_NAME &&
    (task.commercial_contract_handoff || task.commercial_finance_contract)
  ) {
    return NextResponse.json(
      {
        error:
          "As etapas contratuais avançam somente pelas confirmações do fluxo Financeiro.",
      },
      { status: 409 },
    );
  }

  const taskStatusChanged = body.task_status !== undefined && body.task_status !== task.status;
  if (body.task_status === "done" && taskStatusChanged) {
    const blocker = await getOnboardingTaskCompletionBlocker(prisma, task.id);
    if (blocker) return NextResponse.json({ error: blocker }, { status: 409 });
  }
  if (body.task_status === "in_progress" && taskStatusChanged) {
    const blocker = await getOnboardingTaskStartBlocker(prisma, task.id);
    if (blocker) return NextResponse.json({ error: blocker }, { status: 409 });
  }

  const updateTaskStatus = async (tx: Prisma.TransactionClient) => {
    if (!taskStatusChanged) return;
    await tx.task.update({
      where: { id: task.id },
      data: { status: body.task_status },
    });
  };

  const isSocialMediaContent = Boolean(task.social_media_plan_id);
  const isScheduledPublishingDate =
    isSocialMediaContent && def.name === SOCIAL_MEDIA_FIELD_NAMES.scheduledPublishingDate;
  let publishedAt: string | null = null;

  if (isEmptyValue(body.value)) {
    const emptyMutation = await prisma.$transaction(async (tx) => {
      if (isSocialMediaContent && def.name === SOCIAL_MEDIA_FIELD_NAMES.publishedUrl) {
        const fields = await ensureSocialMediaCustomFields(tx, task.project_id);
        const stages = await loadSocialMediaStageValues(tx, task.id, fields);
        if (stages.publishingStatus === "Published") return { ok: false as const };
      }
      await tx.customFieldValue.deleteMany({
        where: { task_id: task.id, definition_id: body.definition_id },
      });
      if (isScheduledPublishingDate) {
        await tx.task.update({ where: { id: task.id }, data: { due_date: null } });
      }
      await updateTaskStatus(tx);
      return { ok: true as const };
    });
    if (!emptyMutation.ok) {
      return NextResponse.json({ error: SOCIAL_MEDIA_PUBLISHED_URL_REQUIRED_ERROR }, { status: 409 });
    }
  } else {
    const validated = validateCustomFieldValue(def, body.value);
    if (!validated.ok) {
      return NextResponse.json(
        { error: `Invalid value for "${def.name}": ${validated.error}` },
        { status: 400 },
      );
    }

    // People-type fields: ensure every referenced id is a workspace member.
    if (def.type === "people" && Array.isArray(validated.value)) {
      const ids = (validated.value as string[]).filter((s) => typeof s === "string");
      if (ids.length > 0) {
        const members = await prisma.workspaceMember.findMany({
          where: {
            workspace_id: task.project.workspace_id,
            user_id: { in: ids },
          },
          select: { user_id: true },
        });
        const memberSet = new Set(members.map((member) => member.user_id));
        const bad = ids.find((memberId) => !memberSet.has(memberId));
        if (bad) {
          return NextResponse.json(
            {
              error: `Invalid value for "${def.name}": user ${bad} is not a member of this workspace`,
            },
            { status: 400 },
          );
        }
      }
    }

    const scheduledPublishingDate = isScheduledPublishingDate
      ? parseAppDate(String(body.value))
      : null;
    if (scheduledPublishingDate === "invalid") {
      return NextResponse.json({ error: "Invalid scheduled publishing date" }, { status: 400 });
    }
    if (
      scheduledPublishingDate &&
      task.social_media_plan?.month &&
      !isDateInSocialMediaMonth(scheduledPublishingDate, task.social_media_plan.month)
    ) {
      return NextResponse.json(
        { error: "Scheduled publishing date must be in the plan month" },
        { status: 400 },
      );
    }

    const mutation = await prisma.$transaction(async (tx) => {
      const fields = isSocialMediaContent
        ? await ensureSocialMediaCustomFields(tx, task.project_id)
        : null;
      const currentStages = fields
        ? await loadSocialMediaStageValues(tx, task.id, fields)
        : null;
      const nextProductionStatus =
        def.name === SOCIAL_MEDIA_FIELD_NAMES.creativeProductionStatus
          ? String(validated.value)
          : currentStages?.creativeProductionStatus ?? null;
      const nextApprovalStatus =
        def.name === SOCIAL_MEDIA_FIELD_NAMES.approvalStatus
          ? String(validated.value)
          : currentStages?.approvalStatus ?? null;
      const publishedUrlEntered =
        isSocialMediaContent &&
        def.name === SOCIAL_MEDIA_FIELD_NAMES.publishedUrl &&
        typeof validated.value === "string" &&
        validated.value.trim().length > 0;
      const nextPublishingStatus =
        def.name === SOCIAL_MEDIA_FIELD_NAMES.publishingStatus
          ? String(validated.value)
          : publishedUrlEntered
            ? "Published"
            : currentStages?.publishingStatus ?? null;

      if (
        isSocialMediaContent &&
        def.name === SOCIAL_MEDIA_FIELD_NAMES.creativeProductionStatus &&
        !canAdvanceSocialMediaProduction(
          nextProductionStatus,
          currentStages?.creativeProductionStatus,
          task.social_media_plan?.moodboard_status,
          currentStages?.approvalStatus,
        )
      ) {
        return { ok: false as const, error: SOCIAL_MEDIA_PRODUCTION_GATE_ERROR };
      }

      if (
        isSocialMediaContent &&
        def.name === SOCIAL_MEDIA_FIELD_NAMES.approvalStatus &&
        !canAdvanceSocialMediaApproval(nextApprovalStatus, nextProductionStatus)
      ) {
        return { ok: false as const, error: SOCIAL_MEDIA_APPROVAL_GATE_ERROR };
      }
      if (
        isSocialMediaContent &&
        (def.name === SOCIAL_MEDIA_FIELD_NAMES.publishingStatus || publishedUrlEntered) &&
        nextPublishingStatus === "Published" &&
        !publishedUrlEntered &&
        !currentStages?.publishedUrl
      ) {
        return { ok: false as const, error: SOCIAL_MEDIA_PUBLISHED_URL_REQUIRED_ERROR };
      }
      if (
        isSocialMediaContent &&
        (def.name === SOCIAL_MEDIA_FIELD_NAMES.publishingStatus || publishedUrlEntered) &&
        !canSetSocialMediaPublishingStatus(
          nextPublishingStatus,
          nextApprovalStatus,
          nextProductionStatus,
        )
      ) {
        return { ok: false as const, error: SOCIAL_MEDIA_PUBLISHING_GATE_ERROR };
      }

      const value = scheduledPublishingDate
        ? scheduledPublishingDate.toISOString()
        : (validated.value as Prisma.InputJsonValue);
      await tx.customFieldValue.upsert({
        where: {
          task_id_definition_id: {
            task_id: task.id,
            definition_id: body.definition_id!,
          },
        },
        update: { value },
        create: {
          task_id: task.id,
          definition_id: body.definition_id!,
          value,
        },
      });
      if (scheduledPublishingDate) {
        await tx.task.update({
          where: { id: task.id },
          data: { due_date: scheduledPublishingDate },
        });
        if (fields && !isSocialMediaPublicationOverdue(scheduledPublishingDate)) {
          await tx.customFieldValue.updateMany({
            where: {
              task_id: task.id,
              definition_id: fields[SOCIAL_MEDIA_FIELD_NAMES.publishingStatus],
              value: { equals: "Overdue" },
            },
            data: { value: "Not Scheduled" },
          });
        }
      }

      const shouldMarkPublished =
        Boolean(fields) &&
        nextPublishingStatus === "Published" &&
        (currentStages?.publishingStatus !== "Published" || !currentStages?.publishedAt);
      const nextPublishedAt = shouldMarkPublished ? new Date().toISOString() : null;
      if (fields && publishedUrlEntered) {
        await tx.customFieldValue.upsert({
          where: {
            task_id_definition_id: {
              task_id: task.id,
              definition_id: fields[SOCIAL_MEDIA_FIELD_NAMES.publishingStatus],
            },
          },
          update: { value: "Published" },
          create: {
            task_id: task.id,
            definition_id: fields[SOCIAL_MEDIA_FIELD_NAMES.publishingStatus],
            value: "Published",
          },
        });
      }
      if (fields && nextPublishedAt) {
        await tx.customFieldValue.upsert({
          where: {
            task_id_definition_id: {
              task_id: task.id,
              definition_id: fields[SOCIAL_MEDIA_FIELD_NAMES.publishedAt],
            },
          },
          update: { value: nextPublishedAt },
          create: {
            task_id: task.id,
            definition_id: fields[SOCIAL_MEDIA_FIELD_NAMES.publishedAt],
            value: nextPublishedAt,
          },
        });
      }
      await updateTaskStatus(tx);
      if (commercialStage && task.commercial_lead) {
        await tx.commercialLead.update({
          where: { id: task.commercial_lead.id },
          data: {
            stage: commercialStage,
            ...(commercialStage === "completed" ? { closed_at: new Date() } : { closed_at: null }),
          },
        });
      }
      return { ok: true as const, publishedAt: nextPublishedAt };
    });
    if (!mutation.ok) {
      return NextResponse.json({ error: mutation.error }, { status: 409 });
    }
    publishedAt = mutation.publishedAt;
  }

  // Repeat completed-status syncs so an interrupted onboarding side effect can
  // recover on retry. Its keyed handoffs make this idempotent.
  const shouldSyncOnboarding = taskStatusChanged || body.task_status === "done";
  const onboardingSync = shouldSyncOnboarding
    ? await syncOnboardingChecklistFromTaskStatus(prisma, {
        taskId: task.id,
        status: body.task_status!,
        actorId: auth.prismaUser.id,
      })
    : null;
  const socialMediaMoodboardSync = taskStatusChanged
    ? await syncSocialMediaMoodboardWorkflow(task.id, body.task_status!)
    : null;
  if (socialMediaMoodboardSync?.became_ready) {
    await notifySocialMediaWorkflow({
      source: "social_media_moodboard_ready",
      planId: socialMediaMoodboardSync.id,
      taskId: task.id,
      taskTitle: task.title,
      actorId: auth.prismaUser.id,
      actorName: auth.prismaUser.name,
    });
  }
  if (taskStatusChanged) {
    await recordActivity({
      workspace_id: task.project.workspace_id,
      actor_id: auth.prismaUser.id,
      type: "task_status_changed",
      entity_type: "task",
      entity_id: task.id,
      project_id: task.project_id,
      task_id: task.id,
      metadata: { old_status: task.status, new_status: body.task_status, source: "custom_field" },
    });
  }

  return NextResponse.json({
    ok: true,
    value: isEmptyValue(body.value) ? null : body.value,
    published_at: publishedAt,
    onboarding_sync: onboardingSync,
    social_media_moodboard_sync: socialMediaMoodboardSync,
  });
}

export const PUT = withErrorReporting("api:tasks/id/custom-fields:PUT", PUT_handler);
