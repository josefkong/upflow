import { prisma } from "@/lib/prisma";
import {
  getDepartmentSpacePreset,
  normalizeDepartmentSpaceName,
} from "@/lib/department-spaces";

export const DEFAULT_CLIENTS_HREF = "/clients";

export async function resolveClientsNavigationHref(input: {
  workspaceId: string;
  userId: string;
  departmentName?: string | null;
}) {
  let departmentName = input.departmentName?.trim() || null;

  if (!departmentName) {
    const ledDepartment = await prisma.department.findFirst({
      where: {
        workspace_id: input.workspaceId,
        leader_id: input.userId,
      },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }],
      select: { name: true },
    });
    departmentName = ledDepartment?.name ?? null;
  }

  if (!departmentName) return DEFAULT_CLIENTS_HREF;

  const departmentPreset = getDepartmentSpacePreset(departmentName);
  const normalizedDepartmentName = normalizeDepartmentSpaceName(departmentName);
  const clientProjects = await prisma.project.findMany({
    where: {
      workspace_id: input.workspaceId,
      folder_id: null,
      company_id: null,
      OR: [
        { name: { equals: "Clients", mode: "insensitive" } },
        { name: { equals: "Clientes", mode: "insensitive" } },
      ],
      space: { isNot: null },
    },
    orderBy: [{ position: "asc" }, { created_at: "asc" }, { id: "asc" }],
    select: {
      id: true,
      space: { select: { name: true } },
    },
  });

  const targetProject = clientProjects.find((project) => {
    const spaceName = project.space?.name;
    if (!spaceName) return false;
    const spacePreset = getDepartmentSpacePreset(spaceName);

    if (departmentPreset && spacePreset) {
      return departmentPreset.department_key === spacePreset.department_key;
    }

    return normalizeDepartmentSpaceName(spaceName) === normalizedDepartmentName;
  });

  return targetProject ? `/projects/${targetProject.id}` : DEFAULT_CLIENTS_HREF;
}
