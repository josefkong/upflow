import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isWorkspaceAdminFor } from "@/lib/auth-helpers";
import { resolveCompanyCreationAccess } from "@/lib/company-creation-access";
import { requireAuth } from "@/lib/auth-response";
import { withErrorReporting } from "@/lib/with-error-reporting";
import { recordActivity } from "@/lib/activity";
import { startClientOnboardingForCompany } from "@/lib/onboarding";
import { buildPage, parsePagination } from "@/lib/pagination";
import { timeEntryDurationSeconds } from "@/lib/time-entry-duration";
import {
  canViewClientFinancials,
  redactClientFinancials,
} from "@/lib/client-financial-access";
import { formatBrazilianCnpj, isBrazilianCnpj } from "@/lib/brazilian-cnpj";
import { formatBrazilianMobile, isBrazilianMobile } from "@/lib/brazilian-mobile";

const ClientSalesChannelSchema = z.enum(["WHOLESALE", "RETAIL", "BOTH"]);
const CompanySalesChannelFilterSchema = z.enum([
  "all",
  "wholesale",
  "retail",
  "both",
  "unclassified",
]);
const CompanyStatusFilterSchema = z.enum(["all", "active", "inactive"]);

// Card and picker views only need the company record and its owner. Keep the
// richer relationship graph below for health reporting, which still needs it
// to calculate summaries.
const companyListInclude = {
  owner: { select: { id: true, name: true, email: true } },
} as const satisfies Prisma.CompanyInclude;

const CompanySchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  website: z.string().trim().url().optional().nullable(),
  status: z.string().trim().optional(),
  commercial_status: z.string().trim().optional().nullable(),
  contract_value: z.number().optional().nullable(),
  commission: z.number().optional().nullable(),
  industry: z.string().trim().optional().nullable(),
  sales_channel: ClientSalesChannelSchema.optional().nullable(),
  service_type: z.string().trim().optional().nullable(),
  plan_name: z.string().trim().optional().nullable(),
  billing_cycle: z.string().trim().optional().nullable(),
  included_services: z
    .array(z.string().trim().min(1))
    .max(50)
    .optional()
    .nullable(),
  start_onboarding: z.boolean().optional(),
  complete_registration: z.boolean().optional(),
  plan_notes: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  legal_name: z.string().trim().optional().nullable(),
  cnpj: z.string().trim().optional().nullable(),
  billing_email: z.string().trim().email().optional().nullable(),
  main_contact_email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  whatsapp: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  billing_notes: z.string().trim().optional().nullable(),
  payment_terms: z.string().trim().optional().nullable(),
  contract_start_date: z.string().trim().optional().nullable(),
  owner_id: z.string().trim().optional().nullable(),
  contact_name: z.string().trim().optional().nullable(),
  contact_email: z.string().trim().email().optional().nullable(),
  contact_phone: z.string().trim().optional().nullable(),
  contact_role: z.string().trim().optional().nullable(),
  responsible_department_id: z.string().trim().optional().nullable(),
  responsible_department_name: z.string().trim().optional().nullable(),
});

