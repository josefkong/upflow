import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-response";
import {
  EQUIPMENT_ACTIVE_CHECKOUT_STATUSES,
  canManageEquipment,
  isEquipmentControlProject,
} from "@/lib/equipment-control";
import { prisma } from "@/lib/prisma";
import { withErrorReporting } from "@/lib/with-error-reporting";
import { recordActivity } from "@/lib/activity";
import { isWorkspaceAdminFor } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

const CreateEquipmentSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  asset_code: z
    .string()
    .trim()
    .max(40)
    .regex(/^[\p{L}\p{N}._-]*$/u)
    .optional()
    .or(z.literal("")),
  brand: z.string().trim().max(80).optional().or(z.literal("")),
  model: z.string().trim().max(100).optional().or(z.literal("")),
  serial_number: z.string().trim().max(100).optional().or(z.literal("")),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  condition: z
    .enum(["new", "excellent", "good", "worn", "damaged"])
    .default("good"),
});

async function GET_handler(req: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const projectId = new URL(req.url).searchParams.get("project_id")?.trim();
  if (!projectId) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      workspace_id: true,
      owner_id: true,
      name: true,
      space: { select: { name: true } },
    },
  });
  if (
    !project ||
    project.workspace_id !== auth.currentWorkspaceId ||
    !isEquipmentControlProject({
      projectName: project.name,
      spaceName: project.space?.name,
    })
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const items = await prisma.equipmentItem.findMany({
    where: { project_id: project.id, active: true },
    orderBy: [{ status: "asc" }, { category: "asc" }, { name: "asc" }],
    include: {
      current_holder: { select: { id: true, name: true, email: true } },
      last_holder: { select: { id: true, name: true, email: true } },
      checkouts: {
        orderBy: [{ requested_at: "desc" }, { id: "desc" }],
        take: 20,
        include: {
          requester: { select: { id: true, name: true, email: true } },
          administrator: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  const activeCheckouts = items
    .flatMap((item) =>
      item.checkouts.map((checkout) => ({
        ...checkout,
        equipment: {
          id: item.id,
          name: item.name,
          asset_code: item.asset_code,
          category: item.category,
          status: item.status,
        },
      })),
    )
    .filter((checkout) =>
      (EQUIPMENT_ACTIVE_CHECKOUT_STATUSES as readonly string[]).includes(
        checkout.status,
      ),
    )
    .sort(
      (left, right) =>
        right.requested_at.getTime() - left.requested_at.getTime(),
    );

  return NextResponse.json({
    items,
    active_checkouts: activeCheckouts,
    summary: {
      total: items.length,
      available: items.filter((item) => item.status === "available").length,
      in_use: items.filter((item) => item.status === "in_use").length,
      pending: items.filter((item) =>
        ["requested", "awaiting_receipt", "return_requested"].includes(
          item.status,
        ),
      ).length,
      maintenance: items.filter((item) => item.status === "maintenance")
        .length,
    },
    viewer: {
      id: auth.prismaUser.id,
      name: auth.prismaUser.name,
      can_manage: canManageEquipment(auth, project.workspace_id),
      can_delete: isWorkspaceAdminFor(auth, project.workspace_id),
    },
  });
}

async function POST_handler(req: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const parsed = CreateEquipmentSchema.safeParse(
    await req.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados do equipamento inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: parsed.data.project_id },
    select: {
      id: true,
      workspace_id: true,
      name: true,
      space: { select: { name: true } },
    },
  });
  if (
    !project ||
    project.workspace_id !== auth.currentWorkspaceId ||
    !isEquipmentControlProject({
      projectName: project.name,
      spaceName: project.space?.name,
    })
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!canManageEquipment(auth, project.workspace_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = randomUUID();
  const assetCode =
    parsed.data.asset_code?.trim().toLocaleUpperCase() ||
    `EQ-${id.slice(0, 8).toLocaleUpperCase()}`;
  try {
    const item = await prisma.equipmentItem.create({
      data: {
        id,
        workspace_id: project.workspace_id,
        project_id: project.id,
        name: parsed.data.name,
        category: parsed.data.category,
        asset_code: assetCode,
        brand: parsed.data.brand || null,
        model: parsed.data.model || null,
        serial_number: parsed.data.serial_number || null,
        description: parsed.data.description || null,
        condition: parsed.data.condition,
        created_by: auth.prismaUser.id,
        custody_events: {
          create: {
            workspace_id: project.workspace_id,
            event_type: "equipment_created",
            actor_id: auth.prismaUser.id,
            condition: parsed.data.condition,
            notes: "Equipamento adicionado ao inventário.",
          },
        },
      },
      include: {
        current_holder: { select: { id: true, name: true, email: true } },
        last_holder: { select: { id: true, name: true, email: true } },
        checkouts: true,
        custody_events: {
          orderBy: { created_at: "desc" },
          take: 20,
          include: {
            actor: { select: { id: true, name: true, email: true } },
            holder: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
    await recordActivity({
      workspace_id: project.workspace_id,
      actor_id: auth.prismaUser.id,
      type: "equipment_created",
      entity_type: "equipment",
      entity_id: item.id,
      project_id: project.id,
      metadata: { name: item.name, asset_code: item.asset_code },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") {
      return NextResponse.json(
        { error: "Já existe um equipamento com este código." },
        { status: 409 },
      );
    }
    throw error;
  }
}

export const GET = withErrorReporting("api:equipment:GET", GET_handler);
export const POST = withErrorReporting("api:equipment:POST", POST_handler);
