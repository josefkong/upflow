import type { Prisma } from "@prisma/client";
import {
  canAccessWorkspace,
  isWorkspaceAdminFor,
  type AuthUser,
} from "@/lib/auth-helpers";
import { logError } from "@/lib/log-error";
import { prisma } from "@/lib/prisma";
import { broadcastNotification } from "@/lib/supabase-server";
import {
  EQUIPMENT_PROJECT_DESCRIPTION,
  EQUIPMENT_PROJECT_NAME,
  isEquipmentControlProject,
  isGeneralAdministrationSpaceName,
} from "@/lib/equipment-control-shared";

export {
  EQUIPMENT_ACTIVE_CHECKOUT_STATUSES,
  EQUIPMENT_PROJECT_DESCRIPTION,
  EQUIPMENT_PROJECT_NAME,
  isEquipmentControlProject,
  isGeneralAdministrationSpaceName,
  normalizeEquipmentStructureName,
} from "@/lib/equipment-control-shared";

type EquipmentProjectDb = Pick<
  Prisma.TransactionClient,
  "project" | "space"
>;

export function canRequestEquipment(auth: AuthUser, workspaceId: string) {
  if (!canAccessWorkspace(auth, workspaceId)) return false;
  if (auth.prismaUser.role === "admin") return true;
  return auth.memberships.some(
    (membership) =>
      membership.workspace_id === workspaceId && membership.role !== "guest",
  );
}

export function canManageEquipment(auth: AuthUser, workspaceId: string) {
  if (isWorkspaceAdminFor(auth, workspaceId)) return true;
  return auth.memberships.some(
    (membership) =>
      membership.workspace_id === workspaceId &&
      membership.role !== "guest" &&
      isGeneralAdministrationSpaceName(membership.department?.name),
  );
}

export async function ensureEquipmentControlProject(
  db: EquipmentProjectDb,
  input: {
    workspaceId: string;
    ownerId: string;
    spaceId?: string;
  },
) {
  const spaces = await db.space.findMany({
    where: {
      workspace_id: input.workspaceId,
      ...(input.spaceId ? { id: input.spaceId } : {}),
    },
    orderBy: [{ position: "asc" }, { created_at: "asc" }, { id: "asc" }],
    select: { id: true, name: true, owner_id: true },
  });
  const generalAdministrationSpaces = spaces.filter((space) =>
    isGeneralAdministrationSpaceName(space.name),
  );

  const projects = [];
  for (const space of generalAdministrationSpaces) {
    const existing = await db.project.findFirst({
      where: {
        workspace_id: input.workspaceId,
        space_id: space.id,
        folder_id: null,
        company_id: null,
        OR: [
          { name: { equals: "Equipment Control", mode: "insensitive" } },
          {
            name: {
              equals: "Controle de Equipamentos",
              mode: "insensitive",
            },
          },
        ],
      },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        kind: true,
        sidebar_hidden: true,
        owner_id: true,
      },
    });

    if (existing) {
      const requiresUpdate =
        existing.name !== EQUIPMENT_PROJECT_NAME ||
        existing.description !== EQUIPMENT_PROJECT_DESCRIPTION ||
        existing.kind !== "operational_queue" ||
        existing.sidebar_hidden;
      projects.push(
        requiresUpdate
          ? await db.project.update({
              where: { id: existing.id },
              data: {
                name: EQUIPMENT_PROJECT_NAME,
                description: EQUIPMENT_PROJECT_DESCRIPTION,
                kind: "operational_queue",
                sidebar_hidden: false,
              },
              select: { id: true, space_id: true },
            })
          : { id: existing.id, space_id: space.id },
      );
      continue;
    }

    const lastProject = await db.project.findFirst({
      where: { workspace_id: input.workspaceId, space_id: space.id },
      orderBy: [{ position: "desc" }, { created_at: "desc" }],
      select: { position: true },
    });
    projects.push(
      await db.project.create({
        data: {
          name: EQUIPMENT_PROJECT_NAME,
          description: EQUIPMENT_PROJECT_DESCRIPTION,
          workspace_id: input.workspaceId,
          owner_id: space.owner_id || input.ownerId,
          space_id: space.id,
          kind: "operational_queue",
          position: (lastProject?.position ?? -1) + 1,
        },
        select: { id: true, space_id: true },
      }),
    );
  }

  return projects;
}

