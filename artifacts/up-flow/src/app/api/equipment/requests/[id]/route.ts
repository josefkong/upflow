import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordActivity } from "@/lib/activity";
import { requireAuth } from "@/lib/auth-response";
import {
  canManageEquipment,
  getEquipmentManagerIds,
  isEquipmentControlProject,
  sendEquipmentNotifications,
} from "@/lib/equipment-control";
import {
  EQUIPMENT_CANCELLATION_REASONS,
  EQUIPMENT_DAMAGE_TYPES,
  MINIMUM_HANDOVER_PHOTOS,
} from "@/lib/equipment-request-options";
import { prisma } from "@/lib/prisma";
import { withErrorReporting } from "@/lib/with-error-reporting";

const TransitionSchema = z.object({
  action: z.enum([
    "confirm_handover",
    "confirm_receipt",
    "request_return",
    "confirm_return",
    "reject",
    "cancel",
  ]),
  condition: z
    .enum(["new", "excellent", "good", "worn", "damaged"])
    .optional(),
  reason: z.enum(EQUIPMENT_CANCELLATION_REASONS).optional(),
  damage_type: z.enum(EQUIPMENT_DAMAGE_TYPES).optional(),
  purpose_and_photos_confirmed: z.boolean().optional(),
  photo_match_confirmed: z.boolean().optional(),
  inspection_confirmed: z.boolean().optional(),
  damage_notice_confirmed: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

async function PATCH_handler(req: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const { id } = await params;
  const parsed = TransitionSchema.safeParse(
    await req.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  const checkout = await prisma.equipmentCheckout.findUnique({
    where: { id },
    include: {
      equipment: { select: { id: true, name: true, condition: true } },
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
    !checkout ||
    checkout.workspace_id !== auth.currentWorkspaceId ||
    !isEquipmentControlProject({
      projectName: checkout.project.name,
      spaceName: checkout.project.space?.name,
    })
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isManager = canManageEquipment(auth, checkout.workspace_id);
  const isRequester = checkout.requester_id === auth.prismaUser.id;
  const managerAction = [
    "confirm_handover",
    "request_return",
    "confirm_return",
    "reject",
    "cancel",
  ].includes(parsed.data.action);
  const requesterAction = [
    "confirm_receipt",
    "cancel",
  ].includes(parsed.data.action);
  const canCancel = parsed.data.action === "cancel" && (isManager || isRequester);
  if (
    (managerAction && !isManager && !canCancel) ||
    (requesterAction && !isRequester && !canCancel)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (
    parsed.data.action === "confirm_return" &&
    !parsed.data.condition
  ) {
    return NextResponse.json(
      { error: "Informe o estado do equipamento na devolução." },
      { status: 400 },
    );
  }
  if (
    ["reject", "cancel"].includes(parsed.data.action) &&
    !parsed.data.reason
  ) {
    return NextResponse.json(
      { error: "Selecione o motivo desta ação." },
      { status: 400 },
    );
  }
  const managerIds = await getEquipmentManagerIds({
    workspaceId: checkout.workspace_id,
    projectOwnerId: checkout.project.owner_id,
  });
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "EquipmentCheckout"
      WHERE "id" = ${checkout.id}
      FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT "id" FROM "EquipmentItem"
      WHERE "id" = ${checkout.equipment_id}
      FOR UPDATE
    `;
    const current = await tx.equipmentCheckout.findUnique({
      where: { id: checkout.id },
      include: { equipment: true },
    });
    if (!current) {
      return { ok: false as const, status: 404, error: "Not found" };
    }

    const now = new Date();
    let nextCheckoutStatus = current.status;
    let nextItemStatus = current.equipment.status;
    let taskStatus: "todo" | "in_progress" | "done" = "in_progress";
    let recipients: string[] = [];
    let eventType: string = parsed.data.action;
    const checkoutData: Record<string, unknown> = {};
    const itemData: Record<string, unknown> = {};

    if (parsed.data.action === "confirm_handover") {
      if (current.status !== "requested") {
        return {
          ok: false as const,
          status: 409,
          error: "A entrega só pode ser confirmada para uma solicitação pendente.",
        };
      }
      if (current.handover_photo_paths.length < MINIMUM_HANDOVER_PHOTOS) {
        return {
          ok: false as const,
          status: 400,
          error: `Envie ao menos ${MINIMUM_HANDOVER_PHOTOS} fotos do equipamento antes da entrega.`,
        };
      }
      if (!parsed.data.purpose_and_photos_confirmed) {
        return {
          ok: false as const,
          status: 400,
          error: "Confirme que verificou a finalidade e registrou as fotos do equipamento.",
        };
      }
      nextCheckoutStatus = "awaiting_receipt";
      nextItemStatus = "awaiting_receipt";
      checkoutData.administrator_id = auth.prismaUser.id;
      checkoutData.admin_handover_confirmed_at = now;
      checkoutData.condition_out = current.equipment.condition;
      recipients = [current.requester_id];
      eventType = "handover_confirmed_by_administration";
    } else if (parsed.data.action === "confirm_receipt") {
      if (current.status !== "awaiting_receipt") {
        return {
          ok: false as const,
          status: 409,
          error: "O recebimento depende da confirmação de entrega pela Administração.",
        };
      }
      if (!parsed.data.photo_match_confirmed) {
        return {
          ok: false as const,
          status: 400,
          error: "Confirme que o equipamento recebido está de acordo com as fotos.",
        };
      }
      nextCheckoutStatus = "checked_out";
      nextItemStatus = "in_use";
      checkoutData.requester_receipt_confirmed_at = now;
      checkoutData.requester_photo_confirmation_at = now;
      itemData.current_holder_id = current.requester_id;
      itemData.last_holder_id = current.requester_id;
      recipients = managerIds;
      eventType = "receipt_confirmed_by_requester";
    } else if (parsed.data.action === "request_return") {
      if (current.status !== "checked_out") {
        return {
          ok: false as const,
          status: 409,
          error: "Somente um equipamento em posse pode ter a devolução solicitada.",
        };
      }
      nextCheckoutStatus = "return_requested";
      nextItemStatus = "return_requested";
      checkoutData.return_requested_at = now;
      recipients = [current.requester_id];
      eventType = "return_requested_by_administration";
    } else if (parsed.data.action === "confirm_return") {
      if (current.status !== "return_requested") {
        return {
          ok: false as const,
          status: 409,
          error: "A devolução precisa ser solicitada antes da inspeção.",
        };
      }
      if (!parsed.data.inspection_confirmed) {
        return {
          ok: false as const,
          status: 400,
          error: "Confirme que ambas as partes estão de acordo com a inspeção.",
        };
      }
      if (
        parsed.data.condition === "damaged" &&
        (!parsed.data.damage_type ||
          current.damage_photo_paths.length === 0 ||
          !parsed.data.damage_notice_confirmed)
      ) {
        return {
          ok: false as const,
          status: 400,
          error: "Para registrar uma avaria, selecione o tipo, envie uma foto e confirme a ciência do solicitante.",
        };
      }
      nextCheckoutStatus = "returned";
      nextItemStatus =
        parsed.data.condition === "damaged" ? "maintenance" : "available";
      taskStatus = "done";
      checkoutData.administrator_id = auth.prismaUser.id;
      checkoutData.admin_return_confirmed_at = now;
      checkoutData.inspection_agreement_confirmed_at = now;
      checkoutData.condition_in = parsed.data.condition;
      checkoutData.damage_notes =
        parsed.data.condition === "damaged" ? parsed.data.damage_type : null;
      checkoutData.damage_notice_confirmed_at =
        parsed.data.condition === "damaged" ? now : null;
      itemData.current_holder_id = null;
      itemData.last_holder_id = current.requester_id;
      itemData.condition = parsed.data.condition;
      recipients = [current.requester_id];
      eventType = "return_inspected_by_administration";
    } else if (parsed.data.action === "reject") {
      if (current.status !== "requested") {
        return {
          ok: false as const,
          status: 409,
          error: "Somente solicitações pendentes podem ser recusadas.",
        };
      }
      nextCheckoutStatus = "rejected";
      nextItemStatus = "available";
      taskStatus = "done";
      checkoutData.administrator_id = auth.prismaUser.id;
      checkoutData.cancelled_at = now;
      checkoutData.handover_notes = parsed.data.reason || null;
      recipients = [current.requester_id];
      eventType = "request_rejected";
    } else if (parsed.data.action === "cancel") {
      if (current.status !== "requested") {
        return {
          ok: false as const,
          status: 409,
          error: "A solicitação não pode mais ser cancelada nesta etapa.",
        };
      }
      nextCheckoutStatus = "cancelled";
      nextItemStatus = "available";
      taskStatus = "done";
      checkoutData.cancelled_at = now;
      checkoutData.return_notes = parsed.data.reason || null;
      recipients = isManager ? [current.requester_id] : managerIds;
      eventType = isManager
        ? "request_cancelled_by_administration"
        : "request_cancelled_by_requester";
    }

    const updated = await tx.equipmentCheckout.update({
      where: { id: current.id },
      data: { ...checkoutData, status: nextCheckoutStatus },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        administrator: { select: { id: true, name: true, email: true } },
      },
    });
    await tx.equipmentItem.update({
      where: { id: current.equipment_id },
      data: { ...itemData, status: nextItemStatus },
    });
    if (current.task_id) {
      await tx.task.update({
        where: { id: current.task_id },
        data: { status: taskStatus },
      });
    }
    await tx.equipmentCustodyEvent.create({
      data: {
        workspace_id: current.workspace_id,
        equipment_id: current.equipment_id,
        checkout_id: current.id,
        actor_id: auth.prismaUser.id,
        holder_id: current.requester_id,
        event_type: eventType,
        condition:
          parsed.data.action === "confirm_return"
            ? parsed.data.condition
            : current.equipment.condition,
        notes: parsed.data.damage_type || parsed.data.reason || null,
      },
    });
    return {
      ok: true as const,
      checkout: updated,
      recipients,
      eventType,
    };
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  await Promise.all([
    recordActivity({
      workspace_id: checkout.workspace_id,
      actor_id: auth.prismaUser.id,
      type: result.eventType,
      entity_type: "equipment_checkout",
      entity_id: checkout.id,
      project_id: checkout.project_id,
      task_id: checkout.task_id,
      metadata: {
        equipment_id: checkout.equipment_id,
        equipment_name: checkout.equipment.name,
      },
    }),
    sendEquipmentNotifications({
      recipientIds: result.recipients,
      workspaceId: checkout.workspace_id,
      projectId: checkout.project_id,
      requestId: checkout.id,
      equipmentId: checkout.equipment_id,
      equipmentName: checkout.equipment.name,
      actorId: auth.prismaUser.id,
      actorName: auth.prismaUser.name,
      action: result.eventType,
    }),
  ]);

  return NextResponse.json(result.checkout);
}

export const PATCH = withErrorReporting(
  "api:equipment/requests/id:PATCH",
  PATCH_handler,
);
