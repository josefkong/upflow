import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-response";
import { recordActivity } from "@/lib/activity";
import {
  financeRegistrationComplete,
  isMarketingB2BFormService,
  isMarketingB2CFormService,
  loadOnboardingAccess,
  onboardingCapabilities,
  onboardingSelect,
  overrideUpZeroMarketingB2BGate,
  recomputeOnboardingProgress,
  redactOnboardingContracts,
  resolveOnboardingTaskProjectId,
  routeForService,
  sendOnboardingAssignmentNotifications,
  type OnboardingAssignmentNotificationTarget,
} from "@/lib/onboarding";
import { withErrorReporting } from "@/lib/with-error-reporting";
import { sharedOnboardingWhatsAppGroupIsComplete } from "@/lib/onboarding-shared-flow";

const PatchSchema = z.object({
  finance: z
    .object({
      legal_name: z.string().trim().nullable().optional(),
      cnpj: z.string().trim().nullable().optional(),
      billing_email: z.string().trim().email().nullable().optional(),
      main_contact_email: z.string().trim().email().nullable().optional(),
      phone: z.string().trim().nullable().optional(),
      whatsapp: z.string().trim().nullable().optional(),
      address: z.string().trim().nullable().optional(),
      billing_notes: z.string().trim().nullable().optional(),
      contract_value: z.number().nullable().optional(),
      payment_terms: z.string().trim().nullable().optional(),
      contract_start_date: z.string().nullable().optional(),
    })
    .optional(),
  support_group: z
    .object({
      group_created: z.boolean().optional(),
      group_name: z.string().trim().nullable().optional(),
      group_link: z.string().trim().nullable().optional(),
      main_client_contact: z.string().trim().nullable().optional(),
      commercial_responsible: z.string().trim().nullable().optional(),
      account_responsible: z.string().trim().nullable().optional(),
      internal_participants: z.array(z.string()).nullable().optional(),
      client_participants: z.array(z.string()).nullable().optional(),
      notes: z.string().trim().nullable().optional(),
      status: z
        .enum(["not_created", "created", "waiting_for_client", "not_necessary"])
        .optional(),
    })
    .optional(),
  meeting: z
    .object({
      service: z.string().trim().min(1),
      scheduled: z.boolean().optional(),
      scheduled_at: z.string().nullable().optional(),
      meeting_url: z.string().trim().nullable().optional(),
      notes: z.string().trim().nullable().optional(),
    })
    .optional(),
  service_assignment: z
    .object({
      service: z.string().trim().min(1),
      leader_id: z.string().trim().nullable().optional(),
      department_id: z.string().trim().nullable().optional(),
      notes: z.string().trim().nullable().optional(),
    })
    .optional(),
  completion_override: z
    .object({
      reason: z.string().trim().min(8),
    })
    .optional(),
  marketing_b2b_dependency_override: z
    .object({
      reason: z.string().trim().min(8),
    })
    .optional(),
});

function optionalDate(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}

type RouteContext = { params: Promise<{ id: string }> };

async function GET_handler(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  void req;
  const onboarding = await prisma.clientOnboarding.findUnique({
    where: { id },
    select: onboardingSelect(),
  });
  if (!onboarding)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await loadOnboardingAccess(auth, onboarding.id);
  if (!access)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const redacted = redactOnboardingContracts(
    onboarding,
    access.canViewPrivateContract,
  );
  return NextResponse.json({
    ...redacted,
    capabilities: onboardingCapabilities(access, onboarding.checklist_items),
  });
}

