import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isWorkspaceAdminFor } from "@/lib/auth-helpers";
import { requireAuth } from "@/lib/auth-response";
import { buildPage, parsePagination } from "@/lib/pagination";
import { withErrorReporting } from "@/lib/with-error-reporting";
import { recordActivity } from "@/lib/activity";
import { ensureOnboardingMirrorProjectForSpace } from "@/lib/onboarding";
import { ensureWorkspaceClientsProjects } from "@/lib/client-space-structure";
import { ensureSharedContractsRegistryProjects } from "@/lib/commercial-contract-mirror";
import { ensureEquipmentControlProject } from "@/lib/equipment-control";

async function GET_handler(req: NextRequest) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  if (!auth.currentWorkspaceId) {
    return NextResponse.json({ items: [], nextCursor: null });
  }
  const { limit, cursor } = parsePagination(req, {
    defaultLimit: 200,
    maxLimit: 500,
  });
  const rows = await prisma.space.findMany({
    where: { workspace_id: auth.currentWorkspaceId },
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: [{ position: "asc" }, { created_at: "asc" }, { id: "asc" }],
    include: {
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { projects: true } },
    },
  });

  return NextResponse.json(buildPage(rows, limit));
}

async function POST_handler(req: NextRequest) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  if (!auth.currentWorkspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 400 });
  }
  if (!isWorkspaceAdminFor(auth, auth.currentWorkspaceId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json()) as { name?: string; icon?: string | null };
  const name = body.name?.trim();
  if (!name)
    return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const last = await prisma.space.findFirst({
    where: { workspace_id: auth.currentWorkspaceId },
    orderBy: { position: "desc" },
  });
  const position = (last?.position ?? -1) + 1;

  const space = await prisma.$transaction(async (tx) => {
    const createdSpace = await tx.space.create({
      data: {
        name,
        icon: body.icon ?? null,
        workspace_id: auth.currentWorkspaceId,
        owner_id: auth.prismaUser.id,
        position,
      },
    });
    await ensureOnboardingMirrorProjectForSpace(tx, {
      workspaceId: auth.currentWorkspaceId,
      spaceId: createdSpace.id,
      spaceName: createdSpace.name,
      ownerId: auth.prismaUser.id,
    });
    await ensureWorkspaceClientsProjects(tx, {
      workspaceId: auth.currentWorkspaceId,
      ownerId: auth.prismaUser.id,
    });
    await ensureSharedContractsRegistryProjects(tx, {
      workspaceId: auth.currentWorkspaceId,
      fallbackOwnerId: auth.prismaUser.id,
    });
    await ensureEquipmentControlProject(tx, {
      workspaceId: auth.currentWorkspaceId,
      ownerId: auth.prismaUser.id,
      spaceId: createdSpace.id,
    });
    return tx.space.findUniqueOrThrow({
      where: { id: createdSpace.id },
      include: { _count: { select: { projects: true } } },
    });
  });
  await recordActivity({
    workspace_id: auth.currentWorkspaceId,
    actor_id: auth.prismaUser.id,
    type: "space_created",
    entity_type: "space",
    entity_id: space.id,
    metadata: { name: space.name },
  });
  return NextResponse.json(space, { status: 201 });
}
export const GET = withErrorReporting("api:spaces:GET", GET_handler);
export const POST = withErrorReporting("api:spaces:POST", POST_handler);