export async function getEquipmentManagerIds(input: {
  workspaceId: string;
  projectOwnerId?: string | null;
}) {
  const departments = await prisma.department.findMany({
    where: { workspace_id: input.workspaceId },
    select: {
      id: true,
      name: true,
      leader_id: true,
      members: {
        where: { status: "active", role: { not: "guest" } },
        select: { user_id: true },
      },
    },
  });
  const administrationDepartments = departments.filter((department) =>
    isGeneralAdministrationSpaceName(department.name),
  );
  const managerIds = new Set<string>();
  if (input.projectOwnerId) managerIds.add(input.projectOwnerId);
  for (const department of administrationDepartments) {
    if (department.leader_id) managerIds.add(department.leader_id);
    department.members.forEach((member) => managerIds.add(member.user_id));
  }

  if (managerIds.size === 0) {
    const administrators = await prisma.workspaceMember.findMany({
      where: {
        workspace_id: input.workspaceId,
        status: "active",
        role: { in: ["owner", "admin"] },
      },
      select: { user_id: true },
    });
    administrators.forEach((member) => managerIds.add(member.user_id));
  }
  return [...managerIds];
}

export async function sendEquipmentNotifications(input: {
  recipientIds: string[];
  workspaceId: string;
  projectId: string;
  requestId: string;
  equipmentId: string;
  equipmentName: string;
  actorId: string;
  actorName: string;
  action: string;
}) {
  const recipientIds = [...new Set(input.recipientIds)].filter(
    (userId) => userId && userId !== input.actorId,
  );
  if (recipientIds.length === 0) return;

  await prisma.notification.createMany({
    data: recipientIds.map((user_id) => ({
      type: "status_changed" as const,
      user_id,
      workspace_id: input.workspaceId,
      data: {
        source: "equipment_request",
        action: input.action,
        project_id: input.projectId,
        equipment_request_id: input.requestId,
        equipment_id: input.equipmentId,
        equipment_name: input.equipmentName,
        actor_id: input.actorId,
        actor_name: input.actorName,
      },
    })),
  });

  await Promise.all(
    recipientIds.map((userId) =>
      broadcastNotification(userId).catch((error) =>
        logError("equipment-notification:broadcast", error, {
          user_id: userId,
          request_id: input.requestId,
          equipment_id: input.equipmentId,
        }),
      ),
    ),
  );
}

export async function processOverdueEquipmentReturns(input?: {
  workspaceId?: string;
  now?: Date;
}) {
  const now = input?.now ?? new Date();
  const overdue = await prisma.equipmentCheckout.findMany({
    where: {
      ...(input?.workspaceId ? { workspace_id: input.workspaceId } : {}),
      status: { in: ["checked_out", "return_requested"] },
      expected_return_at: { lt: now },
      overdue_notified_at: null,
    },
    take: 100,
    orderBy: { expected_return_at: "asc" },
    select: {
      id: true,
      workspace_id: true,
      project_id: true,
      equipment_id: true,
      requester_id: true,
      equipment: { select: { name: true } },
      project: { select: { owner_id: true } },
    },
  });

  let notified = 0;
  for (const checkout of overdue) {
    const claimed = await prisma.equipmentCheckout.updateMany({
      where: { id: checkout.id, overdue_notified_at: null },
      data: { overdue_notified_at: now },
    });
    if (claimed.count === 0) continue;

    try {
      const managerIds = await getEquipmentManagerIds({
        workspaceId: checkout.workspace_id,
        projectOwnerId: checkout.project.owner_id,
      });
      await sendEquipmentNotifications({
        recipientIds: [checkout.requester_id, ...managerIds],
        workspaceId: checkout.workspace_id,
        projectId: checkout.project_id,
        requestId: checkout.id,
        equipmentId: checkout.equipment_id,
        equipmentName: checkout.equipment.name,
        actorId: "system",
        actorName: "Sistema",
        action: "return_overdue",
      });
      notified += 1;
    } catch (error) {
      await prisma.equipmentCheckout.updateMany({
        where: { id: checkout.id, overdue_notified_at: now },
        data: { overdue_notified_at: null },
      });
      logError("equipment-notification:overdue", error, {
        request_id: checkout.id,
        equipment_id: checkout.equipment_id,
      });
    }
  }

  return { scanned: overdue.length, notified };
}
