import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-response";
import { isWorkspaceAdminFor } from "@/lib/auth-helpers";
import { recordActivity } from "@/lib/activity";
import { withErrorReporting } from "@/lib/with-error-reporting";
import {
  parseContractedServices,
  syncClientOnboardingServices,
} from "@/lib/onboarding";
import { normalizeOnboardingRouteValue } from "@/lib/onboarding-routing";
import { timeEntryDurationSeconds } from "@/lib/time-entry-duration";
import {
  CLIENTS_REGISTRY_CONTEXT_PARAM,
  canViewClientFinancialsInContext,
  redactClientFinancials,
} from "@/lib/client-financial-access";
import {
  canViewClientCreativeTracking,
  getClientCreativeTaskMetadata,
  isClientCreativeTrackingTask,
  resolveClientCreativeTaskStage,
} from "@/lib/client-creative-tracking";
import { buildClientOnboardingSectorFolders } from "@/lib/client-onboarding-sector-folders";

const ClientSalesChannelSchema = z.enum(["WHOLESALE", "RETAIL", "BOTH"]);

const UpdateCompanySchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().nullable().optional(),
  website: z.string().trim().url().nullable().optional(),
  status: z.string().trim().optional(),
  commercial_status: z.string().trim().nullable().optional(),
  contract_value: z.number().nullable().optional(),
  commission: z.number().nullable().optional(),
  industry: z.string().trim().nullable().optional(),
  sales_channel: ClientSalesChannelSchema.nullable().optional(),
  service_type: z.string().trim().nullable().optional(),
  plan_name: z.string().trim().nullable().optional(),
  billing_cycle: z.string().trim().nullable().optional(),
  included_services: z
    .array(z.string().trim().min(1))
    .max(50)
    .nullable()
    .optional(),
  plan_notes: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  legal_name: z.string().trim().nullable().optional(),
  cnpj: z.string().trim().nullable().optional(),
  billing_email: z.string().trim().email().nullable().optional(),
  main_contact_email: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  whatsapp: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  billing_notes: z.string().trim().nullable().optional(),
  payment_terms: z.string().trim().nullable().optional(),
  contract_start_date: z.string().nullable().optional(),
  owner_id: z.string().uuid().optional(),
});

function sameServiceSet(left: unknown, right: unknown) {
  const normalize = (value: string) => normalizeOnboardingRouteValue(value);
  const toSet = (services: unknown) =>
    Array.from(
      new Set(
        parseContractedServices(services)
          .map(normalize)
          .filter((value) => value.length > 0),
      ),
    ).sort();
  const leftSet = toSet(left);
  const rightSet = toSet(right);
  return (
    leftSet.length === rightSet.length &&
    leftSet.every((service, index) => service === rightSet[index])
  );
}

async function validateCompanyOwner(ownerId: string, workspaceId: string) {
  const member = await prisma.workspaceMember.findFirst({
    where: {
      workspace_id: workspaceId,
      user_id: ownerId,
      status: "active",
      role: { not: "guest" },
    },
    select: { user_id: true },
  });
  return member?.user_id ?? null;
}

