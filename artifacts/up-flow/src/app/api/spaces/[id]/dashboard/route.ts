import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin, isWorkspaceAdminFor } from "@/lib/auth-helpers";
import { requireAuth } from "@/lib/auth-response";
import {
  getDepartmentSpacePreset,
  normalizeDepartmentSpaceName,
} from "@/lib/department-spaces";
import { buildPage, parsePagination } from "@/lib/pagination";
import { startOfToday, startOfWeekMonday } from "@/lib/time-range";
import { timeEntryDurationSeconds } from "@/lib/time-entry-duration";
import { withErrorReporting } from "@/lib/with-error-reporting";
import {
  canViewClientFinancials,
  redactFinancialMetadata,
} from "@/lib/client-financial-access";

export const dynamic = "force-dynamic";

const DASHBOARD_EVIDENCE_LIMIT = 100;
type RouteContext = { params: Promise<{ id: string }> };

async function GET_handler(req: NextRequest, { params }: RouteContext) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  const { id } = await params;

  if (!auth.currentWorkspaceId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const space = await prisma.space.findFirst({
    where: { id, workspace_id: auth.currentWorkspaceId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { projects: true } },
    },
  });
  if (!space) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const departmentPreset = getDepartmentSpacePreset(space.name);
  const currentMembership = auth.memberships.find(
    (membership) => membership.workspace_id === space.workspace_id,
  );
  const viewerDepartmentName = currentMembership?.department?.name ?? null;
  const viewerDepartmentPreset = viewerDepartmentName
    ? getDepartmentSpacePreset(viewerDepartmentName)
    : null;
  const isDepartmentMember = Boolean(
    viewerDepartmentName &&
    (departmentPreset && viewerDepartmentPreset
      ? departmentPreset.department_key ===
        viewerDepartmentPreset.department_key
      : normalizeDepartmentSpaceName(viewerDepartmentName) ===
        normalizeDepartmentSpaceName(space.name)),
  );
  const canOperateSpace = Boolean(
    isWorkspaceAdminFor(auth, space.workspace_id) ||
    (currentMembership?.role !== "guest" && isDepartmentMember),
  );
  const financialsVisible = await canViewClientFinancials(
    auth,
    space.workspace_id,
  );

  const superAdmin = isSuperAdmin(auth);
  const { limit } = parsePagination(req, { defaultLimit: 200, maxLimit: 500 });
  const todayStart = startOfToday();
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(todayStart.getDate() + 1);
  const weekStart = startOfWeekMonday();
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(weekStart.getDate() + 7);
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setDate(todayStart.getDate() - 7);

  const spaceProjectWhere: Prisma.ProjectWhereInput = {
    workspace_id: space.workspace_id,
    space_id: space.id,
  };
  const taskProjectScope: Prisma.TaskWhereInput = {
    project: spaceProjectWhere,
  };

  const [
    projects,
    tasks,
    openTasks,
    urgentActionItems,
    urgentActionCount,
    users,
    projectIds,
    openTaskCountsByAssignee,
    overdueTaskCountsByAssignee,
    dueTodayTaskCountsByAssignee,
    overdueTaskCountsByProject,
  ] = await Promise.all([
    prisma.project.findMany({
      where: spaceProjectWhere,
      take: limit + 1,
      orderBy: [{ created_at: "desc" }, { id: "asc" }],
      include: {
        owner: { select: { id: true, name: true, email: true } },
        space: { select: { id: true, name: true, icon: true } },
        folder: { select: { id: true, name: true, icon: true } },
        company: {
          select: {
            id: true,
            name: true,
            contract_value: true,
            commission: true,
            plan_name: true,
            service_type: true,
          },
        },
        _count: { select: { tasks: true } },
      },
    }),
    prisma.task.findMany({
      where: taskProjectScope,
      take: limit + 1,
      orderBy: [{ position: "asc" }, { created_at: "desc" }, { id: "asc" }],
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        followers: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { created_at: "asc" },
        },
        project: { select: { id: true, name: true } },
        custom_field_values: { select: { definition_id: true, value: true } },
        _count: { select: { comments: true, subtasks: true } },
      },
    }),
    prisma.task.findMany({
      where: { ...taskProjectScope, status: { not: "done" } },
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
    prisma.task.findMany({
      where: {
        ...taskProjectScope,
        status: { not: "done" },
        assignee_id: auth.prismaUser.id,
        OR: [{ priority: "high" }, { due_date: { lt: tomorrowStart } }],
      },
      take: 20,
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
    prisma.task.count({
      where: {
        ...taskProjectScope,
        status: { not: "done" },
        assignee_id: auth.prismaUser.id,
        OR: [{ priority: "high" }, { due_date: { lt: tomorrowStart } }],
      },
    }),
    prisma.user.findMany({
      where: superAdmin
        ? undefined
        : {
            memberships: {
              some: {
                workspace_id: {
                  in: auth.memberships.map((m) => m.workspace_id),
                },
              },
            },
          },
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
    prisma.project.findMany({
      where: spaceProjectWhere,
      select: { id: true },
    }),
    prisma.task.groupBy({
      by: ["assignee_id"],
      where: {
        ...taskProjectScope,
        status: { not: "done" },
        assignee_id: { not: null },
      },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["assignee_id"],
      where: {
        ...taskProjectScope,
        status: { not: "done" },
        assignee_id: { not: null },
        due_date: { lt: todayStart },
      },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["assignee_id"],
      where: {
        ...taskProjectScope,
        status: { not: "done" },
        assignee_id: { not: null },
        due_date: { gte: todayStart, lt: tomorrowStart },
      },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["project_id"],
      where: {
        ...taskProjectScope,
        status: { not: "done" },
        due_date: { lt: todayStart },
      },
      _count: { _all: true },
    }),
  ]);

  const projectIdList = projectIds.map((project) => project.id);
  const scopedCalendarOrTimeWhere = {
    OR: [
      { project: spaceProjectWhere },
      { task: { project: spaceProjectWhere } },
    ],
  };
  const hasScopedRecords = projectIdList.length > 0;

  const [
    calendarEvents,
    activity,
    runningEntry,
    weekTimeEntries,
    todayTimeEntries,
    recentProjectActivity,
  ] = await Promise.all([
    hasScopedRecords
      ? prisma.calendarEvent.findMany({
          where: {
            workspace_id: space.workspace_id,
            starts_at: { gte: todayStart, lt: tomorrowStart },
            ...scopedCalendarOrTimeWhere,
          },
          take: 20,
          orderBy: [{ starts_at: "asc" }, { id: "asc" }],
          include: {
            attendees: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    hasScopedRecords
      ? prisma.activityEvent.findMany({
          where: {
            workspace_id: space.workspace_id,
            project_id: { in: projectIdList },
          },
          take: 20,
          orderBy: [{ created_at: "desc" }, { id: "asc" }],
          include: {
            actor: {
              select: { id: true, name: true, email: true, avatar_url: true },
            },
          },
        })
      : Promise.resolve([]),
    hasScopedRecords
      ? prisma.timeEntry.findFirst({
          where: {
            workspace_id: space.workspace_id,
            user_id: auth.prismaUser.id,
            status: { not: "stopped" },
            ...scopedCalendarOrTimeWhere,
          },
          orderBy: { started_at: "desc" },
          include: {
            project: { select: { id: true, name: true } },
            task: { select: { id: true, title: true } },
          },
        })
      : Promise.resolve(null),
    hasScopedRecords
      ? prisma.timeEntry.findMany({
          where: {
            workspace_id: space.workspace_id,
            user_id: auth.prismaUser.id,
            started_at: { gte: weekStart, lt: nextWeekStart },
            ...scopedCalendarOrTimeWhere,
          },
          orderBy: [{ started_at: "desc" }, { id: "asc" }],
          include: {
            project: { select: { id: true, name: true } },
            task: { select: { id: true, title: true } },
          },
        })
      : Promise.resolve([]),
    hasScopedRecords
      ? prisma.timeEntry.findMany({
          where: {
            workspace_id: space.workspace_id,
            started_at: { gte: todayStart, lt: tomorrowStart },
            ...scopedCalendarOrTimeWhere,
          },
          take: DASHBOARD_EVIDENCE_LIMIT,
          orderBy: [{ started_at: "desc" }, { id: "asc" }],
          include: {
            user: { select: { id: true, name: true, email: true } },
            project: { select: { id: true, name: true } },
            task: { select: { id: true, title: true } },
          },
        })
      : Promise.resolve([]),
    projectIdList.length > 0
      ? prisma.activityEvent.findMany({
          where: {
            workspace_id: space.workspace_id,
            project_id: { in: projectIdList },
            created_at: { gte: sevenDaysAgo },
          },
          distinct: ["project_id"],
          take: Math.max(projectIdList.length, 1),
          orderBy: [{ created_at: "desc" }, { id: "asc" }],
          select: { project_id: true },
        })
      : Promise.resolve([]),
  ]);

  const flattenedUsers = users.map((u) => {
    const activeMembership = u.memberships.find(
      (m) => m.workspace_id === space.workspace_id,
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

  const countByAssignee = new Map(
    openTaskCountsByAssignee.map((row) => [row.assignee_id, row._count._all]),
  );
  const overdueByAssignee = new Map(
    overdueTaskCountsByAssignee.map((row) => [
      row.assignee_id,
      row._count._all,
    ]),
  );
  const dueTodayByAssignee = new Map(
    dueTodayTaskCountsByAssignee.map((row) => [
      row.assignee_id,
      row._count._all,
    ]),
  );

  const todayTimeByUser = new Map<string, number>();
  for (const entry of todayTimeEntries) {
    const duration = timeEntryDurationSeconds(entry);
    todayTimeByUser.set(
      entry.user_id,
      (todayTimeByUser.get(entry.user_id) ?? 0) + duration,
    );
  }

  const workload = flattenedUsers.map((member) => {
    const assignedOpenTasks = openTasks.filter(
      (task) => task.assignee_id === member.id,
    );
    const openTaskCount = countByAssignee.get(member.id) ?? 0;
    const overdueTaskCount = overdueByAssignee.get(member.id) ?? 0;
    const dueTodayTaskCount = dueTodayByAssignee.get(member.id) ?? 0;
    const trackedSecondsToday = todayTimeByUser.get(member.id) ?? 0;
    return {
      user: member,
      open_tasks: openTaskCount,
      overdue_tasks: overdueTaskCount,
      due_today_tasks: dueTodayTaskCount,
      tracked_seconds_today: trackedSecondsToday,
      tasks: assignedOpenTasks.slice(0, 8),
      state:
        overdueTaskCount > 0
          ? "late"
          : openTaskCount >= 8
            ? "overloaded"
            : openTaskCount === 0 && trackedSecondsToday === 0
              ? "idle"
              : "active",
    };
  });

  const recentProjectIds = new Set(
    recentProjectActivity
      .map((event) => event.project_id)
      .filter((id): id is string => Boolean(id)),
  );
  const overdueByProject = new Map(
    overdueTaskCountsByProject.map((row) => [row.project_id, row._count._all]),
  );
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

  const todayEntriesForMe = todayTimeEntries.filter(
    (entry) => entry.user_id === auth.prismaUser.id,
  );
  const totalSecondsToday = todayEntriesForMe.reduce((sum, entry) => {
    return sum + timeEntryDurationSeconds(entry);
  }, 0);

  const visibleActivity = activity.map((event) => ({
    ...event,
    metadata: redactFinancialMetadata(event.metadata, financialsVisible),
  }));

  return NextResponse.json({
    space,
    department_preset: departmentPreset,
    access: {
      can_operate_space: canOperateSpace,
      is_department_member: isDepartmentMember,
      viewer_department_name: viewerDepartmentName,
    },
    tasks: buildPage(tasks, limit),
    projects: buildPage(
      projects.map((project) => ({
        ...project,
        company: project.company
          ? {
              ...project.company,
              contract_value: financialsVisible
                ? project.company.contract_value
                : null,
              commission: financialsVisible ? project.company.commission : null,
            }
          : null,
      })),
      limit,
    ),
    financials_visible: financialsVisible,
    users: buildPage(flattenedUsers, limit),
    calendar_events: { items: calendarEvents, nextCursor: null },
    activity: { items: visibleActivity, nextCursor: null },
    time: {
      running: runningEntry,
      week_entries: weekTimeEntries,
    },
    command_center: {
      urgent_actions: { items: urgentActionItems, count: urgentActionCount },
      team_workload: { items: workload, count: workload.length },
      time_today: {
        total_seconds: totalSecondsToday,
        running: runningEntry,
        entries: todayEntriesForMe,
      },
      meetings_today: { items: calendarEvents, count: calendarEvents.length },
      recent_activity: { items: visibleActivity, count: activity.length },
      projects_at_risk: {
        items: projectsAtRisk,
        count: projectsAtRisk.length,
        rules: ["overdue open tasks", "no owner", "no activity in 7 days"],
      },
      quick_create: {
        items: ["task", "meeting", "project"],
      },
    },
  });
}

export const GET = withErrorReporting(
  "api:spaces/id/dashboard:GET",
  GET_handler,
);