async function PATCH_handler(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  const access = await loadOnboardingAccess(auth, id);
  if (!access)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid onboarding update", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const notificationTargets: OnboardingAssignmentNotificationTarget[] = [];
    if (parsed.data.finance) {
      if (!access.canUpdateFinance) return null;
      const startDate = optionalDate(parsed.data.finance.contract_start_date);
      if (startDate === "invalid")
        throw new Error("Invalid contract start date");
      const company = await tx.company.update({
        where: { id: access.onboarding.company_id },
        data: {
          ...parsed.data.finance,
          ...(startDate !== undefined && { contract_start_date: startDate }),
        },
        select: {
          legal_name: true,
          cnpj: true,
          billing_email: true,
          main_contact_email: true,
          contract_value: true,
          payment_terms: true,
          contract_start_date: true,
        },
      });
      if (financeRegistrationComplete(company)) {
        await tx.onboardingChecklistItem.updateMany({
          where: { onboarding_id: id, department: "Finance" },
          data: {
            status: "complete",
            completed_at: new Date(),
            completed_by: auth.prismaUser.id,
          },
        });
      }
    }

    if (parsed.data.support_group) {
      if (!access.canUpdateSupport) return null;
      const supportPayload = parsed.data.support_group;
      const groupCreated =
        supportPayload.group_created === true ||
        supportPayload.status === "created";
      const support = await tx.supportGroup.update({
        where: { onboarding_id: id },
        data: {
          ...supportPayload,
          ...(supportPayload.group_created !== undefined ||
          supportPayload.status !== undefined
            ? { group_created: groupCreated }
            : {}),
          ...(groupCreated
            ? { group_created_at: new Date(), created_by: auth.prismaUser.id }
            : {}),
          internal_participants:
            supportPayload.internal_participants === undefined
              ? undefined
              : (supportPayload.internal_participants as Prisma.InputJsonValue),
          client_participants:
            supportPayload.client_participants === undefined
              ? undefined
              : (supportPayload.client_participants as Prisma.InputJsonValue),
        },
      });
      if (support.group_created) {
        await tx.onboardingChecklistItem.updateMany({
          where: {
            onboarding_id: id,
            OR: [
              { automation_key: "shared_onboarding:internal:support-group" },
              ...(sharedOnboardingWhatsAppGroupIsComplete(support)
                ? [
                    {
                      automation_key:
                        "shared_onboarding:internal:01:commercial-whatsapp-group",
                    },
                  ]
                : []),
              { department: "Support", automation_key: null },
            ],
          },
          data: {
            status: "complete",
            completed_at: new Date(),
            completed_by: auth.prismaUser.id,
          },
        });
      }
    }

    if (parsed.data.meeting) {
      if (!access.canUpdateService(parsed.data.meeting.service)) return null;
      const scheduledAt = optionalDate(parsed.data.meeting.scheduled_at);
      if (scheduledAt === "invalid") throw new Error("Invalid meeting date");
      const meeting = await tx.onboardingMeeting.update({
        where: {
          onboarding_id_service: {
            onboarding_id: id,
            service: parsed.data.meeting.service,
          },
        },
        data: {
          scheduled: parsed.data.meeting.scheduled ?? undefined,
          ...(scheduledAt !== undefined && { scheduled_at: scheduledAt }),
          meeting_url: parsed.data.meeting.meeting_url,
          notes: parsed.data.meeting.notes,
        },
      });
      if (meeting.scheduled && meeting.checklist_item_id) {
        await tx.onboardingChecklistItem.update({
          where: { id: meeting.checklist_item_id },
          data: {
            status: "complete",
            completed_at: new Date(),
            completed_by: auth.prismaUser.id,
          },
        });
      }
    }

    if (parsed.data.service_assignment) {
      if (!access.admin) return null;
      const serviceAssignment = parsed.data.service_assignment;
      const leaderWasProvided = Object.hasOwn(serviceAssignment, "leader_id");
      const departmentWasProvided = Object.hasOwn(
        serviceAssignment,
        "department_id",
      );
      const notesWereProvided = Object.hasOwn(serviceAssignment, "notes");

      if (leaderWasProvided && serviceAssignment.leader_id) {
        const member = await tx.workspaceMember.findFirst({
          where: {
            workspace_id: access.onboarding.workspace_id,
            user_id: serviceAssignment.leader_id,
            status: "active",
            role: { not: "guest" },
          },
          select: { id: true },
        });
        if (!member)
          throw new Error("Selected leader is not an active workspace member.");
      }
      if (departmentWasProvided && serviceAssignment.department_id) {
        const department = await tx.department.findFirst({
          where: {
            id: serviceAssignment.department_id,
            workspace_id: access.onboarding.workspace_id,
          },
          select: { id: true },
        });
        if (!department)
          throw new Error(
            "Selected department does not belong to this workspace.",
          );
      }
      const assignment = await tx.onboardingServiceAssignment.update({
        where: {
          onboarding_id_service: {
            onboarding_id: id,
            service: serviceAssignment.service,
          },
        },
        data: {
          ...(leaderWasProvided
            ? {
                leader_id: serviceAssignment.leader_id,
                status: serviceAssignment.leader_id ? "assigned" : "unassigned",
              }
            : {}),
          ...(departmentWasProvided
            ? { department_id: serviceAssignment.department_id }
            : {}),
          ...(notesWereProvided ? { notes: serviceAssignment.notes } : {}),
        },
        select: { leader_id: true },
      });
      const service = serviceAssignment.service;
      const meeting = await tx.onboardingMeeting.findUnique({
        where: {
          onboarding_id_service: {
            onboarding_id: id,
            service,
          },
        },
        select: { id: true, checklist_item_id: true },
      });
      if (meeting && leaderWasProvided) {
        await tx.onboardingMeeting.update({
          where: { id: meeting.id },
          data: { leader_id: assignment.leader_id },
        });
      }
      if (meeting?.checklist_item_id && leaderWasProvided) {
        const projectContext = access.onboarding.project_id
          ? await tx.project.findUnique({
              where: { id: access.onboarding.project_id },
              select: {
                id: true,
                owner_id: true,
                space_id: true,
                company: { select: { name: true } },
              },
            })
          : null;
        const companyContext = await tx.company.findUnique({
          where: { id: access.onboarding.company_id },
          select: { name: true },
        });
        const service = serviceAssignment.service;
        const taskProjectId = await resolveOnboardingTaskProjectId(tx, {
          workspaceId: access.onboarding.workspace_id,
          companyId: access.onboarding.company_id,
          companyName:
            projectContext?.company?.name ?? companyContext?.name ?? "Client",
          sourceProjectId: access.onboarding.project_id ?? null,
          sourceProjectSpaceId: projectContext?.space_id ?? null,
          ownerId: auth.prismaUser.id,
          route: routeForService(service),
        });
        const checklistItem = await tx.onboardingChecklistItem.update({
          where: { id: meeting.checklist_item_id },
          data: { owner_id: assignment.leader_id },
          select: { id: true, task_id: true, sort_order: true },
        });
        let taskId = checklistItem.task_id;
        if (!taskId) {
          const serviceTask = await tx.task.create({
            data: {
              project_id: taskProjectId,
              company_id: access.onboarding.company_id,
              title: `Onboarding: schedule ${service} onboarding meeting`,
              description: `Schedule the ${service} onboarding meeting and save the date/link in the onboarding workflow.`,
              status: "todo",
              priority: "medium",
              assignee_id: assignment.leader_id,
              position: checklistItem.sort_order,
            },
          });
          taskId = serviceTask.id;
          await tx.onboardingChecklistItem.update({
            where: { id: checklistItem.id },
            data: { task_id: taskId },
          });
        } else {
          await tx.task.update({
            where: { id: taskId },
            data: {
              assignee_id: assignment.leader_id,
              project_id: taskProjectId,
            },
          });
        }
        notificationTargets.push({
          userId: assignment.leader_id,
          taskId,
          workspaceId: access.onboarding.workspace_id,
          onboardingId: id,
          actorId: auth.prismaUser.id,
          label: `Schedule ${service} onboarding meeting`,
          companyId: access.onboarding.company_id,
        });
      }
      const b2bForm = isMarketingB2BFormService(service)
        ? await tx.marketingB2BOnboardingForm.findFirst({
            where: { onboarding_id: id },
            orderBy: [
              { updated_at: "desc" },
              { created_at: "desc" },
              { id: "asc" },
            ],
            select: {
              task_id: true,
              checklist_item_id: true,
              task: { select: { assignee_id: true } },
            },
          })
        : null;
      const b2cForm =
        !b2bForm && isMarketingB2CFormService(service)
          ? await tx.marketingB2COnboardingForm.findFirst({
              where: { onboarding_id: id },
              orderBy: [
                { updated_at: "desc" },
                { created_at: "desc" },
                { id: "asc" },
              ],
              select: {
                task_id: true,
                checklist_item_id: true,
                task: { select: { assignee_id: true } },
              },
            })
          : null;
      const form = b2bForm ?? b2cForm;
      if (form && leaderWasProvided) {
        const nextLeaderId = assignment.leader_id;
        await Promise.all([
          tx.onboardingChecklistItem.update({
            where: { id: form.checklist_item_id },
            data: { owner_id: nextLeaderId },
          }),
          tx.task.update({
            where: { id: form.task_id },
            data: { assignee_id: nextLeaderId },
          }),
        ]);
        if (nextLeaderId && form.task.assignee_id !== nextLeaderId) {
          notificationTargets.push({
            userId: nextLeaderId,
            taskId: form.task_id,
            workspaceId: access.onboarding.workspace_id,
            onboardingId: id,
            actorId: auth.prismaUser.id,
            label: `Complete ${b2bForm ? "Marketing B2B" : "Marketing B2C"} onboarding form`,
            companyId: access.onboarding.company_id,
          });
        }
      }
      const missingLeader = await tx.onboardingServiceAssignment.findFirst({
        where: {
          onboarding_id: id,
          OR: [{ leader_id: null }, { status: "needs_mapping" }],
        },
        select: { id: true },
      });
      await tx.onboardingChecklistItem.updateMany({
        where: { onboarding_id: id, department: "Internal Assignment" },
        data: missingLeader
          ? { status: "pending", completed_at: null, completed_by: null }
          : {
              status: "complete",
              completed_at: new Date(),
              completed_by: auth.prismaUser.id,
            },
      });
    }

    if (parsed.data.marketing_b2b_dependency_override) {
      if (!access.admin) return null;
      const override = await overrideUpZeroMarketingB2BGate(tx, {
        onboardingId: id,
        actorId: auth.prismaUser.id,
        reason: parsed.data.marketing_b2b_dependency_override.reason,
      });
      notificationTargets.push(...override.notificationTargets);
      const onboarding = await tx.clientOnboarding.findUniqueOrThrow({
        where: { id },
        select: onboardingSelect(),
      });
      return { onboarding, notificationTargets };
    }

    if (parsed.data.completion_override) {
      if (!access.admin) return null;
      await tx.clientOnboarding.update({
        where: { id },
        data: {
          status: "onboarding_complete",
          progress: 100,
          completed_at: new Date(),
          completion_override_reason: parsed.data.completion_override.reason,
          completion_overridden_by: auth.prismaUser.id,
          completion_overridden_at: new Date(),
        },
        select: { id: true },
      });
      const onboarding = await tx.clientOnboarding.findUniqueOrThrow({
        where: { id },
        select: onboardingSelect(),
      });
      return { onboarding, notificationTargets };
    }

    const onboarding = await recomputeOnboardingProgress(tx, id);
    return { onboarding, notificationTargets };
  });

  if (!result)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { onboarding: updated, notificationTargets } = result;
  await sendOnboardingAssignmentNotifications(notificationTargets);

  await recordActivity({
    workspace_id: updated.workspace_id,
    actor_id: auth.prismaUser.id,
    type: "client_onboarding_updated",
    entity_type: "client_onboarding",
    entity_id: updated.id,
    project_id: updated.project_id,
    company_id: updated.company_id,
    metadata: { status: updated.status, progress: updated.progress },
  });

  const freshAccess = await loadOnboardingAccess(auth, id);
  return NextResponse.json(
    redactOnboardingContracts(
      updated,
      Boolean(freshAccess?.canViewPrivateContract),
    ),
  );
}

export const GET = withErrorReporting("api:onboarding/[id]:GET", GET_handler);
export const PATCH = withErrorReporting(
  "api:onboarding/[id]:PATCH",
  PATCH_handler,
);