async function getCompany(
  id: string,
  workspaceId: string,
  options: { canViewCreativeTracking: boolean },
) {
  const company = await prisma.company.findFirst({
    where: { id, workspace_id: workspaceId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      contacts: { orderBy: [{ created_at: "desc" }, { id: "asc" }] },
      notes_log: {
        orderBy: [{ created_at: "desc" }, { id: "asc" }],
        include: { author: { select: { id: true, name: true, email: true } } },
      },
      projects: {
        orderBy: [{ created_at: "desc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          status: true,
          due_date: true,
          owner: { select: { id: true, name: true, email: true } },
        },
      },
      calendar_events: {
        orderBy: [{ starts_at: "desc" }, { id: "asc" }],
        take: 50,
      },
      activity_events: {
        orderBy: [{ created_at: "desc" }, { id: "asc" }],
        take: 50,
        include: {
          actor: {
            select: { id: true, name: true, email: true, avatar_url: true },
          },
        },
      },
      client_onboardings: {
        orderBy: [{ created_at: "desc" }, { id: "asc" }],
        take: 1,
        select: {
          checklist_items: {
            orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
            select: {
              id: true,
              department: true,
              status: true,
              required: true,
              completed_at: true,
              task: {
                select: {
                  id: true,
                  project_id: true,
                  project: {
                    select: {
                      id: true,
                      name: true,
                      space: { select: { id: true, name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!company) return null;

  const [tasks, timeEntries] = await Promise.all([
    prisma.task.findMany({
      where: {
        project: { workspace_id: workspaceId },
        OR: [
          { company_id: company.id },
          { project: { company_id: company.id } },
        ],
      },
      orderBy: [{ due_date: "asc" }, { created_at: "desc" }],
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        due_date: true,
        created_at: true,
        assignee: { select: { id: true, name: true, email: true } },
        custom_field_values: {
          select: {
            value: true,
            updated_at: true,
            definition: {
              select: { name: true, type: true, position: true },
            },
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            space: { select: { id: true, name: true } },
          },
        },
      },
      take: 100,
    }),
    prisma.timeEntry.findMany({
      where: {
        workspace_id: workspaceId,
        project: { company_id: company.id },
      },
      orderBy: [{ started_at: "desc" }, { id: "asc" }],
      select: {
        id: true,
        started_at: true,
        active_started_at: true,
        stopped_at: true,
        duration_seconds: true,
        status: true,
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
      take: 100,
    }),
  ]);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setDate(todayStart.getDate() - 7);
  const creativeTasks = tasks.filter((task) =>
    isClientCreativeTrackingTask({
      title: task.title,
      description: task.description,
      projectName: task.project.name,
      spaceName: task.project.space?.name,
    }),
  );
  const creativeTaskIds = new Set(creativeTasks.map((task) => task.id));
  const operationalTasks = tasks.filter((task) => !creativeTaskIds.has(task.id));
  const visibleTasks = options.canViewCreativeTracking ? tasks : operationalTasks;
  const activeProjects = company.projects.filter(
    (project) => project.status === "active",
  );
  const openTasks = visibleTasks.filter((task) => task.status !== "done");
  const overdueTasks = openTasks.filter(
    (task) => task.due_date && task.due_date < todayStart,
  );
  const nextDeadline =
    [
      ...company.projects
        .map((project) => project.due_date)
        .filter((date): date is Date => Boolean(date)),
      ...openTasks
        .map((task) => task.due_date)
        .filter((date): date is Date => Boolean(date)),
    ].sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const lastActivityAt = company.activity_events[0]?.created_at ?? null;
  const riskReasons: string[] = [];
  if (company.projects.length === 0) riskReasons.push("No linked projects");
  if (company.contacts.length === 0) riskReasons.push("No contacts");
  if (overdueTasks.length > 0)
    riskReasons.push(
      `${overdueTasks.length} overdue task${overdueTasks.length === 1 ? "" : "s"}`,
    );
  if (!lastActivityAt || lastActivityAt < sevenDaysAgo)
    riskReasons.push("No activity in 7 days");
  if (company.contract_value == null) riskReasons.push("No contract value");
  const trackedSeconds = timeEntries.reduce(
    (sum, entry) => sum + timeEntryDurationSeconds(entry),
    0,
  );
  const trackedHours = trackedSeconds / 3600;
  const assignedMembers = new Map<
    string,
    { id: string; name: string; email: string }
  >();
  assignedMembers.set(company.owner.id, company.owner);
  for (const project of company.projects) {
    assignedMembers.set(project.owner.id, project.owner);
  }
  for (const task of visibleTasks) {
    if (task.assignee) assignedMembers.set(task.assignee.id, task.assignee);
  }
  const healthStatus = riskReasons.some(
    (reason) => reason.includes("overdue") || reason === "No linked projects",
  )
    ? "risk"
    : riskReasons.length > 0
      ? "attention"
      : company.projects.length === 0 &&
          company.contract_value == null &&
          !company.plan_name &&
          !company.service_type
        ? "not_enough_data"
        : "healthy";

  const { client_onboardings: clientOnboardings, ...companyData } = company;
  return {
    ...companyData,
    sector_folders: buildClientOnboardingSectorFolders(
      clientOnboardings[0]?.checklist_items ?? [],
    ),
    tasks: operationalTasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date,
      assignee: task.assignee,
      project: task.project,
    })),
    creative_tracking_visible: options.canViewCreativeTracking,
    creative_work: options.canViewCreativeTracking
      ? {
          items: creativeTasks.map((task) => {
            const metadata = getClientCreativeTaskMetadata(task);
            const latestStageUpdate = task.custom_field_values.reduce<Date>(
              (latest, field) =>
                field.updated_at > latest ? field.updated_at : latest,
              task.created_at,
            );
            return {
              id: task.id,
              title: task.title,
              status: task.status,
              stage: resolveClientCreativeTaskStage(
                task.custom_field_values,
                task.status,
              ),
              priority: task.priority,
              due_date: task.due_date,
              created_at: task.created_at,
              last_updated_at: latestStageUpdate,
              assignee: task.assignee,
              project: task.project,
              ...metadata,
            };
          }),
          summary: {
            total: creativeTasks.length,
            open: creativeTasks.filter((task) => task.status !== "done").length,
            in_progress: creativeTasks.filter(
              (task) => task.status === "in_progress",
            ).length,
            completed: creativeTasks.filter((task) => task.status === "done")
              .length,
            overdue: creativeTasks.filter(
              (task) =>
                task.status !== "done" &&
                task.due_date != null &&
                task.due_date < todayStart,
            ).length,
          },
        }
      : undefined,
    time_entries: timeEntries,
    summary: {
      project_count: company.projects.length,
      active_project_count: activeProjects.length,
      open_task_count: openTasks.length,
      overdue_task_count: overdueTasks.length,
      meeting_count: company.calendar_events.length,
      contact_count: company.contacts.length,
      tracked_seconds: trackedSeconds,
      risk_reasons: riskReasons,
      health_status: healthStatus,
      next_deadline: nextDeadline,
      latest_activity: company.activity_events[0] ?? null,
      assigned_members: Array.from(assignedMembers.values()).slice(0, 8),
      profitability_ratio:
        company.contract_value && company.commission != null
          ? company.commission / company.contract_value
          : null,
      contract_value_per_tracked_hour:
        company.contract_value != null && trackedHours > 0
          ? company.contract_value / trackedHours
          : null,
      commission_per_tracked_hour:
        company.commission != null && trackedHours > 0
          ? company.commission / trackedHours
          : null,
    },
  };
}

type RouteContext = { params: Promise<{ id: string }> };

async function GET_handler(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  if (!auth.currentWorkspaceId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = auth.memberships.find(
    (item) => item.workspace_id === auth.currentWorkspaceId,
  );
  const canViewCreativeTracking = canViewClientCreativeTracking({
    isWorkspaceAdmin: isWorkspaceAdminFor(auth, auth.currentWorkspaceId),
    membership: membership
      ? {
          role: membership.role,
          departmentName: membership.department?.name,
        }
      : null,
  });
  const company = await getCompany(id, auth.currentWorkspaceId, {
    canViewCreativeTracking,
  });
  if (!company)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const canViewFinancials = await canViewClientFinancialsInContext(
    auth,
    auth.currentWorkspaceId,
    req.nextUrl.searchParams.get(CLIENTS_REGISTRY_CONTEXT_PARAM),
  );
  return NextResponse.json({
    ...redactClientFinancials(company, canViewFinancials),
    financials_visible: canViewFinancials,
  });
}

async function PATCH_handler(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  if (!auth.currentWorkspaceId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const company = await prisma.company.findFirst({
    where: { id, workspace_id: auth.currentWorkspaceId },
  });
  if (!company)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isWorkspaceAdminFor(auth, company.workspace_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = UpdateCompanySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid company", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const updatesFinancialData = [
    "contract_value",
    "commission",
    "payment_terms",
    "billing_notes",
  ].some((field) => field in parsed.data);
  if (
    updatesFinancialData &&
    !(await canViewClientFinancialsInContext(
      auth,
      company.workspace_id,
      req.nextUrl.searchParams.get(CLIENTS_REGISTRY_CONTEXT_PARAM),
    ))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (parsed.data.owner_id !== undefined) {
    const ownerId = await validateCompanyOwner(
      parsed.data.owner_id,
      company.workspace_id,
    );
    if (!ownerId) {
      return NextResponse.json(
        {
          error:
            "Responsible manager must be an active non-guest member of this workspace",
        },
        { status: 400 },
      );
    }
  }

  const includedServicesChanged =
    "included_services" in parsed.data &&
    !sameServiceSet(
      company.included_services,
      parsed.data.included_services ?? [],
    );
  if (includedServicesChanged) {
    const activeOnboarding = await prisma.clientOnboarding.findFirst({
      where: {
        workspace_id: company.workspace_id,
        company_id: company.id,
        status: { not: "onboarding_complete" },
      },
      select: { contracted_services: true },
    });
    if (
      activeOnboarding &&
      !sameServiceSet(
        activeOnboarding.contracted_services,
        parsed.data.included_services ?? [],
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Services cannot be changed while onboarding is active. Update the onboarding workflow first.",
        },
        { status: 409 },
      );
    }
  }

  const updateData = { ...parsed.data } as Record<string, unknown>;
  if ("included_services" in parsed.data) {
    updateData.included_services =
      parsed.data.included_services === null
        ? Prisma.JsonNull
        : parsed.data.included_services;
  }
  if ("contract_start_date" in parsed.data) {
    updateData.contract_start_date = parsed.data.contract_start_date
      ? new Date(parsed.data.contract_start_date)
      : null;
  }

  const updated = await prisma.company.update({
    where: { id: company.id },
    data: updateData as unknown as Prisma.CompanyUncheckedUpdateInput,
  });

  await recordActivity({
    workspace_id: company.workspace_id,
    actor_id: auth.prismaUser.id,
    type: "company_updated",
    entity_type: "company",
    entity_id: company.id,
    company_id: company.id,
    metadata: {
      name: updated.name,
      ...(parsed.data.status !== undefined
        ? { previous_status: company.status, status: updated.status }
        : {}),
      ...(parsed.data.owner_id !== undefined
        ? { previous_owner_id: company.owner_id, owner_id: updated.owner_id }
        : {}),
    },
  });

  const onboardingSync = includedServicesChanged
    ? await syncClientOnboardingServices({
        companyId: updated.id,
        workspaceId: company.workspace_id,
        actorId: auth.prismaUser.id,
        services: parsed.data.included_services ?? [],
      })
    : null;

  const responsePayload = {
    ...updated,
    onboarding_id: onboardingSync?.onboarding.id ?? null,
    synced_onboarding_tasks: onboardingSync?.createdTasks ?? [],
    moved_onboarding_tasks: onboardingSync?.movedTasks ?? 0,
  };
  const canViewFinancials = await canViewClientFinancialsInContext(
    auth,
    company.workspace_id,
    req.nextUrl.searchParams.get(CLIENTS_REGISTRY_CONTEXT_PARAM),
  );

  return NextResponse.json({
    ...redactClientFinancials(responsePayload, canViewFinancials),
    financials_visible: canViewFinancials,
  });
}

async function DELETE_handler(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  void req;
  if (!auth.currentWorkspaceId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const company = await prisma.company.findFirst({
    where: { id, workspace_id: auth.currentWorkspaceId },
    select: { id: true, workspace_id: true, name: true },
  });
  if (!company)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isWorkspaceAdminFor(auth, company.workspace_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id" = ${company.id} FOR UPDATE`;
    await tx.activityEvent.create({
      data: {
        workspace_id: company.workspace_id,
        actor_id: auth.prismaUser.id,
        type: "company_deleted",
        entity_type: "company",
        entity_id: company.id,
        company_id: company.id,
        metadata: { name: company.name },
      },
    });
    await tx.project.updateMany({
      where: {
        workspace_id: company.workspace_id,
        company_id: company.id,
        kind: { in: ["client", "onboarding"] },
      },
      data: { company_id: null, onboarding_enabled: false, kind: "internal" },
    });
    await tx.company.delete({ where: { id: company.id } });
  });

  return NextResponse.json({ success: true });
}

export const GET = withErrorReporting("api:companies/id:GET", GET_handler);
export const PATCH = withErrorReporting(
  "api:companies/id:PATCH",
  PATCH_handler,
);
export const DELETE = withErrorReporting(
  "api:companies/id:DELETE",
  DELETE_handler,
);
