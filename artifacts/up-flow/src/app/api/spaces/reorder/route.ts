import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isWorkspaceAdminFor } from "@/lib/auth-helpers";
import { requireAuth } from "@/lib/auth-response";
import { withErrorReporting } from "@/lib/with-error-reporting";

async function POST_handler(req: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  if (!auth.currentWorkspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 400 });
  }
  if (!isWorkspaceAdminFor(auth, auth.currentWorkspaceId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { ordered_space_ids?: unknown };
  if (
    !Array.isArray(body.ordered_space_ids) ||
    body.ordered_space_ids.some((id) => typeof id !== "string" || id.length === 0)
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const orderedSpaceIds = body.ordered_space_ids as string[];
  if (new Set(orderedSpaceIds).size !== orderedSpaceIds.length) {
    return NextResponse.json({ error: "Duplicate space IDs" }, { status: 400 });
  }

  const workspaceSpaces = await prisma.space.findMany({
    where: { workspace_id: auth.currentWorkspaceId },
    select: { id: true },
    orderBy: [{ position: "asc" }, { created_at: "asc" }, { id: "asc" }],
  });
  const workspaceSpaceIds = new Set(workspaceSpaces.map((space) => space.id));
  if (orderedSpaceIds.some((id) => !workspaceSpaceIds.has(id))) {
    return NextResponse.json(
      { error: "A space does not belong to the active workspace" },
      { status: 400 },
    );
  }

  // Spaces omitted from the visible sidebar (for example, personally hidden
  // spaces) keep their relative order and are placed after the reordered set.
  const submittedIds = new Set(orderedSpaceIds);
  const finalOrder = [
    ...orderedSpaceIds,
    ...workspaceSpaces
      .map((space) => space.id)
      .filter((id) => !submittedIds.has(id)),
  ];

  await prisma.$transaction(
    finalOrder.map((id, position) =>
      prisma.space.update({
        where: { id },
        data: { position },
      }),
    ),
  );

  return NextResponse.json({ success: true, count: finalOrder.length });
}

export const POST = withErrorReporting("api:spaces:reorder:POST", POST_handler);
