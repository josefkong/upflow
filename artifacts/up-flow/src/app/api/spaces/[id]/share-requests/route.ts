import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordActivity } from "@/lib/activity";
import { requireAuth } from "@/lib/auth-response";
import { prisma } from "@/lib/prisma";
import { broadcastNotification } from "@/lib/supabase-server";
import { withErrorReporting } from "@/lib/with-error-reporting";

type RouteContext = { params: Promise<{ id: string }> };

const requestSchema = z.object({
  collaborator_id: z.string().uuid(),
  message: z.string().trim().max(500).nullable().optional(),
});

async function POST_handler(req: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const { auth } = authResult;
  const workspaceId = auth.currentWorkspaceId;
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid sharing request" }, { status: 400 });
  }

  const { id: spaceId } = await params;
  const space = await prisma.space.findFirst({
    where: { id: spaceId, workspace_id: workspaceId },
    select: { id: true, name: true, workspace_id: true },
  });
  if (!space) {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  const collaborator = await prisma.user.findFirst({
    where: {
      id: parsed.data.collaborator_id,
      memberships: {
        some: { workspace_id: workspaceId, status: "active" },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      memberships: {
        where: { workspace_id: workspaceId, status: "active" },
        take: 1,
        select: { department: { select: { name: true } } },
      },
    },
  });
  if (!collaborator || collaborator.id === auth.prismaUser.id) {
    return NextResponse.json({ error: "Invalid collaborator" }, { status: 400 });
  }

  const requestKey = `space_share_request:${space.id}:${collaborator.id}`;
  const duplicate = await prisma.notification.findFirst({
    where: {
      workspace_id: workspaceId,
      read: false,
      data: { path: ["request_key"], equals: requestKey },
    },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ success: true, duplicate: true });
  }

  const administrators = await prisma.workspaceMember.findMany({
    where: {
      workspace_id: workspaceId,
      status: "active",
      OR: [{ role: { in: ["owner", "admin"] } }, { user: { role: "admin" } }],
    },
    select: { user_id: true },
  });
  const administratorIds = [...new Set(administrators.map((member) => member.user_id))];
  if (administratorIds.length === 0) {
    return NextResponse.json(
      { error: "No administrator is available for this workspace" },
      { status: 409 },
    );
  }

  const notificationData: Prisma.InputJsonValue = {
    source: "space_share_request",
    request_key: requestKey,
    actor_id: auth.prismaUser.id,
    actor_name: auth.prismaUser.name,
    collaborator_id: collaborator.id,
    collaborator_name: collaborator.name,
    collaborator_email: collaborator.email,
    collaborator_department: collaborator.memberships[0]?.department?.name ?? null,
    space_id: space.id,
    space_name: space.name,
    message: parsed.data.message || null,
  };

  await prisma.notification.createMany({
    data: administratorIds.map((userId) => ({
      type: "mentioned" as const,
      user_id: userId,
      workspace_id: workspaceId,
      data: notificationData,
    })),
  });

  await recordActivity({
    workspace_id: workspaceId,
    actor_id: auth.prismaUser.id,
    type: "space_share_requested",
    entity_type: "space",
    entity_id: space.id,
    metadata: {
      collaborator_id: collaborator.id,
      collaborator_name: collaborator.name,
      collaborator_email: collaborator.email,
    },
  });

  await Promise.all(administratorIds.map((userId) => broadcastNotification(userId)));

  return NextResponse.json({ success: true, duplicate: false }, { status: 201 });
}

export const POST = withErrorReporting(
  "api:spaces:share-requests:POST",
  POST_handler,
);
