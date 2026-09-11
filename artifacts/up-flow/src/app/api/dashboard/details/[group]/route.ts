import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-response";
import { buildPage, parsePagination } from "@/lib/pagination";
import { startOfToday } from "@/lib/time-range";
import { withErrorReporting } from "@/lib/with-error-reporting";
import {
  canViewClientFinancials,
  redactClientFinancials,
} from "@/lib/client-financial-access";

export const dynamic = "force-dynamic";

function dayWindow() {
  const todayStart = startOfToday();
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(todayStart.getDate() + 1);
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setDate(todayStart.getDate() - 7);
  return { todayStart, tomorrowStart, sevenDaysAgo };
}

async function GET_handler(
  req: NextRequest,
  { params }: { params: { group: string } },
) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  if (!auth.currentWorkspaceId) {
    return NextResponse.json({ items: [], nextCursor: null });
  }

  const { searchParams } = new URL(req.url);
  const { limit, cursor } = parsePagination(req, { defaultLimit: 25, maxLimit: 100 });
  const { todayStart, tomorrowStart, sevenDaysAgo } = dayWindow();
  const workspaceId = auth.currentWorkspaceId;
  const financialsVisible = await canViewClientFinancials(auth, workspaceId);
  const status = searchParams.get("status");

  if (params.group === "urgent-actions") {
    const rows = await prisma.task.findMany({
      where: {
        project: { workspace_id: workspaceId },
        assignee_id: auth.prismaUser.id,
        status: { not: "done" },
        OR: [{ priority: "high" }, { due_date: { lt: tomorrowStart } }],
      },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: [{ due_date: "asc" }, { priority: "desc" }, { created_at: "desc" }, { id: "asc" }],
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, company: { select: { id: true, name: true } } } },
        _count: { select: { comments: true, subtasks: true } },
      },
    });
    return NextResponse.json(buildPage(rows, limit));
  }

  if (params.group === "tasks") {
    const taskWhere: Prisma.TaskWhereInput = {
      project: { workspace_id: workspaceId },
      ...(status === "todo" || status === "in_progress" || status === "done" ? { status } : {}),
    };
    const rows = await prisma.task.findMany({
      where: taskWhere,
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: [{ position: "asc" }, { created_at: "desc" }, { id: "asc" }],
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
        _count: { select: { comments: true, subtasks: true } },
      },
    });
    return NextResponse.json(buildPage(rows, limit));
  }

  if (params.group === "meetings-today") {
    const rows = await prisma.calendarEvent.findMany({
      where: { workspace_id: workspaceId, starts_at: { gte: todayStart, lt: tomorrowStart } },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: [{ starts_at: "asc" }, { id: "asc" }],
      include: {
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
        attendees: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });
    return NextResponse.json(buildPage(rows, limit));
  }

  if (params.group === "time-today") {
    const rows = await prisma.timeEntry.findMany({
      where: { workspace_id: workspaceId, started_at: { gte: todayStart, lt: tomorrowStart } },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: [{ started_at: "desc" }, { id: "asc" }],
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
    });
    return NextResponse.json(buildPage(rows, limit));
  }

  if (params.group === "recent-activity") {
    const rows = await prisma.activityEvent.findMany({
      where: { workspace_id: workspaceId },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: [{ created_at: "desc" }, { id: "asc" }],
      include: { actor: { select: { id: true, name: true, email: true, avatar_url: true } } },
    });
    return NextResponse.json(buildPage(rows, limit));
  }

  if (params.group === "projects-at-risk") {
    const rows = await prisma.project.findMany({
      where: {
        workspace_id: workspaceId,
        status: "active",
        tasks: { some: { status: { not: "done" }, due_date: { lt: todayStart } } },
      },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: [{ due_date: "asc" }, { created_at: "desc" }, { id: "asc" }],
      include: {
        owner: { select: { id: true, name: true, email: true } },
        company: { select: { id: true, name: true } },
        space: { select: { id: true, name: true, icon: true } },
        tasks: {
          where: { status: { not: "done" }, due_date: { lt: todayStart } },
          take: 5,
          orderBy: [{ due_date: "asc" }, { id: "asc" }],
          select: { id: true, title: true, due_date: true, priority: true, status: true },
        },
      },
    });
    return NextResponse.json(buildPage(rows, limit));
  }

  if (params.group === "client-risk") {
    const rows = await prisma.company.findMany({
      where: {
        workspace_id: workspaceId,
        status: { not: "archived" },
        OR: [
          { contacts: { none: {} } },
          { projects: { none: {} } },
          { contract_value: null },
          { activity_events: { none: { created_at: { gte: sevenDaysAgo } } } },
          { tasks: { some: { status: { not: "done" }, due_date: { lt: todayStart } } } },
        ],
      },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: [{ updated_at: "desc" }, { id: "asc" }],
      include: {
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { contacts: true, projects: true, tasks: true } },
      },
    });
    return NextResponse.json(
      buildPage(
        rows.map((company) =>
          redactClientFinancials(company, financialsVisible),
        ),
        limit,
      ),
    );
  }

  return NextResponse.json({ error: "Unknown dashboard detail group" }, { status: 404 });
}

export const GET = withErrorReporting("api:dashboard/details/group:GET", GET_handler);
