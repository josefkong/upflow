import { NextRequest, NextResponse } from "next/server";
import { Prisma, type CustomFieldType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canAccessWorkspace, isWorkspaceAdminFor } from "@/lib/auth-helpers";
import { requireAuth } from "@/lib/auth-response";
import { withErrorReporting } from "@/lib/with-error-reporting";
import { commercialFlowProjectKind } from "@/lib/commercial-managed-projects";
import { ensureCommercialContractProjectModel } from "@/lib/commercial-contract-stages";
import { isFinanceContractMirrorProject } from "@/lib/commercial-contract-mirror";
import {
  ensureOnboardingProjectStageModel,
  isOnboardingMirrorProject,
} from "@/lib/onboarding-shared-flow";

const VALID_TYPES: CustomFieldType[] = [
  "text",
  "number",
  "dropdown",
  "date",
  "checkbox",
  "people",
];

type RouteContext = { params: Promise<{ id: string }> };

async function GET_handler(_req: NextRequest, { params }: RouteContext) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      workspace_id: true,
      name: true,
      company_id: true,
      onboarding_enabled: true,
      space: { select: { name: true } },
    },
  });
  if (!project)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessWorkspace(auth, project.workspace_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const isContractHandoff =
    commercialFlowProjectKind({
      projectName: project.name,
      spaceName: project.space?.name,
    }) === "contract_handoff" ||
    isFinanceContractMirrorProject({
      projectName: project.name,
      spaceName: project.space?.name,
    });
  if (isContractHandoff) {
    await prisma.$transaction((tx) =>
      ensureCommercialContractProjectModel(tx, {
        workspaceId: project.workspace_id,
        projectId: id,
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
        workspaceId: project.workspace_id,
        projectId: id,
      }),
    );
  }

  const fields = await prisma.customFieldDefinition.findMany({
    where: { project_id: id },
    orderBy: [{ position: "asc" }, { created_at: "asc" }],
  });
  return NextResponse.json(fields);
}

async function POST_handler(req: NextRequest, { params }: RouteContext) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    select: { workspace_id: true },
  });
  if (!project)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessWorkspace(auth, project.workspace_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isWorkspaceAdminFor(auth, project.workspace_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    type?: CustomFieldType;
    options?: unknown;
  };
  const name = (body.name || "").trim();
  if (!name)
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!body.type || !VALID_TYPES.includes(body.type)) {
    return NextResponse.json({ error: "Invalid field type" }, { status: 400 });
  }

  const last = await prisma.customFieldDefinition.findFirst({
    where: { project_id: id },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const created = await prisma.customFieldDefinition.create({
    data: {
      project_id: id,
      name,
      type: body.type,
      options:
        body.type === "dropdown" && Array.isArray(body.options)
          ? (body.options as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      position: (last?.position ?? -1) + 1,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
export const GET = withErrorReporting(
  "api:projects/id/custom-fields:GET",
  GET_handler,
);
export const POST = withErrorReporting(
  "api:projects/id/custom-fields:POST",
  POST_handler,
);
