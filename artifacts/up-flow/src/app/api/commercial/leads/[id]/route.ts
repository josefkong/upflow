import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-response";
import { isSuperAdmin } from "@/lib/auth-helpers";
import { canContributeToProject } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { setCommercialLeadStage } from "@/lib/commercial-lead-flow.server";
import { notifyTaskAssignee } from "@/lib/task-assignment-notifications";
import { recordActivity } from "@/lib/activity";
import { withErrorReporting } from "@/lib/with-error-reporting";
import {
  getGoogleCalendarConnectionStatus,
  processGoogleCalendarSyncJob,
  queueGoogleCalendarEventSync,
  queueGoogleCalendarEventSyncInTransaction,
} from "@/lib/google-calendar";
import { notifyCalendarEventAssignees } from "@/lib/calendar-notifications";
import { sendCommercialLeadPresentationEmails } from "@/lib/commercial-lead-email";
import { logError } from "@/lib/log-error";
import { COMMERCIAL_LEAD_REVENUE_VALUES } from "@/lib/commercial-lead-revenue";
import { formatBrazilianMobile, isBrazilianMobile } from "@/lib/brazilian-mobile";
import { formatBrazilianCnpj, isBrazilianCnpj } from "@/lib/brazilian-cnpj";
import { COMMERCIAL_CONTRACT_SERVICES } from "@/lib/commercial-contract";
import { canAdvanceCommercialContract } from "@/lib/commercial-contract-access";
import {
  confirmCommercialContractHandoff,
  createCommercialContractHandoffTask,
  markCommercialContractSent,
  markCommercialContractSigned,
  repairMissingCommercialFinanceContractTasks,
  removeCommercialContractWorkflow,
} from "@/lib/commercial-contract-handoff";
import { finishClientOnboardingStart } from "@/lib/onboarding";
import { canViewClientFinancials } from "@/lib/client-financial-access";
import {
  GROUP_UP_PLAN_VALUES,
  UP_ZERO_PLAN_VALUES,
  validateCommercialLeadNegotiation,
} from "@/lib/commercial-lead-negotiation";
import {
  advanceCommercialFollowUp,
  commercialFollowUpDescription,
  commercialFollowUpTaskTitle,
  completeCommercialFollowUp,
  createCommercialFollowUpTask,
  isCommercialFollowUpStage,
  removeCommercialFollowUpTask,
  reopenCommercialFollowUp,
} from "@/lib/commercial-follow-up";

const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update_details"),
    brand_name: z.string().trim().min(1).max(160),
    owner_name: z.string().trim().min(1).max(160),
    owner_email: z.string().trim().email().max(320),
    instagram: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .transform((value) => value.replace(/^@+/, "").replace(/\s+/g, "")),
    monthly_revenue: z.coerce.number().refine(
      (value) =>
        COMMERCIAL_LEAD_REVENUE_VALUES.includes(
          value as (typeof COMMERCIAL_LEAD_REVENUE_VALUES)[number],
        ),
      "Selecione uma faixa de faturamento válida.",
    ),
    whatsapp: z
      .string()
      .trim()
      .refine(isBrazilianMobile, "Informe um WhatsApp no formato DD XXXXX-XXXX.")
      .transform(formatBrazilianMobile),
    presentation_starts_at: z.string().datetime().nullable(),
    presentation_ends_at: z.string().datetime().nullable(),
    assignee_id: z.string().uuid(),
    company_type: z.enum(["B2B", "B2C", "Ambos"]),
    observations: z.string().trim().max(20_000).nullable(),
    negotiation: z
      .object({
        group_up_plan: z.enum(GROUP_UP_PLAN_VALUES),
        group_up_monthly_fee: z.number().positive().max(100_000_000).nullable(),
        up_zero_plan: z.enum(UP_ZERO_PLAN_VALUES),
        up_zero_monthly_fee: z.number().positive().max(100_000_000).nullable(),
        up_zero_implementation_fee: z.number().min(0).max(100_000_000).nullable(),
        negotiated_scope: z.array(z.string().trim().min(1)).max(30),
      })
      .optional(),
  }),
  z.object({ action: z.literal("confirm_presentation") }),
  z.object({ action: z.literal("qualify_lead") }),
  z.object({
    action: z.literal("archive_lead"),
    reason: z.enum(["not_qualified", "not_closed"]),
  }),
  z.object({ action: z.literal("confirm_closed") }),
  z.object({ action: z.literal("ensure_contract_handoff") }),
  z.object({ action: z.literal("mark_contract_sent") }),
  z.object({ action: z.literal("mark_contract_signed") }),
  z.object({ action: z.literal("reopen_after_close") }),
  z.object({
    action: z.literal("confirm_contract_handoff"),
    cnpj: z
      .string()
      .trim()
      .refine(isBrazilianCnpj, "Informe um CNPJ válido.")
      .transform(formatBrazilianCnpj),
    legal_name: z.string().trim().min(2).max(240),
    plan: z.string().trim().min(1).max(240),
    services: z
      .array(z.enum(COMMERCIAL_CONTRACT_SERVICES))
      .min(1, "Selecione ao menos um serviço."),
    monthly_fee: z.number().positive().max(100_000_000),
  }),
  z.object({ action: z.literal("record_follow_up") }),
  z.object({ action: z.literal("retry_presentation_sync") }),
  z.object({
    action: z.literal("save_negotiation_checklist"),
    group_up_plan: z.enum(GROUP_UP_PLAN_VALUES),
    group_up_monthly_fee: z.number().positive().max(100_000_000).nullable(),
    up_zero_plan: z.enum(UP_ZERO_PLAN_VALUES),
    up_zero_monthly_fee: z.number().positive().max(100_000_000).nullable(),
    up_zero_implementation_fee: z.number().min(0).max(100_000_000).nullable(),
    negotiated_scope: z.array(z.string().trim().min(1)).max(30),
  }),
  z.object({
    action: z.literal("update_negotiation_checklist"),
    group_up_plan: z.enum(GROUP_UP_PLAN_VALUES),
    group_up_monthly_fee: z.number().positive().max(100_000_000).nullable(),
    up_zero_plan: z.enum(UP_ZERO_PLAN_VALUES),
    up_zero_monthly_fee: z.number().positive().max(100_000_000).nullable(),
    up_zero_implementation_fee: z.number().min(0).max(100_000_000).nullable(),
    negotiated_scope: z.array(z.string().trim().min(1)).max(30),
  }),
  z.object({
    action: z.literal("schedule_presentation"),
    starts_at: z.string().datetime(),
    ends_at: z.string().datetime(),
  }),
]);
type RouteContext = { params: Promise<{ id: string }> };