async function GET_handler(req: NextRequest) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  if (!auth.currentWorkspaceId) {
    return NextResponse.json({ items: [], nextCursor: null });
  }
  const canViewFinancials = await canViewClientFinancials(
    auth,
    auth.currentWorkspaceId,
  );

  const { limit, cursor } = parsePagination(req, {
    defaultLimit: 50,
    maxLimit: 100,
  });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length > 200) {
    return NextResponse.json({ error: "Query too long" }, { status: 400 });
  }
  const parsedSalesChannel = CompanySalesChannelFilterSchema.safeParse(
    (url.searchParams.get("sales_channel") || "all").trim().toLowerCase(),
  );
  if (!parsedSalesChannel.success) {
    return NextResponse.json(
      {
        error:
          "Invalid sales_channel. Use all, wholesale, retail, both, or unclassified.",
      },
      { status: 400 },
    );
  }
  const parsedStatus = CompanyStatusFilterSchema.safeParse(
    (url.searchParams.get("status") || "active").trim().toLowerCase(),
  );
  if (!parsedStatus.success) {
    return NextResponse.json(
      { error: "Invalid status. Use all, active, or inactive." },
      { status: 400 },
    );
  }
  const includeSummary = url.searchParams.get("include_summary") !== "false";
  const statusWhere: Prisma.CompanyWhereInput = (() => {
    switch (parsedStatus.data) {
      case "active":
        return { status: "active" };
      case "inactive":
        return { status: { in: ["inactive", "archived"] } };
      case "all":
        return {};
    }
  })();
  const salesChannelWhere: Prisma.CompanyWhereInput = (() => {
    switch (parsedSalesChannel.data) {
      case "wholesale":
        return { sales_channel: { in: ["WHOLESALE", "BOTH"] } };
      case "retail":
        return { sales_channel: { in: ["RETAIL", "BOTH"] } };
      case "both":
        return { sales_channel: "BOTH" };
      case "unclassified":
        return { sales_channel: null };
      case "all":
        return {};
    }
  })();
  const where: Prisma.CompanyWhereInput = {
    workspace_id: auth.currentWorkspaceId,
    ...statusWhere,
    ...salesChannelWhere,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
            { plan_name: { contains: q, mode: "insensitive" as const } },
            { service_type: { contains: q, mode: "insensitive" as const } },
            { industry: { contains: q, mode: "insensitive" as const } },
            {
              owner: {
                is: { name: { contains: q, mode: "insensitive" as const } },
              },
            },
          ],
        }
      : {}),
  };
  const pageOptions = {
    where,
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: [
      { created_at: "desc" },
      { id: "asc" },
    ] satisfies Prisma.CompanyOrderByWithRelationInput[],
  };

  if (!includeSummary) {
    const rows = await prisma.company.findMany({
      ...pageOptions,
      include: companyListInclude,
    });
    const page = buildPage(rows, limit);
    return NextResponse.json({
      ...page,
      items: page.items.map((company) =>
        redactClientFinancials(company, canViewFinancials),
      ),
      financials_visible: canViewFinancials,
    });
  }

  const rows = await prisma.company.findMany({
    ...pageOptions,
    include: {
      owner: { select: { id: true, name: true, email: true } },
      contacts: { select: { id: true } },
      calendar_events: { select: { id: true } },
      activity_events: {
        orderBy: [{ created_at: "desc" }, { id: "asc" }],
        take: 1,
        select: {
          type: true,
          created_at: true,
          actor: { select: { id: true, name: true, email: true } },
        },
      },
      tasks: {
        select: {
          id: true,
          title: true,
          status: true,
          due_date: true,
          assignee: { select: { id: true, name: true, email: true } },
        },
      },
      projects: {
        select: {
          id: true,
          name: true,
          status: true,
          due_date: true,
          owner: { select: { id: true, name: true, email: true } },
          time_entries: {
            select: {
              id: true,
              started_at: true,
              active_started_at: true,
              duration_seconds: true,
              status: true,
            },
          },
          tasks: {
            select: {
              id: true,
              title: true,
              status: true,
              due_date: true,
              assignee: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
    },
  });

  const page = buildPage(rows, limit);
  return NextResponse.json({
    items: page.items.map((company) =>
      redactClientFinancials(withCompanySummary(company), canViewFinancials),
    ),
    nextCursor: page.nextCursor,
    financials_visible: canViewFinancials,
  });
}

async function POST_handler(req: NextRequest) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  if (!auth.currentWorkspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 400 });
  }

  const parsed = CompanySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid company", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const includesFinancialData =
    parsed.data.contract_value != null ||
    parsed.data.commission != null ||
    Boolean(parsed.data.payment_terms?.trim()) ||
    Boolean(parsed.data.billing_notes?.trim());
  const canViewFinancials = await canViewClientFinancials(
    auth,
    auth.currentWorkspaceId,
  );
  if (includesFinancialData && !canViewFinancials) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Creating a company is standalone unless a caller explicitly opts into
  // onboarding. This prevents client-only forms and saved drafts from
  // accidentally creating onboarding tasks, projects, or notifications.
  const startOnboarding = parsed.data.start_onboarding ?? false;
  const completeRegistration = parsed.data.complete_registration ?? false;
  const currentMembership = auth.memberships.find(
    (membership) => membership.workspace_id === auth.currentWorkspaceId,
  );
  const companyCreationAccess = resolveCompanyCreationAccess({
    isWorkspaceAdmin: isWorkspaceAdminFor(auth, auth.currentWorkspaceId),
    // Auth memberships are loaded from active rows only; pass that fact into
    // the shared access rule instead of trusting client-provided role data.
    membership: currentMembership
      ? {
          role: currentMembership.role,
          status: "active",
          departmentName: currentMembership.department?.name,
        }
      : null,
  });
  const allowed = startOnboarding
    ? companyCreationAccess.canStartOnboarding
    : completeRegistration
      ? companyCreationAccess.canCreateCompleteClient
      : companyCreationAccess.canCreateStandalone;
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (completeRegistration) {
    const requiredFields = [
      parsed.data.legal_name,
      parsed.data.cnpj,
      parsed.data.service_type,
      parsed.data.plan_name,
      parsed.data.contract_start_date,
      parsed.data.owner_id,
      parsed.data.responsible_department_id,
      parsed.data.contact_name,
      parsed.data.contact_email,
      parsed.data.contact_phone,
    ];
    if (
      requiredFields.some((value) => !value?.trim()) ||
      !parsed.data.included_services?.length
    ) {
      return NextResponse.json(
        { error: "Complete client registration requires every operational and contract field." },
        { status: 400 },
      );
    }
    if (!isBrazilianCnpj(parsed.data.cnpj ?? "")) {
      return NextResponse.json({ error: "Informe um CNPJ válido." }, { status: 400 });
    }
    if (!isBrazilianMobile(parsed.data.contact_phone ?? "")) {
      return NextResponse.json(
        { error: "Informe um WhatsApp no formato DD XXXXX-XXXX." },
        { status: 400 },
      );
    }
    if (
      canViewFinancials &&
      (parsed.data.contract_value == null || parsed.data.contract_value <= 0)
    ) {
      return NextResponse.json(
        { error: "Informe um valor mensal de contrato válido." },
        { status: 400 },
      );
    }
    const contractStartDate = new Date(parsed.data.contract_start_date ?? "");
    if (Number.isNaN(contractStartDate.getTime())) {
      return NextResponse.json(
        { error: "Informe uma data de início do contrato válida." },
        { status: 400 },
      );
    }
    const duplicate = await prisma.company.findFirst({
      where: {
        workspace_id: auth.currentWorkspaceId,
        OR: [
          { name: { equals: parsed.data.name, mode: "insensitive" } },
          { cnpj: formatBrazilianCnpj(parsed.data.cnpj ?? "") },
        ],
      },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "Já existe um cliente com esta marca ou CNPJ." },
        { status: 409 },
      );
    }
  }

  let ownerId = auth.prismaUser.id;
  // Standalone records keep their creator as owner. Onboarding and complete
  // registrations may select any active member from the current workspace.
  if (
    (startOnboarding || completeRegistration) &&
    !companyCreationAccess.forceCreatorAsOwner &&
    parsed.data.owner_id
  ) {
    const selectedOwner = await prisma.workspaceMember.findFirst({
      where: {
        workspace_id: auth.currentWorkspaceId,
        user_id: parsed.data.owner_id,
        status: "active",
      },
      select: { user_id: true },
    });
    if (!selectedOwner) {
      return NextResponse.json(
        { error: "Selected assignee is not an active workspace member" },
        { status: 400 },
      );
    }
    ownerId = selectedOwner.user_id;
  }

  let departmentName = parsed.data.responsible_department_name || null;
  if (parsed.data.responsible_department_id) {
    const department = await prisma.department.findFirst({
      where: {
        id: parsed.data.responsible_department_id,
        workspace_id: auth.currentWorkspaceId,
      },
      select: { name: true },
    });
    if (!department) {
      return NextResponse.json(
        { error: "Selected department does not belong to this workspace" },
        { status: 400 },
      );
    }
    departmentName = department.name;
  }

  const contactName =
    parsed.data.contact_name || parsed.data.contact_email || "";
  const notes =
    [
      parsed.data.notes || null,
      departmentName ? `Responsible department: ${departmentName}` : null,
    ]
      .filter(Boolean)
      .join("\n\n") || null;

  const company = await prisma.company.create({
    data: {
      workspace_id: auth.currentWorkspaceId,
      owner_id: ownerId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      website: parsed.data.website || null,
      status: parsed.data.status || "active",
      commercial_status:
        parsed.data.commercial_status || (completeRegistration ? "active" : null),
      contract_value: parsed.data.contract_value ?? null,
      commission: parsed.data.commission ?? null,
      industry: parsed.data.industry || null,
      sales_channel: parsed.data.sales_channel ?? null,
      service_type: parsed.data.service_type || null,
      plan_name: parsed.data.plan_name || null,
      billing_cycle: parsed.data.billing_cycle || null,
      included_services: parsed.data.included_services?.length
        ? parsed.data.included_services
        : undefined,
      plan_notes: parsed.data.plan_notes || null,
      notes,
      legal_name: parsed.data.legal_name || null,
      cnpj: parsed.data.cnpj ? formatBrazilianCnpj(parsed.data.cnpj) : null,
      billing_email: parsed.data.billing_email || null,
      main_contact_email: parsed.data.main_contact_email || null,
      phone: parsed.data.phone ? formatBrazilianMobile(parsed.data.phone) : null,
      whatsapp: parsed.data.whatsapp
        ? formatBrazilianMobile(parsed.data.whatsapp)
        : null,
      address: parsed.data.address || null,
      billing_notes: parsed.data.billing_notes || null,
      payment_terms: parsed.data.payment_terms || null,
      contract_start_date: parsed.data.contract_start_date
        ? new Date(parsed.data.contract_start_date)
        : null,
      ...(contactName || parsed.data.contact_phone
        ? {
            contacts: {
              create: {
                workspace_id: auth.currentWorkspaceId,
                name: contactName || "Primary contact",
                email: parsed.data.contact_email || null,
                phone: parsed.data.contact_phone
                  ? formatBrazilianMobile(parsed.data.contact_phone)
                  : null,
                role: parsed.data.contact_role || "Primary contact",
              },
            },
          }
        : {}),
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      contacts: true,
    },
  });

  await recordActivity({
    workspace_id: auth.currentWorkspaceId,
    actor_id: auth.prismaUser.id,
    type: "company_created",
    entity_type: "company",
    entity_id: company.id,
    metadata: {
      name: company.name,
      owner_id: ownerId,
      responsible_department: departmentName,
      contact_email: parsed.data.contact_email || null,
      complete_registration: completeRegistration,
    },
  });

  const onboardingResult =
    startOnboarding === false
      ? null
      : await startClientOnboardingForCompany({
          companyId: company.id,
          workspaceId: auth.currentWorkspaceId,
          actorId: auth.prismaUser.id,
          services: parsed.data.included_services ?? undefined,
          expectedStartDate: parsed.data.contract_start_date
            ? new Date(parsed.data.contract_start_date)
            : null,
          initialNotes: notes,
          responsibleSalespersonId: ownerId,
          responsibleDepartmentId:
            parsed.data.responsible_department_id ?? null,
          responsibleDepartmentName: departmentName,
          source: "company_card",
        });

  return NextResponse.json(
    {
      ...company,
      onboarding_id: onboardingResult?.onboarding.id ?? null,
      onboarding_created: onboardingResult ? !onboardingResult.reused : false,
      created_onboarding_tasks: onboardingResult?.createdTasks ?? [],
      missing_mappings: onboardingResult?.missingMappings ?? [],
      onboarding_notifications: onboardingResult?.notifications ?? 0,
    },
    { status: 201 },
  );
}

