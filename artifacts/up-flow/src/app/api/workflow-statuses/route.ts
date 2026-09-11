import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-response";
import {
  requireCurrentWorkspace,
  requireWorkspaceAdmin,
} from "@/lib/api/scope";
import { buildPage, parsePagination } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "@/lib/activity";
import { withErrorReporting } from "@/lib/with-error-reporting";
import { isSpaceWorkflowSchemaUnavailable } from "@/lib/space-workflow-schema";
import { commercialFlowProjectKind } from "@/lib/commercial-managed-projects";
import { ensureCommercialContractProjectModel } from "@/lib/commercial-contract-stages";
import { ensureCommercialLeadProjectModel } from "@/lib/commercial-lead-flow.server";
import { isFinanceContractMirrorProject } from "@/lib/commercial-contract-mirror";
import {
  ensureOnboardingProjectStageModel,
  isOnboardingMirrorProject,
} from "@/lib/onboarding-shared-flow";

const WorkflowStatusSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  key: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  category: z
    .enum(["task", "doc", "report", "campaign", "deliverable"])
    .default("task"),
  stage_order: z.number().int().min(0).max(999).default(0),
  color: z.string().trim().max(80).nullable().optional(),
  terminal: z.boolean().default(false),
  active: z.boolean().default(true),
});

async function GET_handler(req: NextRequest) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  const scope = await requireCurrentWorkspace(auth);
  if (!scope.ok) return scope.response;

  const { searchParams } = new URL(req.url);
  const { limit, cursor } = parsePagination(req, {
    defaultLimit: 100,
    maxLimit: 200,
  });
  const category = searchParams.get("category")?.trim();
  const projectId = searchParams.get("project_id")?.trim();
  const where: Prisma.WorkflowStatusWhereInput = {
    workspace_id: scope.workspaceId,
    ...(category ? { category } : {}),
  };
  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspace_id: scope.workspaceId },
      select: {
        space_id: true,
        name: true,
        company_id: true,
        onboarding_enabled: true,
        space: { select: { name: true } },
      },
    });
    if (!project)
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const commercialProjectKind = commercialFlowProjectKind({
      projectName: project.name,
      spaceName: project.space?.name,
    });
    const isContractHandoff =
      commercialProjectKind === "contract_handoff" ||
      isFinanceContractMirrorProject({
        projectName: project.name,
        spaceName: project.space?.name,
      });
    if (commercialProjectKind === "leads") {
      await prisma.$transaction((tx) =>
        ensureCommercialLeadProjectModel(tx, {
          workspaceId: scope.workspaceId,
          projectId,
        }),
      );
    }
    if (isContractHandoff) {
      await prisma.$transaction((tx) =>
        ensureCommercialContractProjectModel(tx, {
          workspaceId: scope.workspaceId,
          projectId,
        }),
      );
    }
    if (
      isOnboardingMirrorProject({
        projectName: project.name,
        onboardingEnabled: project.onboarding_enabled,
        companyId: project.company_id,
      })
    ) {
      await prisma.$transaction((tx) =>
        ensureOnboardingProjectStageModel(tx, {
          workspaceId: scope.workspaceId,
          projectId,
        }),
      );
    }
    where.OR = [
      { project_id: projectId },
      ...(project.space_id
        ? [{ project_id: null, space_id: project.space_id }]
        : []),
      { project_id: null, space_id: null },
    ];
  }
  const loadRows = () =>
    prisma.workflowStatus.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: [{ stage_order: "asc" }, { name: "asc" }, { id: "asc" }],
    });
  let rows: Awaited<ReturnType<typeof loadRows>>;
  try {
    rows = await loadRows();
  } catch (error) {
    if (!isSpaceWorkflowSchemaUnavailable(error)) throw error;
    const legacyRows = await prisma.workflowStatus.findMany({
      where: {
        workspace_id: scope.workspaceId,
        ...(category ? { category } : {}),
        ...(projectId
          ? { OR: [{ project_id: null }, { project_id: projectId }] }
          : {}),
      },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: [{ stage_order: "asc" }, { name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        workspace_id: true,
        project_id: true,
        key: true,
        name: true,
        category: true,
        stage_order: true,
        color: true,
        terminal: true,
        active: true,
        created_at: true,
        updated_at: true,
      },
    });
    rows = legacyRows.map((status) => ({ ...status, space_id: null }));
  }
  return NextResponse.json(buildPage(rows, limit));
}

async function POST_handler(req: NextRequest) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  const scope = await requireCurrentWorkspace(auth);
  if (!scope.ok) return scope.response;
  const admin = requireWorkspaceAdmin(auth, scope.workspaceId);
  if (!admin.ok) return admin.response;

  const parsed = WorkflowStatusSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid workflow status", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.project_id) {
    const project = await prisma.project.findFirst({
      where: { id: parsed.data.project_id, workspace_id: scope.workspaceId },
      select: { id: true },
    });
    if (!project)
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const existing = await prisma.workflowStatus.findFirst({
    where: {
      workspace_id: scope.workspaceId,
      project_id: parsed.data.project_id ?? null,
      category: parsed.data.category,
      key: parsed.data.key,
    },
    select: { id: true },
  });
  const status = existing
    ? await prisma.workflowStatus.update({
        where: { id: existing.id },
        data: {
          name: parsed.data.name,
          stage_order: parsed.data.stage_order,
          color: parsed.data.color ?? null,
          terminal: parsed.data.terminal,
          active: parsed.data.active,
        },
      })
    : await prisma.workflowStatus.create({
        data: {
          workspace_id: scope.workspaceId,
          project_id: parsed.data.project_id ?? null,
          key: parsed.data.key,
          name: parsed.data.name,
          category: parsed.data.category,
          stage_order: parsed.data.stage_order,
          color: parsed.data.color ?? null,
          terminal: parsed.data.terminal,
          active: parsed.data.active,
        },
      });

  await recordActivity({
    workspace_id: scope.workspaceId,
    actor_id: auth.prismaUser.id,
    type: "workflow_status_upserted",
    entity_type: "workflow_status",
    entity_id: status.id,
    project_id: status.project_id,
    metadata: { key: status.key, name: status.name, category: status.category },
  });

  return NextResponse.json(status, { status: 201 });
}

export const GET = withErrorReporting("api:workflow-statuses:GET", GET_handler);
export const POST = withErrorReporting(
  "api:workflow-statuses:POST",
  POST_handler,
);