function negotiationValidationMessage(
  field:
    | "group_up_monthly_fee"
    | "up_zero_monthly_fee"
    | "up_zero_implementation_fee"
    | "negotiated_scope",
) {
  switch (field) {
    case "group_up_monthly_fee":
      return "Informe o valor mensal do Plano Grupo UP.";
    case "up_zero_monthly_fee":
      return "Informe o valor mensal do Plano UP Zero.";
    case "up_zero_implementation_fee":
      return "Informe a taxa de implementação do Plano UP Zero.";
    case "negotiated_scope":
      return "Confirme todos os itens incluídos nos planos selecionados.";
  }
}

async function PATCH_handler(req: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const { id } = await params;
  const parsed = ActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const lead = await prisma.commercialLead.findFirst({
    where: { id, workspace_id: auth.currentWorkspaceId ?? "" },
    include: {
      task: {
        include: {
          project: true,
          followers: {
            include: { user: { select: { id: true, name: true, email: true } } },
            orderBy: { created_at: "asc" },
          },
        },
      },
      assignee: { select: { id: true, name: true, email: true } },
      follow_up_task: {
        include: { project: { select: { id: true, name: true } } },
      },
      contract_handoff_task: {
        include: { project: true },
      },
      finance_contract_task: {
        include: { project: true },
      },
    },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const contributionProjects = [
    lead.task.project,
    lead.contract_handoff_task?.project,
    lead.finance_contract_task?.project,
  ].filter((project): project is NonNullable<typeof project> => Boolean(project));
  const contributionChecks = await Promise.all(
    contributionProjects.map((project) => canContributeToProject(auth, project)),
  );
  if (!contributionChecks.some(Boolean)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await canViewClientFinancials(auth, lead.workspace_id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (parsed.data.action === "retry_presentation_sync") {
    if (!lead.presentation_event_id) {
      return NextResponse.json(
        { error: "Esta tarefa ainda não possui uma apresentação agendada." },
        { status: 409 },
      );
    }
    const event = await prisma.calendarEvent.findUnique({
      where: { id: lead.presentation_event_id },
      select: { id: true, created_by: true },
    });
    if (!event) {
      return NextResponse.json(
        { error: "O evento da apresentação não foi encontrado." },
        { status: 404 },
      );
    }
    const connection = await getGoogleCalendarConnectionStatus({
      workspaceId: lead.workspace_id,
      userId: event.created_by,
    });
    if (!connection.ready) {
      return NextResponse.json(
        { error: "A integração com o Google Agenda ainda não está configurada." },
        { status: 503 },
      );
    }
    if (!connection.connected) {
      return NextResponse.json(
        { error: "Conecte a conta do Google Agenda responsável por esta apresentação." },
        { status: 409 },
      );
    }
    const jobId = await queueGoogleCalendarEventSync(event.id, { force: true });
    if (!jobId) {
      return NextResponse.json(
        { error: "Não foi possível preparar uma nova sincronização." },
        { status: 409 },
      );
    }
    const result = await processGoogleCalendarSyncJob(jobId);
    if (result === "failed" || result === "deferred") {
      return NextResponse.json(
        { error: "O Google Agenda não concluiu a sincronização. Tente novamente em instantes." },
        { status: 502 },
      );
    }
    return NextResponse.json({ status: result });
  }
  if (parsed.data.action === "qualify_lead") {
    if (lead.stage !== "qualification") {
      return NextResponse.json(
        { error: "O Lead só pode ser qualificado depois da apresentação realizada." },
        { status: 409 },
      );
    }
    if (lead.qualified_at) {
      return NextResponse.json(
        { error: "Este Lead já foi qualificado." },
        { status: 409 },
      );
    }

    const qualifiedAt = new Date();
    const qualified = await prisma.commercialLead.update({
      where: { id: lead.id },
      data: {
        qualified_at: qualifiedAt,
        archived_at: null,
        archive_reason: null,
      },
    });
    await recordActivity({
      workspace_id: lead.workspace_id,
      actor_id: auth.prismaUser.id,
      type: "commercial_lead_qualified",
      entity_type: "commercial_lead",
      entity_id: lead.id,
      project_id: lead.task.project_id,
      task_id: lead.task_id,
      metadata: { brand_name: lead.brand_name },
    });
    return NextResponse.json(qualified);
  }
  if (parsed.data.action === "archive_lead") {
    const archiveReason = parsed.data.reason;
    const expectedStage =
      archiveReason === "not_qualified" ? "qualification" : "awaiting_response";
    if (lead.stage !== expectedStage) {
      return NextResponse.json(
        {
          error:
            archiveReason === "not_qualified"
              ? "O Lead só pode ser arquivado como não qualificado durante a Qualificação."
              : "O Lead só pode ser arquivado por não fechamento enquanto aguarda resposta.",
        },
        { status: 409 },
      );
    }

    const archived = await prisma.$transaction(async (tx) => {
      if (lead.follow_up_task_id) {
        await removeCommercialFollowUpTask(tx, {
          leadId: lead.id,
          parentTaskId: lead.task_id,
          followUpTaskId: lead.follow_up_task_id,
          workspaceId: lead.workspace_id,
        });
      }
      await setCommercialLeadStage(tx, {
        leadId: lead.id,
        taskId: lead.task_id,
        projectId: lead.task.project_id,
        workspaceId: lead.workspace_id,
        stage: "archived",
      });
      return tx.commercialLead.update({
        where: { id: lead.id },
        data: {
          qualified_at:
            archiveReason === "not_qualified" ? null : lead.qualified_at,
          archived_at: new Date(),
          archive_reason: archiveReason,
        },
      });
    });
    await recordActivity({
      workspace_id: lead.workspace_id,
      actor_id: auth.prismaUser.id,
      type: "commercial_lead_archived",
      entity_type: "commercial_lead",
      entity_id: lead.id,
      project_id: lead.task.project_id,
      task_id: lead.task_id,
      metadata: {
        brand_name: lead.brand_name,
        reason: archiveReason,
      },
    });
    return NextResponse.json(archived);
  }
  if (parsed.data.action === "update_details") {
    const input = parsed.data;
    const hasStart = Boolean(input.presentation_starts_at);
    const hasEnd = Boolean(input.presentation_ends_at);
    if (hasStart !== hasEnd) {
      return NextResponse.json(
        { error: "Informe o início e o fim da apresentação." },
        { status: 400 },
      );
    }
    const startsAt = input.presentation_starts_at
      ? new Date(input.presentation_starts_at)
      : null;
    const endsAt = input.presentation_ends_at
      ? new Date(input.presentation_ends_at)
      : null;
    if (startsAt && endsAt && endsAt <= startsAt) {
      return NextResponse.json(
        { error: "O término deve ser posterior ao início." },
        { status: 400 },
      );
    }

    const presentationChanged =
      (lead.presentation_starts_at?.getTime() ?? null) !==
        (startsAt?.getTime() ?? null) ||
      (lead.presentation_ends_at?.getTime() ?? null) !==
        (endsAt?.getTime() ?? null);
    if (
      presentationChanged &&
      !["lead", "presentation_scheduled"].includes(lead.stage)
    ) {
      return NextResponse.json(
        { error: "O horário histórico não pode ser alterado depois da apresentação." },
        { status: 409 },
      );
    }
    if (presentationChanged && lead.presentation_event_id && (!startsAt || !endsAt)) {
      return NextResponse.json(
        { error: "Uma apresentação já agendada precisa manter data, início e fim." },
        { status: 400 },
      );
    }

    const assigneeMembership = await prisma.workspaceMember.findFirst({
      where: {
        workspace_id: lead.workspace_id,
        user_id: input.assignee_id,
        status: "active",
      },
      select: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!assigneeMembership) {
      return NextResponse.json(
        { error: "Selecione um colaborador ativo." },
        { status: 400 },
      );
    }

    const assigneeChanged = input.assignee_id !== lead.assignee_id;
    const ownerRecipientChanged =
      input.owner_email !== lead.owner_email || input.owner_name !== lead.owner_name;
    const teamUserIds = Array.from(
      new Set([input.assignee_id, ...lead.task.followers.map((follower) => follower.user_id)]),
    );
    const teamRecipients = [
      assigneeMembership.user,
      ...lead.task.followers.map((follower) => follower.user),
    ];
    const negotiation = input.negotiation
      ? validateCommercialLeadNegotiation({
          groupUpPlan: input.negotiation.group_up_plan,
          groupUpMonthlyFee: input.negotiation.group_up_monthly_fee,
          upZeroPlan: input.negotiation.up_zero_plan,
          upZeroMonthlyFee: input.negotiation.up_zero_monthly_fee,
          upZeroImplementationFee:
            input.negotiation.up_zero_implementation_fee,
          negotiatedScope: input.negotiation.negotiated_scope,
        })
      : null;
    if (negotiation && !negotiation.ok) {
      return NextResponse.json(
        {
          error: negotiationValidationMessage(negotiation.field),
        },
        { status: 400 },
      );
    }
    if (input.negotiation && !lead.negotiation_checklist_completed_at) {
      return NextResponse.json(
        { error: "Conclua o checklist da negociação antes de editá-lo." },
        { status: 409 },
      );
    }
    const mutation = await prisma.$transaction(async (tx) => {
      let event = lead.presentation_event_id
        ? await tx.calendarEvent.update({
            where: { id: lead.presentation_event_id },
            data: {
              title: `Apresentação — ${input.brand_name}`,
              description: null,
              responsible_user_id: input.assignee_id,
              ...(presentationChanged && startsAt && endsAt
                ? { starts_at: startsAt, ends_at: endsAt, status: "scheduled" as const }
                : {}),
              attendees: {
                deleteMany: {},
                create: teamUserIds.map((user_id) => ({ user_id })),
              },
            },
          })
        : null;

      if (!event && startsAt && endsAt) {
        event = await tx.calendarEvent.create({
          data: {
            workspace_id: lead.workspace_id,
            title: `Apresentação — ${input.brand_name}`,
            description: null,
            type: "client_call",
            starts_at: startsAt,
            ends_at: endsAt,
            timezone: "America/Sao_Paulo",
            created_by: input.assignee_id,
            project_id: lead.task.project_id,
            task_id: lead.task_id,
            space_id: lead.task.project.space_id,
            responsible_user_id: input.assignee_id,
            priority: "high",
            google_meet_requested: true,
            attendees: { create: teamUserIds.map((user_id) => ({ user_id })) },
            reminders: { create: [{ minutes_before: 1440 }, { minutes_before: 30 }] },
          },
        });
      }

      await tx.task.update({
        where: { id: lead.task_id },
        data: {
          title: input.brand_name,
          description: input.observations,
          assignee_id: input.assignee_id,
          ...(presentationChanged ? { due_date: startsAt } : {}),
        },
      });
      await tx.commercialLead.update({
        where: { id: lead.id },
        data: {
          brand_name: input.brand_name,
          owner_name: input.owner_name,
          owner_email: input.owner_email,
          instagram: input.instagram,
          monthly_revenue: input.monthly_revenue,
          whatsapp: input.whatsapp,
          notes: input.observations ?? "",
          assignee_id: input.assignee_id,
          company_type: input.company_type,
          observations: input.observations,
          ...(negotiation?.ok
            ? {
                group_up_plan: negotiation.data.groupUpPlan,
                group_up_monthly_fee: negotiation.data.groupUpMonthlyFee,
                up_zero_plan: negotiation.data.upZeroPlan,
                up_zero_monthly_fee: negotiation.data.upZeroMonthlyFee,
                up_zero_implementation_fee:
                  negotiation.data.upZeroImplementationFee,
                negotiated_scope: negotiation.data.negotiatedScope,
              }
            : {}),
          ...(presentationChanged
            ? {
                presentation_starts_at: startsAt,
                presentation_ends_at: endsAt,
                presentation_event_id: event?.id ?? null,
                presentation_confirmation_requested_at: null,
              }
            : {}),
        },
      });
      if (lead.follow_up_task_id) {
        await tx.task.update({
          where: { id: lead.follow_up_task_id },
          data: {
            title: commercialFollowUpTaskTitle(input.brand_name),
            description: commercialFollowUpDescription({
              brandName: input.brand_name,
              ownerName: input.owner_name,
              ownerEmail: input.owner_email,
              instagram: input.instagram,
              monthlyRevenue: input.monthly_revenue,
              whatsapp: input.whatsapp,
              companyType: input.company_type,
              observations: input.observations,
            }),
            assignee_id: input.assignee_id,
          },
        });
      }
      if (presentationChanged && startsAt && endsAt) {
        await setCommercialLeadStage(tx, {
          leadId: lead.id,
          taskId: lead.task_id,
          projectId: lead.task.project_id,
          workspaceId: lead.workspace_id,
          stage: "presentation_scheduled",
        });
      }
      const googleJobId = event
        ? await queueGoogleCalendarEventSyncInTransaction(tx, event.id)
        : null;
      return { event, googleJobId };
    });

    if (assigneeChanged) {
      await notifyTaskAssignee({
        taskId: lead.task_id,
        userId: input.assignee_id,
        workspaceId: lead.workspace_id,
        data: { source: "commercial_lead_reassigned", lead_id: lead.id },
      });
    }
    if (mutation.event && (presentationChanged || assigneeChanged)) {
      await notifyCalendarEventAssignees({
        event: mutation.event,
        attendeeIds: teamUserIds,
        actor: auth.prismaUser,
      });
    }
    if (mutation.event) {
      after(async () => {
        if (mutation.googleJobId) {
          await processGoogleCalendarSyncJob(mutation.googleJobId).catch((error) =>
            logError("commercial-lead:google-sync", error, { lead_id: lead.id }),
          );
        }
        if (
          (presentationChanged || assigneeChanged || ownerRecipientChanged) &&
          startsAt &&
          endsAt
        ) {
          await sendCommercialLeadPresentationEmails({
            eventId: mutation.event!.id,
            recipients: [
              { email: input.owner_email, name: input.owner_name },
              ...teamRecipients,
            ],
            brandName: input.brand_name,
            startsAt,
            endsAt,
          }).catch((error) =>
            logError("commercial-lead:presentation-email", error, {
              lead_id: lead.id,
            }),
          );
        }
      });
    }
    await recordActivity({
      workspace_id: lead.workspace_id,
      actor_id: auth.prismaUser.id,
      type: "commercial_lead_updated",
      entity_type: "commercial_lead",
      entity_id: lead.id,
      project_id: lead.task.project_id,
      task_id: lead.task_id,
      metadata: {
        brand_name: input.brand_name,
        assignee_id: input.assignee_id,
        presentation_changed: presentationChanged,
        negotiation_updated: Boolean(negotiation?.ok),
      },
    });
    return NextResponse.json(
      await prisma.commercialLead.findUnique({ where: { id: lead.id } }),
    );
  }
  if (parsed.data.action === "schedule_presentation") {
    const startsAt = new Date(parsed.data.starts_at);
    const endsAt = new Date(parsed.data.ends_at);
    if (endsAt <= startsAt) return NextResponse.json({ error: "O término deve ser posterior ao início." }, { status: 400 });
    if (!["lead", "presentation_scheduled"].includes(lead.stage)) {
      return NextResponse.json({ error: "A apresentação não pode mais ser reagendada nesta etapa." }, { status: 409 });
    }
    const teamUserIds = Array.from(
      new Set([lead.assignee_id, ...lead.task.followers.map((follower) => follower.user_id)]),
    );
    const scheduled = await prisma.$transaction(async (tx) => {
      const event = lead.presentation_event_id
        ? await tx.calendarEvent.update({
            where: { id: lead.presentation_event_id },
            data: {
              title: `Apresentação — ${lead.brand_name}`,
              description: null,
              starts_at: startsAt,
              ends_at: endsAt,
              status: "scheduled",
              google_meet_requested: true,
              responsible_user_id: lead.assignee_id,
              attendees: {
                deleteMany: {},
                create: teamUserIds.map((user_id) => ({ user_id })),
              },
            },
          })
        : await tx.calendarEvent.create({
            data: {
              workspace_id: lead.workspace_id,
              title: `Apresentação — ${lead.brand_name}`,
              description: null,
              type: "client_call",
              starts_at: startsAt,
              ends_at: endsAt,
              timezone: "America/Sao_Paulo",
              created_by: lead.assignee_id,
              project_id: lead.task.project_id,
              task_id: lead.task_id,
              space_id: lead.task.project.space_id,
              responsible_user_id: lead.assignee_id,
              priority: "high",
              google_meet_requested: true,
              attendees: { create: teamUserIds.map((user_id) => ({ user_id })) },
              reminders: { create: [{ minutes_before: 1440 }, { minutes_before: 30 }] },
            },
          });
      await tx.commercialLead.update({
        where: { id: lead.id },
        data: {
          presentation_event_id: event.id,
          presentation_starts_at: startsAt,
          presentation_ends_at: endsAt,
          presentation_confirmation_requested_at: null,
        },
      });
      await tx.task.update({ where: { id: lead.task_id }, data: { due_date: startsAt } });
      await setCommercialLeadStage(tx, { leadId: lead.id, taskId: lead.task_id, projectId: lead.task.project_id, workspaceId: lead.workspace_id, stage: "presentation_scheduled" });
      return { event, googleJobId: await queueGoogleCalendarEventSyncInTransaction(tx, event.id) };
    });
    await notifyCalendarEventAssignees({ event: scheduled.event, attendeeIds: teamUserIds, actor: auth.prismaUser });
    after(async () => {
      if (scheduled.googleJobId) await processGoogleCalendarSyncJob(scheduled.googleJobId).catch((error) => logError("commercial-lead:google-sync", error, { lead_id: lead.id }));
      await sendCommercialLeadPresentationEmails({
        eventId: scheduled.event.id,
        recipients: [
          { email: lead.owner_email, name: lead.owner_name },
          { email: lead.assignee.email, name: lead.assignee.name },
          ...lead.task.followers.map((follower) => follower.user),
        ],
        brandName: lead.brand_name,
        startsAt,
        endsAt,
      }).catch((error) => logError("commercial-lead:presentation-email", error, { lead_id: lead.id }));
    });
    return NextResponse.json(await prisma.commercialLead.findUnique({ where: { id: lead.id } }));
  }

  if (
    parsed.data.action === "save_negotiation_checklist" ||
    parsed.data.action === "update_negotiation_checklist"
  ) {
    const isUpdate = parsed.data.action === "update_negotiation_checklist";
    if (
      !isUpdate &&
      (lead.stage !== "qualification" || !lead.qualified_at)
    ) {
      return NextResponse.json(
        { error: "Qualifique o Lead antes de preencher o checklist da negociação." },
        { status: 409 },
      );
    }
    if (isUpdate && !lead.negotiation_checklist_completed_at) {
      return NextResponse.json(
        { error: "Conclua o checklist da negociação antes de editá-lo." },
        { status: 409 },
      );
    }
    const checklist = validateCommercialLeadNegotiation({
      groupUpPlan: parsed.data.group_up_plan,
      groupUpMonthlyFee: parsed.data.group_up_monthly_fee,
      upZeroPlan: parsed.data.up_zero_plan,
      upZeroMonthlyFee: parsed.data.up_zero_monthly_fee,
      upZeroImplementationFee: parsed.data.up_zero_implementation_fee,
      negotiatedScope: parsed.data.negotiated_scope,
    });
    if (!checklist.ok) {
      return NextResponse.json(
        {
          error: negotiationValidationMessage(checklist.field),
        },
        { status: 400 },
      );
    }
    const negotiationData = {
      group_up_plan: checklist.data.groupUpPlan,
      group_up_monthly_fee: checklist.data.groupUpMonthlyFee,
      up_zero_plan: checklist.data.upZeroPlan,
      up_zero_monthly_fee: checklist.data.upZeroMonthlyFee,
      up_zero_implementation_fee: checklist.data.upZeroImplementationFee,
      negotiated_scope: checklist.data.negotiatedScope,
    };
    const updated = isUpdate
      ? await prisma.commercialLead.update({
          where: { id: lead.id },
          data: negotiationData,
        })
      : await prisma.$transaction(async (tx) => {
          await tx.commercialLead.update({
            where: { id: lead.id },
            data: {
              ...negotiationData,
              negotiation_checklist_completed_at: new Date(),
            },
          });
          await setCommercialLeadStage(tx, {
            leadId: lead.id,
            taskId: lead.task_id,
            projectId: lead.task.project_id,
            workspaceId: lead.workspace_id,
            stage: "proposal_sending",
          });
          return tx.commercialLead.findUnique({ where: { id: lead.id } });
        });
    await recordActivity({
      workspace_id: lead.workspace_id,
      actor_id: auth.prismaUser.id,
      type: isUpdate
        ? "commercial_lead_negotiation_updated"
        : "commercial_lead_negotiation_checklist_completed",
      entity_type: "commercial_lead",
      entity_id: lead.id,
      project_id: lead.task.project_id,
      task_id: lead.task_id,
      metadata: {
        brand_name: lead.brand_name,
        group_up_plan: checklist.data.groupUpPlan,
        group_up_monthly_fee: checklist.data.groupUpMonthlyFee,
        up_zero_plan: checklist.data.upZeroPlan,
        up_zero_monthly_fee: checklist.data.upZeroMonthlyFee,
        up_zero_implementation_fee: checklist.data.upZeroImplementationFee,
        negotiated_scope: checklist.data.negotiatedScope,
      },
    });
    return NextResponse.json(updated);
  }

  if (parsed.data.action === "confirm_closed") {
    if (lead.stage !== "awaiting_response") {
      return NextResponse.json(
        { error: "O fechamento só pode ser confirmado depois de Aguardando Resposta." },
        { status: 409 },
      );
    }
    const completed = await prisma.$transaction(async (tx) => {
      if (lead.follow_up_task_id && lead.follow_up_task) {
        await completeCommercialFollowUp(tx, {
          leadId: lead.id,
          followUpTaskId: lead.follow_up_task_id,
          workspaceId: lead.workspace_id,
          projectId: lead.follow_up_task.project_id,
        });
      }
      await setCommercialLeadStage(tx, {
        leadId: lead.id,
        taskId: lead.task_id,
        projectId: lead.task.project_id,
        workspaceId: lead.workspace_id,
        stage: "completed",
      });
      const contractTask = await createCommercialContractHandoffTask(tx, {
        lead,
        workspaceId: lead.workspace_id,
        sourceProjectOwnerId: lead.task.project.owner_id,
        followerIds: lead.task.followers.map((follower) => follower.user_id),
      });
      return {
        lead: await tx.commercialLead.findUnique({ where: { id: lead.id } }),
        contractTask,
      };
    });
    await notifyTaskAssignee({
      taskId: completed.contractTask.id,
      userId: completed.contractTask.assignee_id,
      workspaceId: lead.workspace_id,
      data: {
        source: "commercial_contract_handoff",
        commercial_lead_id: lead.id,
        brand_name: lead.brand_name,
      },
    });
    await recordActivity({
      workspace_id: lead.workspace_id,
      actor_id: auth.prismaUser.id,
      type: "commercial_lead_closed",
      entity_type: "commercial_lead",
      entity_id: lead.id,
      project_id: lead.task.project_id,
      task_id: lead.task_id,
      metadata: {
        brand_name: lead.brand_name,
        contract_handoff_task_id: completed.contractTask.id,
      },
    });
    return NextResponse.json(completed.lead);
  }

  if (parsed.data.action === "confirm_contract_handoff") {
    const contractInput = parsed.data;
    if (lead.stage !== "completed") {
      return NextResponse.json(
        { error: "Conclua o Lead antes de enviar os dados ao Financeiro." },
        { status: 409 },
      );
    }
    if (lead.contract_confirmed_at) {
      return NextResponse.json(
        {
          error:
            "Esta solicitação já foi enviada. Somente o Financeiro ou um Administrador do UP Flow pode continuar o fluxo do contrato.",
        },
        { status: 409 },
      );
    }
    try {
      const confirmed = await prisma.$transaction((tx) =>
        confirmCommercialContractHandoff(tx, {
          lead,
          workspaceId: lead.workspace_id,
          actorId: auth.prismaUser.id,
          cnpj: contractInput.cnpj,
          legalName: contractInput.legal_name,
          plan: contractInput.plan,
          services: contractInput.services,
          monthlyFee: contractInput.monthly_fee,
          confirmedAt: new Date(),
        }),
      );
      await notifyTaskAssignee({
        taskId: confirmed.financeTask.id,
        userId: confirmed.financeTask.assignee_id,
        workspaceId: lead.workspace_id,
        data: {
          source: "commercial_contract_preparation",
          commercial_lead_id: lead.id,
          brand_name: lead.brand_name,
          task_title: `Elaborar Contrato — ${lead.brand_name}`,
        },
      });
      await recordActivity({
        workspace_id: lead.workspace_id,
        actor_id: auth.prismaUser.id,
        type: "commercial_contract_handoff_confirmed",
        entity_type: "commercial_lead",
        entity_id: lead.id,
        project_id: confirmed.financeTask.project_id,
        task_id: confirmed.financeTask.id,
        metadata: {
          brand_name: lead.brand_name,
          contract_handoff_task_id: lead.contract_handoff_task_id,
          finance_contract_task_id: confirmed.financeTask.id,
          finance_assignee_id: confirmed.financeTask.assignee_id,
        },
      });
      return NextResponse.json(
        await prisma.commercialLead.findUnique({ where: { id: lead.id } }),
      );
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Não foi possível acionar o Financeiro.",
        },
        { status: 409 },
      );
    }
  }

  if (parsed.data.action === "mark_contract_sent") {
    if (
      !(await canAdvanceCommercialContract({
        workspaceId: lead.workspace_id,
        userId: auth.prismaUser.id,
        isUpFlowAdmin: isSuperAdmin(auth),
      }))
    ) {
      return NextResponse.json(
        {
          error:
            "Somente a equipe Financeira ou um Administrador do UP Flow pode avançar este contrato.",
        },
        { status: 403 },
      );
    }
    if (!lead.contract_confirmed_at) {
      return NextResponse.json(
        { error: "Confirme primeiro os dados necessários para o contrato." },
        { status: 409 },
      );
    }
    await prisma.$transaction(async (tx) => {
      if (!lead.finance_contract_task_id) {
        await repairMissingCommercialFinanceContractTasks(tx, {
          workspaceId: lead.workspace_id,
          actorId: auth.prismaUser.id,
        });
      }
      const currentLead = await tx.commercialLead.findUniqueOrThrow({
        where: { id: lead.id },
      });
      await markCommercialContractSent(tx, {
        lead: currentLead,
        workspaceId: lead.workspace_id,
      });
    });
    await recordActivity({
      workspace_id: lead.workspace_id,
      actor_id: auth.prismaUser.id,
      type: "commercial_contract_sent",
      entity_type: "commercial_lead",
      entity_id: lead.id,
      project_id: lead.contract_handoff_task?.project_id ?? lead.task.project_id,
      task_id: lead.contract_handoff_task_id ?? lead.task_id,
      metadata: { brand_name: lead.brand_name },
    });
    return NextResponse.json(
      await prisma.commercialLead.findUnique({ where: { id: lead.id } }),
    );
  }

  if (parsed.data.action === "mark_contract_signed") {
    if (
      !(await canAdvanceCommercialContract({
        workspaceId: lead.workspace_id,
        userId: auth.prismaUser.id,
        isUpFlowAdmin: isSuperAdmin(auth),
      }))
    ) {
      return NextResponse.json(
        {
          error:
            "Somente a equipe Financeira ou um Administrador do UP Flow pode avançar este contrato.",
        },
        { status: 403 },
      );
    }
    if (lead.finance_contract_task?.status !== "in_progress") {
      return NextResponse.json(
        { error: "Confirme o envio do contrato antes de registrar a assinatura." },
        { status: 409 },
      );
    }
    const signedAt = new Date();
    const signedContract = await prisma.$transaction(
      (tx) =>
        markCommercialContractSigned(tx, {
          lead,
          workspaceId: lead.workspace_id,
          actorId: auth.prismaUser.id,
          signedAt,
        }),
      { maxWait: 10_000, timeout: 30_000 },
    );
    await finishClientOnboardingStart(
      signedContract.onboarding,
      auth.prismaUser.id,
      "commercial_contract_signed",
    );
    await recordActivity({
      workspace_id: lead.workspace_id,
      actor_id: auth.prismaUser.id,
      type: "commercial_contract_signed",
      entity_type: "commercial_lead",
      entity_id: lead.id,
      company_id: signedContract.company.id,
      project_id: lead.contract_handoff_task?.project_id ?? lead.task.project_id,
      task_id: lead.contract_handoff_task_id ?? lead.task_id,
      metadata: {
        brand_name: lead.brand_name,
        company_id: signedContract.company.id,
        signed_at: signedAt.toISOString(),
        onboarding_id: signedContract.onboarding.onboarding.id,
        onboarding_reused: signedContract.onboarding.reused,
        onboarding_tasks_created: signedContract.onboarding.createdTasks.length,
      },
    });
    return NextResponse.json(
      await prisma.commercialLead.findUnique({ where: { id: lead.id } }),
    );
  }

  if (parsed.data.action === "ensure_contract_handoff") {
    if (lead.stage !== "completed") {
      return NextResponse.json(
        { error: "Conclua o Lead antes de iniciar a preparação contratual." },
        { status: 409 },
      );
    }
    const contractTask = await prisma.$transaction((tx) =>
      createCommercialContractHandoffTask(tx, {
        lead,
        workspaceId: lead.workspace_id,
        sourceProjectOwnerId: lead.task.project.owner_id,
        followerIds: lead.task.followers.map((follower) => follower.user_id),
      }),
    );
    await notifyTaskAssignee({
      taskId: contractTask.id,
      userId: contractTask.assignee_id,
      workspaceId: lead.workspace_id,
      data: {
        source: "commercial_contract_handoff",
        commercial_lead_id: lead.id,
        brand_name: lead.brand_name,
      },
    });
    return NextResponse.json(
      await prisma.commercialLead.findUnique({ where: { id: lead.id } }),
    );
  }

  if (parsed.data.action === "reopen_after_close") {
    if (lead.stage !== "completed") {
      return NextResponse.json(
        { error: "Somente um Lead concluído pode ser reaberto." },
        { status: 409 },
      );
    }
    if (!lead.proposal_storage_path) {
      return NextResponse.json(
        { error: "Não é possível reabrir este Lead sem uma proposta confirmada." },
        { status: 409 },
      );
    }

    const reopened = await prisma.$transaction(async (tx) => {
      await removeCommercialContractWorkflow(tx, {
        leadId: lead.id,
        contractHandoffTaskId: lead.contract_handoff_task_id,
        financeContractTaskId: lead.finance_contract_task_id,
      });
      let followUpTaskId = lead.follow_up_task_id;
      let followUpProjectId = lead.follow_up_task?.project_id;

      if (!followUpTaskId || !followUpProjectId) {
        const followUp = await createCommercialFollowUpTask(tx, {
          leadId: lead.id,
          parentTaskId: lead.task_id,
          workspaceId: lead.workspace_id,
          leadsProjectOwnerId: lead.task.project.owner_id,
          spaceId: lead.task.project.space_id,
          assigneeId: lead.assignee_id,
          followerIds: lead.task.followers.map((follower) => follower.user_id),
          summary: {
            brandName: lead.brand_name,
            ownerName: lead.owner_name,
            ownerEmail: lead.owner_email,
            instagram: lead.instagram,
            monthlyRevenue: lead.monthly_revenue,
            whatsapp: lead.whatsapp,
            companyType: lead.company_type,
            observations: lead.observations,
          },
          now: new Date(),
        });
        followUpTaskId = followUp.task.id;
        followUpProjectId = followUp.task.project_id;
      }

      await reopenCommercialFollowUp(tx, {
        leadId: lead.id,
        followUpTaskId,
        workspaceId: lead.workspace_id,
        projectId: followUpProjectId,
      });
      await setCommercialLeadStage(tx, {
        leadId: lead.id,
        taskId: lead.task_id,
        projectId: lead.task.project_id,
        workspaceId: lead.workspace_id,
        stage: "awaiting_response",
      });
      return tx.commercialLead.findUnique({ where: { id: lead.id } });
    });

    await recordActivity({
      workspace_id: lead.workspace_id,
      actor_id: auth.prismaUser.id,
      type: "commercial_lead_reopened",
      entity_type: "commercial_lead",
      entity_id: lead.id,
      project_id: lead.task.project_id,
      task_id: lead.task_id,
      metadata: {
        brand_name: lead.brand_name,
        previous_stage: "completed",
        restored_stage: "awaiting_response",
        proposal_preserved: true,
        contract_workflow_removed: true,
      },
    });
    return NextResponse.json(reopened);
  }

  if (parsed.data.action === "record_follow_up") {
    const currentFollowUpStage = lead.follow_up_stage;
    if (
      lead.stage !== "awaiting_response" ||
      !lead.follow_up_task_id ||
      !lead.follow_up_task ||
      !isCommercialFollowUpStage(currentFollowUpStage) ||
      currentFollowUpStage === "awaiting_decision" ||
      currentFollowUpStage === "completed" ||
      currentFollowUpStage === "withdrawn"
    ) {
      return NextResponse.json(
        { error: "A cadência de follow-up não está aguardando um contato." },
        { status: 409 },
      );
    }
    const now = new Date();
    if (lead.next_follow_up_at && lead.next_follow_up_at > now) {
      return NextResponse.json(
        { error: "Este contato ainda não chegou à data programada." },
        { status: 409 },
      );
    }
    const advanced = await prisma.$transaction(async (tx) => {
      const result = await advanceCommercialFollowUp(tx, {
        leadId: lead.id,
        followUpTaskId: lead.follow_up_task_id!,
        workspaceId: lead.workspace_id,
        projectId: lead.follow_up_task!.project_id,
        currentStage: currentFollowUpStage,
        proposalConfirmedAt: lead.follow_up_task!.created_at,
        now,
      });
      await tx.activityEvent.create({
        data: {
          workspace_id: lead.workspace_id,
          actor_id: auth.prismaUser.id,
          type: "commercial_lead_follow_up_recorded",
          entity_type: "commercial_lead",
          entity_id: lead.id,
          project_id: lead.follow_up_task!.project_id,
          task_id: lead.follow_up_task_id!,
          metadata: {
            brand_name: lead.brand_name,
            previous_stage: currentFollowUpStage,
            next_stage: result?.stage ?? null,
            next_follow_up_at: result?.dueAt?.toISOString() ?? null,
          },
        },
      });
      return result;
    });
    return NextResponse.json(
      await prisma.commercialLead.findUnique({ where: { id: lead.id } }),
    );
  }

  if (lead.stage !== "presentation_scheduled") {
    return NextResponse.json({ error: "A apresentação não está aguardando confirmação." }, { status: 409 });
  }
  if (!lead.presentation_ends_at || lead.presentation_ends_at > new Date()) {
    return NextResponse.json({ error: "A apresentação só pode ser confirmada depois do horário de término." }, { status: 409 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.commercialLead.update({
      where: { id: lead.id },
      data: {
        presentation_confirmed_at: new Date(),
      },
    });
    await setCommercialLeadStage(tx, {
      leadId: lead.id,
      taskId: lead.task_id,
      projectId: lead.task.project_id,
      workspaceId: lead.workspace_id,
      stage: "qualification",
    });
    return tx.commercialLead.findUnique({ where: { id: lead.id } });
  });

  if (updated) {
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
            source: "commercial_lead_qualification",
            lead_id: lead.id,
            brand_name: lead.brand_name,
          },
        }),
      ),
    );
  }
  await recordActivity({
    workspace_id: lead.workspace_id,
    actor_id: auth.prismaUser.id,
    type: "commercial_lead_presentation_confirmed",
    entity_type: "commercial_lead",
    entity_id: lead.id,
    project_id: lead.task.project_id,
    task_id: lead.task_id,
    metadata: { brand_name: lead.brand_name },
  });
  return NextResponse.json(updated);
}

export const PATCH = withErrorReporting("api:commercial/leads/id:PATCH", PATCH_handler);
