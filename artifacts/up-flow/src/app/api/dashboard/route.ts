import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/auth-helpers";
import { requireAuth } from "@/lib/auth-response";
import { withErrorReporting } from "@/lib/with-error-reporting";
import { startOfToday, startOfWeekMonday } from "@/lib/time-range";
import { timeEntryDurationSeconds } from "@/lib/time-entry-duration";
import { buildPage, parsePagination } from "@/lib/pagination";
import {
  canViewClientFinancials,
  redactFinancialMetadata,
} from "@/lib/client-financial-access";

export const dynamic = "force-dynamic";

const DASHBOARD_EVIDENCE_LIMIT = 100;

async function GET_handler(req: NextRequest) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;

  if (!auth.currentWorkspaceId) {
    return NextResponse.json({
      tasks: { items: [], nextCursor: null },
      projects: { items: [], nextCursor: null },
      users: { items: [], nextCursor: null },
    });
  }

  const superAdmin = isSuperAdmin(auth);
  const financialsVisible = await canViewClientFinancials(
    auth,
    auth.currentWorkspaceId,
  );
  const { searchParams } = new URL(req.url);
  const { limit } = parsePagination(req, { defaultLimit: 200, maxLimit: 500 });
  const q = searchParams.get("q")?.trim();
  const status = searchParams.get("status");
  const userWhere: Prisma.UserWhereInput | undefined = superAdmin
    ? undefined
    : {
        memberships: {
          some: {
            workspace_id: { in: auth.memberships.map((m) => m.workspace_id) },
          },
        },
      };

  const todayStart = startOfToday();
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(todayStart.getDate() + 1);
  const weekStart = startOfWeekMonday();
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(weekStart.getDate() + 7);
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setDate(todayStart.getDate() - 7);

  const [
    tasks,
    projects,
    users,
    calendarEvents,
    activity,
    runningEntry,
    weekTimeEntries,
    workspaceOpenTasks,
    todayTimeEntries,
    recentProjectActivity,
    companies,
    recentCompanyActivity,
  ] = await Promise.all([
    prisma.task.findMany({
      where: {
        assignee_id: auth.prismaUser.id,
        project: { workspace_id: auth.currentWorkspaceId },
        ...(status === "todo" || status === "in_progress" || status === "done"
          ? { status }
          : {}),
        ...(q && { title: { contains: q, mode: "insensitive" as const } }),
      },
      take: limit + 1,
      orderBy: [{ position: "asc" }, { created_at: "desc" }, { id: "asc" }],
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
        custom_field_values: {
          select: { definition_id: true, value: true },
        },
        _count: { select: { comments: true, subtasks: true } },
      },
    }),
    prisma.project.findMany({
      where: {
        workspace_id: auth.currentWorkspaceId,
        ...(q && { name: { contains: q, mode: "insensitive" as const } }),
      },
      take: limit + 1,
      orderBy: [{ created_at: "desc" }, { id: "asc" }],
      include: {
        owner: { select: { id: true, name: true, email: true } },
        space: { select: { id: true, name: true, icon: true } },
        folder: { select: { id: true, name: true, icon: true } },
        _count: { select: { tasks: true } },
      },
    }),
    prisma.user.findMany({
      where: userWhere,
      take: limit + 1,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        avatar_url: true,
        role: true,
        created_at: true,
        _count: { select: { tasks: true, projects: true } },
        memberships: {
          where: superAdmin
            ? undefined
            : {
                workspace_id: {
                  in: auth.memberships.map((m) => m.workspace_id),
                },
              },
          select: {
            workspace_id: true,
            role: true,
            status: true,
            department_id: true,
          },
        },
      },
    }),
    prisma.calendarEvent.findMany({
      where: {
        workspace_id: auth.currentWorkspaceId,
        starts_at: { gte: todayStart, lt: tomorrowStart },
      },
      take: 20,
      orderBy: [{ starts_at: "asc" }, { id: "asc" }],
      include: {
        attendees: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    }),
    prisma.activityEvent.findMany({
      where: { workspace_id: auth.currentWorkspaceId },
      take: 20,
      orderBy: [{ created_at: "desc" }, { id: "asc" }],
      include: {
        actor: {
          select: { id: true, name: true, email: true, avatar_url: true },
        },
      },
    }),
    prisma.timeEntry.findFirst({
      where: {
        workspace_id: auth.currentWorkspaceId,
        user_id: auth.prismaUser.id,
        status: { not: "stopped" },
      },
      orderBy: { started_at: "desc" },
      include: {
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
    }),
    prisma.timeEntry.findMany({
      where: {
        workspace_id: auth.currentWorkspaceId,
        user_id: auth.prismaUser.id,
        started_at: { gte: weekStart, lt: nextWeekStart },
      },
      orderBy: [{ started_at: "desc" }, { id: "asc" }],
      include: {
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
    }),
    prisma.task.findMany({
      where: {
        project: { workspace_id: auth.currentWorkspaceId },
        status: { not: "done" },
      },
      take: DASHBOARD_EVIDENCE_LIMIT,
      orderBy: [
        { due_date: "asc" },
        { priority: "desc" },
        { created_at: "desc" },
      ],
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
        _count: { select: { comments: true, subtasks: true } },
      },
    }),
    prisma.timeEntry.findMany({
      where: {
        workspace_id: auth.currentWorkspaceId,
        started_at: { gte: todayStart, lt: tomorrowStart },
      },
      take: DASHBOARD_EVIDENCE_LIMIT,
      orderBy: [{ started_at: "desc" }, { id: "asc" }],
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
    }),
    prisma.activityEvent.findMany({
      where: {
        workspace_id: auth.currentWorkspaceId,
        project_id: { not: null },
        created_at: { gte: sevenDaysAgo },
      },
      distinct: ["project_id"],
      take: DASHBOARD_EVIDENCE_LIMIT,
      orderBy: [{ created_at: "desc" }, { id: "asc" }],
      select: { project_id: true },
    }),
    prisma.company.findMany({
      where: { workspace_id: auth.currentWorkspaceId },
      take: DASHBOARD_EVIDENCE_LIMIT,
      orderBy: [{ created_at: "desc" }, { id: "asc" }],
      include: {
        owner: { select: { id: true, name: true, email: true } },
        contacts: { select: { id: true } },
        calendar_events: { select: { id: true } },
        projects: {
          select: {
            id: true,
            name: true,
            status: true,
            due_date: true,
            tasks: {
              select: {
                id: true,
                status: true,
                due_date: true,
              },
            },
          },
        },
      },
    }),
    prisma.activityEvent.findMany({
      where: {
        workspace_id: auth.currentWorkspaceId,
        company_id: { not: null },
        created_at: { gte: sevenDaysAgo },
      },
      distinct: ["company_id"],
      take: DASHBOARD_EVIDENCE_LIMIT,
      orderBy: [{ created_at: "desc" }, { id: "asc" }],
      select: { company_id: true },
    }),
  ]);

  const flattenedUsers = users.map((u) => {
    const activeMembership = u.memberships.find(
      (m) => m.workspace_id === auth.currentWorkspaceId,
    );
    const { memberships: _memberships, ...rest } = u;
    void _memberships;
    return {
      ...rest,
      workspace_role: activeMembership?.role ?? null,
      workspace_status: activeMembership?.status ?? null,
      department_id: activeMembership?.department_id ?? null,
      workspaces: u.memberships.map((m) => ({
        workspace_id: m.workspace_id,
        role: m.role,
        status: m.status,
        department_id: m.department_id,
      })),
    };
  });

  const urgentActions = workspaceOpenTasks.filter((task) => {
    const due = task.due_date ? new Date(task.due_date) : null;
    return (
      task.assignee_id === auth.prismaUser.id &&
      (task.priority === "high" || (due !== null && due < tomorrowStart))
    );
  });

  const todayTimeByUser = new Map<string, number>();
  for (const entry of todayTimeEntries) {
    const duration = timeEntryDurationSeconds(entry);
    todayTimeByUser.set(
      entry.user_id,
      (todayTimeByUser.get(entry.user_id) ?? 0) + duration,
    );
  }

  const workload = flattenedUsers.map((member) => {
    const assignedOpenTasks = workspaceOpenTasks.filter(
      (task) => task.assignee_id === member.id,
    );
    const overdueTasks = assignedOpenTasks.filter(
      (task) => task.due_date && new Date(task.due_date) < todayStart,
    );
    const dueTodayTasks = assignedOpenTasks.filter(
      (task) =>
        task.due_date &&
        new Date(task.due_date) >= todayStart &&
        new Date(task.due_date) < tomorrowStart,
    );
    const trackedSecondsToday = todayTimeByUser.get(member.id) ?? 0;
    return {
      user: member,
      open_tasks: assignedOpenTasks.length,
      overdue_tasks: overdueTasks.length,
      due_today_tasks: dueTodayTasks.length,
      tracked_seconds_today: trackedSecondsToday,
      tasks: assignedOpenTasks.slice(0, 8),
      state:
        overdueTasks.length > 0
          ? "late"
          : assignedOpenTasks.length >= 8
            ? "overloaded"
            : assignedOpenTasks.length === 0 && trackedSecondsToday === 0
              ? "idle"
              : "active",
    };
  });

  const recentProjectIds = new Set(
    recentProjectActivity
      .map((event) => event.project_id)
      .filter((id): id is string => Boolean(id)),
  );
  const overdueByProject = new Map<string, number>();
  for (const task of workspaceOpenTasks) {
    if (task.due_date && new Date(task.due_date) < todayStart) {
      overdueByProject.set(
        task.project_id,
        (overdueByProject.get(task.project_id) ?? 0) + 1,
      );
    }
  }
  const projectsAtRisk = projects
    .map((project) => {
      const reasons: string[] = [];
      const overdue = overdueByProject.get(project.id) ?? 0;
      if (overdue > 0)
        reasons.push(`${overdue} overdue open task${overdue === 1 ? "" : "s"}`);
      if (!project.owner_id) reasons.push("No owner");
      if (!recentProjectIds.has(project.id))
        reasons.push("No activity in 7 days");
      return { project, reasons };
    })
    .filter((item) => item.reasons.length > 0)
    .slice(0, 20);

  const recentCompanyIds = new Set(
    recentCompanyActivity
      .map((event) => event.company_id)
      .filter((id): id is string => Boolean(id)),
  );
  const clientsAtRisk = companies
    .map((company) => {
      const projectTasks = company.projects.flatMap((project) => project.tasks);
      const openTasks = projectTasks.filter((task) => task.status !== "done");
      const overdueTasks = openTasks.filter(
        (task) => task.due_date && task.due_date < todayStart,
      );
      const reasons: string[] = [];
      if (company.projects.length === 0) reasons.push("No linked projects");
      if (company.contacts.length === 0) reasons.push("No contacts");
      if (overdueTasks.length > 0)
        reasons.push(
          `${overdueTasks.length} overdue task${overdueTasks.length === 1 ? "" : "s"}`,
        );
      if (!recentCompanyIds.has(company.id))
        reasons.push("No client activity in 7 days");
      if (financialsVisible && company.contract_value == null) {
        reasons.push("No contract value");
      }
      return {
        company: {
          id: company.id,
          name: company.name,
          commercial_status: company.commercial_status,
          status: company.status,
          contract_value: financialsVisible ? company.contract_value : null,
          commission: financialsVisible ? company.commission : null,
        },
        reasons,
        open_tasks: openTasks.length,
        overdue_tasks: overdueTasks.length,
      };
    })
    .filter((item) => item.reasons.length > 0)
    .slice(0, 20);
  const revenueSnapshot = financialsVisible
    ? {
        active_clients: companies.filter(
          (company) => company.status !== "archived",
        ).length,
        total_contract_value: companies.reduce(
          (sum, company) => sum + (company.contract_value ?? 0),
          0,
        ),
        total_commission: companies.reduce(
          (sum, company) => sum + (company.commission ?? 0),
          0,
        ),
        clients_without_contract_value: companies.filter(
          (company) => company.contract_value == null,
        ).length,
        top_clients: companies
          .filter((company) => company.contract_value != null)
          .sort((a, b) => (b.contract_value ?? 0) - (a.contract_value ?? 0))
          .slice(0, 5)
          .map((company) => ({
            id: company.id,
            name: company.name,
            contract_value: company.contract_value,
            commission: company.commission,
          })),
      }
    : {
        active_clients: companies.filter(
          (company) => company.status !== "archived",
        ).length,
        total_contract_value: 0,
        total_commission: 0,
        clients_without_contract_value: 0,
        top_clients: [],
      };

  const todayEntriesForMe = todayTimeEntries.filter(
    (entry) => entry.user_id === auth.prismaUser.id,
  );
  const totalSecondsToday = todayEntriesForMe.reduce((sum, entry) => {
    return sum + timeEntryDurationSeconds(entry);
  }, 0);

  return NextResponse.json({
    tasks: buildPage(tasks, limit),
    projects: buildPage(projects, limit),
    users: buildPage(flattenedUsers, limit),
    calendar_events: { items: calendarEvents, nextCursor: null },
    activity: { items: activity, nextCursor: null },
    time: {
      running: runningEntry,
      week_entries: weekTimeEntries,
    },
    command_center: {
      financials_visible: financialsVisible,
      urgent_actions: { items: urgentActions, count: urgentActions.length },
      team_workload: { items: workload, count: workload.length },
      time_today: {
        total_seconds: totalSecondsToday,
        running: runningEntry,
        entries: todayEntriesForMe,
      },
      meetings_today: { items: calendarEvents, count: calendarEvents.length },
      recent_activity: {
        items: activity.map((event) => ({
          ...event,
          metadata: redactFinancialMetadata(
            event.metadata,
            financialsVisible,
          ),
        })),
        count: activity.length,
      },
      projects_at_risk: {
        items: projectsAtRisk,
        count: projectsAtRisk.length,
        rules: ["overdue open tasks", "no owner", "no activity in 7 days"],
      },
      client_risk: {
        items: clientsAtRisk,
        count: clientsAtRisk.length,
      },
      revenue_snapshot: revenueSnapshot,
      quick_create: {
        items: ["task", "meeting", "company", "project", "note"],
      },
    },
  });
}

export const GET = withErrorReporting("api:dashboard:GET", GET_handler);
