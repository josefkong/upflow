import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-response";
import { buildPage, parsePagination } from "@/lib/pagination";
import { readableProjectWhere } from "@/lib/project-access";
import {
  buildFolderBreadcrumb,
  loadSidebarFolderContext,
  type SidebarSearchResult,
} from "@/lib/sidebar-discovery";
import {
  addProjectPendingTodoCounts,
  countPendingTodoTasks,
} from "@/lib/sidebar-pending-tasks";
import { withErrorReporting } from "@/lib/with-error-reporting";
import { isFinanceContractMirrorProject } from "@/lib/commercial-contract-mirror";
import { commercialFlowProjectKind } from "@/lib/commercial-managed-projects";
import {
  SHARED_ONBOARDING_TASK_AUTOMATION_KEY,
  isOnboardingMirrorProject,
} from "@/lib/onboarding-shared-flow";

export const dynamic = "force-dynamic";

async function GET_handler(req: NextRequest) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;

  if (!auth.currentWorkspaceId) {
    return NextResponse.json({
      spaces: { items: [], nextCursor: null },
      projects: { items: [], nextCursor: null },
      folders: { items: [], nextCursor: null },
      pinned_clients: [],
      hidden_spaces: [],
      search_results: [],
    });
  }

  const { searchParams } = new URL(req.url);
  const { limit } = parsePagination(req, { defaultLimit: 200, maxLimit: 500 });
  const q = searchParams.get("q")?.trim();
  const spacesCursor = searchParams.get("spaces_cursor");
  const projectsCursor = searchParams.get("projects_cursor");
  const foldersCursor = searchParams.get("folders_cursor");
  const hiddenSpaceRows = await prisma.sidebarSpaceHide.findMany({
    where: {
      workspace_id: auth.currentWorkspaceId,
      user_id: auth.prismaUser.id,
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: {
      space: { select: { id: true, name: true, icon: true } },
    },
  });
  const hiddenSpaces = hiddenSpaceRows.map((item) => item.space);
  const hiddenSpaceIds = hiddenSpaces.map((space) => space.id);
  // Keep unassigned projects visible while preventing hidden Spaces from
  // reappearing through a folder or project search result.
  const personalSpaceVisibilityWhere: Prisma.ProjectWhereInput =
    hiddenSpaceIds.length > 0
      ? {
          OR: [
            { space_id: { notIn: hiddenSpaceIds } },
            { space_id: null, folder_id: null },
            {
              space_id: null,
              folder: { is: { space_id: { notIn: hiddenSpaceIds } } },
            },
          ],
        }
      : {};
  const readableProjectsWhere = readableProjectWhere(
    auth,
    auth.currentWorkspaceId,
  );
  // Shared department queues must remain visible even if a legacy visibility
  // migration left an incorrect flag behind. Client-specific work still
  // follows the onboarding visibility rules below.
  const visibleProjectWhere: Prisma.ProjectWhereInput = {
    AND: [
      readableProjectsWhere,
      {
        OR: [
          { sidebar_hidden: false },
          { company_id: null },
          { kind: "onboarding" },
          {
            AND: [{ onboarding_enabled: true }, { company_id: { not: null } }],
          },
        ],
      },
      personalSpaceVisibilityWhere,
    ],
  };
  const contractHandoffStatusCounts = await prisma.task.groupBy({
    by: ["status"],
    where: {
      project: { workspace_id: auth.currentWorkspaceId },
      commercial_contract_handoff: { isNot: null },
    },
    _count: { _all: true },
  });
  const mirroredContractTaskCount = contractHandoffStatusCounts.reduce(
    (total, item) => total + item._count._all,
    0,
  );
  const mirroredContractPendingCount =
    contractHandoffStatusCounts.find((item) => item.status === "todo")?._count
      ._all ?? 0;
  const sharedOnboardingStatusCounts = await prisma.task.groupBy({
    by: ["status"],
    where: {
      project: { workspace_id: auth.currentWorkspaceId },
      onboarding_items: {
        some: { automation_key: SHARED_ONBOARDING_TASK_AUTOMATION_KEY },
      },
    },
    _count: { _all: true },
  });
  const sharedOnboardingTaskCount = sharedOnboardingStatusCounts.reduce(
    (total, item) => total + item._count._all,
    0,
  );
  const sharedOnboardingPendingCount = sharedOnboardingStatusCounts.reduce(
    (total, item) =>
      item.status === "done" ? total : total + item._count._all,
    0,
  );
  const isContractFlowProject = (
    projectName: string,
    spaceName?: string | null,
  ) =>
    isFinanceContractMirrorProject({ projectName, spaceName }) ||
    commercialFlowProjectKind({ projectName, spaceName }) ===
      "contract_handoff";
  // Select the navigation fields explicitly so a release can still read
  // existing spaces while a newly introduced optional UI column is rolling out.
  const spaceSelect = {
    id: true,
    name: true,
    icon: true,
    workspace_id: true,
    owner_id: true,
    position: true,
    created_at: true,
    owner: { select: { id: true, name: true, email: true } },
    _count: { select: { projects: { where: visibleProjectWhere } } },
    projects: {
      where: visibleProjectWhere,
      select: {
        id: true,
        name: true,
        company_id: true,
        onboarding_enabled: true,
        _count: {
          select: {
            tasks: { where: { status: "todo" as const } },
          },
        },
      },
    },
  };
  const projectInclude = {
    owner: { select: { id: true, name: true, email: true } },
    space: { select: { id: true, name: true, icon: true } },
    folder: { select: { id: true, name: true, icon: true } },
    company: {
      select: {
        id: true,
        name: true,
        plan_name: true,
        service_type: true,
      },
    },
    _count: { select: { tasks: true } },
  };
  const folderInclude = {
    _count: { select: { projects: { where: visibleProjectWhere } } },
  };
  const withPendingTodoCount = <
    T extends {
      name: string;
      projects: Array<{
        id: string;
        name: string;
        company_id: string | null;
        onboarding_enabled: boolean;
        _count: { tasks: number };
      }>;
    },
  >(
    space: T,
  ) => {
    const { projects: spaceProjects, ...spaceData } = space;
    const contractFlowProjects = spaceProjects.filter((project) =>
      isContractFlowProject(project.name, space.name),
    );
    const onboardingProjects = spaceProjects.filter((project) =>
      isOnboardingMirrorProject({
        projectName: project.name,
        onboardingEnabled: project.onboarding_enabled,
        companyId: project.company_id,
      }),
    );
    const regularProjects = spaceProjects.filter(
      (project) =>
        !isContractFlowProject(project.name, space.name) &&
        !isOnboardingMirrorProject({
          projectName: project.name,
          onboardingEnabled: project.onboarding_enabled,
          companyId: project.company_id,
        }),
    );
    const hasContractFlow = contractFlowProjects.length > 0;
    const hasOnboardingFlow = onboardingProjects.length > 0;
    return {
      ...spaceData,
      pending_todo_count:
        countPendingTodoTasks(regularProjects) +
        (hasContractFlow ? mirroredContractPendingCount : 0) +
        (hasOnboardingFlow ? sharedOnboardingPendingCount : 0),
      ...(hasContractFlow || hasOnboardingFlow
        ? {
            flow_task_count:
              countPendingTodoTasks(regularProjects) +
              (hasContractFlow ? mirroredContractTaskCount : 0) +
              (hasOnboardingFlow ? sharedOnboardingTaskCount : 0),
          }
        : {}),
    };
  };

  const withProjectPendingTodoCounts = async <
    T extends {
      id: string;
      name: string;
      company_id: string | null;
      onboarding_enabled: boolean;
      space: { name: string } | null;
      _count: { tasks: number };
    },
  >(
    projectRows: T[],
  ): Promise<
    Array<
      T & {
        pending_todo_count: number;
        flow_task_count?: number;
        _count: { tasks: number };
      }
    >
  > => {
    if (projectRows.length === 0) return [];

    const taskCounts = await prisma.task.groupBy({
      by: ["project_id"],
      where: {
        project_id: { in: projectRows.map((project) => project.id) },
        status: "todo",
      },
      _count: { _all: true },
    });

    return addProjectPendingTodoCounts(projectRows, taskCounts).map(
      (project) =>
        isOnboardingMirrorProject({
          projectName: project.name,
          onboardingEnabled: project.onboarding_enabled,
          companyId: project.company_id,
        })
          ? {
              ...project,
              _count: {
                ...project._count,
                tasks: sharedOnboardingTaskCount,
              },
              pending_todo_count: sharedOnboardingPendingCount,
              flow_task_count: sharedOnboardingTaskCount,
            }
          : isContractFlowProject(project.name, project.space?.name)
            ? {
                ...project,
                _count: {
                  ...project._count,
                  tasks: mirroredContractTaskCount,
                },
                pending_todo_count: mirroredContractPendingCount,
                flow_task_count: mirroredContractTaskCount,
              }
            : project,
    );
  };

  if (q) {
    const [matchingSpaces, matchingProjects, matchingFolders, pinnedClients] =
      await Promise.all([
        prisma.space.findMany({
          where: {
            workspace_id: auth.currentWorkspaceId,
            ...(hiddenSpaceIds.length > 0
              ? { id: { notIn: hiddenSpaceIds } }
              : {}),
            name: { contains: q, mode: "insensitive" as const },
          },
          take: limit,
          orderBy: [{ position: "asc" }, { created_at: "asc" }, { id: "asc" }],
          select: spaceSelect,
        }),
        prisma.project.findMany({
          where: {
            AND: [
              visibleProjectWhere,
              {
                OR: [
                  { name: { contains: q, mode: "insensitive" as const } },
                  {
                    company: {
                      is: {
                        name: { contains: q, mode: "insensitive" as const },
                      },
                    },
                  },
                ],
              },
            ],
          },
          take: limit,
          orderBy: [{ position: "asc" }, { created_at: "desc" }, { id: "asc" }],
          include: projectInclude,
        }),
        prisma.folder.findMany({
          where: {
            workspace_id: auth.currentWorkspaceId,
            ...(hiddenSpaceIds.length > 0
              ? { space_id: { notIn: hiddenSpaceIds } }
              : {}),
            name: { contains: q, mode: "insensitive" as const },
          },
          take: limit,
          orderBy: [{ position: "asc" }, { created_at: "asc" }, { id: "asc" }],
          include: folderInclude,
        }),
        prisma.sidebarClientPin.findMany({
          where: {
            workspace_id: auth.currentWorkspaceId,
            user_id: auth.prismaUser.id,
          },
          orderBy: [{ position: "asc" }, { created_at: "asc" }, { id: "asc" }],
          select: {
            id: true,
            company_id: true,
            position: true,
            company: {
              select: {
                id: true,
                name: true,
                status: true,
                commercial_status: true,
                plan_name: true,
              },
            },
          },
        }),
      ]);

    const sidebarProjects =
      await withProjectPendingTodoCounts(matchingProjects);

    const folderById = await loadSidebarFolderContext(
      matchingFolders,
      matchingProjects.map((project) => project.folder_id),
      (folderIds) =>
        prisma.folder.findMany({
          where: {
            id: { in: folderIds },
            workspace_id: auth.currentWorkspaceId,
            ...(hiddenSpaceIds.length > 0
              ? { space_id: { notIn: hiddenSpaceIds } }
              : {}),
          },
          include: folderInclude,
        }),
    );

    const spaceIds = new Set(matchingSpaces.map((space) => space.id));
    for (const folder of folderById.values()) spaceIds.add(folder.space_id);
    for (const project of matchingProjects) {
      if (project.space_id) spaceIds.add(project.space_id);
    }

    const missingSpaceIds = Array.from(spaceIds).filter(
      (id) => !matchingSpaces.some((space) => space.id === id),
    );
    const parentSpaces =
      missingSpaceIds.length > 0
        ? await prisma.space.findMany({
            where: {
              id: { in: missingSpaceIds },
              workspace_id: auth.currentWorkspaceId,
              ...(hiddenSpaceIds.length > 0
                ? { id: { notIn: hiddenSpaceIds } }
                : {}),
            },
            orderBy: [
              { position: "asc" },
              { created_at: "asc" },
              { id: "asc" },
            ],
            select: spaceSelect,
          })
        : [];

    const spaces = [...matchingSpaces, ...parentSpaces].sort((a, b) => {
      const positionDelta = (a.position ?? 0) - (b.position ?? 0);
      if (positionDelta !== 0) return positionDelta;
      return a.name.localeCompare(b.name);
    });
    const folders = Array.from(folderById.values()).sort((a, b) => {
      const positionDelta = (a.position ?? 0) - (b.position ?? 0);
      if (positionDelta !== 0) return positionDelta;
      return a.name.localeCompare(b.name);
    });
    const sidebarSpaces = spaces.map(withPendingTodoCount);
    const spaceById = new Map(sidebarSpaces.map((space) => [space.id, space]));
    const searchResults: SidebarSearchResult[] = [];

    for (const space of matchingSpaces) {
      searchResults.push({
        id: space.id,
        type: "space",
        name: space.name,
        href: `/spaces/${space.id}`,
        breadcrumb: [space.name],
      });
    }

    for (const folder of matchingFolders) {
      const space = spaceById.get(folder.space_id);
      searchResults.push({
        id: folder.id,
        type: "folder",
        name: folder.name,
        href: `/folders/${folder.id}`,
        breadcrumb: [
          space?.name ?? "Unassigned",
          ...buildFolderBreadcrumb(folder.id, folderById),
        ],
      });
    }

    for (const project of matchingProjects) {
      const folder = project.folder_id
        ? folderById.get(project.folder_id)
        : undefined;
      const spaceId = project.space_id ?? folder?.space_id;
      const space = spaceId ? spaceById.get(spaceId) : undefined;
      searchResults.push({
        id: project.id,
        type: "project",
        name: project.name,
        href: `/projects/${project.id}`,
        breadcrumb: [
          space?.name ?? "Unassigned",
          ...buildFolderBreadcrumb(project.folder_id, folderById),
          project.name,
        ],
      });
    }

    const resultOrder = { space: 0, folder: 1, project: 2 } as const;
    searchResults.sort(
      (a, b) =>
        resultOrder[a.type] - resultOrder[b.type] ||
        a.breadcrumb.join("/").localeCompare(b.breadcrumb.join("/")),
    );

    return NextResponse.json({
      spaces: { items: sidebarSpaces, nextCursor: null },
      projects: { items: sidebarProjects, nextCursor: null },
      folders: { items: folders, nextCursor: null },
      pinned_clients: pinnedClients,
      hidden_spaces: hiddenSpaces,
      search_results: searchResults,
    });
  }

  const [spaces, projects, folders, pinnedClients] = await Promise.all([
    prisma.space.findMany({
      where: {
        workspace_id: auth.currentWorkspaceId,
        ...(hiddenSpaceIds.length > 0 ? { id: { notIn: hiddenSpaceIds } } : {}),
        ...(q && { name: { contains: q, mode: "insensitive" as const } }),
      },
      take: limit + 1,
      ...(spacesCursor ? { skip: 1, cursor: { id: spacesCursor } } : {}),
      orderBy: [{ position: "asc" }, { created_at: "asc" }, { id: "asc" }],
      select: spaceSelect,
    }),
    prisma.project.findMany({
      where: {
        ...visibleProjectWhere,
        ...(q && { name: { contains: q, mode: "insensitive" as const } }),
      },
      take: limit + 1,
      ...(projectsCursor ? { skip: 1, cursor: { id: projectsCursor } } : {}),
      orderBy: [{ position: "asc" }, { created_at: "desc" }, { id: "asc" }],
      include: projectInclude,
    }),
    prisma.folder.findMany({
      where: {
        workspace_id: auth.currentWorkspaceId,
        sidebar_hidden: false,
        ...(hiddenSpaceIds.length > 0
          ? { space_id: { notIn: hiddenSpaceIds } }
          : {}),
        ...(q && { name: { contains: q, mode: "insensitive" as const } }),
      },
      take: limit + 1,
      ...(foldersCursor ? { skip: 1, cursor: { id: foldersCursor } } : {}),
      orderBy: [{ position: "asc" }, { created_at: "asc" }, { id: "asc" }],
      include: folderInclude,
    }),
    prisma.sidebarClientPin.findMany({
      where: {
        workspace_id: auth.currentWorkspaceId,
        user_id: auth.prismaUser.id,
      },
      orderBy: [{ position: "asc" }, { created_at: "asc" }, { id: "asc" }],
      select: {
        id: true,
        company_id: true,
        position: true,
        company: {
          select: {
            id: true,
            name: true,
            status: true,
            commercial_status: true,
            plan_name: true,
          },
        },
      },
    }),
  ]);

  const sidebarProjects = await withProjectPendingTodoCounts(projects);
  const projectPage = buildPage(sidebarProjects, limit);
  const folderPage = buildPage(folders, limit);
  const folderById = await loadSidebarFolderContext(
    folderPage.items,
    projectPage.items.map((project) => project.folder_id),
    (folderIds) =>
      prisma.folder.findMany({
        where: {
          id: { in: folderIds },
          workspace_id: auth.currentWorkspaceId,
          ...(hiddenSpaceIds.length > 0
            ? { space_id: { notIn: hiddenSpaceIds } }
            : {}),
        },
        include: folderInclude,
      }),
  );
  const sidebarFolders = Array.from(folderById.values()).sort((a, b) => {
    const positionDelta = (a.position ?? 0) - (b.position ?? 0);
    if (positionDelta !== 0) return positionDelta;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({
    spaces: buildPage(spaces.map(withPendingTodoCount), limit),
    projects: projectPage,
    folders: { items: sidebarFolders, nextCursor: folderPage.nextCursor },
    pinned_clients: pinnedClients,
    hidden_spaces: hiddenSpaces,
    search_results: [],
  });
}

export const GET = withErrorReporting("api:sidebar:GET", GET_handler);
