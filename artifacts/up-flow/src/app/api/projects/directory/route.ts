import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isWorkspaceAdminFor } from "@/lib/auth-helpers";
import { requireAuth } from "@/lib/auth-response";
import {
  buildProjectDirectoryWhere,
  directoryTabWhere,
  parseProjectDirectoryQuery,
  projectDirectoryOrderBy,
  type ProjectDirectoryQuery,
} from "@/lib/project-directory";
import { readableProjectWhere } from "@/lib/project-access";

import { prisma } from "@/lib/prisma";
import { withErrorReporting } from "@/lib/with-error-reporting";

export const dynamic = "force-dynamic";

const projectSummarySelect = {
  id: true,
  name: true,
  status: true,
  kind: true,
  due_date: true,
  created_at: true,
  space: { select: { id: true, name: true, icon: true } },
  folder: { select: { id: true, name: true, icon: true } },
  company: { select: { id: true, name: true } },
  _count: { select: { tasks: true } },
} satisfies Prisma.ProjectSelect;

type ProjectRow = Prisma.ProjectGetPayload<{ select: typeof projectSummarySelect }>;

interface ProjectSummary {
  id: string;
  name: string;
  status: ProjectRow["status"];
  kind: ProjectRow["kind"];
  due_date: Date | null;
  created_at: Date;
  space: ProjectRow["space"];
  folder: ProjectRow["folder"];
  company: ProjectRow["company"];
  totalTaskCount: number;
  openTaskCount: number;
}

async function openTaskCounts(projectIds: string[]): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map();

  const rows = await prisma.task.groupBy({
    by: ["project_id"],
    where: {
      project_id: { in: projectIds },
      status: { not: "done" },
    },
    _count: { _all: true },
  });

  return new Map(rows.map((row) => [row.project_id, row._count._all]));
}

function toProjectSummary(
  project: ProjectRow,
  openCounts: Map<string, number>,
): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    kind: project.kind,
    due_date: project.due_date,
    created_at: project.created_at,
    space: project.space,
    folder: project.folder,
    company: project.company,
    totalTaskCount: project._count.tasks,
    openTaskCount: openCounts.get(project.id) ?? 0,
  };
}

async function directoryCounts(readableScope: Prisma.ProjectWhereInput) {
  const count = (tabWhere: Prisma.ProjectWhereInput) =>
    prisma.project.count({ where: { AND: [readableScope, tabWhere] } });

  const [clients, internal, operations, archived] = await Promise.all([
    count(directoryTabWhere("clients")),
    count(directoryTabWhere("internal")),
    count(directoryTabWhere("operations")),
    count(directoryTabWhere("archived")),
  ]);

  return { clients, internal, operations, archived };
}

async function clientItems(
  query: ProjectDirectoryQuery,
  workspaceId: string,
  projectWhere: Prisma.ProjectWhereInput,
) {
  const rows = await prisma.company.findMany({
    where: {
      workspace_id: workspaceId,
      projects: { some: projectWhere },
    },
    take: query.limit + 1,
    ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      projects: {
        where: projectWhere,
        orderBy: projectDirectoryOrderBy(query.sort),
        select: projectSummarySelect,
      },
    },
  });

  const hasNextPage = rows.length > query.limit;
  const page = hasNextPage ? rows.slice(0, query.limit) : rows;
  const projects = page.flatMap((company) => company.projects);
  const openCounts = await openTaskCounts(projects.map((project) => project.id));

  return {
    items: page.map((company) => {
      const summaries = company.projects.map((project) =>
        toProjectSummary(project, openCounts),
      );
      return {
        type: "client" as const,
        id: company.id,
        name: company.name,
        projectCount: summaries.length,
        openTaskCount: summaries.reduce((sum, project) => sum + project.openTaskCount, 0),
        totalTaskCount: summaries.reduce((sum, project) => sum + project.totalTaskCount, 0),
        projects: summaries,
      };
    }),
    nextCursor: hasNextPage ? page[page.length - 1]?.id ?? null : null,
  };
}

async function projectItems(query: ProjectDirectoryQuery, projectWhere: Prisma.ProjectWhereInput) {
  const rows = await prisma.project.findMany({
    where: projectWhere,
    take: query.limit + 1,
    ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
    orderBy: projectDirectoryOrderBy(query.sort),
    select: projectSummarySelect,
  });

  const hasNextPage = rows.length > query.limit;
  const page = hasNextPage ? rows.slice(0, query.limit) : rows;
  const openCounts = await openTaskCounts(page.map((project) => project.id));

  return {
    items: page.map((project) => ({
      type: "project" as const,
      project: toProjectSummary(project, openCounts),
    })),
    nextCursor: hasNextPage ? page[page.length - 1]?.id ?? null : null,
  };
}

async function getHandler(req: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const workspaceId = auth.currentWorkspaceId;

  if (!workspaceId) {
    return NextResponse.json({
      tab: "clients",
      counts: { clients: 0, internal: 0, operations: 0, archived: 0 },
      items: [],
      nextCursor: null,
      capabilities: { canCreateProject: false, canManageProjects: false },
    });
  }

  const parsed = parseProjectDirectoryQuery(new URL(req.url).searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const query = parsed.value;
  const readableScope = readableProjectWhere(auth, workspaceId);
  const projectWhere = buildProjectDirectoryWhere(readableScope, query);
  const canManageProjects = isWorkspaceAdminFor(auth, workspaceId);

  const [counts, page] = await Promise.all([
    directoryCounts(readableScope),
    query.tab === "clients"
      ? clientItems(query, workspaceId, projectWhere)
      : projectItems(query, projectWhere),
  ]);

  return NextResponse.json({
    tab: query.tab,
    counts,
    items: page.items,
    nextCursor: page.nextCursor,
    capabilities: {
      canCreateProject: canManageProjects,
      canManageProjects,
    },
  });
}

export const GET = withErrorReporting("api:projects:directory:GET", getHandler);
