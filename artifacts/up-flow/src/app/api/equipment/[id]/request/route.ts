import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordActivity } from "@/lib/activity";
import { requireAuth } from "@/lib/auth-response";
import {
  canRequestEquipment,
  getEquipmentManagerIds,
  isEquipmentControlProject,
  sendEquipmentNotifications,
} from "@/lib/equipment-control";
import {
  EQUIPMENT_PURPOSES,
  EQUIPMENT_PURPOSE_LABELS,
  EQUIPMENT_TERMS_VERSION,
  MINIMUM_EQUIPMENT_USE_MS,
} from "@/lib/equipment-request-options";
import { prisma } from "@/lib/prisma";
import { withErrorReporting } from "@/lib/with-error-reporting";

const CreateRequestSchema = z.object({
  purpose: z.enum(EQUIPMENT_PURPOSES),
  expected_return_at: z.string().datetime(),
  terms_accepted: z.literal(true),
});

type RouteContext = { params: Promise<{ id: string }> };

async function POST_handler(req: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const { id } = await params;
  const parsed = CreateRequestSchema.safeParse(
    await req.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Selecione a finalidade, a devolução e aceite os Termos de Uso." },
      { status: 400 },
    );
  }
  const expectedReturnAt = new Date(parsed.data.expected_return_at);
  if (expectedReturnAt.getTime() < Date.now() + MINIMUM_EQUIPMENT_USE_MS) {
    return NextResponse.json(
      { error: "O período mínimo de uso é de 1 hora." },
      { status: 400 },
    );
  }

  const item = await prisma.equipmentItem.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          workspace_id: true,
          owner_id: true,
          space: { select: { name: true } },
        },
      },
    },
  });
  if (
    !item ||
    item.workspace_id !== auth.currentWorkspaceId ||
    !item.active ||
    !isEquipmentControlProject({
      projectName: item.project.name,
      spaceName: item.project.space?.name,
    })
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!canRequestEquipment(auth, item.workspace_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const managerIds = await getEquipmentManagerIds({
    workspaceId: item.workspace_id,
    projectOwnerId: item.project.owner_id,
  });
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "EquipmentItem"
      WHERE "id" = ${item.id}
      FOR UPDATE
    `;
    const current = await tx.equipmentItem.findUnique({ where: { id: item.id } });
    if (!current || !current.active) {
      return { ok: false as const, status: 404, error: "Not found" };
    }
    if (current.status !== "available") {
      return {
        ok: false as const,
        status: 409,
        error: "Este equipamento não está disponível para solicitação.",
      };
    }

    const task = await tx.task.create({
      data: {
        project_id: current.project_id,
        title: `Retirada — ${current.name} — ${auth.prismaUser.name}`,
        description: `Finalidade: ${EQUIPMENT_PURPOSE_LABELS[parsed.data.purpose].pt}\nCódigo: ${current.asset_code}`,
        status: "todo",
        priority: "medium",
        assignee_id: managerIds[0] ?? item.project.owner_id,
        due_date: expectedReturnAt,
      },
      select: { id: true },
    });
    const checkout = await tx.equipmentCheckout.create({
      data: {
        workspace_id: current.workspace_id,
        project_id: current.project_id,
        equipment_id: current.id,
        task_id: task.id,
        requester_id: auth.prismaUser.id,
        purpose: parsed.data.purpose,
        expected_return_at: expectedReturnAt,
        terms_version: EQUIPMENT_TERMS_VERSION,
        terms_accepted_at: new Date(),
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
      },
    });
    await tx.equipmentItem.update({
      where: { id: current.id },
      data: { status: "requested" },
    });
    await tx.equipmentCustodyEvent.create({
      data: {
        workspace_id: current.workspace_id,
        equipment_id: current.id,
        checkout_id: checkout.id,
        actor_id: auth.prismaUser.id,
        holder_id: auth.prismaUser.id,
        event_type: "request_created",
        condition: current.condition,
        notes: parsed.data.purpose,
      },
    });
    return { ok: true as const, checkout };
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
  await Promise.all([
    recordActivity({
      workspace_id: item.workspace_id,
      actor_id: auth.prismaUser.id,
      type: "equipment_request_created",
      entity_type: "equipment_checkout",
      entity_id: result.checkout.id,
      project_id: item.project_id,
      task_id: result.checkout.task_id,
      metadata: { equipment_id: item.id, equipment_name: item.name },
    }),
    sendEquipmentNotifications({
      recipientIds: managerIds,
      workspaceId: item.workspace_id,
      projectId: item.project_id,
      requestId: result.checkout.id,
      equipmentId: item.id,
      equipmentName: item.name,
      actorId: auth.prismaUser.id,
      actorName: auth.prismaUser.name,
      action: "request_created",
    }),
  ]);

  return NextResponse.json(result.checkout, { status: 201 });
}

export const POST = withErrorReporting(
  "api:equipment/id/request:POST",
  POST_handler,
);