export const GET = withErrorReporting("api:companies:GET", GET_handler);
export const POST = withErrorReporting("api:companies:POST", POST_handler);

function withCompanySummary<
  T extends {
    contract_value: number | null;
    commission: number | null;
    owner?: { id: string; name: string; email: string } | null;
    contacts?: Array<{ id: string }>;
    calendar_events?: Array<{ id: string }>;
    activity_events?: Array<{
      type: string;
      created_at: Date;
      actor?: { id: string; name: string; email: string } | null;
    }>;
    tasks?: Array<{
      id: string;
      title: string;
      status: string;
      due_date: Date | null;
      assignee?: { id: string; name: string; email: string } | null;
    }>;
    projects?: Array<{
      id: string;
      name: string;
      status: string;
      due_date: Date | null;
      owner?: { id: string; name: string; email: string } | null;
      time_entries?: Array<{
        id: string;
        started_at: Date;
        active_started_at: Date | null;
        duration_seconds: number;
        status: "running" | "paused" | "stopped";
      }>;
      tasks: Array<{
        id: string;
        title: string;
        status: string;
        due_date: Date | null;
        assignee?: { id: string; name: string; email: string } | null;
      }>;
    }>;
  },
>(company: T) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setDate(todayStart.getDate() - 7);
  const projects = company.projects ?? [];
  const tasksById = new Map<
    string,
    | NonNullable<T["tasks"]>[number]
    | NonNullable<T["projects"]>[number]["tasks"][number]
  >();
  for (const task of company.tasks ?? []) tasksById.set(task.id, task);
  for (const task of projects.flatMap((project) => project.tasks))
    tasksById.set(task.id, task);
  const tasks = Array.from(tasksById.values());
  const timeEntries = projects.flatMap((project) => project.time_entries ?? []);
  const activeProjects = projects.filter(
    (project) => project.status === "active",
  );
  const openTasks = tasks.filter((task) => task.status !== "done");
  const overdueTasks = openTasks.filter(
    (task) => task.due_date && task.due_date < todayStart,
  );
  const nextDeadline =
    [
      ...projects
        .map((project) => project.due_date)
        .filter((date): date is Date => Boolean(date)),
      ...openTasks
        .map((task) => task.due_date)
        .filter((date): date is Date => Boolean(date)),
    ].sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const lastActivityAt = company.activity_events?.[0]?.created_at ?? null;
  const riskReasons: string[] = [];

  if (projects.length === 0) riskReasons.push("No linked projects");
  if ((company.contacts?.length ?? 0) === 0) riskReasons.push("No contacts");
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
  if (company.owner) assignedMembers.set(company.owner.id, company.owner);
  for (const project of projects) {
    if (project.owner) assignedMembers.set(project.owner.id, project.owner);
  }
  for (const task of tasks) {
    if (task.assignee) assignedMembers.set(task.assignee.id, task.assignee);
  }
  const hasPlanData = Boolean(
    company.contract_value != null || company.commission != null,
  );
  const hasServiceData = Boolean(
    (company as { service_type?: unknown }).service_type ||
    (company as { plan_name?: unknown }).plan_name,
  );
  const healthStatus = riskReasons.some(
    (reason) => reason.includes("overdue") || reason === "No linked projects",
  )
    ? "risk"
    : riskReasons.length > 0
      ? "attention"
      : projects.length === 0 && !hasPlanData && !hasServiceData
        ? "not_enough_data"
        : "healthy";

  return {
    ...company,
    summary: {
      project_count: projects.length,
      active_project_count: activeProjects.length,
      open_task_count: openTasks.length,
      overdue_task_count: overdueTasks.length,
      meeting_count: company.calendar_events?.length ?? 0,
      contact_count: company.contacts?.length ?? 0,
      tracked_seconds: trackedSeconds,
      risk_reasons: riskReasons,
      health_status: healthStatus,
      next_deadline: nextDeadline,
      latest_activity: company.activity_events?.[0] ?? null,
      assigned_members: Array.from(assignedMembers.values()).slice(0, 5),
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
