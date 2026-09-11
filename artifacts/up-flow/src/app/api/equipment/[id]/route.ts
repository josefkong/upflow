import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordActivity } from "@/lib/activity";
import { requireAuth } from "@/lib/auth-response";
import { isWorkspaceAdminFor } from "@/lib/auth-helpers";
import {
  EQUIPMENT_ACTIVE_CHECKOUT_STATUSES,
  canManageEquipment,
  isEquipmentControlProject,
} from "@/lib/equipment-control";
import { prisma } from "@/lib/prisma";
import { withErrorReporting } from "@/lib/with-error-reporting";

const UpdateSchema = z.object({
  action: z.literal("release_from_maintenance"),
  condition: z.enum(["new", "excellent", "good", "worn"]),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

type RouteContext = { params: Promise<{ id: string }> };

async function PATCH_handler(req: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const { id } = await params;
  const parsed = UpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const item = await prisma.equipmentItem.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          workspace_id: true,
          space: { select: { name: true } },
        },
      },
    },
  });
  if (
    !item ||
    item.workspace_id !== auth.currentWorkspaceId ||
    !isEquipmentControlProject({
      projectName: item.project.name,
      spaceName: item.project.space?.name,
    })
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!canManageEquipment(auth, item.workspace_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "EquipmentItem" WHERE "id" = ${item.id} FOR UPDATE
    `;
    const current = await tx.equipmentItem.findUnique({ where: { id: item.id } });
    if (!current || current.status !== "maintenance") {
      return {
        ok: false as const,
        error: "Somente equipamentos em manutenção podem ser liberados.",
      };
    }
    const updated = await tx.equipmentItem.update({
      where: { id: current.id },
      data: { status: "available", condition: parsed.data.condition },
    });
    await tx.equipmentCustodyEvent.create({
      data: {
        workspace_id: current.workspace_id,
        equipment_id: current.id,
        actor_id: auth.prismaUser.id,
        event_type: "maintenance_completed",
        condition: parsed.data.condition,
        notes: parsed.data.notes || null,
      },
    });
    return { ok: true as const, item: updated };
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  await recordActivity({
    workspace_id: item.workspace_id,
    actor_id: auth.prismaUser.id,
    type: "equipment_maintenance_completed",
    entity_type: "equipment",
    entity_id: item.id,
    project_id: item.project_id,
    metadata: { name: item.name, condition: parsed.data.condition },
  });
  return NextResponse.json(result.item);
}

export const PATCH = withErrorReporting(
  "api:equipment/id:PATCH",
  PATCH_handler,
);

async function DELETE_handler(_req: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const { id } = await params;

  const item = await prisma.equipmentItem.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          name: true,
          workspace_id: true,
          space: { select: { name: true } },
        },
      },
    },
  });
  if (
    !item ||
    !item.active ||
    item.workspace_id !== auth.currentWorkspaceId ||
    !isEquipmentControlProject({
      projectName: item.project.name,
      spaceName: item.project.space?.name,
    })
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isWorkspaceAdminFor(auth, item.workspace_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "EquipmentItem" WHERE "id" = ${item.id} FOR UPDATE
    `;
    const current = await tx.equipmentItem.findUnique({ where: { id: item.id } });
    if (!current?.active) {
      return { ok: false as const, status: 404, error: "Equipamento não encontrado." };
    }
    const activeCheckoutCount = await tx.equipmentCheckout.count({
      where: {
        equipment_id: current.id,
        status: { in: [...EQUIPMENT_ACTIVE_CHECKOUT_STATUSES] },
      },
    });
    if (activeCheckoutCount > 0 || current.current_holder_id) {
      return {
        ok: false as const,
        status: 409,
        error: "Conclua ou cancele a solicitação em andamento antes de excluir este equipamento.",
      };
    }

    await tx.equipmentItem.update({
      where: { id: current.id },
      data: { active: false, status: "archived", current_holder_id: null },
    });
    await tx.equipmentCustodyEvent.create({
      data: {
        workspace_id: current.workspace_id,
        equipment_id: current.id,
        actor_id: auth.prismaUser.id,
        event_type: "equipment_archived",
        notes: "Equipamento removido do inventário ativo. Histórico preservado.",
      },
    });
    return { ok: true as const };
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await recordActivity({
    workspace_id: item.workspace_id,
    actor_id: auth.prismaUser.id,
    type: "equipment_archived",
    entity_type: "equipment",
    entity_id: item.id,
    project_id: item.project_id,
    metadata: { name: item.name, asset_code: item.asset_code },
  });
  return NextResponse.json({ ok: true });
}

export const DELETE = withErrorReporting(
  "api:equipment/id:DELETE",
  DELETE_handler,
);
