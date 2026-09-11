import { prisma } from "@/lib/prisma";

export function isFinanceDepartmentName(name: string | null | undefined) {
  const normalized = (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase();

  return normalized === "finance" || normalized === "financeiro";
}

/**
 * Contract checkpoints are an operational Finance boundary. Only the global
 * UP Flow administrator profile can act across departments.
 */
export async function canAdvanceCommercialContract(input: {
  workspaceId: string;
  userId: string;
  isUpFlowAdmin: boolean;
}) {
  if (input.isUpFlowAdmin) return true;

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspace_id: input.workspaceId,
      user_id: input.userId,
      status: "active",
      role: { not: "guest" },
    },
    select: {
      department: { select: { name: true } },
    },
  });

  if (!membership) return false;
  if (isFinanceDepartmentName(membership.department?.name)) return true;

  const ledDepartments = await prisma.department.findMany({
    where: {
      workspace_id: input.workspaceId,
      leader_id: input.userId,
    },
    select: { name: true },
  });

  return ledDepartments.some((department) =>
    isFinanceDepartmentName(department.name),
  );
}
