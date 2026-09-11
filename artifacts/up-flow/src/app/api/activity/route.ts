import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-response";
import { buildPage, parsePagination } from "@/lib/pagination";
import { withErrorReporting } from "@/lib/with-error-reporting";
import {
  canViewClientFinancials,
  redactFinancialMetadata,
} from "@/lib/client-financial-access";

async function GET_handler(req: NextRequest) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  if (!auth.currentWorkspaceId) {
    return NextResponse.json({ items: [], nextCursor: null });
  }

  const { searchParams } = new URL(req.url);
  const { limit, cursor } = parsePagination(req, { defaultLimit: 50, maxLimit: 100 });
  const type = searchParams.get("type")?.trim();
  const entityType = searchParams.get("entity_type")?.trim();
  const actorId = searchParams.get("actor_id")?.trim();
  const companyId = searchParams.get("company_id")?.trim();
  const projectId = searchParams.get("project_id")?.trim();
  const taskId = searchParams.get("task_id")?.trim();
  const includeSubtasks = searchParams.get("include_subtasks") === "true";
  const query = searchParams.get("q")?.trim();

  const taskIds = taskId
    ? includeSubtasks
      ? [
          taskId,
          ...(
            await prisma.task.findMany({
              where: {
                parent_id: taskId,
                project: { workspace_id: auth.currentWorkspaceId },
              },
              select: { id: true },
            })
          ).map((task) => task.id),
        ]
      : [taskId]
    : [];

  const where: Prisma.ActivityEventWhereInput = {
    workspace_id: auth.currentWorkspaceId,
    ...(type ? { type } : {}),
    ...(entityType ? { entity_type: entityType } : {}),
    ...(actorId ? { actor_id: actorId } : {}),
    ...(companyId ? { company_id: companyId } : {}),
    ...(projectId ? { project_id: projectId } : {}),
    ...(taskId ? { task_id: { in: taskIds } } : {}),
    ...(query
      ? {
          OR: [
            { type: { contains: query, mode: "insensitive" } },
            { entity_type: { contains: query, mode: "insensitive" } },
            { entity_id: { contains: query, mode: "insensitive" } },
            { actor: { is: { name: { contains: query, mode: "insensitive" } } } },
            { actor: { is: { email: { contains: query, mode: "insensitive" } } } },
            { company: { is: { name: { contains: query, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const items = await prisma.activityEvent.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ created_at: "desc" }, { id: "asc" }],
    include: {
      actor: { select: { id: true, name: true, email: true, avatar_url: true } },
      company: { select: { id: true, name: true } },
    },
  });
  const financialsVisible = await canViewClientFinancials(
    auth,
    auth.currentWorkspaceId,
  );

  return NextResponse.json(
    buildPage(
      items.map((item) => ({
        ...item,
        metadata: redactFinancialMetadata(item.metadata, financialsVisible),
      })),
      limit,
    ),
  );
}

export const GET = withErrorReporting("api:activity:GET", GET_handler);
