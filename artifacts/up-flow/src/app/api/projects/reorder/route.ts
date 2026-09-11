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

  const body = (await req.json()) as { ordered_project_ids?: unknown };
  if (
    !Array.isArray(body.ordered_project_ids) ||
    body.ordered_project_ids.length === 0 ||
    body.ordered_project_ids.some(
      (id) => typeof id !== "string" || id.length === 0,
    )
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const orderedProjectIds = body.ordered_project_ids as string[];
  if (new Set(orderedProjectIds).size !== orderedProjectIds.length) {
    return NextResponse.json({ error: "Duplicate project IDs" }, { status: 400 });
  }

  const submittedProjects = await prisma.project.findMany({
    where: {
      workspace_id: auth.currentWorkspaceId,
      id: { in: orderedProjectIds },
    },
    select: { id: true, space_id: true, folder_id: true },
  });
  if (submittedProjects.length !== orderedProjectIds.length) {
    return NextResponse.json(
      { error: "A project does not belong to the active workspace" },
      { status: 400 },
    );
  }

  const firstProject = submittedProjects[0];
  if (!firstProject) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const sameContainer = submittedProjects.every((project) =>
    firstProject.folder_id
      ? project.folder_id === firstProject.folder_id
      : project.folder_id === null && project.space_id === firstProject.space_id,
  );
  if (!sameContainer) {
    return NextResponse.json(
      { error: "Projects must belong to the same sidebar group" },
      { status: 400 },
    );
  }

  const siblingProjects = await prisma.project.findMany({
    where: firstProject.folder_id
      ? {
          workspace_id: auth.currentWorkspaceId,
          folder_id: firstProject.folder_id,
        }
      : {
          workspace_id: auth.currentWorkspaceId,
          folder_id: null,
          space_id: firstProject.space_id,
        },
    select: { id: true },
    orderBy: [{ position: "asc" }, { created_at: "desc" }, { id: "asc" }],
  });

  const siblingIds = new Set(siblingProjects.map((project) => project.id));
  if (orderedProjectIds.some((id) => !siblingIds.has(id))) {
    return NextResponse.json(
      { error: "A project does not belong to this sidebar group" },
      { status: 400 },
    );
  }

  // Projects omitted from the visible sidebar keep their relative order and
  // follow the explicitly reordered items.
  const submittedIds = new Set(orderedProjectIds);
  const finalOrder = [
    ...orderedProjectIds,
    ...siblingProjects
      .map((project) => project.id)
      .filter((id) => !submittedIds.has(id)),
  ];

  await prisma.$transaction(
    finalOrder.map((id, position) =>
      prisma.project.update({ where: { id }, data: { position } }),
    ),
  );

  return NextResponse.json({ success: true, count: finalOrder.length });
}

export const POST = withErrorReporting("api:projects:reorder:POST", POST_handler);
